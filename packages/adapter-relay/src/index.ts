import {
  type AggregateSessionReason,
  type AggregateSessionState,
  type RelayConnectionState as CoreRelayConnectionState,
  type RelayObservation,
  type RelayObservationReason,
  type RequestKey,
  type SessionObservation,
  verifier
} from '@auftakt/core';
import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';
import { distinct, Observable, Subject } from 'rxjs';

export { verifier };

export interface DefaultRelayConfig {
  url: string;
  read: boolean;
  write: boolean;
}

export interface RelayStatus {
  connection: RelayConnectionState;
  replaying: boolean;
  degraded: boolean;
  reason: RelayObservationReason;
  aggregate: SessionObservation;
}

export type RelayConnectionState = CoreRelayConnectionState;

export interface ConnectionStatePacket {
  from: string;
  state: RelayConnectionState;
  reason: RelayObservationReason;
  relay: RelayObservation;
  aggregate: SessionObservation;
}

export interface EventPacket {
  from: string;
  event: NostrEvent;
}

export interface OkPacketAgainstEvent {
  from: string;
  eventId: string;
  ok: boolean;
  notice?: string;
  done: boolean;
}

export interface RelaySelectionOptions {
  relays?: string[];
  defaultReadRelays?: boolean;
  defaultWriteRelays?: boolean;
}

export interface RelayUseOptions {
  on?: RelaySelectionOptions;
}

export interface RelaySendOptions {
  signer?: EventSigner;
  on?: RelaySelectionOptions;
}

export interface EventSigner {
  getPublicKey(): Promise<string> | string;
  signEvent(
    event: UnsignedEvent
  ):
    | Promise<SignedEventShape | { id: string; sig: string }>
    | SignedEventShape
    | { id: string; sig: string };
}

export interface UnsignedEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

export interface SignedEventShape extends UnsignedEvent {
  id: string;
  pubkey: string;
  sig: string;
}

export interface RelayRequest {
  readonly mode: 'backward' | 'forward';
  readonly requestKey?: RequestKey;
  emit(input: Filter | Filter[] | Record<string, unknown> | Array<Record<string, unknown>>): void;
  over(): void;
  readonly filters: Filter[];
  readonly closed: boolean;
  onChange(listener: () => void): () => void;
}

export interface CreateRelayRequestOptions {
  readonly requestKey?: RequestKey;
}

class MutableRelayRequest implements RelayRequest {
  private listeners = new Set<() => void>();
  private collected: Filter[] = [];
  private completed = false;

  constructor(
    readonly mode: 'backward' | 'forward',
    readonly requestKey?: RequestKey
  ) {}

  emit(input: Filter | Filter[] | Record<string, unknown> | Array<Record<string, unknown>>): void {
    const next = Array.isArray(input) ? input : [input];
    this.collected.push(...(next as Filter[]));
    this.notify();
  }

  over(): void {
    this.completed = true;
    this.notify();
  }

  get filters(): Filter[] {
    return [...this.collected];
  }

  get closed(): boolean {
    return this.completed;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

class RelaySocket {
  private ws: WebSocket | undefined;
  private connectPromise: Promise<WebSocket> | undefined;
  state: RelayConnectionState = 'idle';

  constructor(
    readonly url: string,
    private readonly onMessage: (from: string, message: unknown) => void,
    private readonly onStateChange: (from: string, state: RelayConnectionState) => void
  ) {}

  async connect(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN) return this.ws;
    if (this.connectPromise) return this.connectPromise;

    this.setState('connecting');
    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      let opened = false;

      ws.addEventListener('open', () => {
        opened = true;
        this.ws = ws;
        this.connectPromise = undefined;
        this.setState('open');
        resolve(ws);
      });

      ws.addEventListener('message', (event) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        try {
          this.onMessage(this.url, JSON.parse(raw));
        } catch {
          // ignore malformed packets
        }
      });

      ws.addEventListener('error', (error) => {
        if (!opened) {
          this.connectPromise = undefined;
          this.setState('degraded');
          reject(error);
        }
      });

      ws.addEventListener('close', () => {
        this.ws = undefined;
        this.connectPromise = undefined;
        this.setState(opened ? 'backoff' : 'closed');
      });
    });

    return this.connectPromise;
  }

  async send(payload: unknown): Promise<void> {
    const ws = await this.connect();
    ws.send(JSON.stringify(payload));
  }

  close(): void {
    this.ws?.close();
    this.ws = undefined;
    this.connectPromise = undefined;
    this.setState('closed');
  }

  private setState(next: RelayConnectionState): void {
    this.state = next;
    this.onStateChange(this.url, next);
  }
}

export interface RxNostr {
  getDefaultRelays(): Record<string, DefaultRelayConfig>;
  setDefaultRelays(relays: string[]): void;
  getRelayStatus(url: string): RelayStatus | undefined;
  getSessionObservation(): SessionObservation;
  createSessionObservationObservable(): Observable<SessionObservation>;
  createConnectionStateObservable(): Observable<ConnectionStatePacket>;
  use(req: RelayRequest, options?: RelayUseOptions): Observable<EventPacket>;
  send(params: EventParameters, options?: RelaySendOptions): Observable<OkPacketAgainstEvent>;
  cast(params: EventParameters, options?: RelaySendOptions): Promise<void>;
  dispose(): void;
}

export interface CreateRelaySessionOptions {
  readonly defaultRelays: readonly string[];
  readonly eoseTimeout?: number;
}

export type CreateRxNostrSessionOptions = CreateRelaySessionOptions;

class RelaySession implements RxNostr {
  private readonly defaultRelays = new Map<string, DefaultRelayConfig>();
  private readonly connections = new Map<string, RelaySocket>();
  private readonly messages = new Subject<{ from: string; message: unknown }>();
  private readonly states = new Subject<ConnectionStatePacket>();
  private readonly sessionStates = new Subject<SessionObservation>();
  private readonly replayRecords = new Map<
    RequestKey,
    {
      mode: 'backward' | 'forward';
      relayUrls: string[];
      getFilters: () => Filter[];
      replay: (relayUrl: string) => Promise<void>;
    }
  >();
  private readonly requestToSubIds = new Map<RequestKey, Set<string>>();
  private readonly subIdToRequestKey = new Map<string, RequestKey>();
  private readonly relayRequestKeys = new Map<string, Set<RequestKey>>();
  private readonly relayNeedsReplay = new Map<string, Set<RequestKey>>();
  private readonly relayObservations = new Map<string, RelayObservation>();
  private disposed = false;

  constructor(
    private readonly eoseTimeout: number,
    defaultRelays: readonly string[]
  ) {
    this.setDefaultRelays([...defaultRelays]);
  }

  getDefaultRelays(): Record<string, DefaultRelayConfig> {
    return Object.fromEntries(
      [...this.defaultRelays.entries()].map(([url, config]) => [url, { ...config }])
    );
  }

  setDefaultRelays(relays: string[]): void {
    const next = new Map<string, DefaultRelayConfig>();
    for (const relay of relays) {
      next.set(relay, { url: relay, read: true, write: true });
    }

    for (const [url, connection] of this.connections.entries()) {
      if (!next.has(url)) {
        connection.close();
        this.connections.delete(url);
      }
    }

    this.defaultRelays.clear();
    for (const [url, config] of next.entries()) this.defaultRelays.set(url, config);
  }

  getRelayStatus(url: string): RelayStatus | undefined {
    const relay = this.relayObservations.get(url);
    if (!relay) return undefined;
    return {
      connection: relay.connection,
      replaying: relay.replaying,
      degraded: relay.degraded,
      reason: relay.reason,
      aggregate: this.getSessionObservation()
    };
  }

  getSessionObservation(): SessionObservation {
    return {
      state: this.calculateAggregateSessionState(),
      reason: this.calculateAggregateSessionReason(),
      relays: [...this.relayObservations.values()]
    };
  }

  createSessionObservationObservable(): Observable<SessionObservation> {
    return this.sessionStates.asObservable();
  }

  createConnectionStateObservable(): Observable<ConnectionStatePacket> {
    return this.states.asObservable();
  }

  use(req: RelayRequest, options?: RelayUseOptions): Observable<EventPacket> {
    return new Observable<EventPacket>((observer) => {
      const requestKey = req.requestKey ?? this.createLegacyRequestKey(req.mode);
      const relayUrls = this.resolveReadRelays(options?.on);
      const pendingRelays = new Set<string>();
      const transportSubIds = new Map<string, string>();
      let currentFilters: Filter[] = [];
      let started = false;
      let forwardFlushQueued = false;
      let finished = false;

      const completeIfDone = () => {
        if (finished || req.mode !== 'backward') return;
        if (pendingRelays.size === 0) {
          finished = true;
          observer.complete();
        }
      };

      const sendReqToRelay = async (url: string): Promise<void> => {
        try {
          pendingRelays.add(url);
          const relay = this.getConnection(url);
          const previousSubId = transportSubIds.get(url);
          if (previousSubId) {
            this.untrackSubId(previousSubId);
          }

          const subId = createSubId();
          transportSubIds.set(url, subId);
          this.trackRequestTransport(requestKey, subId, url);
          await relay.send(['REQ', subId, ...currentFilters]);
        } catch {
          pendingRelays.delete(url);
          completeIfDone();
        }
      };

      const replayRelay = async (url: string): Promise<void> => {
        if (currentFilters.length === 0) return;
        await sendReqToRelay(url);
      };

      this.registerReplayRecord(requestKey, {
        mode: req.mode,
        relayUrls,
        getFilters: () => currentFilters,
        replay: replayRelay
      });

      const sendCurrentReq = () => {
        if (currentFilters.length === 0) return;
        for (const url of relayUrls) {
          void sendReqToRelay(url);
        }
        if (req.mode === 'backward') {
          const timer = setTimeout(() => {
            for (const url of relayUrls) pendingRelays.delete(url);
            completeIfDone();
          }, this.eoseTimeout);
          cleanup.push(() => clearTimeout(timer));
        }
      };

      const scheduleForwardFlush = () => {
        if (forwardFlushQueued) return;
        forwardFlushQueued = true;
        queueMicrotask(() => {
          forwardFlushQueued = false;
          sendCurrentReq();
        });
      };

      const handleReqChange = () => {
        currentFilters = req.filters;
        if (req.mode === 'backward') {
          if (!started && req.closed) {
            started = true;
            sendCurrentReq();
          }
          return;
        }
        scheduleForwardFlush();
      };

      const cleanup: Array<() => void> = [];

      const messageSub = this.messages.subscribe(({ from, message }) => {
        if (!relayUrls.includes(from) || !Array.isArray(message)) return;
        const [type, incomingSubId] = message as [string, string, ...unknown[]];
        if (this.subIdToRequestKey.get(incomingSubId) !== requestKey) return;
        if (transportSubIds.get(from) !== incomingSubId) return;

        if (type === 'EVENT') {
          const event = (message as [string, string, NostrEvent])[2];
          observer.next({ from, event });
          return;
        }

        if (type === 'EOSE' && req.mode === 'backward') {
          pendingRelays.delete(from);
          completeIfDone();
        }

        if (type === 'CLOSED' && req.mode === 'backward') {
          pendingRelays.delete(from);
          completeIfDone();
        }
      });
      cleanup.push(() => messageSub.unsubscribe());

      const stateSub = this.states.subscribe((packet) => {
        if (!relayUrls.includes(packet.from)) return;
        if (req.mode === 'backward') {
          if (
            (packet.state === 'backoff' ||
              packet.state === 'closed' ||
              packet.state === 'degraded') &&
            pendingRelays.has(packet.from)
          ) {
            pendingRelays.delete(packet.from);
            completeIfDone();
          }
          return;
        }

        if (
          packet.state === 'backoff' ||
          packet.state === 'closed' ||
          packet.state === 'degraded'
        ) {
          this.markRelayNeedsReplay(packet.from, requestKey);
          void this.getConnection(packet.from)
            .connect()
            .catch(() => {});
          return;
        }

        if (packet.state === 'open') {
          void this.restoreRelayStreams(packet.from);
        }
      });
      cleanup.push(() => stateSub.unsubscribe());

      const off = req.onChange(handleReqChange);
      cleanup.push(off);
      handleReqChange();

      return () => {
        for (const stop of cleanup.splice(0)) stop();
        for (const [url, subId] of transportSubIds.entries()) {
          const relay = this.connections.get(url);
          if (relay) {
            void relay.send(['CLOSE', subId]).catch(() => {});
          }
          this.untrackSubId(subId);
        }
        this.unregisterReplayRecord(requestKey);
      };
    });
  }

  send(params: EventParameters, options?: RelaySendOptions): Observable<OkPacketAgainstEvent> {
    return new Observable<OkPacketAgainstEvent>((observer) => {
      const relayUrls = this.resolveWriteRelays(options?.on);
      const cleanup: Array<() => void> = [];
      const pendingRelays = new Set<string>();
      let eventId = '';
      let settled = false;

      const finish = () => {
        if (settled || pendingRelays.size > 0) return;
        settled = true;
        observer.complete();
      };

      const start = async () => {
        const event = await this.signEvent(params, options?.signer);
        eventId = event.id;

        const messageSub = this.messages.subscribe(({ from, message }) => {
          if (!relayUrls.includes(from) || !Array.isArray(message)) return;
          if (message[0] !== 'OK' || message[1] !== eventId) return;
          pendingRelays.delete(from);
          observer.next({
            from,
            eventId,
            ok: Boolean(message[2]),
            notice: typeof message[3] === 'string' ? message[3] : undefined,
            done: pendingRelays.size === 0
          });
          finish();
        });
        cleanup.push(() => messageSub.unsubscribe());

        const stateSub = this.states.subscribe((packet) => {
          if (!relayUrls.includes(packet.from)) return;
          if (
            (packet.state === 'backoff' ||
              packet.state === 'closed' ||
              packet.state === 'degraded') &&
            pendingRelays.has(packet.from)
          ) {
            pendingRelays.delete(packet.from);
            observer.next({
              from: packet.from,
              eventId,
              ok: false,
              done: pendingRelays.size === 0
            });
            finish();
          }
        });
        cleanup.push(() => stateSub.unsubscribe());

        for (const url of relayUrls) pendingRelays.add(url);
        for (const url of relayUrls) {
          const relay = this.getConnection(url);
          void relay.send(['EVENT', event]).catch(() => {
            if (pendingRelays.delete(url)) {
              observer.next({ from: url, eventId, ok: false, done: pendingRelays.size === 0 });
              finish();
            }
          });
        }

        const timeout = setTimeout(() => {
          for (const url of [...pendingRelays]) {
            pendingRelays.delete(url);
            observer.next({
              from: url,
              eventId,
              ok: false,
              notice: 'timeout',
              done: pendingRelays.size === 0
            });
          }
          finish();
        }, this.eoseTimeout);
        cleanup.push(() => clearTimeout(timeout));
      };

      void start().catch((error) => {
        if (!settled) {
          settled = true;
          observer.error(error);
        }
      });

      return () => {
        for (const stop of cleanup.splice(0)) stop();
      };
    });
  }

  async cast(params: EventParameters, options?: RelaySendOptions): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let ok = false;
      const sub = this.send(params, options).subscribe({
        next: (packet) => {
          if (packet.ok) ok = true;
        },
        error: (error) => {
          sub.unsubscribe();
          reject(error);
        },
        complete: () => {
          sub.unsubscribe();
          if (ok) resolve();
          else reject(new Error('All relays rejected the event'));
        }
      });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const relayUrl of this.connections.keys()) {
      this.updateRelayObservation(relayUrl, 'closed', 'disposed');
    }

    this.sessionStates.next(this.getSessionObservation());
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
    this.replayRecords.clear();
    this.requestToSubIds.clear();
    this.subIdToRequestKey.clear();
    this.relayRequestKeys.clear();
    this.relayNeedsReplay.clear();
    this.messages.complete();
    this.states.complete();
    this.sessionStates.complete();
  }

  private updateRelayObservation(
    url: string,
    connection: RelayConnectionState,
    reason: RelayObservationReason
  ): void {
    const relay: RelayObservation = {
      url,
      connection,
      replaying: connection === 'replaying',
      degraded: connection === 'degraded' || connection === 'backoff' || connection === 'closed',
      reason
    };
    this.relayObservations.set(url, relay);
    const aggregate = this.getSessionObservation();
    const packet: ConnectionStatePacket = {
      from: url,
      state: connection,
      reason,
      relay,
      aggregate
    };
    this.states.next(packet);
    this.sessionStates.next(aggregate);
  }

  private calculateAggregateSessionState(): AggregateSessionState {
    if (this.disposed) return 'disposed';

    const relays = [...this.relayObservations.values()];
    if (relays.length === 0) return 'booting';
    if (relays.some((relay) => relay.connection === 'replaying')) return 'replaying';
    if (relays.some((relay) => relay.connection === 'open')) return 'live';
    if (relays.some((relay) => relay.connection === 'connecting')) return 'connecting';
    return 'degraded';
  }

  private calculateAggregateSessionReason(): AggregateSessionReason {
    const state = this.calculateAggregateSessionState();
    switch (state) {
      case 'booting':
        return 'boot';
      case 'connecting':
        return 'relay-disconnected';
      case 'live':
        return 'relay-opened';
      case 'replaying':
        return 'relay-replaying';
      case 'degraded':
        return 'relay-degraded';
      case 'disposed':
        return 'disposed';
    }
  }

  private createLegacyRequestKey(mode: 'backward' | 'forward'): RequestKey {
    return `rq:legacy:${mode}:${crypto.randomUUID()}` as RequestKey;
  }

  private registerReplayRecord(
    requestKey: RequestKey,
    record: {
      mode: 'backward' | 'forward';
      relayUrls: string[];
      getFilters: () => Filter[];
      replay: (relayUrl: string) => Promise<void>;
    }
  ): void {
    this.replayRecords.set(requestKey, record);
    for (const relayUrl of record.relayUrls) {
      const set = this.relayRequestKeys.get(relayUrl) ?? new Set<RequestKey>();
      set.add(requestKey);
      this.relayRequestKeys.set(relayUrl, set);
    }
  }

  private unregisterReplayRecord(requestKey: RequestKey): void {
    const record = this.replayRecords.get(requestKey);
    if (!record) return;
    this.replayRecords.delete(requestKey);

    for (const relayUrl of record.relayUrls) {
      const set = this.relayRequestKeys.get(relayUrl);
      if (!set) continue;
      set.delete(requestKey);
      if (set.size === 0) this.relayRequestKeys.delete(relayUrl);
    }

    for (const set of this.relayNeedsReplay.values()) {
      set.delete(requestKey);
    }

    const subIds = this.requestToSubIds.get(requestKey);
    if (!subIds) return;
    for (const subId of subIds) {
      this.subIdToRequestKey.delete(subId);
    }
    this.requestToSubIds.delete(requestKey);
  }

  private trackRequestTransport(requestKey: RequestKey, subId: string, relayUrl: string): void {
    const subIds = this.requestToSubIds.get(requestKey) ?? new Set<string>();
    subIds.add(subId);
    this.requestToSubIds.set(requestKey, subIds);
    this.subIdToRequestKey.set(subId, requestKey);

    const relaySet = this.relayRequestKeys.get(relayUrl) ?? new Set<RequestKey>();
    relaySet.add(requestKey);
    this.relayRequestKeys.set(relayUrl, relaySet);
  }

  private untrackSubId(subId: string): void {
    const requestKey = this.subIdToRequestKey.get(subId);
    if (!requestKey) return;
    this.subIdToRequestKey.delete(subId);
    const subIds = this.requestToSubIds.get(requestKey);
    if (!subIds) return;
    subIds.delete(subId);
    if (subIds.size === 0) {
      this.requestToSubIds.delete(requestKey);
    }
  }

  private markRelayNeedsReplay(relayUrl: string, requestKey: RequestKey): void {
    const set = this.relayNeedsReplay.get(relayUrl) ?? new Set<RequestKey>();
    set.add(requestKey);
    this.relayNeedsReplay.set(relayUrl, set);
  }

  private async restoreRelayStreams(relayUrl: string): Promise<void> {
    const pending = this.relayNeedsReplay.get(relayUrl);
    if (!pending || pending.size === 0) return;
    this.updateRelayObservation(relayUrl, 'replaying', 'replay-started');
    const requestKeys = [...pending];
    this.relayNeedsReplay.delete(relayUrl);

    try {
      await Promise.all(
        requestKeys.map(async (requestKey) => {
          const record = this.replayRecords.get(requestKey);
          if (!record || record.mode !== 'forward') return;
          if (!record.relayUrls.includes(relayUrl)) return;
          if (record.getFilters().length === 0) return;
          await record.replay(relayUrl);
        })
      );
      this.updateRelayObservation(relayUrl, 'open', 'replay-finished');
    } catch {
      this.updateRelayObservation(relayUrl, 'degraded', 'replay-failed');
    }
  }

  private getConnection(url: string): RelaySocket {
    let connection = this.connections.get(url);
    if (!connection) {
      connection = new RelaySocket(
        url,
        (from, message) => this.messages.next({ from, message }),
        (from, state) => {
          const reason =
            state === 'connecting'
              ? 'connecting'
              : state === 'open'
                ? 'opened'
                : state === 'degraded'
                  ? 'connect-failed'
                  : 'disconnected';
          this.updateRelayObservation(from, state, reason);
        }
      );
      this.connections.set(url, connection);
      this.updateRelayObservation(url, 'idle', 'boot');
    }
    return connection;
  }

  private resolveReadRelays(selection?: RelaySelectionOptions): string[] {
    const urls = new Set<string>();
    if (selection?.defaultReadRelays ?? true) {
      for (const [url, config] of this.defaultRelays.entries()) {
        if (config.read) urls.add(url);
      }
    }
    for (const relay of selection?.relays ?? []) urls.add(relay);
    return [...urls];
  }

  private resolveWriteRelays(selection?: RelaySelectionOptions): string[] {
    const urls = new Set<string>();
    if (selection?.defaultWriteRelays ?? true) {
      for (const [url, config] of this.defaultRelays.entries()) {
        if (config.write) urls.add(url);
      }
    }
    for (const relay of selection?.relays ?? []) urls.add(relay);
    return [...urls];
  }

  private async signEvent(
    params: EventParameters,
    signer?: EventSigner
  ): Promise<SignedEventShape> {
    const candidate = params as Partial<SignedEventShape>;
    if (
      typeof candidate.id === 'string' &&
      typeof candidate.sig === 'string' &&
      typeof candidate.pubkey === 'string' &&
      typeof candidate.created_at === 'number'
    ) {
      return candidate as SignedEventShape;
    }

    const unsigned: UnsignedEvent = {
      kind: params.kind,
      content: params.content,
      tags: params.tags ?? [],
      created_at:
        typeof candidate.created_at === 'number'
          ? candidate.created_at
          : Math.floor(Date.now() / 1000)
    };

    const activeSigner = signer ?? nip07Signer();
    const pubkey = await activeSigner.getPublicKey();
    const signed = await activeSigner.signEvent(unsigned);

    if (typeof (signed as SignedEventShape).pubkey === 'string') {
      return signed as SignedEventShape;
    }

    return {
      ...unsigned,
      pubkey,
      id: (signed as { id: string; sig: string }).id,
      sig: (signed as { id: string; sig: string }).sig
    };
  }
}

export function createRelaySession(options: CreateRelaySessionOptions): RxNostr {
  return new RelaySession(options.eoseTimeout ?? 10_000, options.defaultRelays);
}

export function createRxNostrSession(options: CreateRxNostrSessionOptions): RxNostr {
  return createRelaySession(options);
}

export function createBackwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return new MutableRelayRequest('backward', options?.requestKey);
}

export function createForwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return new MutableRelayRequest('forward', options?.requestKey);
}

export function createRxBackwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return createBackwardReq(options);
}

export function createRxForwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return createForwardReq(options);
}

export function uniq<T extends { event?: { id?: string } }>() {
  return distinct<T, string | undefined>((packet) => packet.event?.id);
}

export function nip07Signer(): EventSigner {
  return {
    async getPublicKey() {
      const nostr = getWindowNostr();
      return nostr.getPublicKey();
    },
    async signEvent(event: UnsignedEvent) {
      const nostr = getWindowNostr();
      const signed = await nostr.signEvent(event);
      return signed as SignedEventShape;
    }
  };
}

function getWindowNostr(): {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedEvent): Promise<SignedEventShape | { id: string; sig: string }>;
} {
  const maybeWindow = globalThis.window as undefined | { nostr?: unknown };
  const nostr = maybeWindow?.nostr as
    | undefined
    | {
        getPublicKey?: () => Promise<string>;
        signEvent?: (
          event: UnsignedEvent
        ) => Promise<SignedEventShape | { id: string; sig: string }>;
      };
  if (!nostr?.getPublicKey || !nostr?.signEvent) {
    throw new Error('window.nostr is unavailable');
  }
  return {
    getPublicKey: nostr.getPublicKey,
    signEvent: nostr.signEvent
  };
}

function createSubId(): string {
  return `auftakt-${crypto.randomUUID()}`;
}
