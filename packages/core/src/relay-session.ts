import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';
import { distinct, Observable, Subject } from 'rxjs';

import {
  buildRequestExecutionPlan,
  type OptimizedLogicalRequestPlan,
  type RequestOptimizerCapabilities
} from './request-planning.js';
import type {
  AggregateSessionReason,
  AggregateSessionState,
  NegentropyTransportResult,
  RelayConnectionState,
  RelayObservation,
  RelayObservationReason,
  RequestKey,
  SessionObservation
} from './vocabulary.js';

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

export interface NegentropyRequestOptions {
  readonly relayUrl: string;
  readonly filter: Filter;
  readonly initialMessageHex: string;
  readonly timeoutMs?: number;
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
  readonly coalescingScope?: string;
  emit(input: Filter | Filter[] | Record<string, unknown> | Array<Record<string, unknown>>): void;
  over(): void;
  readonly filters: Filter[];
  readonly closed: boolean;
  onChange(listener: () => void): () => void;
}

export interface CreateRelayRequestOptions {
  readonly requestKey?: RequestKey;
  readonly coalescingScope?: string;
}

class MutableRelayRequest implements RelayRequest {
  private listeners = new Set<() => void>();
  private collected: Filter[] = [];
  private completed = false;

  constructor(
    readonly mode: 'backward' | 'forward',
    readonly requestKey?: RequestKey,
    readonly coalescingScope?: string
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
  requestNegentropySync(options: NegentropyRequestOptions): Promise<NegentropyTransportResult>;
  send(params: EventParameters, options?: RelaySendOptions): Observable<OkPacketAgainstEvent>;
  cast(params: EventParameters, options?: RelaySendOptions): Promise<void>;
  dispose(): void;
}

export interface CreateRelaySessionOptions {
  readonly defaultRelays: readonly string[];
  readonly eoseTimeout?: number;
  readonly requestOptimizer?: RelayRequestOptimizerOptions;
}

export type CreateRxNostrSessionOptions = CreateRelaySessionOptions;

export interface RelayRequestOptimizerOptions {
  readonly defaultMaxFiltersPerRequest?: number;
  readonly relayMaxFiltersPerRequest?: Record<string, number | undefined>;
}

interface RelayRequestObserver {
  next(packet: EventPacket): void;
  error(error: unknown): void;
  complete(): void;
}

interface RelayRequestConsumer {
  readonly requestKey: RequestKey;
  readonly observer: RelayRequestObserver;
  currentGroupKey: string | null;
}

interface ActiveRequestGroup {
  readonly groupKey: string;
  readonly mode: 'backward' | 'forward';
  readonly relayUrls: string[];
  readonly plansByRelay: Map<string, OptimizedLogicalRequestPlan>;
  readonly consumers: Set<RelayRequestConsumer>;
  consumerCount: number;
  readonly requestKeys: Set<RequestKey>;
  readonly pendingSubIds: Set<string>;
  readonly transportSubIds: Map<string, Map<string, string>>;
  readonly cleanup: Array<() => void>;
  started: boolean;
  finished: boolean;
}

class RelaySession implements RxNostr {
  private readonly defaultRelays = new Map<string, DefaultRelayConfig>();
  private readonly connections = new Map<string, RelaySocket>();
  private readonly messages = new Subject<{ from: string; message: unknown }>();
  private readonly states = new Subject<ConnectionStatePacket>();
  private readonly sessionStates = new Subject<SessionObservation>();
  private readonly requestGroups = new Map<string, ActiveRequestGroup>();
  private readonly groupToSubIds = new Map<string, Set<string>>();
  private readonly subIdToGroupKey = new Map<string, string>();
  private readonly relayGroupKeys = new Map<string, Set<string>>();
  private readonly relayNeedsReplay = new Map<string, Set<string>>();
  private readonly relayObservations = new Map<string, RelayObservation>();
  private disposed = false;

  constructor(
    private readonly eoseTimeout: number,
    defaultRelays: readonly string[],
    private readonly requestOptimizer: RelayRequestOptimizerOptions
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
    for (const [url, config] of next.entries()) {
      this.defaultRelays.set(url, config);
    }
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
      const requestKey = req.requestKey;
      if (!requestKey) {
        observer.error(
          new Error(`Relay request is missing canonical requestKey for ${req.mode} mode`)
        );
        return;
      }

      const relayUrls = this.resolveReadRelays(options?.on);
      const consumer: RelayRequestConsumer = {
        requestKey,
        observer,
        currentGroupKey: null
      };
      let currentFilters: Filter[] = [];
      let started = false;
      let forwardFlushQueued = false;
      let disposed = false;

      const syncConsumerGroup = () => {
        if (disposed) return;
        if (currentFilters.length === 0) {
          this.detachConsumer(consumer);
          return;
        }

        const group = this.getOrCreateRequestGroup({
          requestKey,
          coalescingScope: req.coalescingScope,
          mode: req.mode,
          relayUrls,
          filters: currentFilters
        });

        if (consumer.currentGroupKey === group.groupKey) return;

        this.detachConsumer(consumer);
        if (!group.consumers.has(consumer)) {
          group.consumers.add(consumer);
          group.consumerCount += 1;
        }
        group.requestKeys.add(requestKey);
        consumer.currentGroupKey = group.groupKey;

        if (!group.started) {
          group.started = true;
          this.startRequestGroup(group);
        }
      };

      const scheduleForwardFlush = () => {
        if (forwardFlushQueued) return;
        forwardFlushQueued = true;
        queueMicrotask(() => {
          forwardFlushQueued = false;
          syncConsumerGroup();
        });
      };

      const handleReqChange = () => {
        currentFilters = req.filters;
        if (req.mode === 'backward') {
          if (!started && req.closed) {
            started = true;
            syncConsumerGroup();
          }
          return;
        }
        scheduleForwardFlush();
      };

      const off = req.onChange(handleReqChange);
      handleReqChange();

      return () => {
        disposed = true;
        off();
        this.detachConsumer(consumer);
      };
    });
  }

  private getOrCreateRequestGroup(input: {
    requestKey: RequestKey;
    coalescingScope?: string;
    mode: 'backward' | 'forward';
    relayUrls: string[];
    filters: Filter[];
  }): ActiveRequestGroup {
    const overlay = {
      relays: input.relayUrls,
      includeDefaultReadRelays: false
    };
    const plansByRelay = new Map<string, OptimizedLogicalRequestPlan>();
    const basePlan = buildRequestExecutionPlan({
      requestKey: input.requestKey,
      coalescingScope: input.coalescingScope,
      mode: input.mode,
      filters: input.filters,
      overlay
    });

    for (const relayUrl of input.relayUrls) {
      plansByRelay.set(
        relayUrl,
        buildRequestExecutionPlan(
          {
            requestKey: input.requestKey,
            coalescingScope: input.coalescingScope,
            mode: input.mode,
            filters: input.filters,
            overlay
          },
          this.resolveRequestOptimizerCapabilities(relayUrl)
        )
      );
    }

    const existing = this.requestGroups.get(basePlan.logicalKey);
    if (existing) {
      existing.requestKeys.add(input.requestKey);
      return existing;
    }

    const group: ActiveRequestGroup = {
      groupKey: basePlan.logicalKey,
      mode: input.mode,
      relayUrls: [...input.relayUrls],
      plansByRelay,
      consumers: new Set(),
      consumerCount: 0,
      requestKeys: new Set([input.requestKey]),
      pendingSubIds: new Set(),
      transportSubIds: new Map(),
      cleanup: [],
      started: false,
      finished: false
    };

    const messageSub = this.messages.subscribe(({ from, message }) => {
      if (!group.relayUrls.includes(from) || !Array.isArray(message)) return;
      const [type, incomingSubId] = message as [string, string, ...unknown[]];
      if (this.subIdToGroupKey.get(incomingSubId) !== group.groupKey) return;
      if (!this.groupOwnsRelaySubId(group, from, incomingSubId)) return;

      if (type === 'EVENT') {
        const event = (message as [string, string, NostrEvent])[2];
        for (const consumer of group.consumers) {
          consumer.observer.next({ from, event });
        }
        return;
      }

      if ((type === 'EOSE' || type === 'CLOSED') && group.mode === 'backward') {
        group.pendingSubIds.delete(incomingSubId);
        this.untrackSubId(incomingSubId);
        this.completeBackwardGroupIfDone(group);
      }
    });
    group.cleanup.push(() => messageSub.unsubscribe());

    const stateSub = this.states.subscribe((packet) => {
      if (!group.relayUrls.includes(packet.from)) return;

      if (group.mode === 'backward') {
        if (
          packet.state === 'backoff' ||
          packet.state === 'closed' ||
          packet.state === 'degraded'
        ) {
          this.dropRelayPendingSubIds(group, packet.from);
          this.completeBackwardGroupIfDone(group);
        }
        return;
      }

      if (packet.state === 'backoff' || packet.state === 'closed' || packet.state === 'degraded') {
        this.markRelayNeedsReplay(packet.from, group.groupKey);
        void this.getConnection(packet.from)
          .connect()
          .catch(() => {});
        return;
      }

      if (packet.state === 'open') {
        void this.restoreRelayStreams(packet.from);
      }
    });
    group.cleanup.push(() => stateSub.unsubscribe());

    this.registerReplayRecord(group);
    return group;
  }

  private resolveRequestOptimizerCapabilities(relayUrl: string): RequestOptimizerCapabilities {
    const relaySpecific = this.requestOptimizer.relayMaxFiltersPerRequest?.[relayUrl];
    return {
      maxFiltersPerShard: relaySpecific ?? this.requestOptimizer.defaultMaxFiltersPerRequest
    };
  }

  private startRequestGroup(group: ActiveRequestGroup): void {
    if (group.mode === 'backward') {
      const timer = setTimeout(() => {
        group.pendingSubIds.clear();
        this.completeBackwardGroupIfDone(group);
      }, this.eoseTimeout);
      group.cleanup.push(() => clearTimeout(timer));

      if (group.relayUrls.length === 0) {
        this.completeBackwardGroupIfDone(group);
        return;
      }
    }

    for (const relayUrl of group.relayUrls) {
      void this.sendGroupToRelay(group, relayUrl);
    }
  }

  private async sendGroupToRelay(group: ActiveRequestGroup, relayUrl: string): Promise<void> {
    const plan = group.plansByRelay.get(relayUrl);
    if (!plan || plan.shards.length === 0) {
      this.dropRelayPendingSubIds(group, relayUrl);
      this.completeBackwardGroupIfDone(group);
      return;
    }

    try {
      await this.closeRelayTransport(group, relayUrl);
      const relay = this.getConnection(relayUrl);
      const shardSubIds = new Map<string, string>();
      group.transportSubIds.set(relayUrl, shardSubIds);

      for (const shard of plan.shards) {
        const subId = createSubId();
        shardSubIds.set(shard.shardKey, subId);
        this.trackRequestTransport(group.groupKey, subId, relayUrl);
        if (group.mode === 'backward') {
          group.pendingSubIds.add(subId);
        }
        await relay.send(['REQ', subId, ...shard.filters]);
      }
    } catch {
      this.dropRelayPendingSubIds(group, relayUrl);
      this.completeBackwardGroupIfDone(group);
    }
  }

  private async closeRelayTransport(group: ActiveRequestGroup, relayUrl: string): Promise<void> {
    const relaySubIds = group.transportSubIds.get(relayUrl);
    if (!relaySubIds) return;

    group.transportSubIds.delete(relayUrl);
    for (const subId of relaySubIds.values()) {
      group.pendingSubIds.delete(subId);
      this.untrackSubId(subId);
    }
  }

  private groupOwnsRelaySubId(group: ActiveRequestGroup, relayUrl: string, subId: string): boolean {
    return [...(group.transportSubIds.get(relayUrl)?.values() ?? [])].includes(subId);
  }

  private dropRelayPendingSubIds(group: ActiveRequestGroup, relayUrl: string): void {
    const relaySubIds = group.transportSubIds.get(relayUrl);
    if (!relaySubIds) return;

    for (const subId of relaySubIds.values()) {
      group.pendingSubIds.delete(subId);
      this.untrackSubId(subId);
    }
  }

  private completeBackwardGroupIfDone(group: ActiveRequestGroup): void {
    if (group.mode !== 'backward' || group.finished || group.pendingSubIds.size > 0) return;

    group.finished = true;
    group.consumerCount = 0;
    for (const consumer of group.consumers) {
      consumer.currentGroupKey = null;
      consumer.observer.complete();
    }
    this.teardownRequestGroup(group.groupKey, false);
  }

  private detachConsumer(consumer: RelayRequestConsumer): void {
    const groupKey = consumer.currentGroupKey;
    consumer.currentGroupKey = null;
    if (!groupKey) return;

    const group = this.requestGroups.get(groupKey);
    if (!group) return;

    if (group.consumers.delete(consumer)) {
      group.consumerCount = Math.max(0, group.consumerCount - 1);
    }
    if (group.consumerCount === 0) {
      this.teardownRequestGroup(group.groupKey, true);
    }
  }

  private teardownRequestGroup(groupKey: string, closeTransport: boolean): void {
    const group = this.requestGroups.get(groupKey);
    if (!group) return;

    for (const stop of group.cleanup.splice(0)) stop();

    for (const [relayUrl, relaySubIds] of group.transportSubIds.entries()) {
      const relay = closeTransport ? this.connections.get(relayUrl) : undefined;
      for (const subId of relaySubIds.values()) {
        if (relay) {
          void relay.send(['CLOSE', subId]).catch(() => {});
        }
        this.untrackSubId(subId);
      }
    }

    group.transportSubIds.clear();
    group.pendingSubIds.clear();
    this.unregisterReplayRecord(groupKey);
  }

  async requestNegentropySync(
    options: NegentropyRequestOptions
  ): Promise<NegentropyTransportResult> {
    const relay = this.getConnection(options.relayUrl);
    const subId = createNegentropySubId();

    try {
      await relay.connect();
    } catch {
      return {
        capability: 'failed',
        reason: 'transport-connect-failed'
      };
    }

    return new Promise<NegentropyTransportResult>((resolve) => {
      let settled = false;
      const cleanup: Array<() => void> = [];

      const finish = (result: NegentropyTransportResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        for (const stop of cleanup.splice(0)) stop();
        void relay.send(['NEG-CLOSE', subId]).catch(() => {});
        resolve(result);
      };

      const messageSub = this.messages.subscribe(({ from, message }) => {
        if (from !== options.relayUrl || !Array.isArray(message)) return;
        const [type, incomingSubId] = message as [string, string, ...unknown[]];
        if (incomingSubId !== subId) return;

        if (type === 'NEG-MSG' && typeof message[2] === 'string') {
          finish({
            capability: 'supported',
            messageHex: message[2]
          });
          return;
        }

        if (type === 'NEG-ERR') {
          finish({
            capability: 'unsupported',
            reason: typeof message[2] === 'string' ? message[2] : 'relay-error'
          });
        }
      });
      cleanup.push(() => messageSub.unsubscribe());

      const stateSub = this.states.subscribe((packet) => {
        if (packet.from !== options.relayUrl) return;
        if (
          packet.state === 'backoff' ||
          packet.state === 'closed' ||
          packet.state === 'degraded'
        ) {
          finish({
            capability: 'failed',
            reason: `relay-${packet.state}`
          });
        }
      });
      cleanup.push(() => stateSub.unsubscribe());

      const timeout = setTimeout(() => {
        finish({
          capability: 'failed',
          reason: 'timeout'
        });
      }, options.timeoutMs ?? this.eoseTimeout);

      void relay.send(['NEG-OPEN', subId, options.filter, options.initialMessageHex]).catch(() => {
        finish({
          capability: 'failed',
          reason: 'transport-send-failed'
        });
      });
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
              observer.next({
                from: url,
                eventId,
                ok: false,
                done: pendingRelays.size === 0
              });
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

    for (const group of [...this.requestGroups.values()]) {
      this.teardownRequestGroup(group.groupKey, false);
    }

    for (const relayUrl of this.connections.keys()) {
      this.updateRelayObservation(relayUrl, 'closed', 'disposed');
    }

    this.sessionStates.next(this.getSessionObservation());
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
    this.requestGroups.clear();
    this.groupToSubIds.clear();
    this.subIdToGroupKey.clear();
    this.relayGroupKeys.clear();
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
    if (relays.some((relay) => relay.connection === 'replaying')) {
      return 'replaying';
    }
    if (relays.some((relay) => relay.connection === 'open')) return 'live';
    if (relays.some((relay) => relay.connection === 'connecting')) {
      return 'connecting';
    }
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

  private registerReplayRecord(group: ActiveRequestGroup): void {
    this.requestGroups.set(group.groupKey, group);
    for (const relayUrl of group.relayUrls) {
      const set = this.relayGroupKeys.get(relayUrl) ?? new Set<string>();
      set.add(group.groupKey);
      this.relayGroupKeys.set(relayUrl, set);
    }
  }

  private unregisterReplayRecord(groupKey: string): void {
    const group = this.requestGroups.get(groupKey);
    if (!group) return;
    this.requestGroups.delete(groupKey);

    for (const relayUrl of group.relayUrls) {
      const set = this.relayGroupKeys.get(relayUrl);
      if (!set) continue;
      set.delete(groupKey);
      if (set.size === 0) this.relayGroupKeys.delete(relayUrl);
    }

    for (const set of this.relayNeedsReplay.values()) {
      set.delete(groupKey);
    }

    const subIds = this.groupToSubIds.get(groupKey);
    if (!subIds) return;
    for (const subId of subIds) {
      this.subIdToGroupKey.delete(subId);
    }
    this.groupToSubIds.delete(groupKey);
  }

  private trackRequestTransport(groupKey: string, subId: string, relayUrl: string): void {
    const subIds = this.groupToSubIds.get(groupKey) ?? new Set<string>();
    subIds.add(subId);
    this.groupToSubIds.set(groupKey, subIds);
    this.subIdToGroupKey.set(subId, groupKey);

    const relaySet = this.relayGroupKeys.get(relayUrl) ?? new Set<string>();
    relaySet.add(groupKey);
    this.relayGroupKeys.set(relayUrl, relaySet);
  }

  private untrackSubId(subId: string): void {
    const groupKey = this.subIdToGroupKey.get(subId);
    if (!groupKey) return;
    this.subIdToGroupKey.delete(subId);
    const subIds = this.groupToSubIds.get(groupKey);
    if (!subIds) return;
    subIds.delete(subId);
    if (subIds.size === 0) {
      this.groupToSubIds.delete(groupKey);
    }
  }

  private markRelayNeedsReplay(relayUrl: string, groupKey: string): void {
    const set = this.relayNeedsReplay.get(relayUrl) ?? new Set<string>();
    set.add(groupKey);
    this.relayNeedsReplay.set(relayUrl, set);
  }

  private async restoreRelayStreams(relayUrl: string): Promise<void> {
    const pending = this.relayNeedsReplay.get(relayUrl);
    if (!pending || pending.size === 0) return;
    this.updateRelayObservation(relayUrl, 'replaying', 'replay-started');
    const groupKeys = [...pending];
    this.relayNeedsReplay.delete(relayUrl);

    try {
      await Promise.all(
        groupKeys.map(async (groupKey) => {
          const group = this.requestGroups.get(groupKey);
          if (!group || group.mode !== 'forward') return;
          if (!group.relayUrls.includes(relayUrl)) return;
          if ((group.plansByRelay.get(relayUrl)?.shards.length ?? 0) === 0) {
            return;
          }
          await this.sendGroupToRelay(group, relayUrl);
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
  return new RelaySession(
    options.eoseTimeout ?? 10_000,
    options.defaultRelays,
    options.requestOptimizer ?? {}
  );
}

export function createRxNostrSession(options: CreateRxNostrSessionOptions): RxNostr {
  return createRelaySession(options);
}

export function createBackwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return new MutableRelayRequest('backward', options?.requestKey, options?.coalescingScope);
}

export function createForwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return new MutableRelayRequest('forward', options?.requestKey, options?.coalescingScope);
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

function createNegentropySubId(): string {
  return `neg-${crypto.randomUUID()}`;
}
