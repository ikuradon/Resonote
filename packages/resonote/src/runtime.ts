import type {
  NamedRegistration,
  NamedRegistrationRegistry,
  NegentropyTransportResult,
  ProjectionDefinition,
  ReadSettlement,
  ReadSettlementLocalProvenance,
  RelayObservationPacket,
  RelayObservationRuntime,
  RelayObservationSnapshot,
  RequestKey,
  StoredEvent
} from '@auftakt/core';
import { createNamedRegistrationRegistry, createProjectionRegistry } from '@auftakt/core';
import {
  buildRequestExecutionPlan,
  cacheEvent,
  createNegentropyRepairRequestKey,
  createRuntimeRequestKey,
  type EventSubscriptionRefs as CommentSubscriptionRefs,
  fetchEventById,
  fetchFollowGraph,
  fetchLatestEventsForKinds,
  fetchReplaceableEventsByAuthorsAndKind,
  filterNegentropyEventRefs,
  type LatestEventSnapshot,
  loadEventSubscriptionDeps,
  type NegentropyEventRef,
  observeRelayStatuses as observeRelayStatusesImpl,
  type OfflineDeliveryDecision,
  type QueryRuntime,
  type ReconcileEmission,
  reconcileNegentropyRepairSubjects,
  reconcileReplayRepairSubjects,
  reduceReadSettlement,
  type RelayRequestLike,
  type RelaySessionLike,
  REPAIR_REQUEST_COALESCING_SCOPE,
  type SessionRuntime,
  snapshotRelayStatuses as snapshotRelayStatusesImpl,
  sortNegentropyEventRefsAsc,
  startBackfillAndLiveSubscription,
  startDeletionReconcile as startDeletionReconcileImpl,
  startMergedLiveSubscription,
  subscribeDualFilterStreams,
  type SubscriptionHandle,
  type SubscriptionLike
} from '@auftakt/core';
import type { EventParameters } from 'nostr-typedef';
import { Observable } from 'rxjs';

import { createEventCoordinator } from './event-coordinator.js';
import { ingestRelayEvent } from './event-ingress.js';
import {
  type CommentsFlow,
  type ContentResolutionFlow,
  createEmojiCatalogPlugin,
  createNotificationsFlowPlugin,
  createRelayListFlowPlugin,
  EMOJI_CATALOG_READ_MODEL,
  type EmojiCatalogReadModel,
  NOTIFICATIONS_FLOW,
  type NotificationsFlow,
  RELAY_LIST_FLOW,
  type RelayListFlow
} from './plugins/built-in-plugins.js';
import {
  COMMENTS_FLOW,
  CONTENT_RESOLUTION_FLOW,
  createResonoteCommentsFlowPlugin,
  createResonoteContentResolutionFlowPlugin
} from './plugins/resonote-flows.js';
import { createTimelinePlugin } from './plugins/timeline-plugin.js';

export type { CommentSubscriptionRefs, SubscriptionHandle };

type RuntimeFilter = Record<string, unknown>;

export interface RelayReadOverlayOptions {
  readonly relays: readonly string[];
  readonly includeDefaultReadRelays?: boolean;
}

export interface FetchBackwardOptions {
  readonly overlay?: RelayReadOverlayOptions;
  readonly timeoutMs?: number;
  readonly rejectOnError?: boolean;
}

export interface CachedFetchByIdRuntime<TResult> {
  cachedFetchById(runtime: CoordinatorReadRuntime, eventId: string): Promise<TResult>;
  invalidateFetchByIdCache(runtime: CoordinatorReadRuntime, eventId: string): void;
}

export interface CachedLatestRuntime<TResult> {
  useCachedLatest(runtime: CoordinatorReadRuntime, pubkey: string, kind: number): TResult;
}

interface CoordinatorReadRuntime {
  getEventsDB(): Promise<{
    getById(id: string): Promise<StoredEvent | null>;
    getByPubkeyAndKind(pubkey: string, kind: number): Promise<StoredEvent | null>;
    put(event: StoredEvent): Promise<unknown>;
    putWithReconcile?(event: StoredEvent): Promise<{
      stored: boolean;
      emissions: ReconcileEmission[];
    }>;
  }>;
  getRxNostr(): Promise<NegentropySessionRuntime>;
  createRxBackwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): {
    emit(input: unknown): void;
    over(): void;
  };
}

interface CachedFetchState {
  readonly cache: Map<string, StoredEvent | null>;
  readonly nullCacheTimestamps: Map<string, number>;
  readonly inflight: Map<string, Promise<SettledReadResult<StoredEvent>>>;
  readonly invalidatedDuringFetch: Set<string>;
}

export interface SettledReadResult<TEvent> {
  readonly event: TEvent | null;
  readonly settlement: ReadSettlement;
}

export interface LatestReadDriver<TEvent> {
  getSnapshot(): SettledReadResult<TEvent>;
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

interface LatestReadState<TEvent extends StoredEvent = StoredEvent> {
  event: TEvent | null;
  localSettled: boolean;
  relaySettled: boolean;
  localHitProvenance: ReadSettlementLocalProvenance | null;
  relayHit: boolean;
  destroyed: boolean;
  sub?: { unsubscribe(): void };
  timeout?: ReturnType<typeof setTimeout>;
  readonly listeners: Set<() => void>;
}

interface BackwardFetchRuntime {
  getRxNostr(): Promise<NegentropySessionRuntime>;
  createRxBackwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): {
    emit(input: unknown): void;
    over(): void;
  };
}

interface RegistryRelayUseOptions {
  readonly on?: {
    readonly relays?: readonly string[];
    readonly defaultReadRelays?: boolean;
  };
}

interface RegistryManagedRelayRequest extends RelayRequestLike {
  readonly mode: 'backward' | 'forward';
  readonly requestKey?: RequestKey;
  readonly filters: RuntimeFilter[];
  readonly closed: boolean;
  onChange(listener: () => void): () => void;
}

interface RegistryObserver {
  next?(packet: unknown): void;
  error?(error: unknown): void;
  complete?(): void;
}

interface RegistryConsumer {
  readonly observer: RegistryObserver;
  entryKey: string | null;
}

interface SharedSubscriptionEntry {
  readonly entryKey: string;
  readonly mode: 'backward' | 'forward';
  readonly filters: RuntimeFilter[];
  readonly useOptions?: RegistryRelayUseOptions;
  readonly transportRequest: RelayRequestLike;
  readonly consumers: Set<RegistryConsumer>;
  consumerCount: number;
  transportSubscription: SubscriptionLike | null;
  starting: boolean;
  completed: boolean;
}

const NULL_CACHE_TTL_MS = 30_000;

const cachedFetchStates = new WeakMap<CoordinatorReadRuntime, CachedFetchState>();
const subscriptionRegistries = new WeakMap<
  SessionRuntime<StoredEvent>,
  CoordinatorSubscriptionRegistry
>();

const unsupportedNegentropyRelaysByRuntime = new WeakMap<object, Set<string>>();

function isRegistryManagedRelayRequest(
  value: RelayRequestLike
): value is RegistryManagedRelayRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'mode' in value &&
    'filters' in value &&
    'closed' in value &&
    'onChange' in value
  );
}

function cloneRuntimeFilters(filters: readonly RuntimeFilter[]): RuntimeFilter[] {
  return filters.map((filter) => ({ ...filter }));
}

function cloneRegistryUseOptions(
  options?: RegistryRelayUseOptions
): RegistryRelayUseOptions | undefined {
  if (!options?.on) return undefined;
  return {
    on: {
      relays: options.on.relays ? [...options.on.relays] : undefined,
      defaultReadRelays: options.on.defaultReadRelays
    }
  };
}

function buildRegistryOverlay(
  options?: RegistryRelayUseOptions
): RelayReadOverlayOptions | undefined {
  if (!options?.on) return undefined;
  return {
    relays: [...(options.on.relays ?? [])],
    includeDefaultReadRelays: options.on.defaultReadRelays
  };
}

function buildSharedSubscriptionEntryKey(
  request: RegistryManagedRelayRequest,
  options?: RegistryRelayUseOptions
): string {
  return buildRequestExecutionPlan({
    requestKey: request.requestKey as RequestKey,
    coalescingScope: request.coalescingScope,
    mode: request.mode,
    filters: request.filters,
    overlay: buildRegistryOverlay(options)
  }).logicalKey;
}

class CoordinatorSubscriptionRegistry {
  private readonly entries = new Map<string, SharedSubscriptionEntry>();
  private rawSessionPromise: Promise<RelaySessionLike> | null = null;

  constructor(private readonly runtime: SessionRuntime<StoredEvent>) {}

  createRelaySession(): RelaySessionLike {
    return {
      use: (req, options) => this.use(req, options as RegistryRelayUseOptions | undefined)
    };
  }

  private getRawSession(): Promise<RelaySessionLike> {
    if (!this.rawSessionPromise) {
      this.rawSessionPromise = this.runtime.getRxNostr();
    }
    return this.rawSessionPromise;
  }

  private use(req: RelayRequestLike, options?: RegistryRelayUseOptions): Observable<unknown> {
    return new Observable<unknown>((observer) => {
      const managedRequest = isRegistryManagedRelayRequest(req) ? req : null;
      let disposed = false;
      let off = () => {};
      let rawSubscription: SubscriptionLike | null = null;
      let forwardFlushQueued = false;
      const consumer: RegistryConsumer = {
        observer,
        entryKey: null
      };

      const attachToRawSession = () => {
        void this.getRawSession()
          .then((session) => {
            if (disposed) return;
            rawSubscription = session.use(req, options).subscribe(observer);
          })
          .catch((error) => {
            observer.error?.(error);
          });
      };

      const syncConsumerEntry = () => {
        if (disposed) return;
        if (!managedRequest) {
          attachToRawSession();
          return;
        }
        if (!managedRequest.requestKey) {
          observer.error?.(
            new Error(
              `Relay request is missing canonical requestKey for ${managedRequest.mode} mode`
            )
          );
          return;
        }
        if (managedRequest.filters.length === 0) {
          this.detachConsumer(consumer);
          return;
        }
        if (managedRequest.mode === 'backward' && !managedRequest.closed) {
          return;
        }

        const entryKey = buildSharedSubscriptionEntryKey(managedRequest, options);
        if (consumer.entryKey === entryKey) return;

        this.detachConsumer(consumer);
        const entry = this.getOrCreateEntry(entryKey, managedRequest, options);
        if (!entry.consumers.has(consumer)) {
          entry.consumers.add(consumer);
          entry.consumerCount += 1;
        }
        consumer.entryKey = entryKey;
        this.ensureEntryStarted(entry);
      };

      const handleRequestChange = () => {
        if (!managedRequest) return;
        if (managedRequest.mode === 'backward') {
          syncConsumerEntry();
          return;
        }
        if (forwardFlushQueued) return;
        forwardFlushQueued = true;
        queueMicrotask(() => {
          forwardFlushQueued = false;
          syncConsumerEntry();
        });
      };

      if (managedRequest) {
        off = managedRequest.onChange(handleRequestChange);
        handleRequestChange();
      } else {
        attachToRawSession();
      }

      return () => {
        disposed = true;
        off();
        rawSubscription?.unsubscribe();
        this.detachConsumer(consumer);
      };
    });
  }

  private getOrCreateEntry(
    entryKey: string,
    request: RegistryManagedRelayRequest,
    options?: RegistryRelayUseOptions
  ): SharedSubscriptionEntry {
    const existing = this.entries.get(entryKey);
    if (existing) return existing;

    const transportRequest =
      request.mode === 'backward'
        ? this.runtime.createRxBackwardReq({
            requestKey: request.requestKey,
            coalescingScope: request.coalescingScope
          })
        : this.runtime.createRxForwardReq({
            requestKey: request.requestKey,
            coalescingScope: request.coalescingScope
          });
    const entry: SharedSubscriptionEntry = {
      entryKey,
      mode: request.mode,
      filters: cloneRuntimeFilters(request.filters),
      useOptions: cloneRegistryUseOptions(options),
      transportRequest,
      consumers: new Set(),
      consumerCount: 0,
      transportSubscription: null,
      starting: false,
      completed: false
    };
    this.entries.set(entryKey, entry);
    return entry;
  }

  private ensureEntryStarted(entry: SharedSubscriptionEntry): void {
    if (entry.starting || entry.transportSubscription || entry.completed) return;
    entry.starting = true;

    void this.getRawSession()
      .then((session) => {
        if (!this.entries.has(entry.entryKey) || entry.consumerCount === 0) return;

        entry.transportSubscription = session
          .use(entry.transportRequest, entry.useOptions)
          .subscribe({
            next: (packet) => {
              for (const consumer of entry.consumers) {
                consumer.observer.next?.(packet);
              }
            },
            error: (error) => {
              for (const consumer of entry.consumers) {
                consumer.entryKey = null;
                consumer.observer.error?.(error);
              }
              this.finishEntry(entry.entryKey);
            },
            complete: () => {
              for (const consumer of entry.consumers) {
                consumer.entryKey = null;
                consumer.observer.complete?.();
              }
              this.finishEntry(entry.entryKey);
            }
          });

        for (const filter of entry.filters) {
          entry.transportRequest.emit(filter);
        }
        if (entry.mode === 'backward') {
          entry.transportRequest.over();
        }
      })
      .catch((error) => {
        for (const consumer of entry.consumers) {
          consumer.entryKey = null;
          consumer.observer.error?.(error);
        }
        this.finishEntry(entry.entryKey);
      })
      .finally(() => {
        entry.starting = false;
      });
  }

  private detachConsumer(consumer: RegistryConsumer): void {
    const entryKey = consumer.entryKey;
    consumer.entryKey = null;
    if (!entryKey) return;

    const entry = this.entries.get(entryKey);
    if (!entry) return;

    if (entry.consumers.delete(consumer)) {
      entry.consumerCount = Math.max(0, entry.consumerCount - 1);
    }
    if (entry.consumerCount === 0) {
      entry.transportSubscription?.unsubscribe();
      this.finishEntry(entryKey);
    }
  }

  private finishEntry(entryKey: string): void {
    const entry = this.entries.get(entryKey);
    if (!entry) return;
    entry.completed = true;
    entry.transportSubscription = null;
    entry.consumerCount = 0;
    entry.consumers.clear();
    this.entries.delete(entryKey);
  }
}

function getCoordinatorSubscriptionRegistry(
  runtime: SessionRuntime<StoredEvent>
): CoordinatorSubscriptionRegistry {
  const existing = subscriptionRegistries.get(runtime);
  if (existing) return existing;

  const registry = new CoordinatorSubscriptionRegistry(runtime);
  subscriptionRegistries.set(runtime, registry);
  return registry;
}

function createRegistryBackedSessionRuntime(
  runtime: SessionRuntime<StoredEvent>
): SessionRuntime<StoredEvent> {
  const registry = getCoordinatorSubscriptionRegistry(runtime);
  return {
    fetchBackwardEvents: (...args) => runtime.fetchBackwardEvents(...args),
    fetchBackwardFirst: (...args) => runtime.fetchBackwardFirst(...args),
    fetchLatestEvent: (...args) => runtime.fetchLatestEvent(...args),
    getEventsDB: () => runtime.getEventsDB(),
    getRxNostr: async () => {
      const rawSession = (await runtime.getRxNostr()) as Partial<NegentropySessionRuntime>;
      const registrySession = registry.createRelaySession();

      return {
        use: (req, options) => registrySession.use(req, options),
        requestNegentropySync:
          typeof rawSession.requestNegentropySync === 'function'
            ? rawSession.requestNegentropySync.bind(rawSession)
            : async () => ({ capability: 'unsupported' as const })
      };
    },
    createRxBackwardReq: (options) => runtime.createRxBackwardReq(options),
    createRxForwardReq: (options) => runtime.createRxForwardReq(options),
    uniq: () => runtime.uniq(),
    merge: (...streams) => runtime.merge(...streams),
    getRelayConnectionState: (url) => runtime.getRelayConnectionState(url),
    observeRelayConnectionStates: (onPacket) => runtime.observeRelayConnectionStates(onPacket)
  };
}

function getCachedFetchState(runtime: CoordinatorReadRuntime): CachedFetchState {
  const existing = cachedFetchStates.get(runtime);
  if (existing) return existing;

  const state: CachedFetchState = {
    cache: new Map(),
    nullCacheTimestamps: new Map(),
    inflight: new Map(),
    invalidatedDuringFetch: new Set()
  };
  cachedFetchStates.set(runtime, state);
  return state;
}

function getUnsupportedNegentropyRelayCache(runtime: object): Set<string> {
  const existing = unsupportedNegentropyRelaysByRuntime.get(runtime);
  if (existing) return existing;

  const relays = new Set<string>();
  unsupportedNegentropyRelaysByRuntime.set(runtime, relays);
  return relays;
}

function cacheUnsupportedNegentropyRelay(runtime: object, relayUrl: string): void {
  getUnsupportedNegentropyRelayCache(runtime).add(relayUrl);
}

function isNegentropyRelayUnsupported(runtime: object, relayUrl: string): boolean {
  return getUnsupportedNegentropyRelayCache(runtime).has(relayUrl);
}

function isCoordinatorReadRuntime(value: unknown): value is CoordinatorReadRuntime {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getEventsDB' in value &&
    'getRxNostr' in value &&
    'createRxBackwardReq' in value
  );
}

function isBackwardFetchRuntime(value: unknown): value is BackwardFetchRuntime {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getRxNostr' in value &&
    'createRxBackwardReq' in value
  );
}

function hasFetchBackwardEvents(
  value: unknown
): value is Pick<QueryRuntime, 'fetchBackwardEvents'> {
  return typeof value === 'object' && value !== null && 'fetchBackwardEvents' in value;
}

function hasFetchBackwardFirst(value: unknown): value is Pick<QueryRuntime, 'fetchBackwardFirst'> {
  return typeof value === 'object' && value !== null && 'fetchBackwardFirst' in value;
}

function snapshotLatestRead<TEvent extends StoredEvent>(
  state: Pick<
    LatestReadState<TEvent>,
    'event' | 'localSettled' | 'relaySettled' | 'localHitProvenance' | 'relayHit'
  >
): SettledReadResult<TEvent> {
  return {
    event: state.event,
    settlement: reduceReadSettlement({
      localSettled: state.localSettled,
      relaySettled: state.relaySettled,
      relayRequired: true,
      localHitProvenance: state.localHitProvenance,
      relayHit: state.relayHit
    })
  };
}

function notifyLatestRead<TEvent extends StoredEvent>(state: LatestReadState<TEvent>): void {
  for (const listener of state.listeners) {
    listener();
  }
}

async function materializeIncomingEvent(
  runtime: Pick<CoordinatorReadRuntime, 'getEventsDB'>,
  event: StoredEvent
): Promise<boolean> {
  try {
    const db = await runtime.getEventsDB();
    if (typeof db.putWithReconcile === 'function') {
      const result = await db.putWithReconcile(event);
      return result.stored;
    }

    const stored = await db.put(event);
    return stored !== false;
  } catch {
    return true;
  }
}

function toStoredEvent(event: unknown): StoredEvent | null {
  const candidate = event as Partial<StoredEvent>;
  if (
    typeof candidate.id === 'string' &&
    typeof candidate.pubkey === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.created_at === 'number' &&
    Array.isArray(candidate.tags) &&
    typeof candidate.kind === 'number'
  ) {
    return candidate as StoredEvent;
  }
  return null;
}

function createLatestReadDriver<TEvent extends StoredEvent>(
  runtime: CoordinatorReadRuntime,
  pubkey: string,
  kind: number
): LatestReadDriver<TEvent> {
  const state: LatestReadState<TEvent> = {
    event: null,
    localSettled: false,
    relaySettled: false,
    localHitProvenance: null,
    relayHit: false,
    destroyed: false,
    listeners: new Set()
  };

  const startDB = async () => {
    try {
      const db = await runtime.getEventsDB();
      const cached = await db.getByPubkeyAndKind(pubkey, kind);
      if (state.destroyed) return;
      if (cached && (state.event === null || cached.created_at > state.event.created_at)) {
        state.event = cached as TEvent;
        state.localHitProvenance = 'store';
        notifyLatestRead(state);
      }
    } catch {
      // DB not available
    } finally {
      if (!state.destroyed) {
        state.localSettled = true;
        notifyLatestRead(state);
      }
    }
  };

  const settleRelay = () => {
    if (state.destroyed) return;
    state.relaySettled = true;
    notifyLatestRead(state);
  };

  const startRelay = async () => {
    try {
      if (state.destroyed) return;
      const rxNostr = await runtime.getRxNostr();
      if (state.destroyed) return;

      const requestKey = createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ kinds: [kind], authors: [pubkey], limit: 1 }],
        scope: 'resonote:coordinator:useCachedLatest'
      });
      const req = runtime.createRxBackwardReq({ requestKey });

      state.timeout = setTimeout(() => {
        state.sub?.unsubscribe();
        settleRelay();
      }, 10_000);

      state.sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          void (async () => {
            if (state.destroyed) return;
            const result = await ingestRelayEvent({
              relayUrl: typeof packet.from === 'string' ? packet.from : '',
              event: packet.event,
              materialize: (event) => materializeIncomingEvent(runtime, event),
              quarantine: async () => {}
            });
            if (!result.ok) return;
            const incoming = result.event as unknown as TEvent;
            const accepted = result.stored;
            if (!accepted || state.destroyed) return;
            if (state.event === null || incoming.created_at > state.event.created_at) {
              state.event = incoming;
              notifyLatestRead(state);
            }
            state.relayHit = true;
            notifyLatestRead(state);
          })();
        },
        complete: () => {
          if (state.timeout) clearTimeout(state.timeout);
          settleRelay();
        },
        error: () => {
          if (state.timeout) clearTimeout(state.timeout);
          settleRelay();
        }
      });

      req.emit({ kinds: [kind], authors: [pubkey], limit: 1 });
      req.over();
    } catch {
      settleRelay();
    }
  };

  void startDB();
  void startRelay();

  return {
    getSnapshot: () => snapshotLatestRead(state),
    subscribe(listener) {
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },
    destroy() {
      state.destroyed = true;
      state.sub?.unsubscribe();
      if (state.timeout) clearTimeout(state.timeout);
      state.listeners.clear();
    }
  };
}

async function performCachedFetchById(
  runtime: CoordinatorReadRuntime,
  eventId: string
): Promise<SettledReadResult<StoredEvent>> {
  const state = getCachedFetchState(runtime);

  const pending = state.inflight.get(eventId);
  if (pending) return pending;

  const promise = coordinatorFetchById(runtime, state, eventId);

  state.inflight.set(eventId, promise);
  try {
    return await promise;
  } finally {
    state.inflight.delete(eventId);
  }
}

async function coordinatorFetchById(
  runtime: CoordinatorReadRuntime,
  state: CachedFetchState,
  eventId: string
): Promise<SettledReadResult<StoredEvent>> {
  let invalidated = false;
  const coordinator = createEventCoordinator({
    store: {
      getById: async (id) => {
        const cached = readCachedById(state, id);
        if (cached.hit) return cached.event;

        try {
          const db = await runtime.getEventsDB();
          const event = await db.getById(id);
          invalidated = state.invalidatedDuringFetch.delete(id);
          if (!invalidated && event) {
            state.cache.set(id, event);
            state.nullCacheTimestamps.delete(id);
          }
          return event;
        } catch {
          return null;
        }
      },
      putWithReconcile: async (event) => materializeIncomingEvent(runtime, event)
    },
    relay: {
      verify: async (filters) => verifyByIdFilters(runtime, state, filters)
    }
  });

  const result = await coordinator.read({ ids: [eventId] }, { policy: 'localFirst' });
  return {
    event: result.events[0] ?? null,
    settlement: invalidated
      ? reduceReadSettlement({
          localSettled: true,
          relaySettled: false,
          relayRequired: true,
          invalidatedDuringFetch: true
        })
      : result.settlement
  };
}

function readCachedById(
  state: CachedFetchState,
  eventId: string
): { readonly hit: true; readonly event: StoredEvent | null } | { readonly hit: false } {
  if (!state.cache.has(eventId)) return { hit: false };

  const cached = state.cache.get(eventId) ?? null;
  if (cached !== null) return { hit: true, event: cached };

  const ts = state.nullCacheTimestamps.get(eventId);
  if (ts !== undefined && Date.now() - ts < NULL_CACHE_TTL_MS) {
    return { hit: true, event: null };
  }

  state.cache.delete(eventId);
  state.nullCacheTimestamps.delete(eventId);
  return { hit: false };
}

async function verifyByIdFilters(
  runtime: CoordinatorReadRuntime,
  state: CachedFetchState,
  filters: readonly Record<string, unknown>[]
): Promise<StoredEvent[]> {
  const ids = filters.flatMap((filter) =>
    Array.isArray(filter.ids) ? filter.ids.filter((id): id is string => typeof id === 'string') : []
  );
  const results = await Promise.all(
    ids.map((id) => fetchAndCacheByIdFromRelay(runtime, state, id))
  );
  return results.filter((event): event is StoredEvent => Boolean(event));
}

async function fetchAndCacheByIdFromRelay(
  runtime: CoordinatorReadRuntime,
  state: CachedFetchState,
  eventId: string
): Promise<StoredEvent | null> {
  try {
    const rxNostr = await runtime.getRxNostr();
    const event = await new Promise<StoredEvent | null>((resolve) => {
      const requestKey = createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ ids: [eventId] }],
        scope: 'resonote:coordinator:cachedFetchById'
      });
      const req = runtime.createRxBackwardReq({ requestKey });
      let found: StoredEvent | null = null;
      const pendingMaterializations = new Set<Promise<void>>();
      const sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          const task = (async () => {
            const result = await ingestRelayEvent({
              relayUrl: typeof packet.from === 'string' ? packet.from : '',
              event: packet.event,
              materialize: (incoming) => materializeIncomingEvent(runtime, incoming),
              quarantine: async () => {}
            });
            if (result.ok && result.stored) {
              found = result.event;
            }
          })();
          pendingMaterializations.add(task);
          void task.finally(() => {
            pendingMaterializations.delete(task);
          });
        },
        complete: () => {
          clearTimeout(timeout);
          sub.unsubscribe();
          void Promise.allSettled([...pendingMaterializations]).then(() => resolve(found));
        },
        error: () => {
          clearTimeout(timeout);
          sub.unsubscribe();
          void Promise.allSettled([...pendingMaterializations]).then(() => resolve(found));
        }
      });
      const timeout = setTimeout(() => {
        sub.unsubscribe();
        void Promise.allSettled([...pendingMaterializations]).then(() => resolve(found));
      }, 5_000);

      req.emit({ ids: [eventId] });
      req.over();
    });

    const invalidated = state.invalidatedDuringFetch.delete(eventId);
    if (!invalidated) {
      state.cache.set(eventId, event);
      if (event) {
        state.nullCacheTimestamps.delete(eventId);
      } else {
        state.nullCacheTimestamps.set(eventId, Date.now());
      }
    }
    return event;
  } catch {
    return null;
  }
}

function performInvalidateFetchByIdCache(runtime: CoordinatorReadRuntime, eventId: string): void {
  const state = getCachedFetchState(runtime);
  state.cache.delete(eventId);
  state.nullCacheTimestamps.delete(eventId);
  if (state.inflight.has(eventId)) {
    state.invalidatedDuringFetch.add(eventId);
  }
}

async function fetchBackwardEventsFromReadRuntime<TEvent>(
  runtime: BackwardFetchRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent[]> {
  const rxNostr = await runtime.getRxNostr();
  const requestKey = createRuntimeRequestKey({
    mode: 'backward',
    filters,
    overlay: options?.overlay,
    scope: 'resonote:coordinator:fetchBackwardEvents'
  });
  const req = runtime.createRxBackwardReq({ requestKey });
  const events: TEvent[] = [];

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => settleResolve(), options?.timeoutMs ?? 10_000);
    const useOptions =
      options?.overlay && options.overlay.relays.length > 0
        ? {
            on: {
              relays: options.overlay.relays,
              defaultReadRelays: options.overlay.includeDefaultReadRelays ?? true
            }
          }
        : undefined;

    const sub = rxNostr.use(req, useOptions).subscribe({
      next: (packet) => {
        events.push(packet.event as TEvent);
      },
      complete: () => settleResolve(),
      error: (error) => {
        if (options?.rejectOnError) {
          settleReject(error);
          return;
        }
        settleResolve();
      }
    });

    for (const filter of filters) {
      req.emit(filter as never);
    }
    req.over();

    function settleResolve() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.unsubscribe();
      resolve(events);
    }

    function settleReject(error: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.unsubscribe();
      reject(error);
    }
  });
}

export interface RelayStatusRuntime {
  fetchLatestEvent(
    pubkey: string,
    kind: number
  ): Promise<{
    tags: string[][];
    content: string;
    created_at: number;
  } | null>;
  setDefaultRelays(urls: string[]): Promise<void>;
}

export interface ResonoteRuntime {
  fetchBackwardEvents<TEvent>(
    filters: readonly Record<string, unknown>[],
    options?: FetchBackwardOptions
  ): Promise<TEvent[]>;
  fetchBackwardFirst<TEvent>(
    filters: readonly Record<string, unknown>[],
    options?: FetchBackwardOptions
  ): Promise<TEvent | null>;
  fetchLatestEvent(
    pubkey: string,
    kind: number
  ): Promise<{
    tags: string[][];
    content: string;
    created_at: number;
  } | null>;
  getEventsDB(): Promise<{
    getByPubkeyAndKind(pubkey: string, kind: number): Promise<StoredEvent | null>;
    getManyByPubkeysAndKind(pubkeys: string[], kind: number): Promise<StoredEvent[]>;
    getByReplaceKey(pubkey: string, kind: number, dTag: string): Promise<StoredEvent | null>;
    getByTagValue(tagQuery: string, kind?: number): Promise<StoredEvent[]>;
    getById(id: string): Promise<StoredEvent | null>;
    getAllByKind(kind: number): Promise<StoredEvent[]>;
    listNegentropyEventRefs(): Promise<NegentropyEventRef[]>;
    deleteByIds(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
    put(event: StoredEvent): Promise<unknown>;
    putWithReconcile(event: StoredEvent): Promise<{
      stored: boolean;
      emissions: ReconcileEmission[];
    }>;
  }>;
  getRxNostr(): Promise<unknown>;
  createRxBackwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): unknown;
  createRxForwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): unknown;
  uniq(): unknown;
  merge(...streams: unknown[]): unknown;
  getRelayConnectionState(url: string): Promise<RelayObservationSnapshot | null>;
  observeRelayConnectionStates(onPacket: (packet: RelayObservationPacket) => void): Promise<{
    unsubscribe(): void;
  }>;
}

export type ResonoteCoordinatorPluginApiVersion = 'v1';

export interface ResonoteCoordinatorPluginApi {
  readonly apiVersion: ResonoteCoordinatorPluginApiVersion;
  registerProjection(definition: ProjectionDefinition): void;
  registerReadModel<TReadModel>(name: string, readModel: TReadModel): void;
  registerFlow<TFlow>(name: string, flow: TFlow): void;
}

export interface ResonoteCoordinatorPlugin {
  readonly name: string;
  readonly apiVersion: ResonoteCoordinatorPluginApiVersion;
  setup(api: ResonoteCoordinatorPluginApi): void | Promise<void>;
}

export interface ResonoteCoordinatorPluginRegistration {
  readonly pluginName: string;
  readonly apiVersion: ResonoteCoordinatorPluginApiVersion;
  readonly enabled: boolean;
  readonly error?: Error;
}

interface PendingPluginRegistrations {
  readonly projections: ProjectionDefinition[];
  readonly readModels: Array<NamedRegistration>;
  readonly flows: Array<NamedRegistration>;
}

export interface ResonoteCoordinator<TResult = unknown, TLatestResult = unknown> {
  cachedFetchById(eventId: string): Promise<TResult>;
  invalidateFetchByIdCache(eventId: string): void;
  useCachedLatest(pubkey: string, kind: number): TLatestResult;
  castSigned(params: EventParameters): Promise<void>;
  publishSignedEvent(params: EventParameters): Promise<void>;
  publishSignedEvents(params: EventParameters[]): Promise<void>;
  retryPendingPublishes(): Promise<void>;
  fetchLatestEvent(
    pubkey: string,
    kind: number
  ): Promise<{
    tags: string[][];
    content: string;
    created_at: number;
  } | null>;
  setDefaultRelays(urls: string[]): Promise<void>;
  getRelayConnectionState(url: string): Promise<RelayObservationSnapshot | null>;
  observeRelayConnectionStates(onPacket: (packet: RelayObservationPacket) => void): Promise<{
    unsubscribe(): void;
  }>;
  openEventsDb(): ReturnType<ResonoteRuntime['getEventsDB']>;
  fetchProfileCommentEvents(
    pubkey: string,
    until?: number,
    limit?: number
  ): Promise<ProfileCommentEvent[]>;
  fetchFollowListSnapshot(pubkey: string, followKind?: number): Promise<LatestEventSnapshot | null>;
  fetchProfileMetadataEvents(
    pubkeys: readonly string[],
    batchSize?: number
  ): Promise<{
    cachedEvents: StoredEvent[];
    fetchedEvents: StoredEvent[];
    unresolvedPubkeys: string[];
  }>;
  fetchProfileMetadataSources(
    pubkeys: readonly string[],
    batchSize?: number
  ): Promise<{
    cachedEvents: StoredEvent[];
    fetchedEvents: StoredEvent[];
    fallbackEvents: Array<{
      pubkey: string;
      tags: string[][];
      content: string;
      created_at: number;
    }>;
    unresolvedPubkeys: string[];
  }>;
  fetchCustomEmojiSources(pubkey: string): Promise<{
    listEvent: StoredEvent | null;
    setEvents: StoredEvent[];
  }>;
  fetchCustomEmojiCategories(pubkey: string): Promise<EmojiCategory[]>;
  searchBookmarkDTagEvent(pubkey: string, normalizedUrl: string): Promise<StoredEvent | null>;
  searchEpisodeBookmarkByGuid(pubkey: string, guid: string): Promise<StoredEvent | null>;
  fetchNostrEventById<TEvent>(
    eventId: string,
    relayHints: readonly string[]
  ): Promise<TEvent | null>;
  fetchNotificationTargetPreview(eventId: string): Promise<string | null>;
  loadCommentSubscriptionDeps(): Promise<CommentSubscriptionRefs>;
  fetchWot(
    pubkey: string,
    callbacks: WotProgressCallback,
    extractFollows: (event: Pick<StoredEvent, 'tags'>) => Set<string>,
    followKind?: number,
    batchSize?: number
  ): Promise<WotResult>;
  subscribeNotificationStreams(
    options: NotificationStreamOptions,
    handlers: NotificationStreamHandlers
  ): Promise<SubscriptionHandle[]>;
  snapshotRelayStatuses(urls: readonly string[]): ReturnType<typeof snapshotRelayStatusesImpl>;
  observeRelayStatuses(
    onPacket: (packet: RelayObservationPacket) => void
  ): ReturnType<typeof observeRelayStatusesImpl>;
  fetchRelayListEvents(
    pubkey: string,
    relayListKind: number,
    followKind: number
  ): Promise<{
    relayListEvents: StoredEvent[];
    followListEvents: StoredEvent[];
  }>;
  fetchRelayListSources(
    pubkey: string,
    relayListKind: number,
    followKind: number
  ): Promise<{
    relayListEvents: Array<{
      created_at: number;
      tags: string[][];
    }>;
    followListEvents: Array<{
      created_at: number;
      content: string;
    }>;
  }>;
  registerPlugin(plugin: ResonoteCoordinatorPlugin): Promise<ResonoteCoordinatorPluginRegistration>;
}

export interface CreateResonoteCoordinatorOptions<TResult, TLatestResult> {
  readonly runtime: ResonoteRuntime;
  readonly cachedFetchByIdRuntime: Pick<
    CachedFetchByIdRuntime<TResult>,
    'cachedFetchById' | 'invalidateFetchByIdCache'
  >;
  readonly cachedLatestRuntime: Pick<CachedLatestRuntime<TLatestResult>, 'useCachedLatest'>;
  readonly publishTransportRuntime: Pick<PublishRuntime, 'castSigned'>;
  readonly pendingPublishQueueRuntime: PendingPublishQueueRuntime;
  readonly relayStatusRuntime: RelayStatusRuntime;
}

export interface PublishRuntime {
  castSigned(params: EventParameters): Promise<void>;
  retryPendingPublishes(): Promise<void>;
  publishSignedEvent(params: EventParameters): Promise<void>;
  publishSignedEvents(params: EventParameters[]): Promise<void>;
}

export interface RetryableSignedEvent extends EventParameters {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly sig: string;
}

export interface PendingDrainResult {
  readonly emissions: ReconcileEmission[];
  readonly settledCount: number;
  readonly retryingCount: number;
}

export interface PendingPublishQueueRuntime {
  addPendingPublish(event: RetryableSignedEvent): Promise<void>;
  drainPendingPublishes(
    deliver: (event: RetryableSignedEvent) => Promise<OfflineDeliveryDecision>
  ): Promise<PendingDrainResult>;
}

export interface RelayRepairOptions {
  readonly filters: readonly RuntimeFilter[];
  readonly relayUrl: string;
  readonly timeoutMs?: number;
}

export interface RelayRepairResult {
  readonly strategy: 'negentropy' | 'fallback';
  readonly capability: NegentropyTransportResult['capability'];
  readonly repairedIds: string[];
  readonly materializationEmissions: ReconcileEmission[];
  readonly repairEmissions: ReconcileEmission[];
}

interface NegentropySessionRuntime {
  requestNegentropySync(options: {
    relayUrl: string;
    filter: RuntimeFilter;
    initialMessageHex: string;
    timeoutMs?: number;
  }): Promise<NegentropyTransportResult>;
  use(
    req: {
      emit(input: unknown): void;
      over(): void;
    },
    options?: { on?: { relays?: readonly string[]; defaultReadRelays?: boolean } }
  ): {
    subscribe(observer: {
      next?: (packet: { event: unknown; from?: string }) => void;
      complete?: () => void;
      error?: (error: unknown) => void;
    }): { unsubscribe(): void };
  };
}

export interface DeletionEvent extends StoredEvent {
  readonly content: string;
}

export interface CommentFilterKinds {
  comment: number;
  reaction: number;
  deletion: number;
  contentReaction: number;
}

interface ProfileCommentEvent extends StoredEvent {
  readonly content: string;
}

export interface CustomEmoji {
  shortcode: string;
  url: string;
}

export interface EmojiCategory {
  id: string;
  name: string;
  emojis: { id: string; name: string; skins: { src: string }[] }[];
}

interface WotProgressCallback {
  onDirectFollows(follows: Set<string>): void;
  onWotProgress(count: number): void;
  isCancelled(): boolean;
}

interface WotResult {
  directFollows: Set<string>;
  wot: Set<string>;
}

interface NotificationStreamOptions {
  readonly myPubkey: string;
  readonly follows: ReadonlySet<string>;
  readonly mentionKinds: readonly number[];
  readonly followCommentKind: number;
  readonly mentionSince: number;
  readonly followCommentSince: number;
  readonly batchSize?: number;
}

interface NotificationStreamHandlers {
  onMentionPacket(packet: { event: StoredEvent; from?: string }): void;
  onFollowCommentPacket(packet: { event: StoredEvent; from?: string }): void;
  onError(error: unknown): void;
}

export const RESONOTE_COORDINATOR_PLUGIN_API_VERSION: ResonoteCoordinatorPluginApiVersion = 'v1';

function normalizePluginError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'Plugin registration failed');
}

function createPendingPluginRegistrations(): PendingPluginRegistrations {
  return {
    projections: [],
    readModels: [],
    flows: []
  };
}

function createPluginRegistrationApi(
  pending: PendingPluginRegistrations
): ResonoteCoordinatorPluginApi {
  return {
    apiVersion: RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
    registerProjection(definition) {
      pending.projections.push(definition);
    },
    registerReadModel(name, readModel) {
      pending.readModels.push({ name, value: readModel });
    },
    registerFlow(name, flow) {
      pending.flows.push({ name, value: flow });
    }
  };
}

function commitPluginRegistrations(
  projectionRegistry: ReturnType<typeof createProjectionRegistry>,
  readModelRegistry: NamedRegistrationRegistry,
  flowRegistry: NamedRegistrationRegistry,
  pending: PendingPluginRegistrations
): void {
  for (const definition of pending.projections) {
    projectionRegistry.register(definition);
  }
  for (const registration of pending.readModels) {
    readModelRegistry.register(registration);
  }
  for (const registration of pending.flows) {
    flowRegistry.register(registration);
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function getRegisteredReadModel<TReadModel>(
  registry: NamedRegistrationRegistry,
  name: string
): TReadModel {
  const registration = registry.get(name);
  if (!registration) {
    throw new Error(`Read model is not registered: ${name}`);
  }
  return registration.value as TReadModel;
}

function getRegisteredFlow<TFlow>(registry: NamedRegistrationRegistry, name: string): TFlow {
  const registration = registry.get(name);
  if (!registration) {
    throw new Error(`Flow is not registered: ${name}`);
  }
  return registration.value as TFlow;
}

export function createResonoteCoordinator<TResult, TLatestResult>({
  runtime,
  cachedFetchByIdRuntime,
  cachedLatestRuntime,
  publishTransportRuntime,
  pendingPublishQueueRuntime,
  relayStatusRuntime
}: CreateResonoteCoordinatorOptions<TResult, TLatestResult>): ResonoteCoordinator<
  TResult,
  TLatestResult
> {
  const queryRuntime = runtime as QueryRuntime<StoredEvent>;
  const sessionRuntime = runtime as unknown as SessionRuntime<StoredEvent>;
  const registrySessionRuntime = createRegistryBackedSessionRuntime(sessionRuntime);
  const relayObservationRuntime = registrySessionRuntime as RelayObservationRuntime;
  const coordinatorReadRuntime = runtime as unknown as CoordinatorReadRuntime;
  const projectionRegistry = createProjectionRegistry();
  const readModelRegistry = createNamedRegistrationRegistry('Read model');
  const flowRegistry = createNamedRegistrationRegistry('Flow');

  const registerPlugin = async (
    plugin: ResonoteCoordinatorPlugin
  ): Promise<ResonoteCoordinatorPluginRegistration> => {
    const pending = createPendingPluginRegistrations();

    try {
      if (plugin.apiVersion !== RESONOTE_COORDINATOR_PLUGIN_API_VERSION) {
        throw new Error(`Unsupported plugin API version for ${plugin.name}: ${plugin.apiVersion}`);
      }

      await plugin.setup(createPluginRegistrationApi(pending));
      commitPluginRegistrations(projectionRegistry, readModelRegistry, flowRegistry, pending);

      return {
        pluginName: plugin.name,
        apiVersion: RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
        enabled: true
      };
    } catch (error) {
      return {
        pluginName: plugin.name,
        apiVersion: RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
        enabled: false,
        error: normalizePluginError(error)
      };
    }
  };

  const registerPluginSynchronously = (
    plugin: ResonoteCoordinatorPlugin
  ): ResonoteCoordinatorPluginRegistration => {
    const pending = createPendingPluginRegistrations();

    try {
      if (plugin.apiVersion !== RESONOTE_COORDINATOR_PLUGIN_API_VERSION) {
        throw new Error(`Unsupported plugin API version for ${plugin.name}: ${plugin.apiVersion}`);
      }

      const setupResult = plugin.setup(createPluginRegistrationApi(pending));
      if (isPromiseLike(setupResult)) {
        throw new Error(`Built-in plugin setup must be synchronous: ${plugin.name}`);
      }

      commitPluginRegistrations(projectionRegistry, readModelRegistry, flowRegistry, pending);

      return {
        pluginName: plugin.name,
        apiVersion: RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
        enabled: true
      };
    } catch (error) {
      return {
        pluginName: plugin.name,
        apiVersion: RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
        enabled: false,
        error: normalizePluginError(error)
      };
    }
  };

  const fetchCustomEmojiSourcesFromRuntime = async (pubkey: string) => {
    const eventsDB = await runtime.getEventsDB();
    const listEvent = await queryRuntime.fetchBackwardFirst<StoredEvent>(
      [{ kinds: [10030], authors: [pubkey], limit: 1 }],
      { timeoutMs: 5_000 }
    );
    if (listEvent) {
      await cacheEvent(eventsDB, listEvent);
    }

    if (!listEvent) {
      return { listEvent: null, setEvents: [] };
    }

    const setRefs = extractEmojiSetRefs(listEvent);
    if (setRefs.length === 0) {
      return { listEvent, setEvents: [] };
    }

    const cachedEvents = (
      await Promise.all(
        setRefs.map(async (ref) => {
          const [kind, author, dTag] = ref.split(':');
          if (kind !== '30030' || !author || !dTag) return null;
          return eventsDB.getByReplaceKey(author, 30030, dTag);
        })
      )
    ).filter((event): event is StoredEvent => event !== null);

    const cachedKeys = new Set(
      cachedEvents.map((event) => `${event.pubkey}:${findDTag(event.tags)}`)
    );
    const missingRefs = setRefs.filter((ref) => {
      const [, author, dTag] = ref.split(':');
      return Boolean(author && dTag && !cachedKeys.has(`${author}:${dTag}`));
    });

    const missingFilters = missingRefs.flatMap((ref) => {
      const [kind, author, dTag] = ref.split(':');
      if (kind !== '30030' || !author || !dTag) return [];
      return [{ kinds: [30030], authors: [author], '#d': [dTag] }];
    });

    const fetchedEvents =
      missingFilters.length === 0
        ? []
        : await queryRuntime.fetchBackwardEvents<StoredEvent>(missingFilters, { timeoutMs: 5_000 });

    await Promise.all(fetchedEvents.map((event) => cacheEvent(eventsDB, event)));

    return { listEvent, setEvents: [...cachedEvents, ...fetchedEvents] };
  };

  const subscribeNotificationStreamsWithRuntime = async (
    options: NotificationStreamOptions,
    handlers: NotificationStreamHandlers
  ) => {
    const secondaryFilters = [...options.follows].flatMap((author, index, authors) => {
      if (authors.length === 0) return [];
      const batchSize = options.batchSize ?? 100;
      if (index % batchSize !== 0) return [];
      return [
        {
          kinds: [options.followCommentKind],
          authors: authors.slice(index, index + batchSize),
          since: options.followCommentSince
        }
      ];
    });

    return subscribeDualFilterStreams(
      registrySessionRuntime,
      {
        primaryFilter: {
          kinds: [...options.mentionKinds],
          '#p': [options.myPubkey],
          since: options.mentionSince
        },
        secondaryFilters
      },
      {
        onPrimaryPacket: handlers.onMentionPacket,
        onSecondaryPacket: handlers.onFollowCommentPacket,
        onError: handlers.onError
      }
    );
  };

  const builtInPlugins: ResonoteCoordinatorPlugin[] = [
    createTimelinePlugin(),
    createEmojiCatalogPlugin({
      fetchCustomEmojiSources: (pubkey) => fetchCustomEmojiSourcesFromRuntime(pubkey),
      fetchCustomEmojiCategories: async (pubkey) => {
        const { listEvent, setEvents } = await fetchCustomEmojiSourcesFromRuntime(pubkey);
        if (!listEvent) return [];

        const categories: EmojiCategory[] = [];
        const inlineCategory = buildInlineCategory(listEvent);
        if (inlineCategory) categories.push(inlineCategory);

        for (const event of setEvents) {
          const category = buildCategoryFromEvent(event);
          if (category) categories.push(category);
        }

        return categories;
      }
    }),
    createResonoteCommentsFlowPlugin({
      loadCommentSubscriptionDeps: () => loadEventSubscriptionDeps(registrySessionRuntime),
      buildCommentContentFilters,
      startCommentSubscription,
      startMergedCommentSubscription,
      startCommentDeletionReconcile
    }),
    createNotificationsFlowPlugin({
      subscribeNotificationStreams: (options, handlers) =>
        subscribeNotificationStreamsWithRuntime(options, handlers)
    }),
    createRelayListFlowPlugin({
      fetchRelayListEvents: async (pubkey, relayListKind, followKind) => {
        const [relayListEvents, followListEvents] = await fetchLatestEventsForKinds(
          queryRuntime,
          pubkey,
          [relayListKind, followKind]
        );
        return { relayListEvents: relayListEvents ?? [], followListEvents: followListEvents ?? [] };
      }
    }),
    createResonoteContentResolutionFlowPlugin({
      searchBookmarkDTagEvent: async (pubkey, normalizedUrl) => {
        const eventsDB = await runtime.getEventsDB();
        const cached = await eventsDB.getByReplaceKey(pubkey, 39701, normalizedUrl);
        if (cached && hasBookmarkDTagPayload(cached.tags)) return cached;

        const event = await queryRuntime.fetchBackwardFirst<StoredEvent>(
          [{ kinds: [39701], authors: [pubkey], '#d': [normalizedUrl], limit: 1 }],
          { timeoutMs: 5_000 }
        );

        if (event) await cacheEvent(eventsDB, event);
        return event;
      },
      searchEpisodeBookmarkByGuid: async (pubkey, guid) => {
        const eventsDB = await runtime.getEventsDB();
        const cached = await eventsDB.getByTagValue(`i:podcast:item:guid:${guid}`, 39701);
        const cachedMatch = cached.find((event) => event.pubkey === pubkey) ?? null;
        if (cachedMatch) return cachedMatch;

        const event = await queryRuntime.fetchBackwardFirst<StoredEvent>(
          [{ kinds: [39701], authors: [pubkey], '#i': [`podcast:item:guid:${guid}`], limit: 1 }],
          { timeoutMs: 5_000 }
        );

        if (event) await cacheEvent(eventsDB, event);
        return event;
      }
    })
  ];

  for (const plugin of builtInPlugins) {
    const registration = registerPluginSynchronously(plugin);
    if (!registration.enabled) {
      throw registration.error ?? new Error(`Failed to register built-in plugin: ${plugin.name}`);
    }
  }

  return {
    cachedFetchById: (eventId) =>
      cachedFetchByIdRuntime.cachedFetchById(coordinatorReadRuntime, eventId),
    invalidateFetchByIdCache: (eventId) =>
      cachedFetchByIdRuntime.invalidateFetchByIdCache(coordinatorReadRuntime, eventId),
    useCachedLatest: (pubkey, kind) =>
      cachedLatestRuntime.useCachedLatest(coordinatorReadRuntime, pubkey, kind),
    castSigned: (params) => publishTransportRuntime.castSigned(params),
    publishSignedEvent: (params) => publishTransportRuntime.castSigned(params),
    publishSignedEvents: (params) =>
      publishSignedEventsWithOfflineFallback(
        publishTransportRuntime,
        pendingPublishQueueRuntime,
        params
      ),
    retryPendingPublishes: async () => {
      await retryQueuedSignedPublishes(publishTransportRuntime, pendingPublishQueueRuntime);
    },
    fetchLatestEvent: (pubkey, kind) => relayStatusRuntime.fetchLatestEvent(pubkey, kind),
    setDefaultRelays: (urls) => relayStatusRuntime.setDefaultRelays(urls),
    getRelayConnectionState: async (url) => {
      const [snapshot] = await snapshotRelayStatusesImpl(relayObservationRuntime, [url]);
      return snapshot ?? null;
    },
    observeRelayConnectionStates: (onPacket) =>
      observeRelayStatusesImpl(relayObservationRuntime, onPacket),
    openEventsDb: () => runtime.getEventsDB(),
    fetchProfileCommentEvents: async (pubkey, until, limit = 20) => {
      const filter = until
        ? { kinds: [1111], authors: [pubkey], limit, until }
        : { kinds: [1111], authors: [pubkey], limit };
      return queryRuntime.fetchBackwardEvents<ProfileCommentEvent>([filter], {
        rejectOnError: true
      });
    },
    fetchFollowListSnapshot: (pubkey, followKind = 3) =>
      queryRuntime.fetchLatestEvent(pubkey, followKind),
    fetchProfileMetadataEvents: (pubkeys, batchSize = 50) =>
      fetchReplaceableEventsByAuthorsAndKind(queryRuntime, pubkeys, 0, batchSize),
    fetchProfileMetadataSources: (pubkeys, batchSize = 50) =>
      fetchProfileMetadataSources(queryRuntime, relayStatusRuntime, pubkeys, batchSize),
    fetchCustomEmojiSources: (pubkey) =>
      getRegisteredReadModel<EmojiCatalogReadModel>(
        readModelRegistry,
        EMOJI_CATALOG_READ_MODEL
      ).fetchCustomEmojiSources(pubkey),
    fetchCustomEmojiCategories: (pubkey) =>
      getRegisteredReadModel<EmojiCatalogReadModel>(
        readModelRegistry,
        EMOJI_CATALOG_READ_MODEL
      ).fetchCustomEmojiCategories(pubkey),
    searchBookmarkDTagEvent: (pubkey, normalizedUrl) =>
      getRegisteredFlow<ContentResolutionFlow>(
        flowRegistry,
        CONTENT_RESOLUTION_FLOW
      ).searchBookmarkDTagEvent(pubkey, normalizedUrl),
    searchEpisodeBookmarkByGuid: (pubkey, guid) =>
      getRegisteredFlow<ContentResolutionFlow>(
        flowRegistry,
        CONTENT_RESOLUTION_FLOW
      ).searchEpisodeBookmarkByGuid(pubkey, guid),
    fetchNostrEventById: (eventId: string, relayHints: readonly string[]) =>
      fetchNostrEventById(queryRuntime as QueryRuntimeWithById, eventId, relayHints),
    fetchNotificationTargetPreview: async (eventId: string) => {
      const direct = await fetchEventById<{ content: string }>(queryRuntime, eventId, []);
      if (direct) return direct.content;

      const fallback = await cachedFetchByIdRuntime.cachedFetchById(
        coordinatorReadRuntime,
        eventId
      );
      return (
        ((fallback as { event?: { content?: string } | null }).event?.content as
          | string
          | undefined) ?? null
      );
    },
    loadCommentSubscriptionDeps: () =>
      getRegisteredFlow<CommentsFlow>(flowRegistry, COMMENTS_FLOW).loadCommentSubscriptionDeps(),
    fetchWot: (pubkey, callbacks, extractFollows, followKind = 3, batchSize = 100) =>
      fetchFollowGraph(sessionRuntime, pubkey, callbacks, extractFollows, followKind, batchSize),
    subscribeNotificationStreams: (options, handlers) =>
      getRegisteredFlow<NotificationsFlow>(
        flowRegistry,
        NOTIFICATIONS_FLOW
      ).subscribeNotificationStreams(options, handlers),
    snapshotRelayStatuses: (urls) => snapshotRelayStatusesImpl(relayObservationRuntime, urls),
    observeRelayStatuses: (onPacket) => observeRelayStatusesImpl(relayObservationRuntime, onPacket),
    fetchRelayListEvents: (pubkey, relayListKind, followKind) =>
      getRegisteredFlow<RelayListFlow>(flowRegistry, RELAY_LIST_FLOW).fetchRelayListEvents(
        pubkey,
        relayListKind,
        followKind
      ),
    fetchRelayListSources: (pubkey, relayListKind, followKind) =>
      fetchRelayListSources(queryRuntime, relayStatusRuntime, pubkey, relayListKind, followKind),
    registerPlugin
  };
}

export async function cachedFetchById<TResult>(
  coordinatorOrRuntime:
    | Pick<ResonoteCoordinator<TResult, unknown>, 'cachedFetchById'>
    | CoordinatorReadRuntime,
  eventId: string
): Promise<TResult> {
  if (isCoordinatorReadRuntime(coordinatorOrRuntime)) {
    return (await performCachedFetchById(coordinatorOrRuntime, eventId)) as TResult;
  }
  return coordinatorOrRuntime.cachedFetchById(eventId);
}

export function invalidateFetchByIdCache<TResult>(
  coordinatorOrRuntime:
    | Pick<ResonoteCoordinator<TResult, unknown>, 'invalidateFetchByIdCache'>
    | CoordinatorReadRuntime,
  eventId: string
): void {
  if (isCoordinatorReadRuntime(coordinatorOrRuntime)) {
    performInvalidateFetchByIdCache(coordinatorOrRuntime, eventId);
    return;
  }
  coordinatorOrRuntime.invalidateFetchByIdCache(eventId);
}

export function useCachedLatest<TResult>(
  coordinatorOrRuntime:
    | Pick<ResonoteCoordinator<unknown, TResult>, 'useCachedLatest'>
    | CoordinatorReadRuntime,
  pubkey: string,
  kind: number
): TResult {
  if (isCoordinatorReadRuntime(coordinatorOrRuntime)) {
    return createLatestReadDriver(coordinatorOrRuntime, pubkey, kind) as TResult;
  }
  return coordinatorOrRuntime.useCachedLatest(pubkey, kind);
}

export async function castSigned(
  coordinator: Pick<ResonoteCoordinator, 'castSigned'>,
  params: EventParameters
): Promise<void> {
  return coordinator.castSigned(params);
}

export async function fetchLatestEvent(
  coordinator: Pick<ResonoteCoordinator, 'fetchLatestEvent'>,
  pubkey: string,
  kind: number
) {
  return coordinator.fetchLatestEvent(pubkey, kind);
}

export async function setDefaultRelays(
  coordinator: Pick<ResonoteCoordinator, 'setDefaultRelays'>,
  urls: string[]
): Promise<void> {
  return coordinator.setDefaultRelays(urls);
}

export async function registerPlugin(
  coordinator: Pick<ResonoteCoordinator, 'registerPlugin'>,
  plugin: ResonoteCoordinatorPlugin
): Promise<ResonoteCoordinatorPluginRegistration> {
  return coordinator.registerPlugin(plugin);
}

export async function getRelayConnectionState(
  coordinator: Pick<ResonoteCoordinator, 'getRelayConnectionState'>,
  url: string
): Promise<RelayObservationSnapshot | null> {
  return coordinator.getRelayConnectionState(url);
}

export async function observeRelayConnectionStates(
  coordinator: Pick<ResonoteCoordinator, 'observeRelayConnectionStates'>,
  onPacket: (packet: RelayObservationPacket) => void
): Promise<{ unsubscribe(): void }> {
  return coordinator.observeRelayConnectionStates(onPacket);
}

export async function fetchBackwardEvents<TEvent>(
  runtime: Pick<QueryRuntime, 'fetchBackwardEvents'> | BackwardFetchRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent[]> {
  if (!hasFetchBackwardEvents(runtime) && isBackwardFetchRuntime(runtime)) {
    return fetchBackwardEventsFromReadRuntime<TEvent>(
      runtime,
      filters,
      cloneFetchBackwardOptions(options)
    );
  }
  return runtime.fetchBackwardEvents<TEvent>(filters, cloneFetchBackwardOptions(options));
}

export async function fetchBackwardFirst<TEvent>(
  runtime: Pick<QueryRuntime, 'fetchBackwardFirst'> | BackwardFetchRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent | null> {
  if (!hasFetchBackwardFirst(runtime) && isBackwardFetchRuntime(runtime)) {
    const events = await fetchBackwardEventsFromReadRuntime<TEvent>(
      runtime,
      filters,
      cloneFetchBackwardOptions(options)
    );
    return events.at(-1) ?? null;
  }
  return runtime.fetchBackwardFirst<TEvent>(filters, cloneFetchBackwardOptions(options));
}

export async function retryPendingPublishes(
  coordinator: Pick<ResonoteCoordinator, 'retryPendingPublishes'>
): Promise<void> {
  return coordinator.retryPendingPublishes();
}

export async function publishSignedEvent(
  coordinator: Pick<ResonoteCoordinator, 'publishSignedEvent'>,
  params: EventParameters
): Promise<void> {
  return coordinator.publishSignedEvent(params);
}

export async function publishSignedEvents(
  coordinator: Pick<ResonoteCoordinator, 'publishSignedEvents'>,
  params: EventParameters[]
): Promise<void> {
  return coordinator.publishSignedEvents(params);
}

function toRetryableSignedEvent(
  event: EventParameters | RetryableSignedEvent
): RetryableSignedEvent | null {
  const candidate = event as Partial<RetryableSignedEvent>;

  if (
    typeof candidate.id === 'string' &&
    typeof candidate.sig === 'string' &&
    typeof candidate.kind === 'number' &&
    typeof candidate.pubkey === 'string' &&
    typeof candidate.created_at === 'number' &&
    Array.isArray(candidate.tags) &&
    typeof candidate.content === 'string'
  ) {
    return candidate as RetryableSignedEvent;
  }

  return null;
}

export async function retryQueuedSignedPublishes(
  runtime: Pick<PublishRuntime, 'castSigned'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'drainPendingPublishes'>
): Promise<PendingDrainResult> {
  return queueRuntime.drainPendingPublishes(async (event) => {
    try {
      await runtime.castSigned(event);
      return 'confirmed';
    } catch {
      return 'retrying';
    }
  });
}

export async function publishSignedEventWithOfflineFallback(
  runtime: Pick<PublishRuntime, 'castSigned'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'addPendingPublish'>,
  event: EventParameters | RetryableSignedEvent
): Promise<void> {
  try {
    await runtime.castSigned(event);
  } catch {
    const pending = toRetryableSignedEvent(event);
    if (pending) await queueRuntime.addPendingPublish(pending);
  }
}

export async function publishSignedEventsWithOfflineFallback(
  runtime: Pick<PublishRuntime, 'castSigned'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'addPendingPublish'>,
  events: Array<EventParameters | RetryableSignedEvent>
): Promise<void> {
  if (events.length === 0) return;

  await Promise.allSettled(
    events.map(async (event) => publishSignedEventWithOfflineFallback(runtime, queueRuntime, event))
  );
}

function cloneFetchBackwardOptions(
  options?: FetchBackwardOptions
): FetchBackwardOptions | undefined {
  if (!options) return undefined;

  return {
    ...options,
    overlay: options.overlay
      ? {
          ...options.overlay,
          relays: [...options.overlay.relays]
        }
      : undefined
  };
}

function encodeHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function decodeHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('negentropy hex payload must have even length');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);
    if (!Number.isFinite(value)) {
      throw new Error('negentropy hex payload contains invalid byte');
    }
    bytes[index / 2] = value;
  }
  return bytes;
}

function encodeVarint(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('negentropy varint must be a non-negative integer');
  }

  const digits = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining > 0) {
    digits.push(remaining & 0x7f);
    remaining >>>= 7;
  }

  return digits.reverse().map((digit, index) => (index < digits.length - 1 ? digit | 0x80 : digit));
}

function decodeVarint(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let index = start;

  while (index < bytes.length) {
    const byte = bytes[index] ?? 0;
    value = (value << 7) | (byte & 0x7f);
    index += 1;
    if ((byte & 0x80) === 0) {
      return { value, next: index };
    }
  }

  throw new Error('unterminated negentropy varint');
}

function encodeNegentropyIdListMessage(events: readonly NegentropyEventRef[]): string {
  const sorted = sortNegentropyEventRefsAsc(events);
  const bytes: number[] = [0x61, 0x00, 0x00, 0x02, ...encodeVarint(sorted.length)];

  for (const event of sorted) {
    if (!/^[0-9a-f]{64}$/i.test(event.id)) {
      throw new Error(`negentropy requires 32-byte hex ids, received: ${event.id}`);
    }
    bytes.push(...decodeHex(event.id));
  }

  return encodeHex(Uint8Array.from(bytes));
}

function decodeNegentropyIdListMessage(messageHex: string): string[] {
  const bytes = decodeHex(messageHex);
  if ((bytes[0] ?? 0) !== 0x61) {
    throw new Error('unsupported negentropy protocol version');
  }

  let index = 1;
  const ids: string[] = [];

  while (index < bytes.length) {
    const upperTimestamp = decodeVarint(bytes, index);
    index = upperTimestamp.next;
    const prefixLength = decodeVarint(bytes, index);
    index = prefixLength.next + prefixLength.value;

    const mode = decodeVarint(bytes, index);
    index = mode.next;

    if (mode.value === 0) {
      continue;
    }

    if (mode.value !== 2) {
      throw new Error(`unsupported negentropy mode: ${mode.value}`);
    }

    const listLength = decodeVarint(bytes, index);
    index = listLength.next;

    for (let count = 0; count < listLength.value; count += 1) {
      const nextIndex = index + 32;
      if (nextIndex > bytes.length) {
        throw new Error('truncated negentropy id list');
      }
      ids.push(encodeHex(bytes.slice(index, nextIndex)));
      index = nextIndex;
    }
  }

  return ids;
}

function chunkIds(ids: readonly string[], size = 50): RuntimeFilter[] {
  const chunks: RuntimeFilter[] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push({ ids: ids.slice(index, index + size) });
  }
  return chunks;
}

async function fetchRepairEventsFromRelay(
  runtime: ResonoteRuntime,
  filters: readonly RuntimeFilter[],
  relayUrl: string,
  timeoutMs: number | undefined,
  scope: string
): Promise<StoredEvent[]> {
  if (filters.length === 0) return [];

  const rxNostr = (await runtime.getRxNostr()) as NegentropySessionRuntime;
  const req = runtime.createRxBackwardReq({
    requestKey: createNegentropyRepairRequestKey({ filters, relayUrl, scope }),
    coalescingScope: REPAIR_REQUEST_COALESCING_SCOPE
  }) as {
    emit(input: unknown): void;
    over(): void;
  };

  const events = new Map<string, StoredEvent>();

  return new Promise<StoredEvent[]>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => finish(), timeoutMs ?? 10_000);

    const sub = rxNostr
      .use(req, {
        on: {
          relays: [relayUrl],
          defaultReadRelays: false
        }
      })
      .subscribe({
        next: (packet) => {
          const event = toStoredEvent(packet.event);
          if (event) events.set(event.id, event);
        },
        complete: () => finish(),
        error: () => finish()
      });

    for (const filter of filters) req.emit(filter);
    req.over();

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.unsubscribe();
      resolve([...events.values()]);
    }
  });
}

async function materializeRepairEvents(
  runtime: ResonoteRuntime,
  events: readonly StoredEvent[]
): Promise<{ repairedIds: string[]; materializationEmissions: ReconcileEmission[] }> {
  const eventsDB = await runtime.getEventsDB();
  const repairedIds: string[] = [];
  const materializationEmissions: ReconcileEmission[] = [];

  for (const event of events) {
    const result = await eventsDB.putWithReconcile(event);
    materializationEmissions.push(...result.emissions);
    if (result.stored) repairedIds.push(event.id);
  }

  return {
    repairedIds,
    materializationEmissions
  };
}

async function fallbackRepairEventsFromRelay(
  runtime: ResonoteRuntime,
  options: RelayRepairOptions,
  capability: NegentropyTransportResult['capability']
): Promise<RelayRepairResult> {
  const fallbackEvents = await fetchRepairEventsFromRelay(
    runtime,
    options.filters,
    options.relayUrl,
    options.timeoutMs,
    'timeline:repair:fallback'
  );
  const materialized = await materializeRepairEvents(runtime, fallbackEvents);

  return {
    strategy: 'fallback',
    capability,
    repairedIds: materialized.repairedIds,
    materializationEmissions: materialized.materializationEmissions,
    repairEmissions: reconcileReplayRepairSubjects(materialized.repairedIds, 'repaired-replay')
  };
}

export async function repairEventsFromRelay(
  runtime: ResonoteRuntime,
  options: RelayRepairOptions
): Promise<RelayRepairResult> {
  const eventsDB = await runtime.getEventsDB();

  if (isNegentropyRelayUnsupported(runtime, options.relayUrl)) {
    return fallbackRepairEventsFromRelay(runtime, options, 'unsupported');
  }

  const session = (await runtime.getRxNostr()) as Partial<NegentropySessionRuntime>;

  if (typeof session.requestNegentropySync !== 'function') {
    cacheUnsupportedNegentropyRelay(runtime, options.relayUrl);
    return fallbackRepairEventsFromRelay(runtime, options, 'unsupported');
  }

  const localRefs = await eventsDB.listNegentropyEventRefs();
  const missingIds = new Set<string>();

  for (const filter of options.filters) {
    const selectedLocal = filterNegentropyEventRefs(localRefs, [filter]);

    let transportResult: NegentropyTransportResult;
    try {
      transportResult = await session.requestNegentropySync({
        relayUrl: options.relayUrl,
        filter,
        initialMessageHex: encodeNegentropyIdListMessage(selectedLocal),
        timeoutMs: options.timeoutMs
      });
    } catch {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    if (transportResult.capability !== 'supported') {
      if (transportResult.capability === 'unsupported') {
        cacheUnsupportedNegentropyRelay(runtime, options.relayUrl);
      }
      return fallbackRepairEventsFromRelay(runtime, options, transportResult.capability);
    }

    if (!transportResult.messageHex) {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    let remoteIds: string[];
    try {
      remoteIds = decodeNegentropyIdListMessage(transportResult.messageHex);
    } catch {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    const localIds = new Set(selectedLocal.map((event) => event.id));
    for (const remoteId of remoteIds) {
      if (!localIds.has(remoteId)) {
        missingIds.add(remoteId);
      }
    }
  }

  const repairEvents = await fetchRepairEventsFromRelay(
    runtime,
    chunkIds([...missingIds]),
    options.relayUrl,
    options.timeoutMs,
    'timeline:repair:negentropy:fetch'
  );
  const materialized = await materializeRepairEvents(runtime, repairEvents);

  return {
    strategy: 'negentropy',
    capability: 'supported',
    repairedIds: materialized.repairedIds,
    materializationEmissions: materialized.materializationEmissions,
    repairEmissions: reconcileNegentropyRepairSubjects(materialized.repairedIds)
  };
}

export async function fetchProfileCommentEvents(
  runtime: QueryRuntime,
  pubkey: string,
  until?: number,
  limit = 20
): Promise<ProfileCommentEvent[]> {
  const filter = until
    ? { kinds: [1111], authors: [pubkey], limit, until }
    : { kinds: [1111], authors: [pubkey], limit };
  return runtime.fetchBackwardEvents<ProfileCommentEvent>([filter], { rejectOnError: true });
}

export async function fetchFollowListSnapshot(
  runtime: QueryRuntime,
  pubkey: string,
  followKind = 3
): Promise<LatestEventSnapshot | null> {
  return runtime.fetchLatestEvent(pubkey, followKind);
}

export async function fetchProfileMetadataEvents(
  runtime: QueryRuntime,
  pubkeys: readonly string[],
  batchSize = 50
) {
  return fetchReplaceableEventsByAuthorsAndKind(runtime, pubkeys, 0, batchSize);
}

export async function fetchProfileMetadataSources(
  runtime: QueryRuntime,
  relayStatusRuntime: Pick<RelayStatusRuntime, 'fetchLatestEvent'>,
  pubkeys: readonly string[],
  batchSize = 50
): Promise<{
  cachedEvents: StoredEvent[];
  fetchedEvents: StoredEvent[];
  fallbackEvents: Array<{
    pubkey: string;
    tags: string[][];
    content: string;
    created_at: number;
  }>;
  unresolvedPubkeys: string[];
}> {
  const { cachedEvents, fetchedEvents, unresolvedPubkeys } = await fetchProfileMetadataEvents(
    runtime,
    pubkeys,
    batchSize
  );

  if (unresolvedPubkeys.length === 0) {
    return { cachedEvents, fetchedEvents, fallbackEvents: [], unresolvedPubkeys };
  }

  const fallbackResults = await Promise.all(
    unresolvedPubkeys.map(async (pubkey) => ({
      pubkey,
      event: await relayStatusRuntime.fetchLatestEvent(pubkey, 0)
    }))
  );

  return {
    cachedEvents,
    fetchedEvents,
    fallbackEvents: fallbackResults.flatMap(({ pubkey, event }) =>
      event
        ? [
            {
              pubkey,
              tags: event.tags,
              content: event.content,
              created_at: event.created_at
            }
          ]
        : []
    ),
    unresolvedPubkeys: fallbackResults
      .filter(({ event }) => event === null)
      .map(({ pubkey }) => pubkey)
  };
}

function extractEmojiSetRefs(event: Pick<StoredEvent, 'tags'>): string[] {
  return event.tags
    .filter((tag) => tag[0] === 'a' && tag[1]?.startsWith('30030:'))
    .map((tag) => tag[1] as string);
}

function findDTag(tags: string[][]): string {
  return tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
}

function buildCategoryFromEvent(event: Pick<StoredEvent, 'id' | 'tags'>): EmojiCategory | null {
  const setName =
    event.tags.find((tag) => tag[0] === 'title')?.[1] ??
    event.tags.find((tag) => tag[0] === 'd')?.[1] ??
    'Emoji Set';

  const emojis = event.tags
    .filter((tag) => tag[0] === 'emoji' && tag[1] && tag[2])
    .map((tag) => ({
      id: tag[1] as string,
      name: tag[1] as string,
      skins: [{ src: tag[2] as string }]
    }));

  if (emojis.length === 0) return null;
  return { id: `set-${event.id.slice(0, 8)}`, name: setName, emojis };
}

function buildInlineCategory(listEvent: Pick<StoredEvent, 'tags'>): EmojiCategory | null {
  const emojis = listEvent.tags
    .filter((tag) => tag[0] === 'emoji' && tag[1] && tag[2])
    .map((tag) => ({
      id: tag[1] as string,
      name: tag[1] as string,
      skins: [{ src: tag[2] as string }]
    }));

  if (emojis.length === 0) return null;
  return { id: 'custom-inline', name: 'Custom', emojis };
}

export async function fetchCustomEmojiSources(
  runtime: QueryRuntime,
  pubkey: string
): Promise<{
  listEvent: StoredEvent | null;
  setEvents: StoredEvent[];
}> {
  const eventsDB = await runtime.getEventsDB();
  const listEvent = await runtime.fetchBackwardFirst<StoredEvent>(
    [{ kinds: [10030], authors: [pubkey], limit: 1 }],
    { timeoutMs: 5_000 }
  );
  if (listEvent) {
    await cacheEvent(eventsDB, listEvent);
  }

  if (!listEvent) {
    return { listEvent: null, setEvents: [] };
  }

  const setRefs = extractEmojiSetRefs(listEvent);
  if (setRefs.length === 0) {
    return { listEvent, setEvents: [] };
  }

  const cachedEvents = (
    await Promise.all(
      setRefs.map(async (ref) => {
        const [kind, author, dTag] = ref.split(':');
        if (kind !== '30030' || !author || !dTag) return null;
        return eventsDB.getByReplaceKey(author, 30030, dTag);
      })
    )
  ).filter((event): event is StoredEvent => event !== null);

  const cachedKeys = new Set(
    cachedEvents.map((event) => `${event.pubkey}:${findDTag(event.tags)}`)
  );
  const missingRefs = setRefs.filter((ref) => {
    const [, author, dTag] = ref.split(':');
    return Boolean(author && dTag && !cachedKeys.has(`${author}:${dTag}`));
  });

  const missingFilters = missingRefs.flatMap((ref) => {
    const [kind, author, dTag] = ref.split(':');
    if (kind !== '30030' || !author || !dTag) return [];
    return [{ kinds: [30030], authors: [author], '#d': [dTag] }];
  });

  const fetchedEvents =
    missingFilters.length === 0
      ? []
      : await runtime.fetchBackwardEvents<StoredEvent>(missingFilters, { timeoutMs: 5_000 });

  await Promise.all(fetchedEvents.map((event) => cacheEvent(eventsDB, event)));

  return { listEvent, setEvents: [...cachedEvents, ...fetchedEvents] };
}

export async function fetchCustomEmojiCategories(
  runtime: QueryRuntime,
  pubkey: string
): Promise<EmojiCategory[]> {
  const { listEvent, setEvents } = await fetchCustomEmojiSources(runtime, pubkey);
  if (!listEvent) return [];

  const categories: EmojiCategory[] = [];
  const inlineCategory = buildInlineCategory(listEvent);
  if (inlineCategory) categories.push(inlineCategory);

  for (const event of setEvents) {
    const category = buildCategoryFromEvent(event);
    if (category) categories.push(category);
  }

  return categories;
}

function hasBookmarkDTagPayload(tags: string[][]): boolean {
  let hasFeed = false;
  let hasItem = false;

  for (const tag of tags) {
    if (tag[0] !== 'i' || !tag[1] || !tag[2]) continue;
    if (tag[1].startsWith('podcast:guid:')) hasFeed = true;
    if (tag[1].startsWith('podcast:item:guid:')) hasItem = true;
  }

  return hasFeed && hasItem;
}

export async function searchBookmarkDTagEvent(
  runtime: QueryRuntime,
  pubkey: string,
  normalizedUrl: string
): Promise<StoredEvent | null> {
  const eventsDB = await runtime.getEventsDB();
  const cached = await eventsDB.getByReplaceKey(pubkey, 39701, normalizedUrl);
  if (cached && hasBookmarkDTagPayload(cached.tags)) return cached;

  const event = await runtime.fetchBackwardFirst<StoredEvent>(
    [{ kinds: [39701], authors: [pubkey], '#d': [normalizedUrl], limit: 1 }],
    { timeoutMs: 5_000 }
  );

  if (event) await cacheEvent(eventsDB, event);
  return event;
}

export async function searchEpisodeBookmarkByGuid(
  runtime: QueryRuntime,
  pubkey: string,
  guid: string
): Promise<StoredEvent | null> {
  const eventsDB = await runtime.getEventsDB();
  const cached = await eventsDB.getByTagValue(`i:podcast:item:guid:${guid}`, 39701);
  const cachedMatch = cached.find((event) => event.pubkey === pubkey) ?? null;
  if (cachedMatch) return cachedMatch;

  const event = await runtime.fetchBackwardFirst<StoredEvent>(
    [{ kinds: [39701], authors: [pubkey], '#i': [`podcast:item:guid:${guid}`], limit: 1 }],
    { timeoutMs: 5_000 }
  );

  if (event) await cacheEvent(eventsDB, event);
  return event;
}

interface QueryRuntimeWithById extends QueryRuntime<StoredEvent> {
  getEventsDB(): Promise<
    Awaited<ReturnType<QueryRuntime<StoredEvent>['getEventsDB']>> & {
      getById(id: string): Promise<StoredEvent | null>;
      putWithReconcile?(event: StoredEvent): Promise<{ stored: boolean }>;
    }
  >;
}

export async function fetchNostrEventById<TEvent>(
  runtime: QueryRuntimeWithById,
  eventId: string,
  relayHints: readonly string[]
): Promise<TEvent | null> {
  const eventsDB = await runtime.getEventsDB();
  const cached = await eventsDB.getById(eventId);
  if (cached) return cached as TEvent;

  const event = await fetchEventById<TEvent & StoredEvent>(runtime, eventId, relayHints);
  if (!event) return null;

  const stored =
    typeof (eventsDB as { putWithReconcile?: unknown }).putWithReconcile === 'function'
      ? await (
          eventsDB as unknown as {
            putWithReconcile(event: StoredEvent): Promise<{ stored: boolean }>;
          }
        ).putWithReconcile(event)
      : { stored: (await eventsDB.put(event)) !== false };

  return stored.stored ? event : null;
}

export async function fetchNotificationTargetPreview(
  coordinator: Pick<ResonoteCoordinator, 'fetchNotificationTargetPreview'>,
  eventId: string
): Promise<string | null> {
  return coordinator.fetchNotificationTargetPreview(eventId);
}

export async function loadCommentSubscriptionDeps(
  runtime: SessionRuntime
): Promise<CommentSubscriptionRefs> {
  return loadEventSubscriptionDeps(
    createRegistryBackedSessionRuntime(runtime as SessionRuntime<StoredEvent>)
  );
}

export function buildCommentContentFilters(
  idValue: string,
  kinds: CommentFilterKinds
): Array<Record<string, unknown>> {
  return [
    { kinds: [kinds.comment], '#I': [idValue] },
    { kinds: [kinds.reaction], '#I': [idValue] },
    { kinds: [kinds.deletion], '#I': [idValue] },
    { kinds: [kinds.contentReaction], '#i': [idValue] }
  ];
}

export function startCommentSubscription(
  refs: CommentSubscriptionRefs,
  filters: Array<Record<string, unknown>>,
  maxCreatedAt: number | null,
  onPacket: (
    event: {
      id: string;
      pubkey: string;
      content: string;
      created_at: number;
      tags: string[][];
      kind: number;
    },
    relayHint?: string
  ) => void,
  onBackwardComplete: () => void,
  onError?: (error: unknown) => void
): SubscriptionHandle[] {
  return startBackfillAndLiveSubscription<DeletionEvent>(
    refs,
    filters,
    maxCreatedAt,
    onPacket,
    onBackwardComplete,
    onError
  );
}

export function startMergedCommentSubscription(
  refs: CommentSubscriptionRefs,
  filters: Array<Record<string, unknown>>,
  onPacket: (
    event: {
      id: string;
      pubkey: string;
      content: string;
      created_at: number;
      tags: string[][];
      kind: number;
    },
    relayHint?: string
  ) => void,
  onError?: (error: unknown) => void
): SubscriptionHandle {
  return startMergedLiveSubscription<DeletionEvent>(refs, filters, onPacket, onError);
}

export function startCommentDeletionReconcile(
  refs: CommentSubscriptionRefs,
  cachedIds: string[],
  deletionKind: number,
  onDeletionEvent: (event: DeletionEvent) => void,
  onComplete: () => void
): { sub: SubscriptionHandle; timeout: ReturnType<typeof setTimeout> } {
  return startDeletionReconcileImpl<DeletionEvent>(
    refs,
    cachedIds,
    deletionKind,
    onDeletionEvent,
    onComplete
  );
}

export async function fetchWot(
  runtime: SessionRuntime,
  pubkey: string,
  callbacks: WotProgressCallback,
  extractFollows: (event: Pick<StoredEvent, 'tags'>) => Set<string>,
  followKind = 3,
  batchSize = 100
): Promise<WotResult> {
  return fetchFollowGraph(runtime, pubkey, callbacks, extractFollows, followKind, batchSize);
}

export async function subscribeNotificationStreams(
  runtime: SessionRuntime,
  options: NotificationStreamOptions,
  handlers: NotificationStreamHandlers
): Promise<SubscriptionHandle[]> {
  const secondaryFilters = [...options.follows].flatMap((author, index, authors) => {
    if (authors.length === 0) return [];
    const batchSize = options.batchSize ?? 100;
    if (index % batchSize !== 0) return [];
    return [
      {
        kinds: [options.followCommentKind],
        authors: authors.slice(index, index + batchSize),
        since: options.followCommentSince
      }
    ];
  });

  return subscribeDualFilterStreams(
    createRegistryBackedSessionRuntime(runtime as SessionRuntime<StoredEvent>),
    {
      primaryFilter: {
        kinds: [...options.mentionKinds],
        '#p': [options.myPubkey],
        since: options.mentionSince
      },
      secondaryFilters
    },
    {
      onPrimaryPacket: handlers.onMentionPacket,
      onSecondaryPacket: handlers.onFollowCommentPacket,
      onError: handlers.onError
    }
  );
}

export async function snapshotRelayStatuses(runtime: SessionRuntime, urls: readonly string[]) {
  return snapshotRelayStatusesImpl(runtime, urls);
}

export async function observeRelayStatuses(
  runtime: SessionRuntime,
  onPacket: (packet: RelayObservationPacket) => void
) {
  return observeRelayStatusesImpl(runtime, onPacket);
}

export async function fetchRelayListEvents(
  runtime: QueryRuntime,
  pubkey: string,
  relayListKind: number,
  followKind: number
): Promise<{
  relayListEvents: StoredEvent[];
  followListEvents: StoredEvent[];
}> {
  const [relayListEvents, followListEvents] = await fetchLatestEventsForKinds(runtime, pubkey, [
    relayListKind,
    followKind
  ]);
  return { relayListEvents: relayListEvents ?? [], followListEvents: followListEvents ?? [] };
}

export async function fetchRelayListSources(
  runtime: QueryRuntime,
  relayStatusRuntime: Pick<RelayStatusRuntime, 'fetchLatestEvent'>,
  pubkey: string,
  relayListKind: number,
  followKind: number
): Promise<{
  relayListEvents: Array<{
    created_at: number;
    tags: string[][];
  }>;
  followListEvents: Array<{
    created_at: number;
    content: string;
  }>;
}> {
  const { relayListEvents: fetchedRelayListEvents, followListEvents: fetchedFollowListEvents } =
    await fetchRelayListEvents(runtime, pubkey, relayListKind, followKind);
  const relayListEvents = fetchedRelayListEvents.map((event) => ({
    created_at: event.created_at,
    tags: event.tags
  }));
  const followListEvents = fetchedFollowListEvents.map((event) => ({
    created_at: event.created_at,
    content: event.content
  }));

  if (relayListEvents.length === 0) {
    const latestRelayList = await relayStatusRuntime.fetchLatestEvent(pubkey, relayListKind);
    if (latestRelayList) {
      relayListEvents.push({
        created_at: latestRelayList.created_at,
        tags: latestRelayList.tags
      });
    }
  }

  if (followListEvents.length === 0) {
    const latestFollowList = await relayStatusRuntime.fetchLatestEvent(pubkey, followKind);
    if (latestFollowList) {
      followListEvents.push({
        created_at: latestFollowList.created_at,
        content: latestFollowList.content
      });
    }
  }

  return { relayListEvents, followListEvents };
}
