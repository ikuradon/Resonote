import {
  type AggregateSessionReason,
  type AggregateSessionState,
  type EventSigner,
  type Filter as RequestFilter,
  type NegentropyTransportResult,
  normalizeRelayUrl,
  parseRelayLimitClosedReason,
  type RelayCapabilityLearningEvent,
  type RelayConnectionState,
  type RelayExecutionCapability,
  type RelayObservation,
  type RelayObservationReason,
  type RequestKey,
  type SessionObservation,
  type SignedEventShape,
  type UnsignedEvent
} from '@auftakt/core';
import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';
import { distinct, Observable, Subject } from 'rxjs';

import {
  normalizeRelayCapabilitySnapshot,
  type RelayCapabilityPacket,
  type RelayCapabilitySnapshot,
  type RelayRuntimeCapabilityState
} from './relay-capability.js';
import {
  calculateRelayReconnectDelay,
  type NormalizedRelayLifecycleOptions,
  normalizeRelayLifecycleOptions,
  type RelayLifecycleMode,
  type RelayLifecycleOptions,
  type RelayLifecyclePolicy
} from './relay-lifecycle.js';
import {
  buildRequestExecutionPlan,
  type OptimizedLogicalRequestPlan,
  type RequestOptimizerCapabilities
} from './request-planning.js';

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
  signer?: EventSigner;
}

export interface NegentropyRequestOptions {
  readonly relayUrl: string;
  readonly filter: Filter;
  readonly initialMessageHex: string;
  readonly timeoutMs?: number;
}

export interface CountRequestOptions {
  readonly relayUrl: string;
  readonly filters: readonly Filter[];
  readonly timeoutMs?: number;
}

export interface CountResult {
  readonly capability: 'supported' | 'unsupported' | 'failed';
  readonly count?: number;
  readonly approximate?: boolean;
  readonly hll?: string;
  readonly reason?: string;
}

export interface RelaySendOptions {
  signer?: EventSigner;
  on?: RelaySelectionOptions;
}

function normalizeRelaySessionKey(url: string): string {
  return normalizeRelayUrl(url) ?? url;
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
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly queue: Array<{ readonly payload: unknown }> = [];
  private intentionalCloseReason: RelayObservationReason | undefined;
  private reconnectAttempts = 0;
  state: RelayConnectionState = 'idle';

  constructor(
    readonly url: string,
    private readonly getPolicy: () => RelayLifecyclePolicy,
    private readonly shouldReconnect: () => boolean,
    private readonly onMessage: (from: string, message: unknown) => void,
    private readonly onStateChange: (
      from: string,
      state: RelayConnectionState,
      reason?: RelayObservationReason
    ) => void
  ) {}

  async connect(): Promise<WebSocket> {
    this.cancelIdleTimer();
    this.cancelReconnectTimer();
    if (this.ws?.readyState === WebSocket.OPEN) return this.ws;
    if (this.connectPromise) return this.connectPromise;

    this.setState('connecting', 'connecting');
    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      let opened = false;

      ws.addEventListener('open', () => {
        opened = true;
        this.ws = ws;
        this.connectPromise = undefined;
        this.intentionalCloseReason = undefined;
        this.reconnectAttempts = 0;
        this.setState('open', 'opened');
        this.flushQueue();
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
          this.ws = undefined;
          this.setState('degraded', 'connect-failed');
          reject(error);
        }
      });

      ws.addEventListener('close', () => {
        this.ws = undefined;
        this.connectPromise = undefined;
        const reason = this.intentionalCloseReason;
        this.intentionalCloseReason = undefined;

        if (reason === 'idle-timeout') {
          this.setState('idle', 'idle-timeout');
          return;
        }

        if (reason) {
          this.setState('closed', reason);
          return;
        }

        if (opened) {
          if (!this.shouldReconnect()) {
            this.setState('backoff', 'disconnected');
            return;
          }
          this.scheduleReconnect();
          return;
        }

        this.setState('closed', 'connect-failed');
      });
    });

    return this.connectPromise;
  }

  async send(payload: unknown): Promise<void> {
    this.cancelIdleTimer();
    if (this.ws?.readyState !== WebSocket.OPEN) {
      const queued = { payload };
      this.queue.push(queued);
      try {
        await this.connect();
      } catch (error) {
        const index = this.queue.indexOf(queued);
        if (index >= 0) this.queue.splice(index, 1);
        throw error;
      }
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  scheduleIdleDisconnect(): void {
    const policy = this.getPolicy();
    if (policy.mode !== 'lazy') return;
    if (this.state !== 'open') return;
    if (this.idleTimer) return;

    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.intentionalCloseReason = 'idle-timeout';
        this.ws.close();
        return;
      }
      this.ws = undefined;
      this.connectPromise = undefined;
      this.setState('idle', 'idle-timeout');
    }, policy.idleDisconnectMs);
  }

  close(reason: RelayObservationReason = 'disposed'): void {
    this.cancelIdleTimer();
    this.cancelReconnectTimer();
    this.queue.splice(0);
    this.intentionalCloseReason = reason;

    if (this.ws) {
      this.ws.close();
      return;
    }

    this.ws = undefined;
    this.connectPromise = undefined;
    this.setState('closed', reason);
  }

  private scheduleReconnect(): void {
    const policy = this.getPolicy();
    const attempt = this.reconnectAttempts + 1;
    const delay = calculateRelayReconnectDelay(attempt, policy.retry);
    if (delay === null) {
      this.reconnectAttempts = attempt;
      this.setState('degraded', 'retry-exhausted');
      return;
    }

    this.reconnectAttempts = attempt;
    this.setState('backoff', 'reconnect-scheduled');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.shouldReconnect()) return;
      void this.connect().catch(() => {});
    }, delay);
  }

  private flushQueue(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    for (const { payload } of this.queue.splice(0)) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private cancelIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private cancelReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private setState(next: RelayConnectionState, reason?: RelayObservationReason): void {
    this.state = next;
    this.onStateChange(this.url, next, reason);
  }
}

export interface RelaySessionApi {
  getDefaultRelays(): Record<string, DefaultRelayConfig>;
  setDefaultRelays(relays: string[]): void;
  getRelayStatus(url: string): RelayStatus | undefined;
  getSessionObservation(): SessionObservation;
  createSessionObservationObservable(): Observable<SessionObservation>;
  createConnectionStateObservable(): Observable<ConnectionStatePacket>;
  setRelayCapabilities(capabilities: Record<string, RelayExecutionCapability | undefined>): void;
  setRelayCapabilityLearningHandler(
    handler: ((event: RelayCapabilityLearningEvent) => void) | null
  ): void;
  getRelayCapabilitySnapshot(url: string): RelayCapabilitySnapshot;
  createRelayCapabilityObservable(): Observable<RelayCapabilityPacket>;
  use(req: RelayRequest, options?: RelayUseOptions): Observable<EventPacket>;
  requestNegentropySync(options: NegentropyRequestOptions): Promise<NegentropyTransportResult>;
  requestCount(options: CountRequestOptions): Promise<CountResult>;
  send(params: EventParameters, options?: RelaySendOptions): Observable<OkPacketAgainstEvent>;
  cast(params: EventParameters, options?: RelaySendOptions): Promise<void>;
  dispose(): void;
}

export interface CreateRelaySessionOptions {
  readonly defaultRelays: readonly string[];
  readonly eoseTimeout?: number;
  readonly requestOptimizer?: RelayRequestOptimizerOptions;
  readonly relayLifecycle?: RelayLifecycleOptions;
}

export interface RelayRequestOptimizerOptions {
  readonly defaultMaxFiltersPerRequest?: number;
  readonly relayMaxFiltersPerRequest?: Record<string, number | undefined>;
  readonly relayCapabilities?: Record<string, RelayExecutionCapability | undefined>;
  readonly onCapabilityLearned?: (event: RelayCapabilityLearningEvent) => void;
}

interface RelayRequestObserver {
  next(packet: EventPacket): void;
  error(error: unknown): void;
  complete(): void;
}

interface RelayRequestConsumer {
  readonly requestKey: RequestKey;
  readonly observer: RelayRequestObserver;
  readonly deliveredEventIds: Set<string>;
  currentGroupKey: string | null;
}

interface QueuedRelayShard {
  readonly shardKey: string;
  readonly filters: readonly RequestFilter[];
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
  readonly relayShardQueues: Map<string, QueuedRelayShard[]>;
  readonly activeRelaySubIds: Map<string, Set<string>>;
  readonly activeRelayShards: Map<string, Map<string, QueuedRelayShard>>;
  readonly authRetriedShardKeys: Map<string, Set<string>>;
  readonly cleanup: Array<() => void>;
  signer?: EventSigner;
  started: boolean;
  finished: boolean;
}

interface RelayAuthState {
  challenge?: string;
  readonly authenticatedPubkeys: Set<string>;
  readonly pendingByPubkey: Map<string, Promise<boolean>>;
}

class RelaySession implements RelaySessionApi {
  private readonly defaultRelays = new Map<string, DefaultRelayConfig>();
  private readonly defaultRelayKeys = new Set<string>();
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
  private readonly relayCapabilities = new Map<string, RelayExecutionCapability>();
  private readonly relayLifecyclePolicies = new Map<string, RelayLifecyclePolicy>();
  private readonly relayLifecycleOptions: NormalizedRelayLifecycleOptions;
  private readonly capabilityStates = new Subject<RelayCapabilityPacket>();
  private readonly relayAuthStates = new Map<string, RelayAuthState>();
  private capabilityLearningHandler: ((event: RelayCapabilityLearningEvent) => void) | undefined;
  private disposed = false;

  constructor(
    private readonly eoseTimeout: number,
    defaultRelays: readonly string[],
    private readonly requestOptimizer: RelayRequestOptimizerOptions,
    relayLifecycle: RelayLifecycleOptions = {}
  ) {
    this.relayLifecycleOptions = normalizeRelayLifecycleOptions(relayLifecycle);
    this.setDefaultRelays([...defaultRelays]);
    this.setRelayCapabilities(requestOptimizer.relayCapabilities ?? {});
    this.capabilityLearningHandler = requestOptimizer.onCapabilityLearned;
  }

  getDefaultRelays(): Record<string, DefaultRelayConfig> {
    return Object.fromEntries(
      [...this.defaultRelays.entries()].map(([url, config]) => [url, { ...config }])
    );
  }

  setDefaultRelays(relays: string[]): void {
    const nextByKey = new Map<string, DefaultRelayConfig>();
    for (const relay of relays) {
      const key = normalizeRelaySessionKey(relay);
      if (nextByKey.has(key)) continue;
      nextByKey.set(key, { url: relay, read: true, write: true });
      this.registerRelayLifecyclePolicy(relay, 'lazy-keep');
    }
    const nextKeys = new Set(nextByKey.keys());

    for (const [url, connection] of this.connections.entries()) {
      if (!nextKeys.has(normalizeRelaySessionKey(url))) {
        connection.close();
        this.relayLifecyclePolicies.delete(url);
        this.connections.delete(url);
      }
    }

    this.defaultRelays.clear();
    this.defaultRelayKeys.clear();
    for (const [key, config] of nextByKey.entries()) {
      const url = config.url;
      this.defaultRelays.set(url, config);
      this.defaultRelayKeys.add(key);
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

  setRelayCapabilities(capabilities: Record<string, RelayExecutionCapability | undefined>): void {
    for (const [url, capability] of Object.entries(capabilities)) {
      if (!capability) {
        this.relayCapabilities.delete(url);
        this.publishRelayCapability(url);
        continue;
      }
      this.relayCapabilities.set(url, capability);
      this.publishRelayCapability(url);
    }
  }

  setRelayCapabilityLearningHandler(
    handler: ((event: RelayCapabilityLearningEvent) => void) | null
  ): void {
    this.capabilityLearningHandler = handler ?? undefined;
  }

  getRelayCapabilitySnapshot(url: string): RelayCapabilitySnapshot {
    return normalizeRelayCapabilitySnapshot(this.buildRuntimeCapabilityState(url));
  }

  createRelayCapabilityObservable(): Observable<RelayCapabilityPacket> {
    return this.capabilityStates.asObservable();
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
        deliveredEventIds: new Set(),
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
          filters: currentFilters,
          signer: options?.signer
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

  private buildRuntimeCapabilityState(url: string): RelayRuntimeCapabilityState {
    const capability = this.relayCapabilities.get(url);
    const legacyRelaySpecific = this.requestOptimizer.relayMaxFiltersPerRequest?.[url] ?? null;
    const legacyDefault = this.requestOptimizer.defaultMaxFiltersPerRequest ?? null;
    const fallbackMaxFilters = minNullable(legacyRelaySpecific, legacyDefault);
    return {
      relayUrl: url,
      maxFilters: capability?.maxFilters ?? fallbackMaxFilters,
      maxSubscriptions: capability?.maxSubscriptions ?? null,
      supportedNips: capability?.supportedNips ?? [],
      source:
        capability?.source ??
        (fallbackMaxFilters !== null ? ('override' as const) : ('unknown' as const)),
      expiresAt: capability?.expiresAt ?? null,
      stale: capability?.stale ?? false,
      queueDepth: this.countQueuedShards(url),
      activeSubscriptions: this.countActiveSubscriptions(url)
    };
  }

  private publishRelayCapability(url: string): void {
    this.capabilityStates.next({
      from: url,
      capability: this.getRelayCapabilitySnapshot(url)
    });
  }

  private countQueuedShards(url: string): number {
    let count = 0;
    for (const group of this.requestGroups.values()) {
      count += group.relayShardQueues.get(url)?.length ?? 0;
    }
    return count;
  }

  private countActiveSubscriptions(url: string): number {
    let count = 0;
    for (const group of this.requestGroups.values()) {
      count += group.activeRelaySubIds.get(url)?.size ?? 0;
    }
    return count;
  }

  private getOrCreateRequestGroup(input: {
    requestKey: RequestKey;
    coalescingScope?: string;
    mode: 'backward' | 'forward';
    relayUrls: string[];
    filters: Filter[];
    signer?: EventSigner;
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
      existing.signer ??= input.signer;
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
      relayShardQueues: new Map(),
      activeRelaySubIds: new Map(),
      activeRelayShards: new Map(),
      authRetriedShardKeys: new Map(),
      cleanup: [],
      signer: input.signer,
      started: false,
      finished: false
    };

    const messageSub = this.messages.subscribe({
      next: ({ from, message }) => {
        if (!group.relayUrls.includes(from) || !Array.isArray(message)) return;
        const [type, incomingSubId] = message as [string, string, ...unknown[]];
        if (this.subIdToGroupKey.get(incomingSubId) !== group.groupKey) return;
        if (!this.groupOwnsRelaySubId(group, from, incomingSubId)) return;

        if (type === 'EVENT') {
          const event = (message as [string, string, NostrEvent])[2];
          for (const consumer of group.consumers) {
            const eventId = typeof event?.id === 'string' ? event.id : null;
            if (eventId && consumer.deliveredEventIds.has(eventId)) continue;
            if (eventId) consumer.deliveredEventIds.add(eventId);
            consumer.observer.next({ from, event });
          }
          return;
        }

        if (type === 'CLOSED') {
          const reason = typeof message[2] === 'string' ? message[2] : '';
          if (this.retryRelayShardAfterAuthRequired(group, from, incomingSubId, reason)) {
            return;
          }
        }

        if ((type === 'EOSE' || type === 'CLOSED') && group.mode === 'backward') {
          if (type === 'CLOSED') {
            const reason = typeof message[2] === 'string' ? message[2] : '';
            const learned = parseRelayLimitClosedReason({
              relayUrl: from,
              reason,
              activeAcceptedSubscriptions: this.countActiveSubscriptions(from)
            });
            if (learned) {
              const activeShard = this.getActiveRelayShard(group, from, incomingSubId);
              this.applyLearnedRelayCapability(learned);
              if (activeShard) {
                this.requeueRelayShardAfterCapabilityLearning(group, from, activeShard, learned);
              }
              this.capabilityLearningHandler?.(learned);
            }
          }
          group.pendingSubIds.delete(incomingSubId);
          if (type === 'EOSE') {
            this.closeRelaySubscription(from, incomingSubId);
          }
          this.releaseRelaySubId(group, from, incomingSubId);
          void this.pumpRelayShardQueue(group, from)
            .catch(() => {
              this.dropRelayPendingSubIds(group, from);
            })
            .finally(() => this.completeBackwardGroupIfDone(group));
        }

        if (type === 'CLOSED' && group.mode === 'forward') {
          this.releaseRelaySubId(group, from, incomingSubId);
          void this.pumpRelayShardQueue(group, from).catch(() => {
            this.dropRelayPendingSubIds(group, from);
          });
        }
      }
    });
    group.cleanup.push(() => messageSub.unsubscribe());

    const stateSub = this.states.subscribe({
      next: (packet) => {
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

        if (
          packet.state === 'backoff' ||
          packet.state === 'closed' ||
          packet.state === 'degraded'
        ) {
          this.markRelayNeedsReplay(packet.from, group.groupKey);
          return;
        }

        if (packet.state === 'open') {
          void this.restoreRelayStreams(packet.from);
        }
      }
    });
    group.cleanup.push(() => stateSub.unsubscribe());

    this.registerReplayRecord(group);
    return group;
  }

  private resolveRequestOptimizerCapabilities(relayUrl: string): RequestOptimizerCapabilities {
    const capability = this.relayCapabilities.get(relayUrl);
    const relaySpecific = this.requestOptimizer.relayMaxFiltersPerRequest?.[relayUrl] ?? null;
    const fallback = this.requestOptimizer.defaultMaxFiltersPerRequest ?? null;
    return {
      maxFiltersPerShard: minNullable(capability?.maxFilters ?? null, relaySpecific, fallback),
      maxSubscriptions: capability?.maxSubscriptions ?? null
    };
  }

  private retryRelayShardAfterAuthRequired(
    group: ActiveRequestGroup,
    relayUrl: string,
    subId: string,
    reason: string
  ): boolean {
    if (!isAuthRequiredReason(reason) || !group.signer || !this.hasRelayAuthChallenge(relayUrl)) {
      return false;
    }

    const activeShard = this.getActiveRelayShard(group, relayUrl, subId);
    if (!activeShard) return false;

    const retried = group.authRetriedShardKeys.get(relayUrl) ?? new Set<string>();
    group.authRetriedShardKeys.set(relayUrl, retried);
    if (retried.has(activeShard.shardKey)) return false;
    retried.add(activeShard.shardKey);

    const currentQueue = group.relayShardQueues.get(relayUrl) ?? [];
    group.relayShardQueues.set(relayUrl, [activeShard, ...currentQueue]);
    group.pendingSubIds.delete(subId);
    this.releaseRelaySubId(group, relayUrl, subId);
    this.publishRelayCapability(relayUrl);

    void this.authenticateRelay(relayUrl, group.signer)
      .then((authenticated) => {
        if (!authenticated) {
          this.dropRelayPendingSubIds(group, relayUrl);
          this.completeBackwardGroupIfDone(group);
          return;
        }
        return this.pumpRelayShardQueue(group, relayUrl);
      })
      .catch(() => {
        this.dropRelayPendingSubIds(group, relayUrl);
        this.completeBackwardGroupIfDone(group);
      });

    return true;
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
      this.publishRelayCapability(relayUrl);
      return;
    }

    try {
      await this.closeRelayTransport(group, relayUrl);
      group.relayShardQueues.set(
        relayUrl,
        plan.shards.map((shard) => ({ shardKey: shard.shardKey, filters: shard.filters }))
      );
      group.activeRelaySubIds.set(relayUrl, new Set());
      await this.pumpRelayShardQueue(group, relayUrl);
    } catch {
      this.dropRelayPendingSubIds(group, relayUrl);
      this.completeBackwardGroupIfDone(group);
      this.publishRelayCapability(relayUrl);
    }
  }

  private async pumpRelayShardQueue(group: ActiveRequestGroup, relayUrl: string): Promise<void> {
    const relay = this.getConnection(relayUrl);
    const queue = group.relayShardQueues.get(relayUrl) ?? [];
    const active = group.activeRelaySubIds.get(relayUrl) ?? new Set<string>();
    group.activeRelaySubIds.set(relayUrl, active);
    const maxSubscriptions = this.relayCapabilities.get(relayUrl)?.maxSubscriptions ?? null;
    const availableSlots =
      maxSubscriptions === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, maxSubscriptions - active.size);

    let sent = 0;
    await this.authenticateRelayIfPossible(relayUrl, group.signer);
    while (queue.length > 0 && sent < availableSlots) {
      const shard = queue.shift();
      if (!shard) break;
      const subId = createSubId();
      const shardSubIds = group.transportSubIds.get(relayUrl) ?? new Map<string, string>();
      shardSubIds.set(shard.shardKey, subId);
      group.transportSubIds.set(relayUrl, shardSubIds);
      active.add(subId);
      const activeShards =
        group.activeRelayShards.get(relayUrl) ?? new Map<string, QueuedRelayShard>();
      activeShards.set(subId, shard);
      group.activeRelayShards.set(relayUrl, activeShards);
      this.trackRequestTransport(group.groupKey, subId, relayUrl);
      if (group.mode === 'backward') {
        group.pendingSubIds.add(subId);
      }
      await relay.send(['REQ', subId, ...shard.filters]);
      if (group.relayShardQueues.get(relayUrl) !== queue) {
        return;
      }
      sent += 1;
    }

    if (group.relayShardQueues.get(relayUrl) !== queue) {
      return;
    }
    group.relayShardQueues.set(relayUrl, queue);
    this.publishRelayCapability(relayUrl);
  }

  private async closeRelayTransport(group: ActiveRequestGroup, relayUrl: string): Promise<void> {
    const relaySubIds = group.transportSubIds.get(relayUrl);
    if (relaySubIds) {
      group.transportSubIds.delete(relayUrl);
      for (const subId of relaySubIds.values()) {
        group.pendingSubIds.delete(subId);
        this.untrackSubId(subId);
      }
    }
    group.activeRelaySubIds.get(relayUrl)?.clear();
    group.activeRelayShards.get(relayUrl)?.clear();
    group.relayShardQueues.delete(relayUrl);
    this.publishRelayCapability(relayUrl);
    this.maybeScheduleIdleDisconnect(relayUrl);
  }

  private groupOwnsRelaySubId(group: ActiveRequestGroup, relayUrl: string, subId: string): boolean {
    return [...(group.transportSubIds.get(relayUrl)?.values() ?? [])].includes(subId);
  }

  private closeRelaySubscription(relayUrl: string, subId: string): void {
    const relay = this.connections.get(relayUrl);
    if (!relay) return;
    void relay.send(['CLOSE', subId]).catch(() => {});
  }

  private dropRelayPendingSubIds(group: ActiveRequestGroup, relayUrl: string): void {
    const relaySubIds = group.transportSubIds.get(relayUrl);
    if (relaySubIds) {
      for (const subId of relaySubIds.values()) {
        group.pendingSubIds.delete(subId);
        this.untrackSubId(subId);
      }
    }
    group.activeRelaySubIds.get(relayUrl)?.clear();
    group.activeRelayShards.get(relayUrl)?.clear();
    group.relayShardQueues.delete(relayUrl);
    this.publishRelayCapability(relayUrl);
    this.maybeScheduleIdleDisconnect(relayUrl);
  }

  private releaseRelaySubId(group: ActiveRequestGroup, relayUrl: string, subId: string): void {
    group.activeRelaySubIds.get(relayUrl)?.delete(subId);
    group.activeRelayShards.get(relayUrl)?.delete(subId);
    const relaySubIds = group.transportSubIds.get(relayUrl);
    if (relaySubIds) {
      for (const [shardKey, trackedSubId] of relaySubIds.entries()) {
        if (trackedSubId === subId) {
          relaySubIds.delete(shardKey);
          break;
        }
      }
    }
    this.untrackSubId(subId);
    this.publishRelayCapability(relayUrl);
    this.maybeScheduleIdleDisconnect(relayUrl);
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
      group.activeRelaySubIds.get(relayUrl)?.clear();
      group.activeRelayShards.get(relayUrl)?.clear();
      group.relayShardQueues.delete(relayUrl);
      this.publishRelayCapability(relayUrl);
      this.maybeScheduleIdleDisconnect(relayUrl);
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

      const messageSub = this.messages.subscribe({
        next: ({ from, message }) => {
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
        }
      });
      cleanup.push(() => messageSub.unsubscribe());

      const stateSub = this.states.subscribe({
        next: (packet) => {
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

  async requestCount(options: CountRequestOptions): Promise<CountResult> {
    if (options.filters.length === 0) {
      return {
        capability: 'failed',
        reason: 'missing-filters'
      };
    }

    const relay = this.getConnection(options.relayUrl);
    const subId = createCountSubId();

    try {
      await relay.connect();
    } catch {
      return {
        capability: 'failed',
        reason: 'transport-connect-failed'
      };
    }

    return new Promise<CountResult>((resolve) => {
      let settled = false;
      const cleanup: Array<() => void> = [];

      const finish = (result: CountResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        for (const stop of cleanup.splice(0)) stop();
        resolve(result);
      };

      const messageSub = this.messages.subscribe({
        next: ({ from, message }) => {
          if (from !== options.relayUrl || !Array.isArray(message)) return;
          const [type, incomingSubId] = message as [string, string, ...unknown[]];
          if (incomingSubId !== subId) return;

          if (type === 'COUNT') {
            const parsed = parseCountPayload(message[2]);
            finish(
              parsed ?? {
                capability: 'failed',
                reason: 'invalid-count-response'
              }
            );
            return;
          }

          if (type === 'CLOSED') {
            finish({
              capability: 'unsupported',
              reason: typeof message[2] === 'string' ? message[2] : 'relay-closed'
            });
          }
        }
      });
      cleanup.push(() => messageSub.unsubscribe());

      const stateSub = this.states.subscribe({
        next: (packet) => {
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
        }
      });
      cleanup.push(() => stateSub.unsubscribe());

      const timeout = setTimeout(() => {
        finish({
          capability: 'failed',
          reason: 'timeout'
        });
      }, options.timeoutMs ?? this.eoseTimeout);

      void relay.send(['COUNT', subId, ...options.filters]).catch(() => {
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
      const authRetriedRelays = new Set<string>();
      let eventId = '';
      let settled = false;

      const finish = () => {
        if (settled || pendingRelays.size > 0) return;
        settled = true;
        observer.complete();
      };

      const start = async () => {
        const activeSigner = this.resolveEventSigner(params, options?.signer);
        const event = await this.signEvent(params, activeSigner);
        eventId = event.id;

        const rejectRelay = (url: string, notice?: string) => {
          if (!pendingRelays.delete(url)) return;
          observer.next({
            from: url,
            eventId,
            ok: false,
            notice,
            done: pendingRelays.size === 0
          });
          finish();
        };

        const retryEventAfterAuthentication = async (url: string, notice?: string) => {
          if (!activeSigner) {
            rejectRelay(url, notice);
            return;
          }
          const authenticated = await this.authenticateRelay(url, activeSigner).catch(() => false);
          if (!authenticated) {
            rejectRelay(url, notice);
            return;
          }
          const relay = this.getConnection(url);
          await relay.send(['EVENT', event]).catch(() => rejectRelay(url, notice));
        };

        const messageSub = this.messages.subscribe({
          next: ({ from, message }) => {
            if (!relayUrls.includes(from) || !Array.isArray(message)) return;
            if (message[0] !== 'OK' || message[1] !== eventId) return;
            const ok = Boolean(message[2]);
            const notice = typeof message[3] === 'string' ? message[3] : undefined;
            if (
              !ok &&
              activeSigner &&
              notice &&
              isAuthRequiredReason(notice) &&
              this.hasRelayAuthChallenge(from) &&
              !authRetriedRelays.has(from)
            ) {
              authRetriedRelays.add(from);
              void retryEventAfterAuthentication(from, notice);
              return;
            }
            pendingRelays.delete(from);
            observer.next({
              from,
              eventId,
              ok,
              notice,
              done: pendingRelays.size === 0
            });
            finish();
          }
        });
        cleanup.push(() => messageSub.unsubscribe());

        const stateSub = this.states.subscribe({
          next: (packet) => {
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
          }
        });
        cleanup.push(() => stateSub.unsubscribe());

        for (const url of relayUrls) pendingRelays.add(url);
        for (const url of relayUrls) {
          const relay = this.getConnection(url);
          void (async () => {
            if (hasProtectedEventTag(event)) {
              await this.authenticateRelayIfPossible(url, activeSigner);
            }
            await relay.send(['EVENT', event]);
          })().catch(() => rejectRelay(url));
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
    this.capabilityStates.complete();
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

  private getActiveRelayShard(
    group: ActiveRequestGroup,
    relayUrl: string,
    subId: string
  ): QueuedRelayShard | undefined {
    return group.activeRelayShards.get(relayUrl)?.get(subId);
  }

  private applyLearnedRelayCapability(event: RelayCapabilityLearningEvent): void {
    const existing = this.relayCapabilities.get(event.relayUrl);
    const learnedMaxFilters = event.kind === 'maxFilters' ? event.value : null;
    const learnedMaxSubscriptions = event.kind === 'maxSubscriptions' ? event.value : null;
    const source =
      !existing || existing.source === 'unknown' || existing.source === 'learned'
        ? 'learned'
        : 'mixed';

    this.relayCapabilities.set(event.relayUrl, {
      relayUrl: event.relayUrl,
      maxFilters: minNullable(existing?.maxFilters ?? null, learnedMaxFilters),
      maxSubscriptions: minNullable(existing?.maxSubscriptions ?? null, learnedMaxSubscriptions),
      supportedNips: [...(existing?.supportedNips ?? [])],
      source,
      expiresAt: existing?.expiresAt ?? null,
      stale: existing?.stale ?? false
    });
    this.publishRelayCapability(event.relayUrl);
  }

  private requeueRelayShardAfterCapabilityLearning(
    group: ActiveRequestGroup,
    relayUrl: string,
    failedShard: QueuedRelayShard,
    learned: RelayCapabilityLearningEvent
  ): void {
    const currentQueue = group.relayShardQueues.get(relayUrl) ?? [];

    if (learned.kind === 'maxSubscriptions') {
      group.relayShardQueues.set(relayUrl, [failedShard, ...currentQueue]);
      this.publishRelayCapability(relayUrl);
      return;
    }

    const shardSize = Math.max(1, Math.floor(learned.value));
    const retryFilters = [failedShard, ...currentQueue].flatMap((shard) => shard.filters);
    const retryQueue: QueuedRelayShard[] = [];

    for (let index = 0; index < retryFilters.length; index += shardSize) {
      retryQueue.push({
        shardKey: `${failedShard.shardKey}:adaptive:${retryQueue.length}`,
        filters: retryFilters.slice(index, index + shardSize)
      });
    }

    group.relayShardQueues.set(relayUrl, retryQueue);
    this.publishRelayCapability(relayUrl);
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

  private registerRelayLifecyclePolicy(url: string, mode: RelayLifecycleMode): void {
    const current = this.relayLifecyclePolicies.get(url);
    if (current?.mode === mode) return;

    const policy =
      mode === 'lazy-keep'
        ? this.relayLifecycleOptions.defaultRelay
        : this.relayLifecycleOptions.temporaryRelay;
    this.relayLifecyclePolicies.set(url, policy);
  }

  private isDefaultRelayUrl(url: string): boolean {
    return this.defaultRelayKeys.has(normalizeRelaySessionKey(url));
  }

  private addResolvedRelay(target: Map<string, string>, relay: string): void {
    const key = normalizeRelaySessionKey(relay);
    if (!target.has(key)) {
      target.set(key, relay);
    }
  }

  private getRelayLifecyclePolicy(url: string): RelayLifecyclePolicy {
    const existing = this.relayLifecyclePolicies.get(url);
    if (existing) return existing;
    this.relayLifecyclePolicies.set(url, this.relayLifecycleOptions.temporaryRelay);
    return this.relayLifecycleOptions.temporaryRelay;
  }

  private maybeScheduleIdleDisconnect(relayUrl: string): void {
    const policy = this.getRelayLifecyclePolicy(relayUrl);
    if (policy.mode !== 'lazy') return;
    if (this.countActiveSubscriptions(relayUrl) > 0) return;
    if (this.countQueuedShards(relayUrl) > 0) return;
    if ((this.relayNeedsReplay.get(relayUrl)?.size ?? 0) > 0) return;

    this.connections.get(relayUrl)?.scheduleIdleDisconnect();
  }

  private getConnection(url: string): RelaySocket {
    let connection = this.connections.get(url);
    if (!connection) {
      connection = new RelaySocket(
        url,
        () => this.getRelayLifecyclePolicy(url),
        () => (this.relayGroupKeys.get(url)?.size ?? 0) > 0,
        (from, message) => this.handleRelayMessage(from, message),
        (from, state, explicitReason) => {
          const reason =
            explicitReason ??
            (state === 'connecting'
              ? 'connecting'
              : state === 'open'
                ? 'opened'
                : state === 'degraded'
                  ? 'connect-failed'
                  : 'disconnected');
          this.updateRelayObservation(from, state, reason);
        }
      );
      this.connections.set(url, connection);
      this.updateRelayObservation(url, 'idle', 'boot');
    }
    return connection;
  }

  private handleRelayMessage(from: string, message: unknown): void {
    if (Array.isArray(message) && message[0] === 'AUTH' && typeof message[1] === 'string') {
      const auth = this.getRelayAuthState(from);
      if (auth.challenge !== message[1]) {
        auth.challenge = message[1];
        auth.authenticatedPubkeys.clear();
        auth.pendingByPubkey.clear();
      }
    }
    this.messages.next({ from, message });
  }

  private getRelayAuthState(relayUrl: string): RelayAuthState {
    const existing = this.relayAuthStates.get(relayUrl);
    if (existing) return existing;
    const created: RelayAuthState = {
      authenticatedPubkeys: new Set(),
      pendingByPubkey: new Map()
    };
    this.relayAuthStates.set(relayUrl, created);
    return created;
  }

  private hasRelayAuthChallenge(relayUrl: string): boolean {
    return typeof this.relayAuthStates.get(relayUrl)?.challenge === 'string';
  }

  private async authenticateRelayIfPossible(
    relayUrl: string,
    signer: EventSigner | undefined
  ): Promise<boolean> {
    if (!signer || !this.hasRelayAuthChallenge(relayUrl)) return false;
    try {
      return await this.authenticateRelay(relayUrl, signer);
    } catch {
      return false;
    }
  }

  private async authenticateRelay(relayUrl: string, signer: EventSigner): Promise<boolean> {
    const auth = this.getRelayAuthState(relayUrl);
    const challenge = auth.challenge;
    if (!challenge) return false;

    const pubkey = await signer.getPublicKey();
    if (auth.challenge !== challenge) {
      return this.authenticateRelay(relayUrl, signer);
    }
    if (auth.authenticatedPubkeys.has(pubkey)) return true;

    const existing = auth.pendingByPubkey.get(pubkey);
    if (existing) return existing;

    const pending = this.performRelayAuthentication(relayUrl, signer, pubkey, challenge).finally(
      () => {
        const current = this.relayAuthStates.get(relayUrl);
        if (current?.pendingByPubkey.get(pubkey) === pending) {
          current.pendingByPubkey.delete(pubkey);
        }
      }
    );
    auth.pendingByPubkey.set(pubkey, pending);
    return pending;
  }

  private async performRelayAuthentication(
    relayUrl: string,
    signer: EventSigner,
    pubkey: string,
    challenge: string
  ): Promise<boolean> {
    const relay = this.getConnection(relayUrl);
    const event = await this.signUnsignedEvent(
      {
        kind: 22242,
        content: '',
        tags: [
          ['relay', relayUrl],
          ['challenge', challenge]
        ],
        created_at: Math.floor(Date.now() / 1000)
      },
      signer,
      pubkey
    );

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const cleanup: Array<() => void> = [];
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        for (const stop of cleanup.splice(0)) stop();
        if (ok && this.relayAuthStates.get(relayUrl)?.challenge === challenge) {
          this.getRelayAuthState(relayUrl).authenticatedPubkeys.add(pubkey);
        }
        resolve(ok);
      };

      const messageSub = this.messages.subscribe({
        next: ({ from, message }) => {
          if (from !== relayUrl || !Array.isArray(message)) return;
          if (message[0] !== 'OK' || message[1] !== event.id) return;
          finish(Boolean(message[2]));
        }
      });
      cleanup.push(() => messageSub.unsubscribe());

      const stateSub = this.states.subscribe({
        next: (packet) => {
          if (packet.from !== relayUrl) return;
          if (
            packet.state === 'backoff' ||
            packet.state === 'closed' ||
            packet.state === 'degraded'
          ) {
            finish(false);
          }
        }
      });
      cleanup.push(() => stateSub.unsubscribe());

      const timeout = setTimeout(() => finish(false), this.eoseTimeout);
      cleanup.push(() => clearTimeout(timeout));

      void relay.send(['AUTH', event]).catch(() => finish(false));
    });
  }

  private resolveReadRelays(selection?: RelaySelectionOptions): string[] {
    const urls = new Map<string, string>();
    if (selection?.defaultReadRelays ?? true) {
      for (const [url, config] of this.defaultRelays.entries()) {
        if (config.read) this.addResolvedRelay(urls, url);
      }
    }
    for (const relay of selection?.relays ?? []) {
      this.registerRelayLifecyclePolicy(
        relay,
        this.isDefaultRelayUrl(relay) ? 'lazy-keep' : 'lazy'
      );
      this.addResolvedRelay(urls, relay);
    }
    return [...urls.values()];
  }

  private resolveWriteRelays(selection?: RelaySelectionOptions): string[] {
    const urls = new Map<string, string>();
    if (selection?.defaultWriteRelays ?? true) {
      for (const [url, config] of this.defaultRelays.entries()) {
        if (config.write) this.addResolvedRelay(urls, url);
      }
    }
    for (const relay of selection?.relays ?? []) {
      this.registerRelayLifecyclePolicy(
        relay,
        this.isDefaultRelayUrl(relay) ? 'lazy-keep' : 'lazy'
      );
      this.addResolvedRelay(urls, relay);
    }
    return [...urls.values()];
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
    return this.signUnsignedEvent(unsigned, activeSigner);
  }

  private async signUnsignedEvent(
    unsigned: UnsignedEvent,
    signer: EventSigner,
    pubkeyHint?: string
  ): Promise<SignedEventShape> {
    const pubkey = pubkeyHint ?? (await signer.getPublicKey());
    const signed = await signer.signEvent(unsigned);
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

  private resolveEventSigner(
    params: EventParameters,
    signer?: EventSigner
  ): EventSigner | undefined {
    if (signer) return signer;
    const candidate = params as Partial<SignedEventShape>;
    if (
      typeof candidate.id === 'string' &&
      typeof candidate.sig === 'string' &&
      typeof candidate.pubkey === 'string' &&
      typeof candidate.created_at === 'number'
    ) {
      return undefined;
    }
    return nip07Signer();
  }
}

export function createRelaySession(options: CreateRelaySessionOptions): RelaySessionApi {
  return new RelaySession(
    options.eoseTimeout ?? 10_000,
    options.defaultRelays,
    options.requestOptimizer ?? {},
    options.relayLifecycle
  );
}

export function createBackwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return new MutableRelayRequest('backward', options?.requestKey, options?.coalescingScope);
}

export function createForwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return new MutableRelayRequest('forward', options?.requestKey, options?.coalescingScope);
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
    getPublicKey: nostr.getPublicKey.bind(nostr),
    signEvent: nostr.signEvent.bind(nostr)
  };
}

function createSubId(): string {
  return `auftakt-${crypto.randomUUID()}`;
}

function createNegentropySubId(): string {
  return `neg-${crypto.randomUUID()}`;
}

function createCountSubId(): string {
  return `count-${crypto.randomUUID()}`;
}

function parseCountPayload(payload: unknown): CountResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.count !== 'number' || !Number.isSafeInteger(record.count) || record.count < 0) {
    return null;
  }
  if ('approximate' in record && typeof record.approximate !== 'boolean') return null;
  if (
    'hll' in record &&
    (typeof record.hll !== 'string' || !/^[0-9a-fA-F]{512}$/.test(record.hll))
  ) {
    return null;
  }
  return {
    capability: 'supported',
    count: record.count,
    ...(typeof record.approximate === 'boolean' ? { approximate: record.approximate } : {}),
    ...(typeof record.hll === 'string' ? { hll: record.hll } : {})
  };
}

function minNullable(...values: Array<number | null | undefined>): number | null {
  const normalized = values.filter((value): value is number => typeof value === 'number');
  if (normalized.length === 0) return null;
  return Math.min(...normalized);
}

function isAuthRequiredReason(reason: string): boolean {
  return reason.toLowerCase().startsWith('auth-required:');
}

function hasProtectedEventTag(event: Pick<SignedEventShape, 'tags'>): boolean {
  return event.tags.some((tag) => tag.length === 1 && tag[0] === '-');
}
