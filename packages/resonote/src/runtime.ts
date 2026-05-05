import type {
  NegentropyTransportResult,
  OrderedEventCursor,
  ReadSettlement,
  ReadSettlementLocalProvenance,
  RelayCapabilityLearningEvent,
  RelayCapabilityRecord,
  RelayExecutionCapability,
  RelayObservationPacket,
  RelayObservationRuntime,
  RelayObservationSnapshot,
  RelaySelectionCandidate,
  RelaySelectionPolicyOptions,
  RequestKey,
  StoredEvent
} from '@auftakt/core';
import {
  createNegentropyRepairRequestKey,
  createRuntimeRequestKey,
  filterNegentropyEventRefs,
  type NegentropyEventRef,
  parseNip65RelayListTags,
  type ReconcileEmission,
  reduceReadSettlement,
  validateRelayEvent
} from '@auftakt/core';
import {
  type AddressableHandle,
  type AddressableHandleInput,
  type AuftaktRuntimePlugin,
  type AuftaktRuntimePluginRegistration,
  buildPublishRelaySendOptions,
  buildReadRelayOverlay,
  buildRelaySetSnapshot,
  cacheEvent,
  createAuftaktRuntimeCoordinator,
  createEventCoordinator,
  createMaterializerQueue,
  createRegistryBackedSessionRuntime,
  createRelayCapabilityRegistry,
  createRelayGateway,
  DEFAULT_RELAY_SELECTION_POLICY as RESONOTE_DEFAULT_RELAY_SELECTION_POLICY,
  type EntityHandleRuntime,
  type EventHandle,
  type EventHandleInput,
  type EventSubscriptionRefs as CommentSubscriptionRefs,
  fetchEventById,
  fetchFollowGraph,
  fetchLatestEventsForKinds,
  fetchNip11RelayInformation,
  fetchReplaceableEventsByAuthorsAndKind,
  type LatestEventSnapshot,
  loadEventSubscriptionDeps,
  observeRelayStatuses as observeRelayStatusesImpl,
  type PendingPublishQueueRuntime,
  type PublishHintRecorder,
  type PublishRuntime,
  publishSignedEventThroughCoordinator,
  publishSignedEventWithOfflineFallback,
  type PublishTransportOptions,
  publishTransportRuntimeWithAcks,
  type QueryRuntime,
  RELAY_LIST_KIND,
  type RelayCapabilityPacket,
  type RelayCapabilityRegistry,
  type RelayCapabilitySnapshot,
  type RelayCapabilityStore,
  type RelayHintsHandle,
  type RelayInformationDocument,
  type RelayMetricSnapshot,
  type RelaySetHandle,
  type RelaySetSubject,
  REPAIR_REQUEST_COALESCING_SCOPE,
  retryQueuedSignedPublishes,
  type SessionRuntime,
  snapshotRelayMetricsFromStore,
  snapshotRelayStatuses as snapshotRelayStatusesImpl,
  startBackfillAndLiveSubscription,
  startDeletionReconcile as startDeletionReconcileImpl,
  startMergedLiveSubscription,
  subscribeDualFilterStreams,
  type SubscriptionHandle,
  toRetryableSignedEvent,
  type UserHandle,
  type UserHandleInput
} from '@auftakt/runtime';
import { createRelayListFlowPlugin, RELAY_LIST_FLOW, type RelayListFlow } from '@auftakt/runtime';
import type { EventParameters } from 'nostr-typedef';
import { Observable } from 'rxjs';

import { ingestRelayEvent, type QuarantineRecord } from './event-ingress.js';
import {
  type CommentsFlow,
  type ContentResolutionFlow,
  createEmojiCatalogPlugin,
  createNotificationsFlowPlugin,
  type CustomEmojiSetDiagnosticsSource,
  type CustomEmojiSourceDiagnosticsResult,
  EMOJI_CATALOG_READ_MODEL,
  type EmojiCatalogReadModel,
  NOTIFICATIONS_FLOW,
  type NotificationsFlow
} from './plugins/built-in-plugins.js';
import {
  COMMENTS_FLOW,
  CONTENT_RESOLUTION_FLOW,
  createResonoteCommentsFlowPlugin,
  createResonoteContentResolutionFlowPlugin
} from './plugins/resonote-flows.js';
import { createTimelinePlugin } from './plugins/timeline-plugin.js';

export type { CommentSubscriptionRefs, SubscriptionHandle };
export type {
  AddressableHandle,
  AddressableHandleInput,
  EntityFetchOptions,
  EntityHandleState,
  EntityReadResult,
  EventHandle,
  EventHandleInput,
  NormalizedRelayHint,
  RelayHintsHandle,
  RelayHintsReadResult,
  RelaySetHandle,
  RelaySetSnapshot,
  RelaySetSubject,
  UserHandle,
  UserHandleInput,
  UserProfileReadResult
} from '@auftakt/runtime';
export type { RelayCapabilityPacket, RelayCapabilitySnapshot } from '@auftakt/runtime';

type RuntimeFilter = Record<string, unknown>;

const ORDINARY_READ_NEGENTROPY_PROBE_TIMEOUT_MS = 250;
const NIP77_NEGENTROPY_SYNC_NIP = 77;

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
    getAllByKind(kind: number): Promise<StoredEvent[]>;
    getByTagValue(tagQuery: string, kind?: number): Promise<StoredEvent[]>;
    listNegentropyEventRefs(): Promise<NegentropyEventRef[]>;
    recordRelayHint?(hint: {
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }): Promise<void>;
    getRelayHints?(eventId: string): Promise<
      Array<{
        readonly eventId: string;
        readonly relayUrl: string;
        readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
        readonly lastSeenAt: number;
      }>
    >;
    putQuarantine?(record: QuarantineRecord): Promise<void>;
    put(event: StoredEvent): Promise<unknown>;
    putWithReconcile?(event: StoredEvent): Promise<{
      stored: boolean;
      emissions: ReconcileEmission[];
    }>;
    getRelayCapability?(relayUrl: string): Promise<RelayCapabilityRecord | null>;
    listRelayCapabilities?(): Promise<RelayCapabilityRecord[]>;
    putRelayCapability?(record: RelayCapabilityRecord): Promise<void>;
  }>;
  getRelaySession(): Promise<NegentropySessionRuntime>;
  getDefaultRelays?(): Promise<readonly string[]> | readonly string[];
  createBackwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): {
    emit(input: unknown): void;
    over(): void;
  };
}

interface EventMaterializationRuntime {
  getEventsDB(): Promise<{
    putQuarantine?(record: QuarantineRecord): Promise<void>;
    put(event: StoredEvent): Promise<unknown>;
    putWithReconcile?(event: StoredEvent): Promise<{
      stored: boolean;
      emissions: ReconcileEmission[];
    }>;
  }>;
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

const NULL_CACHE_TTL_MS = 30_000;

const cachedFetchStates = new WeakMap<CoordinatorReadRuntime, CachedFetchState>();
const unsupportedOrdinaryReadNegentropyRelays = new WeakMap<object, Set<string>>();

const capabilitySubscribedSessions = new WeakSet<object>();
function createMaterializedSubscriptionRuntime(
  runtime: SessionRuntime<StoredEvent>
): SessionRuntime<StoredEvent> {
  const materializationRuntime = runtime as unknown as EventMaterializationRuntime;

  return {
    fetchBackwardEvents: <TOutput = StoredEvent>(
      filters: readonly RuntimeFilter[],
      options?: FetchBackwardOptions
    ) => runtime.fetchBackwardEvents<TOutput>(filters, options),
    fetchBackwardFirst: <TOutput = StoredEvent>(
      filters: readonly RuntimeFilter[],
      options?: FetchBackwardOptions
    ) => runtime.fetchBackwardFirst<TOutput>(filters, options),
    fetchLatestEvent: (...args) => runtime.fetchLatestEvent(...args),
    getEventsDB: () => runtime.getEventsDB(),
    getRelaySession: async () => {
      const session = await runtime.getRelaySession();

      return {
        use: (req, options) =>
          new Observable<unknown>((observer) => {
            const pendingMaterializations = new Set<Promise<void>>();
            let settled:
              | { readonly type: 'complete' }
              | { readonly type: 'error'; error: unknown }
              | null = null;
            let disposed = false;

            const finishIfIdle = () => {
              if (!settled || pendingMaterializations.size > 0 || disposed) return;
              if (settled.type === 'error') {
                observer.error(settled.error);
                return;
              }
              observer.complete();
            };

            const subscription = session.use(req, options).subscribe({
              next: (packet) => {
                const candidate = readRelayPacketCandidate(packet);
                if (!candidate) return;

                const task = (async () => {
                  const accepted = await ingestRelayCandidateForRuntime(materializationRuntime, {
                    event: candidate.event,
                    relayUrl: candidate.relayUrl
                  });
                  if (!accepted.ok || disposed) return;

                  observer.next({
                    ...candidate.packet,
                    event: accepted.event,
                    from: candidate.relayUrl || undefined
                  });
                })();

                pendingMaterializations.add(task);
                void task
                  .catch((error) => {
                    if (!disposed) observer.error(error);
                  })
                  .finally(() => {
                    pendingMaterializations.delete(task);
                    finishIfIdle();
                  });
              },
              complete: () => {
                settled = { type: 'complete' };
                finishIfIdle();
              },
              error: (error) => {
                settled = { type: 'error', error };
                finishIfIdle();
              }
            });

            return () => {
              disposed = true;
              subscription.unsubscribe();
              pendingMaterializations.clear();
            };
          })
      };
    },
    createBackwardReq: (options) => runtime.createBackwardReq(options),
    createForwardReq: (options) => runtime.createForwardReq(options),
    uniq: () => runtime.uniq(),
    merge: (...streams) => runtime.merge(...streams),
    getRelayConnectionState: (url) => runtime.getRelayConnectionState(url),
    observeRelayConnectionStates: (onPacket) => runtime.observeRelayConnectionStates(onPacket)
  };
}

function readRelayPacketCandidate(packet: unknown): {
  packet: Record<string, unknown>;
  event: unknown;
  relayUrl: string;
} | null {
  if (typeof packet !== 'object' || packet === null || !('event' in packet)) {
    return null;
  }

  const record = packet as Record<string, unknown>;
  return {
    packet: record,
    event: record.event,
    relayUrl: typeof record.from === 'string' ? record.from : ''
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

function getUnsupportedOrdinaryReadNegentropyRelayCache(runtime: object): Set<string> {
  const existing = unsupportedOrdinaryReadNegentropyRelays.get(runtime);
  if (existing) return existing;
  const relays = new Set<string>();
  unsupportedOrdinaryReadNegentropyRelays.set(runtime, relays);
  return relays;
}

function cacheUnsupportedOrdinaryReadNegentropyRelay(runtime: object, relayUrl: string): void {
  getUnsupportedOrdinaryReadNegentropyRelayCache(runtime).add(relayUrl);
}

function isOrdinaryReadNegentropyRelayUnsupported(runtime: object, relayUrl: string): boolean {
  return getUnsupportedOrdinaryReadNegentropyRelayCache(runtime).has(relayUrl);
}

function isFreshRelayCapabilityRecord(record: RelayCapabilityRecord): boolean {
  return (
    record.nip11Status === 'ok' &&
    typeof record.nip11ExpiresAt === 'number' &&
    record.nip11ExpiresAt > Math.floor(Date.now() / 1000)
  );
}

function isFreshFailedRelayCapabilityRecord(record: RelayCapabilityRecord): boolean {
  return (
    record.nip11Status === 'failed' &&
    typeof record.nip11ExpiresAt === 'number' &&
    record.nip11ExpiresAt > Math.floor(Date.now() / 1000)
  );
}

async function shouldAttemptOrdinaryReadNegentropy(
  runtime: CoordinatorReadRuntime,
  relayUrl: string
): Promise<boolean> {
  if (isOrdinaryReadNegentropyRelayUnsupported(runtime, relayUrl)) return false;

  try {
    const db = await runtime.getEventsDB();
    const record = await db.getRelayCapability?.(relayUrl);
    if (!record) return true;
    if (isFreshRelayCapabilityRecord(record)) {
      return record.supportedNips.includes(NIP77_NEGENTROPY_SYNC_NIP);
    }
    if (isFreshFailedRelayCapabilityRecord(record)) return false;
  } catch {
    return true;
  }

  return true;
}

async function requestOrdinaryReadNegentropySync(
  runtime: CoordinatorReadRuntime,
  input: {
    readonly relayUrl: string;
    readonly filter: RuntimeFilter;
    readonly initialMessageHex: string;
  }
): Promise<NegentropyTransportResult> {
  const session = (await runtime.getRelaySession()) as Partial<NegentropySessionRuntime>;
  if (typeof session.requestNegentropySync !== 'function') {
    cacheUnsupportedOrdinaryReadNegentropyRelay(runtime, input.relayUrl);
    return {
      capability: 'unsupported',
      reason: 'missing-negentropy'
    };
  }

  if (!(await shouldAttemptOrdinaryReadNegentropy(runtime, input.relayUrl))) {
    return {
      capability: 'unsupported',
      reason: 'cached-unsupported'
    };
  }

  try {
    const result = await session.requestNegentropySync({
      relayUrl: input.relayUrl,
      filter: input.filter,
      initialMessageHex: input.initialMessageHex,
      timeoutMs: ORDINARY_READ_NEGENTROPY_PROBE_TIMEOUT_MS
    });
    if (result.capability !== 'supported') {
      cacheUnsupportedOrdinaryReadNegentropyRelay(runtime, input.relayUrl);
    }
    return result;
  } catch (error) {
    cacheUnsupportedOrdinaryReadNegentropyRelay(runtime, input.relayUrl);
    return {
      capability: 'failed',
      reason: error instanceof Error ? error.message : 'negentropy-error'
    };
  }
}

function isCoordinatorReadRuntime(value: unknown): value is CoordinatorReadRuntime {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getEventsDB' in value &&
    'getRelaySession' in value &&
    'createBackwardReq' in value
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
  runtime: EventMaterializationRuntime,
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

async function quarantineRelayEvent(
  runtime: EventMaterializationRuntime,
  record: QuarantineRecord
): Promise<void> {
  try {
    const db = await runtime.getEventsDB();
    await db.putQuarantine?.(record);
  } catch {
    // Invalid relay input remains blocked even if diagnostics cannot be persisted.
  }
}

async function ingestRelayCandidateForRuntime(
  runtime: EventMaterializationRuntime,
  candidate: { readonly event: unknown; readonly relayUrl: string }
): Promise<{ readonly ok: true; readonly event: StoredEvent } | { readonly ok: false }> {
  const result = await ingestRelayEvent({
    relayUrl: candidate.relayUrl,
    event: candidate.event,
    materialize: (incoming) => materializeIncomingEvent(runtime, incoming),
    quarantine: (record) => quarantineRelayEvent(runtime, record)
  });

  if (!result.ok || !result.stored) {
    return { ok: false };
  }

  return { ok: true, event: result.event };
}

function getRawRelayEventId(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const id = (event as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

async function acceptRelayCandidateForRuntime(
  runtime: EventMaterializationRuntime,
  candidate: { readonly event: unknown; readonly relayUrl: string }
): Promise<{ readonly ok: true; readonly event: StoredEvent } | { readonly ok: false }> {
  const validation = await validateRelayEvent(candidate.event);
  if (!validation.ok) {
    await quarantineRelayEvent(runtime, {
      relayUrl: candidate.relayUrl,
      eventId: getRawRelayEventId(candidate.event),
      reason: validation.reason,
      rawEvent: candidate.event
    });
    return { ok: false };
  }

  return { ok: true, event: validation.event };
}

function createCoordinatorStore(runtime: CoordinatorReadRuntime) {
  return {
    getById: async (id: string) => {
      const db = await runtime.getEventsDB();
      return db.getById(id);
    },
    getAllByKind: async (kind: number) => {
      const db = await runtime.getEventsDB();
      return db.getAllByKind(kind);
    },
    getByTagValue: async (tagQuery: string, kind?: number) => {
      const db = await runtime.getEventsDB();
      return db.getByTagValue(tagQuery, kind);
    },
    putWithReconcile: async (event: StoredEvent) => ({
      stored: await materializeIncomingEvent(runtime, event)
    }),
    recordRelayHint: async (hint: {
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }) => {
      const db = await runtime.getEventsDB();
      await db.recordRelayHint?.(hint);
    }
  };
}

function createRuntimeEventCoordinator(
  runtime: CoordinatorReadRuntime,
  options?: FetchBackwardOptions
) {
  return createEventCoordinator({
    materializerQueue: createMaterializerQueue(),
    relayGateway: {
      verify: async (filters) => {
        const candidates = await verifyOrdinaryReadRelayCandidates(runtime, filters, options);
        return { candidates };
      }
    },
    ingestRelayCandidate: (candidate) => acceptRelayCandidateForRuntime(runtime, candidate),
    store: createCoordinatorStore(runtime),
    relay: {
      verify: async () => []
    }
  });
}

function createOrdinaryReadRelayGateway(
  runtime: CoordinatorReadRuntime,
  options?: FetchBackwardOptions
) {
  return createRelayGateway({
    requestNegentropySync: (input) => requestOrdinaryReadNegentropySync(runtime, input),
    fetchByReq: async (filters, requestOptions) =>
      fetchRelayCandidateEventsFromRelay(
        runtime as ResonoteRuntime,
        filters,
        requestOptions.relayUrl,
        options?.timeoutMs,
        'coordinator:ordinary-read:gateway'
      ),
    listLocalRefs: async (filters) => {
      const db = await runtime.getEventsDB();
      return filterNegentropyEventRefs(await db.listNegentropyEventRefs(), filters);
    }
  });
}

async function verifyOrdinaryReadRelayCandidates(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options: FetchBackwardOptions | undefined
): Promise<Array<{ event: unknown; relayUrl: string }>> {
  if (filters.length === 0) return [];

  const relayUrls = await selectOrdinaryReadVerificationRelays(runtime, options);
  if (relayUrls.length === 0) {
    if (options?.overlay && options.overlay.includeDefaultReadRelays !== true) return [];
    return fetchRelayCandidateEventsFromDefaultReadRelays(runtime, filters, options);
  }

  const gateway = createOrdinaryReadRelayGateway(runtime, options);
  const results = await Promise.all(
    relayUrls.map(async (relayUrl) => {
      try {
        return await gateway.verify(filters, { relayUrl });
      } catch (error) {
        if (options?.rejectOnError) throw error;
        return { strategy: 'fallback-req' as const, candidates: [] };
      }
    })
  );

  return results.flatMap((result) => result.candidates);
}

async function selectOrdinaryReadVerificationRelays(
  runtime: CoordinatorReadRuntime,
  options: FetchBackwardOptions | undefined
): Promise<string[]> {
  const relays: string[] = [];
  const addRelays = (values: readonly string[]) => {
    for (const relay of values) {
      if (!relays.includes(relay)) relays.push(relay);
    }
  };

  if (options?.overlay) {
    addRelays(options.overlay.relays);
    if (options.overlay.includeDefaultReadRelays !== true) return relays;
  }

  if (typeof runtime.getDefaultRelays === 'function') {
    addRelays(await runtime.getDefaultRelays());
  }

  if (relays.length > 0) return relays;

  const session = (await runtime.getRelaySession()) as Partial<{
    getDefaultRelays(): Record<string, { read: boolean }>;
  }>;
  const sessionDefaults = Object.entries(session.getDefaultRelays?.() ?? {})
    .filter(([, config]) => config.read)
    .map(([relayUrl]) => relayUrl);
  addRelays(sessionDefaults);

  return relays;
}

async function fetchRelayCandidateEventsFromDefaultReadRelays(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options: FetchBackwardOptions | undefined
): Promise<Array<{ event: unknown; relayUrl: string }>> {
  if (filters.length === 0) return [];

  const relaySession = await runtime.getRelaySession();
  const req = runtime.createBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      filters,
      scope: 'coordinator:ordinary-read:default-read-relays'
    })
  });
  const candidates: Array<{ event: unknown; relayUrl: string }> = [];

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(), options?.timeoutMs ?? 10_000);
    const sub = relaySession.use(req).subscribe({
      next: (packet) => {
        candidates.push({
          event: packet.event,
          relayUrl: typeof packet.from === 'string' ? packet.from : ''
        });
      },
      complete: () => finish(),
      error: (error) => {
        if (options?.rejectOnError) {
          finish(error);
          return;
        }
        finish();
      }
    });

    for (const filter of filters) req.emit(filter);
    req.over();

    function finish(error?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.unsubscribe();
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve(candidates);
    }
  });
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

  const pendingRelayMaterializations = new Set<Promise<void>>();
  let relayFinished = false;

  const settleRelayIfIdle = () => {
    if (!relayFinished || pendingRelayMaterializations.size > 0) return;
    settleRelay();
  };

  const startRelay = async () => {
    try {
      if (state.destroyed) return;
      const relaySession = await runtime.getRelaySession();
      if (state.destroyed) return;

      const requestKey = createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ kinds: [kind], authors: [pubkey], limit: 1 }],
        scope: 'resonote:coordinator:useCachedLatest'
      });
      const req = runtime.createBackwardReq({ requestKey });

      state.timeout = setTimeout(() => {
        state.sub?.unsubscribe();
        settleRelay();
      }, 10_000);

      state.sub = relaySession.use(req).subscribe({
        next: (packet) => {
          const task = (async () => {
            if (state.destroyed) return;
            const result = await ingestRelayEvent({
              relayUrl: typeof packet.from === 'string' ? packet.from : '',
              event: packet.event,
              materialize: (event) => materializeIncomingEvent(runtime, event),
              quarantine: (record) => quarantineRelayEvent(runtime, record)
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
          pendingRelayMaterializations.add(task);
          void task.finally(() => {
            pendingRelayMaterializations.delete(task);
            settleRelayIfIdle();
          });
        },
        complete: () => {
          if (state.timeout) clearTimeout(state.timeout);
          relayFinished = true;
          settleRelayIfIdle();
        },
        error: () => {
          if (state.timeout) clearTimeout(state.timeout);
          relayFinished = true;
          settleRelayIfIdle();
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
      pendingRelayMaterializations.clear();
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
  const cached = readCachedById(state, eventId);
  if (cached.hit) {
    return {
      event: cached.event,
      settlement:
        cached.event === null
          ? reduceReadSettlement({
              localSettled: true,
              relaySettled: true,
              nullTtlHit: true
            })
          : reduceReadSettlement({
              localSettled: true,
              relaySettled: true,
              relayRequired: false,
              localHitProvenance: 'memory'
            })
    };
  }
  const gateway = createRelayGateway({
    requestNegentropySync: (input) => requestOrdinaryReadNegentropySync(runtime, input),
    fetchByReq: async (filters, options) =>
      fetchRelayCandidateEventsFromRelay(
        runtime as ResonoteRuntime,
        filters,
        options.relayUrl,
        5_000,
        'coordinator:gateway'
      ),
    listLocalRefs: async (filters) => {
      const db = await runtime.getEventsDB();
      return filterNegentropyEventRefs(await db.listNegentropyEventRefs(), filters);
    }
  });
  const coordinator = createEventCoordinator({
    materializerQueue: createMaterializerQueue(),
    relayGateway: {
      verify: async (filters) => {
        const session = (await runtime.getRelaySession()) as Partial<{
          getDefaultRelays(): Record<string, { read: boolean }>;
        }>;
        const relays = Object.entries(session.getDefaultRelays?.() ?? {})
          .filter(([, config]) => config.read)
          .map(([relayUrl]) => relayUrl);
        if (relays.length === 0) {
          const events = await verifyByIdFilters(runtime, state, filters);
          return {
            candidates: events.map((event) => ({ event, relayUrl: '' }))
          };
        }

        const results = await Promise.all(
          relays.map((relayUrl) => gateway.verify(filters, { relayUrl }))
        );
        return { candidates: results.flatMap((result) => result.candidates) };
      }
    },
    ingestRelayCandidate: (candidate) => ingestRelayCandidateForRuntime(runtime, candidate),
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

  const result = await coordinator.read(
    { ids: [eventId] },
    {
      policy: 'localFirst'
    }
  );
  if (invalidated) {
    state.cache.delete(eventId);
    state.nullCacheTimestamps.delete(eventId);
  }
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
):
  | { readonly hit: true; readonly event: StoredEvent | null }
  | {
      readonly hit: false;
    } {
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
    const relaySession = await runtime.getRelaySession();
    const event = await new Promise<StoredEvent | null>((resolve) => {
      const requestKey = createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ ids: [eventId] }],
        scope: 'resonote:coordinator:cachedFetchById'
      });
      const req = runtime.createBackwardReq({ requestKey });
      let found: StoredEvent | null = null;
      const pendingMaterializations = new Set<Promise<void>>();
      const sub = relaySession.use(req).subscribe({
        next: (packet) => {
          const task = (async () => {
            const result = await ingestRelayEvent({
              relayUrl: typeof packet.from === 'string' ? packet.from : '',
              event: packet.event,
              materialize: (incoming) => materializeIncomingEvent(runtime, incoming),
              quarantine: (record) => quarantineRelayEvent(runtime, record)
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
      if (event) {
        state.cache.set(eventId, event);
        state.nullCacheTimestamps.delete(eventId);
      } else if (!state.cache.has(eventId) || state.cache.get(eventId) === null) {
        state.cache.set(eventId, null);
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
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions,
  relaySelectionPolicy: RelaySelectionPolicyOptions = RESONOTE_DEFAULT_RELAY_SELECTION_POLICY,
  temporaryRelays: readonly string[] = []
): Promise<TEvent[]> {
  const resolvedOptions = await resolveReadOptions(
    runtime,
    filters,
    options,
    'read',
    relaySelectionPolicy,
    temporaryRelays
  );
  const coordinator = createRuntimeEventCoordinator(runtime, resolvedOptions);
  const result = await coordinator.read([...filters], { policy: 'localFirst' });

  if (resolvedOptions?.rejectOnError && result.settlement.phase !== 'settled') {
    throw new Error('Relay read did not settle');
  }

  return result.events as TEvent[];
}

function selectNewestVisibleEvent<TEvent extends StoredEvent>(
  events: readonly TEvent[]
): TEvent | null {
  return (
    [...events].sort((left, right) => {
      if (right.created_at !== left.created_at) return right.created_at - left.created_at;
      return right.id.localeCompare(left.id);
    })[0] ?? null
  );
}

function selectNewestBackwardResult<TEvent>(events: readonly TEvent[]): TEvent | null {
  return (
    [...events].sort((left, right) => {
      const leftEvent = left as Partial<StoredEvent>;
      const rightEvent = right as Partial<StoredEvent>;
      const leftCreatedAt = leftEvent.created_at ?? 0;
      const rightCreatedAt = rightEvent.created_at ?? 0;
      if (rightCreatedAt !== leftCreatedAt) return rightCreatedAt - leftCreatedAt;
      return (rightEvent.id ?? '').localeCompare(leftEvent.id ?? '');
    })[0] ?? null
  );
}

async function fetchLatestEventFromReadRuntime(
  runtime: CoordinatorReadRuntime,
  pubkey: string,
  kind: number,
  relaySelectionPolicy: RelaySelectionPolicyOptions
): Promise<LatestEventSnapshot | null> {
  const filters: RuntimeFilter[] = [{ kinds: [kind], authors: [pubkey], limit: 1 }];

  try {
    const resolvedOptions = await resolveReadOptions(
      runtime,
      filters,
      { timeoutMs: 10_000 },
      'read',
      relaySelectionPolicy
    );
    const coordinator = createRuntimeEventCoordinator(runtime, resolvedOptions);
    const result = await coordinator.read(filters, { policy: 'localFirst' });
    return selectNewestVisibleEvent(result.events);
  } catch {
    return null;
  }
}

async function fetchNostrEventByIdFromReadRuntime<TEvent>(
  runtime: CoordinatorReadRuntime,
  eventId: string,
  relayHints: readonly string[],
  relaySelectionPolicy: RelaySelectionPolicyOptions
): Promise<TEvent | null> {
  try {
    const events = await fetchBackwardEventsFromReadRuntime<StoredEvent>(
      runtime,
      [{ ids: [eventId] }],
      { timeoutMs: 10_000 },
      relaySelectionPolicy,
      relayHints
    );
    return (events.find((event) => event.id === eventId) as TEvent | undefined) ?? null;
  } catch {
    return null;
  }
}

async function resolveReadOptions(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options: FetchBackwardOptions | undefined,
  intent: 'read' | 'subscribe' | 'repair',
  relaySelectionPolicy: RelaySelectionPolicyOptions = RESONOTE_DEFAULT_RELAY_SELECTION_POLICY,
  temporaryRelays: readonly string[] = []
): Promise<FetchBackwardOptions | undefined> {
  if (options?.overlay) return options;

  const overlay = await buildReadRelayOverlay(runtime, {
    intent,
    filters,
    temporaryRelays,
    policy: relaySelectionPolicy
  });

  if (!overlay) return options;
  return {
    ...options,
    overlay
  };
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
    getSyncCursor?(key: string): Promise<OrderedEventCursor | null>;
    putSyncCursor?(record: {
      readonly key: string;
      readonly relay: string;
      readonly requestKey: string;
      readonly cursor: OrderedEventCursor;
      readonly updatedAt: number;
    }): Promise<void>;
    isDeleted?(id: string, pubkey: string): Promise<boolean>;
    recordRelayHint?(hint: {
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }): Promise<void>;
    getRelayHints?(eventId: string): Promise<
      Array<{
        readonly eventId: string;
        readonly relayUrl: string;
        readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
        readonly lastSeenAt: number;
      }>
    >;
    deleteByIds(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
    put(event: StoredEvent): Promise<unknown>;
    putWithReconcile(event: StoredEvent): Promise<{
      stored: boolean;
      emissions: ReconcileEmission[];
    }>;
    getRelayCapability?(relayUrl: string): Promise<RelayCapabilityRecord | null>;
    listRelayCapabilities?(): Promise<RelayCapabilityRecord[]>;
    putRelayCapability?(record: RelayCapabilityRecord): Promise<void>;
  }>;
  getRelaySession(): Promise<unknown>;
  getDefaultRelays?(): Promise<readonly string[]> | readonly string[];
  createBackwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): unknown;
  createForwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): unknown;
  uniq(): unknown;
  merge(...streams: unknown[]): unknown;
  getRelayConnectionState(url: string): Promise<RelayObservationSnapshot | null>;
  observeRelayConnectionStates(onPacket: (packet: RelayObservationPacket) => void): Promise<{
    unsubscribe(): void;
  }>;
}

export interface RelayCapabilityRuntime {
  fetchRelayInformation?(relayUrl: string): Promise<RelayInformationDocument>;
}

export interface ResonoteCoordinator<TResult = unknown, TLatestResult = unknown> {
  fetchBackwardEvents<TEvent>(
    filters: readonly Record<string, unknown>[],
    options?: FetchBackwardOptions
  ): Promise<TEvent[]>;
  fetchBackwardFirst<TEvent>(
    filters: readonly Record<string, unknown>[],
    options?: FetchBackwardOptions
  ): Promise<TEvent | null>;
  cachedFetchById(eventId: string): Promise<TResult>;
  invalidateFetchByIdCache(eventId: string): void;
  useCachedLatest(pubkey: string, kind: number): TLatestResult;
  castSigned(params: EventParameters, options?: PublishTransportOptions): Promise<void>;
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
  getEvent(input: EventHandleInput): EventHandle;
  getUser(input: UserHandleInput): UserHandle;
  getAddressable(input: AddressableHandleInput): AddressableHandle;
  getRelaySet(subject: RelaySetSubject): RelaySetHandle;
  getRelayHints(eventId: string): RelayHintsHandle;
  readCommentEventsByTag(tagQuery: string): Promise<StoredEvent[]>;
  storeCommentEvent(event: StoredEvent): Promise<boolean>;
  deleteCommentEventsByIds(ids: readonly string[]): Promise<void>;
  readStoredFollowGraph(
    pubkey: string,
    followKind: number
  ): Promise<{
    currentUserFollowList: StoredEvent | null;
    allFollowLists: StoredEvent[];
  }>;
  countStoredEventsByKinds(
    kinds: readonly number[]
  ): Promise<Array<{ readonly kind: number; readonly count: number }>>;
  clearStoredEvents(): Promise<void>;
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
  fetchCustomEmojiSourceDiagnostics(pubkey: string): Promise<CustomEmojiSourceDiagnosticsResult>;
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
  snapshotRelayCapabilities(urls: readonly string[]): Promise<RelayCapabilitySnapshot[]>;
  observeRelayCapabilities(
    onPacket: (packet: RelayCapabilityPacket) => void
  ): Promise<{ unsubscribe(): void }>;
  snapshotRelayMetrics(): Promise<RelayMetricSnapshot[]>;
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
  registerPlugin(plugin: AuftaktRuntimePlugin): Promise<AuftaktRuntimePluginRegistration>;
}

export interface CreateResonoteCoordinatorOptions<TResult, TLatestResult> {
  readonly runtime: ResonoteRuntime;
  readonly cachedFetchByIdRuntime: Pick<
    CachedFetchByIdRuntime<TResult>,
    'cachedFetchById' | 'invalidateFetchByIdCache'
  >;
  readonly cachedLatestRuntime: Pick<CachedLatestRuntime<TLatestResult>, 'useCachedLatest'>;
  readonly publishTransportRuntime: Pick<PublishRuntime, 'castSigned' | 'observePublishAcks'>;
  readonly pendingPublishQueueRuntime: PendingPublishQueueRuntime;
  readonly relayStatusRuntime: RelayStatusRuntime;
  readonly relayCapabilityRuntime?: RelayCapabilityRuntime;
  readonly relaySelectionPolicy?: RelaySelectionPolicyOptions;
  readonly entityHandleRuntime?: Pick<
    EntityHandleRuntime,
    'read' | 'snapshotRelaySet' | 'isDeleted'
  >;
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
    options?: {
      on?: { relays?: readonly string[]; defaultReadRelays?: boolean };
    }
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

interface RelayCapabilitySession {
  setRelayCapabilities(capabilities: Record<string, RelayExecutionCapability | undefined>): void;
  setRelayCapabilityLearningHandler(
    handler: ((event: RelayCapabilityLearningEvent) => void) | null
  ): void;
  createRelayCapabilityObservable(): {
    subscribe(observer: { next?: (packet: RelayCapabilityPacket) => void }): {
      unsubscribe(): void;
    };
  };
}

function createMemoryRelayCapabilityStore(): RelayCapabilityStore {
  const records = new Map<string, RelayCapabilityRecord>();

  return {
    async getRelayCapability(relayUrl) {
      return records.get(relayUrl) ?? null;
    },
    async listRelayCapabilities() {
      return [...records.values()];
    },
    async putRelayCapability(record) {
      const existing = records.get(record.relayUrl);
      records.set(record.relayUrl, {
        ...record,
        learnedMaxFilters: record.learnedMaxFilters ?? existing?.learnedMaxFilters ?? null,
        learnedMaxSubscriptions:
          record.learnedMaxSubscriptions ?? existing?.learnedMaxSubscriptions ?? null,
        learnedAt: record.learnedAt ?? existing?.learnedAt ?? null,
        learnedReason: record.learnedReason ?? existing?.learnedReason ?? null
      });
    }
  };
}

async function openRelayCapabilityStore(
  runtime: ResonoteRuntime,
  fallbackStore: RelayCapabilityStore
): Promise<RelayCapabilityStore> {
  const eventsDb = await runtime.getEventsDB();
  if (
    typeof eventsDb.getRelayCapability === 'function' &&
    typeof eventsDb.listRelayCapabilities === 'function' &&
    typeof eventsDb.putRelayCapability === 'function'
  ) {
    return {
      getRelayCapability: eventsDb.getRelayCapability.bind(eventsDb),
      listRelayCapabilities: eventsDb.listRelayCapabilities.bind(eventsDb),
      putRelayCapability: eventsDb.putRelayCapability.bind(eventsDb)
    };
  }

  return fallbackStore;
}

async function applyRelayCapabilitiesToRuntime(
  runtime: ResonoteRuntime,
  registry: RelayCapabilityRegistry,
  urls: readonly string[]
): Promise<void> {
  const session = await runtime.getRelaySession();
  if (typeof session !== 'object' || session === null) return;

  const capabilitySession = session as Partial<RelayCapabilitySession>;
  capabilitySession.setRelayCapabilities?.(await registry.getExecutionCapabilities(urls));

  if (capabilitySubscribedSessions.has(session)) {
    return;
  }

  capabilitySubscribedSessions.add(session);
  capabilitySession.setRelayCapabilityLearningHandler?.((event) => {
    void registry
      .recordLearned(event)
      .then(async () => {
        capabilitySession.setRelayCapabilities?.(
          await registry.getExecutionCapabilities([event.relayUrl])
        );
      })
      .catch(() => {});
  });

  const observable = capabilitySession.createRelayCapabilityObservable?.();
  observable?.subscribe({
    next: (packet) => {
      registry.setRuntimeState(packet.from, {
        queueDepth: packet.capability.queueDepth,
        activeSubscriptions: packet.capability.activeSubscriptions
      });
    }
  });
}

export function createResonoteCoordinator<TResult, TLatestResult>({
  runtime,
  cachedFetchByIdRuntime,
  cachedLatestRuntime,
  publishTransportRuntime,
  pendingPublishQueueRuntime,
  relayStatusRuntime,
  relayCapabilityRuntime,
  relaySelectionPolicy: configuredRelaySelectionPolicy,
  entityHandleRuntime
}: CreateResonoteCoordinatorOptions<TResult, TLatestResult>): ResonoteCoordinator<
  TResult,
  TLatestResult
> {
  const relaySelectionPolicy =
    configuredRelaySelectionPolicy ?? RESONOTE_DEFAULT_RELAY_SELECTION_POLICY;
  const coordinatorReadRuntime = runtime as unknown as CoordinatorReadRuntime;
  const queryRuntime: QueryRuntime<StoredEvent> = {
    fetchBackwardEvents: <TOutput = StoredEvent>(
      filters: readonly RuntimeFilter[],
      options?: FetchBackwardOptions
    ) =>
      fetchBackwardEventsFromReadRuntime<TOutput>(
        coordinatorReadRuntime,
        filters,
        cloneFetchBackwardOptions(options),
        relaySelectionPolicy
      ),
    fetchBackwardFirst: async <TOutput = StoredEvent>(
      filters: readonly RuntimeFilter[],
      options?: FetchBackwardOptions
    ) => {
      const events = await fetchBackwardEventsFromReadRuntime<TOutput>(
        coordinatorReadRuntime,
        filters,
        cloneFetchBackwardOptions(options),
        relaySelectionPolicy
      );
      return selectNewestBackwardResult(events);
    },
    fetchLatestEvent: (pubkey, kind) =>
      fetchLatestEventFromReadRuntime(coordinatorReadRuntime, pubkey, kind, relaySelectionPolicy),
    getEventsDB: () => runtime.getEventsDB()
  };
  const sessionRuntime = runtime as unknown as SessionRuntime<StoredEvent>;
  const registrySessionRuntime = createRegistryBackedSessionRuntime(sessionRuntime, {
    registryKey: JSON.stringify({
      strategy: relaySelectionPolicy.strategy,
      maxReadRelays: relaySelectionPolicy.maxReadRelays ?? null,
      maxWriteRelays: relaySelectionPolicy.maxWriteRelays ?? null,
      maxTemporaryRelays: relaySelectionPolicy.maxTemporaryRelays ?? null,
      maxAudienceRelays: relaySelectionPolicy.maxAudienceRelays ?? null,
      includeDefaultFallback: relaySelectionPolicy.includeDefaultFallback ?? null,
      allowTemporaryHints: relaySelectionPolicy.allowTemporaryHints ?? null,
      includeDurableHints: relaySelectionPolicy.includeDurableHints ?? null,
      includeAudienceRelays: relaySelectionPolicy.includeAudienceRelays ?? null
    }),
    queryRuntime,
    resolveUseOptions: async (entry) => {
      const overlay = await buildReadRelayOverlay(runtime, {
        intent: 'subscribe',
        filters: entry.filters,
        policy: relaySelectionPolicy
      });
      if (!overlay) return undefined;
      return {
        on: {
          relays: overlay.relays,
          defaultReadRelays: overlay.includeDefaultReadRelays ?? false
        }
      };
    }
  });
  const materializedSubscriptionRuntime =
    createMaterializedSubscriptionRuntime(registrySessionRuntime);
  const relayObservationRuntime = registrySessionRuntime as RelayObservationRuntime;
  const memoryRelayCapabilityStore = createMemoryRelayCapabilityStore();
  const relayCapabilityRegistry = createRelayCapabilityRegistry({
    openStore: () => openRelayCapabilityStore(runtime, memoryRelayCapabilityStore),
    fetchRelayInformation:
      relayCapabilityRuntime?.fetchRelayInformation ?? fetchNip11RelayInformation
  });
  const entityHandleRuntimeForCoordinator: EntityHandleRuntime = {
    read:
      entityHandleRuntime?.read ??
      (async (filters, options, temporaryRelays) => {
        const resolvedOptions = await resolveReadOptions(
          coordinatorReadRuntime,
          filters,
          {
            timeoutMs: options.timeoutMs,
            rejectOnError: options.rejectOnError
          },
          'read',
          relaySelectionPolicy,
          temporaryRelays
        );
        const coordinator = createRuntimeEventCoordinator(coordinatorReadRuntime, resolvedOptions);
        return coordinator.read(filters, {
          policy: options.cacheOnly === true ? 'cacheOnly' : 'localFirst'
        });
      }),
    isDeleted:
      entityHandleRuntime?.isDeleted ??
      (async (id, pubkey) => {
        const db = await runtime.getEventsDB();
        return (await db.isDeleted?.(id, pubkey)) === true;
      }),
    openStore: () => runtime.getEventsDB(),
    snapshotRelaySet:
      entityHandleRuntime?.snapshotRelaySet ??
      (async (subject) => {
        const candidates = await buildRelaySetCandidates(runtime, subject);
        return buildRelaySetSnapshot({
          subject,
          policy: relaySelectionPolicy,
          candidates
        });
      })
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
        : await queryRuntime.fetchBackwardEvents<StoredEvent>(missingFilters, {
            timeoutMs: 5_000
          });

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
      materializedSubscriptionRuntime,
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

  const builtInPlugins: AuftaktRuntimePlugin[] = [
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
      },
      fetchCustomEmojiSourceDiagnostics: (pubkey) =>
        fetchCustomEmojiSourceDiagnostics(queryRuntime, pubkey)
    }),
    createResonoteCommentsFlowPlugin({
      loadCommentSubscriptionDeps: () => loadEventSubscriptionDeps(materializedSubscriptionRuntime),
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
        return {
          relayListEvents: relayListEvents ?? [],
          followListEvents: followListEvents ?? []
        };
      }
    }),
    createResonoteContentResolutionFlowPlugin({
      searchBookmarkDTagEvent: async (pubkey, normalizedUrl) => {
        const eventsDB = await runtime.getEventsDB();
        const cached = await eventsDB.getByReplaceKey(pubkey, 39701, normalizedUrl);
        if (cached && hasBookmarkDTagPayload(cached.tags)) return cached;

        const event = await queryRuntime.fetchBackwardFirst<StoredEvent>(
          [
            {
              kinds: [39701],
              authors: [pubkey],
              '#d': [normalizedUrl],
              limit: 1
            }
          ],
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
          [
            {
              kinds: [39701],
              authors: [pubkey],
              '#i': [`podcast:item:guid:${guid}`],
              limit: 1
            }
          ],
          { timeoutMs: 5_000 }
        );

        if (event) await cacheEvent(eventsDB, event);
        return event;
      }
    })
  ];

  const runtimeCoordinator = createAuftaktRuntimeCoordinator({
    entityHandleRuntime: entityHandleRuntimeForCoordinator,
    builtInPlugins
  });

  const publishHintRecorder: PublishHintRecorder = {
    recordRelayHint: async (hint) => {
      const db = await runtime.getEventsDB();
      await db.recordRelayHint?.(hint);
    }
  };

  const publishSignedEventFromCoordinator = async (params: EventParameters): Promise<void> => {
    const options = await buildPublishRelaySendOptions(runtime, {
      event: params,
      policy: relaySelectionPolicy
    });
    const pending = toRetryableSignedEvent(params);
    if (!pending) {
      return publishSignedEventWithOfflineFallback(
        publishTransportRuntime,
        pendingPublishQueueRuntime,
        params,
        publishHintRecorder,
        options
      );
    }

    await publishSignedEventThroughCoordinator({
      event: pending,
      options,
      openStore: () => runtime.getEventsDB(),
      publish: (event, handlers, sendOptions) =>
        publishTransportRuntimeWithAcks(publishTransportRuntime, event, handlers, sendOptions),
      addPendingPublish: (event) => pendingPublishQueueRuntime.addPendingPublish(event)
    });
  };

  return {
    fetchBackwardEvents: (filters, options) =>
      fetchBackwardEventsFromReadRuntime<never>(
        coordinatorReadRuntime,
        filters,
        cloneFetchBackwardOptions(options),
        relaySelectionPolicy
      ),
    fetchBackwardFirst: async (filters, options) => {
      const events = await fetchBackwardEventsFromReadRuntime<never>(
        coordinatorReadRuntime,
        filters,
        cloneFetchBackwardOptions(options),
        relaySelectionPolicy
      );
      return selectNewestBackwardResult(events);
    },
    cachedFetchById: (eventId) =>
      cachedFetchByIdRuntime.cachedFetchById(coordinatorReadRuntime, eventId),
    invalidateFetchByIdCache: (eventId) =>
      cachedFetchByIdRuntime.invalidateFetchByIdCache(coordinatorReadRuntime, eventId),
    useCachedLatest: (pubkey, kind) =>
      cachedLatestRuntime.useCachedLatest(coordinatorReadRuntime, pubkey, kind),
    castSigned: (params, options) => publishTransportRuntime.castSigned(params, options),
    publishSignedEvent: publishSignedEventFromCoordinator,
    publishSignedEvents: async (params) => {
      if (params.length === 0) return;
      await Promise.allSettled(params.map((event) => publishSignedEventFromCoordinator(event)));
    },
    retryPendingPublishes: async () => {
      await retryQueuedSignedPublishes(publishTransportRuntime, pendingPublishQueueRuntime);
    },
    fetchLatestEvent: (pubkey, kind) =>
      fetchLatestEventFromReadRuntime(coordinatorReadRuntime, pubkey, kind, relaySelectionPolicy),
    setDefaultRelays: async (urls) => {
      await relayStatusRuntime.setDefaultRelays(urls);
      try {
        await relayCapabilityRegistry.prefetchDefaultRelays(urls);
        await applyRelayCapabilitiesToRuntime(runtime, relayCapabilityRegistry, urls);
      } catch {
        // NIP-11 capability は補助情報なので、保存域の失敗で relay list 適用を止めない。
      }
    },
    getRelayConnectionState: async (url) => {
      const [snapshot] = await snapshotRelayStatusesImpl(relayObservationRuntime, [url]);
      return snapshot ?? null;
    },
    observeRelayConnectionStates: (onPacket) =>
      observeRelayStatusesImpl(relayObservationRuntime, onPacket),
    getEvent: runtimeCoordinator.getEvent,
    getUser: runtimeCoordinator.getUser,
    getAddressable: runtimeCoordinator.getAddressable,
    getRelaySet: runtimeCoordinator.getRelaySet,
    getRelayHints: runtimeCoordinator.getRelayHints,
    readCommentEventsByTag: async (tagQuery) => {
      const db = await runtime.getEventsDB();
      return db.getByTagValue(tagQuery);
    },
    storeCommentEvent: async (event) => {
      const db = await runtime.getEventsDB();
      return (await db.put(event)) !== false;
    },
    deleteCommentEventsByIds: async (ids) => {
      if (ids.length === 0) return;
      const db = await runtime.getEventsDB();
      await db.deleteByIds([...ids]);
    },
    readStoredFollowGraph: async (pubkey, followKind) => {
      const db = await runtime.getEventsDB();
      const [currentUserFollowList, allFollowLists] = await Promise.all([
        db.getByPubkeyAndKind(pubkey, followKind),
        db.getAllByKind(followKind)
      ]);

      return {
        currentUserFollowList,
        allFollowLists
      };
    },
    countStoredEventsByKinds: async (kinds) => {
      const db = await runtime.getEventsDB();
      return Promise.all(
        kinds.map(async (kind) => {
          const events = await db.getAllByKind(kind);
          return {
            kind,
            count: events.length
          };
        })
      );
    },
    clearStoredEvents: async () => {
      const db = await runtime.getEventsDB();
      await db.clearAll();
    },
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
      runtimeCoordinator
        .getReadModel<EmojiCatalogReadModel>(EMOJI_CATALOG_READ_MODEL)
        .fetchCustomEmojiSources(pubkey),
    fetchCustomEmojiCategories: (pubkey) =>
      runtimeCoordinator
        .getReadModel<EmojiCatalogReadModel>(EMOJI_CATALOG_READ_MODEL)
        .fetchCustomEmojiCategories(pubkey),
    fetchCustomEmojiSourceDiagnostics: (pubkey) =>
      runtimeCoordinator
        .getReadModel<EmojiCatalogReadModel>(EMOJI_CATALOG_READ_MODEL)
        .fetchCustomEmojiSourceDiagnostics(pubkey),
    searchBookmarkDTagEvent: (pubkey, normalizedUrl) =>
      runtimeCoordinator
        .getFlow<ContentResolutionFlow>(CONTENT_RESOLUTION_FLOW)
        .searchBookmarkDTagEvent(pubkey, normalizedUrl),
    searchEpisodeBookmarkByGuid: (pubkey, guid) =>
      runtimeCoordinator
        .getFlow<ContentResolutionFlow>(CONTENT_RESOLUTION_FLOW)
        .searchEpisodeBookmarkByGuid(pubkey, guid),
    fetchNostrEventById: (eventId: string, relayHints: readonly string[]) =>
      fetchNostrEventByIdFromReadRuntime<never>(
        coordinatorReadRuntime,
        eventId,
        relayHints,
        relaySelectionPolicy
      ),
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
      runtimeCoordinator.getFlow<CommentsFlow>(COMMENTS_FLOW).loadCommentSubscriptionDeps(),
    fetchWot: (pubkey, callbacks, extractFollows, followKind = 3, batchSize = 100) =>
      fetchFollowGraph(sessionRuntime, pubkey, callbacks, extractFollows, followKind, batchSize),
    subscribeNotificationStreams: (options, handlers) =>
      runtimeCoordinator
        .getFlow<NotificationsFlow>(NOTIFICATIONS_FLOW)
        .subscribeNotificationStreams(options, handlers),
    snapshotRelayStatuses: (urls) => snapshotRelayStatusesImpl(relayObservationRuntime, urls),
    observeRelayStatuses: (onPacket) => observeRelayStatusesImpl(relayObservationRuntime, onPacket),
    snapshotRelayCapabilities: (urls) => relayCapabilityRegistry.snapshot(urls),
    observeRelayCapabilities: (onPacket) => relayCapabilityRegistry.observe(onPacket),
    snapshotRelayMetrics: () => snapshotRelayMetricsFromStore(runtime),
    fetchRelayListEvents: (pubkey, relayListKind, followKind) =>
      runtimeCoordinator
        .getFlow<RelayListFlow>(RELAY_LIST_FLOW)
        .fetchRelayListEvents(pubkey, relayListKind, followKind),
    fetchRelayListSources: (pubkey, relayListKind, followKind) =>
      fetchRelayListSources(queryRuntime, relayStatusRuntime, pubkey, relayListKind, followKind),
    registerPlugin: runtimeCoordinator.registerPlugin
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
  plugin: AuftaktRuntimePlugin
): Promise<AuftaktRuntimePluginRegistration> {
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

export async function snapshotRelayCapabilities(
  coordinator: Pick<ResonoteCoordinator, 'snapshotRelayCapabilities'>,
  urls: readonly string[]
): Promise<RelayCapabilitySnapshot[]> {
  return coordinator.snapshotRelayCapabilities(urls);
}

export async function observeRelayCapabilities(
  coordinator: Pick<ResonoteCoordinator, 'observeRelayCapabilities'>,
  onPacket: (packet: RelayCapabilityPacket) => void
): Promise<{ unsubscribe(): void }> {
  return coordinator.observeRelayCapabilities(onPacket);
}

export async function snapshotRelayMetrics(
  coordinator: Pick<ResonoteCoordinator, 'snapshotRelayMetrics'>
): Promise<RelayMetricSnapshot[]> {
  return coordinator.snapshotRelayMetrics();
}

export async function fetchBackwardEvents<TEvent>(
  runtime: Pick<QueryRuntime, 'fetchBackwardEvents'> | CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent[]> {
  if (!hasFetchBackwardEvents(runtime) && isCoordinatorReadRuntime(runtime)) {
    return fetchBackwardEventsFromReadRuntime<TEvent>(
      runtime,
      filters,
      cloneFetchBackwardOptions(options)
    );
  }
  return runtime.fetchBackwardEvents<TEvent>(filters, cloneFetchBackwardOptions(options));
}

export async function fetchBackwardFirst<TEvent>(
  runtime: Pick<QueryRuntime, 'fetchBackwardFirst'> | CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent | null> {
  if (!hasFetchBackwardFirst(runtime) && isCoordinatorReadRuntime(runtime)) {
    const events = await fetchBackwardEventsFromReadRuntime<TEvent>(
      runtime,
      filters,
      cloneFetchBackwardOptions(options)
    );
    return selectNewestBackwardResult(events);
  }
  return runtime.fetchBackwardFirst<TEvent>(filters, cloneFetchBackwardOptions(options));
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

async function fetchRelayCandidateEventsFromRelay(
  runtime: ResonoteRuntime,
  filters: readonly RuntimeFilter[],
  relayUrl: string,
  timeoutMs: number | undefined,
  scope: string
): Promise<unknown[]> {
  if (filters.length === 0) return [];

  const relaySession = (await runtime.getRelaySession()) as NegentropySessionRuntime;
  const req = runtime.createBackwardReq({
    requestKey: createNegentropyRepairRequestKey({ filters, relayUrl, scope }),
    coalescingScope: REPAIR_REQUEST_COALESCING_SCOPE
  }) as {
    emit(input: unknown): void;
    over(): void;
  };

  const candidates: unknown[] = [];

  return new Promise<unknown[]>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => finish(), timeoutMs ?? 10_000);

    const sub = relaySession
      .use(req, {
        on: {
          relays: [relayUrl],
          defaultReadRelays: false
        }
      })
      .subscribe({
        next: (packet) => {
          candidates.push(packet.event);
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
      resolve(candidates);
    }
  });
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
  return runtime.fetchBackwardEvents<ProfileCommentEvent>([filter], {
    rejectOnError: true
  });
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
    return {
      cachedEvents,
      fetchedEvents,
      fallbackEvents: [],
      unresolvedPubkeys
    };
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

function isValidEmojiSetRef(value: string | undefined): value is string {
  if (!value) return false;
  const [kind, pubkey, dTag] = value.split(':');
  return kind === '30030' && Boolean(pubkey) && Boolean(dTag);
}

function parseEmojiSetRefs(tags: string[][]): {
  refs: string[];
  invalidRefs: string[];
} {
  const refs: string[] = [];
  const seen = new Set<string>();
  const invalidRefs: string[] = [];

  for (const tag of tags) {
    if (tag[0] !== 'a') continue;
    const value = tag[1];
    if (!isValidEmojiSetRef(value)) {
      invalidRefs.push(value ?? JSON.stringify(tag));
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    refs.push(value);
  }

  return { refs, invalidRefs };
}

function extractEmojiSetRefs(event: Pick<StoredEvent, 'tags'>): string[] {
  return parseEmojiSetRefs(event.tags).refs;
}

function findDTag(tags: string[][]): string {
  return tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
}

function isNip30EmojiTag(tag: string[]): tag is [string, string, string, ...string[]] {
  return tag[0] === 'emoji' && /^[A-Za-z0-9_]+$/.test(tag[1] ?? '') && Boolean(tag[2]);
}

function buildEmojiItems(tags: string[][]): EmojiCategory['emojis'] {
  const seen = new Set<string>();
  const emojis: EmojiCategory['emojis'] = [];
  for (const tag of tags) {
    if (!isNip30EmojiTag(tag)) continue;
    if (seen.has(tag[1])) continue;
    seen.add(tag[1]);
    emojis.push({
      id: tag[1],
      name: tag[1],
      skins: [{ src: tag[2] }]
    });
  }
  return emojis;
}

function titleForEmojiSet(event: Pick<StoredEvent, 'id' | 'tags'>): string {
  return (
    event.tags.find((tag) => tag[0] === 'title')?.[1] ||
    event.tags.find((tag) => tag[0] === 'name')?.[1] ||
    findDTag(event.tags) ||
    event.id.slice(0, 8)
  );
}

function buildCategoryFromEvent(event: Pick<StoredEvent, 'id' | 'tags'>): EmojiCategory | null {
  const setName = titleForEmojiSet(event);
  const emojis = buildEmojiItems(event.tags);

  if (emojis.length === 0) return null;
  return { id: `set-${event.id.slice(0, 8)}`, name: setName, emojis };
}

function buildInlineCategory(listEvent: Pick<StoredEvent, 'tags'>): EmojiCategory | null {
  const emojis = buildEmojiItems(listEvent.tags);

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
      : await runtime.fetchBackwardEvents<StoredEvent>(missingFilters, {
          timeoutMs: 5_000
        });

  await Promise.all(fetchedEvents.map((event) => cacheEvent(eventsDB, event)));

  return { listEvent, setEvents: [...cachedEvents, ...fetchedEvents] };
}

function canWriteCustomEmojiCache(options: {
  readonly generation?: number;
  readonly getGeneration?: () => number;
}): boolean {
  return options.getGeneration === undefined || options.generation === options.getGeneration();
}

export async function fetchCustomEmojiSourceDiagnostics(
  runtime: QueryRuntime,
  pubkey: string,
  options: {
    readonly generation?: number;
    readonly getGeneration?: () => number;
  } = {}
): Promise<CustomEmojiSourceDiagnosticsResult> {
  const eventsDB = await runtime.getEventsDB();
  const listEvent = await runtime.fetchBackwardFirst<StoredEvent>(
    [{ kinds: [10030], authors: [pubkey], limit: 1 }],
    { timeoutMs: 5_000 }
  );
  if (listEvent && canWriteCustomEmojiCache(options)) {
    await cacheEvent(eventsDB, listEvent);
  }

  if (!listEvent) {
    return {
      diagnostics: {
        listEvent: null,
        sets: [],
        missingRefs: [],
        invalidRefs: [],
        warnings: [],
        sourceMode: 'unknown'
      },
      categories: []
    };
  }

  const { refs, invalidRefs } = parseEmojiSetRefs(listEvent.tags);
  const cachedPairs = await Promise.all(
    refs.map(async (ref) => {
      const [, author, dTag] = ref.split(':');
      return {
        ref,
        event: await eventsDB.getByReplaceKey(author, 30030, dTag)
      };
    })
  );
  const cachedByRef = new Map(
    cachedPairs.filter((pair) => pair.event !== null).map((pair) => [pair.ref, pair.event!])
  );
  const missingBeforeRelay = refs.filter((ref) => !cachedByRef.has(ref));
  const relayFilters = missingBeforeRelay.map((ref) => {
    const [, author, dTag] = ref.split(':');
    return { kinds: [30030], authors: [author], '#d': [dTag] };
  });
  const fetchedEvents =
    relayFilters.length === 0
      ? []
      : await runtime.fetchBackwardEvents<StoredEvent>(relayFilters, {
          timeoutMs: 5_000
        });

  if (canWriteCustomEmojiCache(options)) {
    await Promise.all(fetchedEvents.map((event) => cacheEvent(eventsDB, event)));
  }

  const fetchedByRef = new Map(
    fetchedEvents.map((event) => [`30030:${event.pubkey}:${findDTag(event.tags)}`, event])
  );
  const categories: EmojiCategory[] = [];
  const inlineCategory = buildInlineCategory(listEvent);
  if (inlineCategory) categories.push(inlineCategory);

  const sets: CustomEmojiSetDiagnosticsSource[] = [];
  const missingRefs: string[] = [];
  for (const ref of refs) {
    const event = cachedByRef.get(ref) ?? fetchedByRef.get(ref) ?? null;
    if (!event) {
      missingRefs.push(ref);
      continue;
    }

    const category = buildCategoryFromEvent(event);
    if (category) categories.push(category);
    sets.push({
      ref,
      id: event.id,
      pubkey: event.pubkey,
      dTag: findDTag(event.tags),
      title: titleForEmojiSet(event),
      createdAtSec: event.created_at,
      emojiCount: buildEmojiItems(event.tags).length,
      resolvedVia: cachedByRef.has(ref) ? 'cache' : 'relay'
    });
  }

  return {
    diagnostics: {
      listEvent: {
        id: listEvent.id,
        createdAtSec: listEvent.created_at,
        inlineEmojiCount: buildEmojiItems(listEvent.tags).length,
        referencedSetRefCount: refs.length
      },
      sets,
      missingRefs,
      invalidRefs,
      warnings: [],
      sourceMode: sets.some((set) => set.resolvedVia === 'relay') ? 'relay-checked' : 'cache-only'
    },
    categories
  };
}

export async function fetchCustomEmojiCategories(
  runtime: QueryRuntime,
  pubkey: string
): Promise<EmojiCategory[]> {
  return (await fetchCustomEmojiSourceDiagnostics(runtime, pubkey)).categories;
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
    [
      {
        kinds: [39701],
        authors: [pubkey],
        '#i': [`podcast:item:guid:${guid}`],
        limit: 1
      }
    ],
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
    createMaterializedSubscriptionRuntime(
      createRegistryBackedSessionRuntime(runtime as SessionRuntime<StoredEvent>)
    )
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
    createMaterializedSubscriptionRuntime(
      createRegistryBackedSessionRuntime(runtime as SessionRuntime<StoredEvent>)
    ),
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
  return {
    relayListEvents: relayListEvents ?? [],
    followListEvents: followListEvents ?? []
  };
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

async function buildRelaySetCandidates(
  runtime: ResonoteRuntime,
  subject: RelaySetSubject
): Promise<RelaySelectionCandidate[]> {
  const candidates: RelaySelectionCandidate[] = [];
  const defaults = runtime.getDefaultRelays ? await runtime.getDefaultRelays() : [];
  candidates.push(
    ...[...defaults].map((relay) => ({
      relay,
      source: 'default' as const,
      role: 'read' as const
    }))
  );

  const db = await runtime.getEventsDB();
  if (subject.type === 'event') {
    candidates.push(
      ...(subject.relayHints ?? []).map((relay) => ({
        relay,
        source: 'temporary-hint' as const,
        role: 'temporary' as const
      }))
    );
    const hints = (await db.getRelayHints?.(subject.id)) ?? [];
    candidates.push(
      ...hints.map((hint) => ({
        relay: hint.relayUrl,
        source: 'durable-hint' as const,
        role: 'read' as const
      }))
    );
  } else if (subject.type === 'user') {
    const relayList = await db.getByPubkeyAndKind(subject.pubkey, RELAY_LIST_KIND);
    const entries = relayList ? parseNip65RelayListTags(relayList.tags) : [];
    candidates.push(
      ...entries.flatMap((entry) =>
        entry.write
          ? [
              {
                relay: entry.relay,
                source: 'nip65-write' as const,
                role: 'read' as const
              }
            ]
          : []
      )
    );
  } else {
    const relayList = await db.getByPubkeyAndKind(subject.pubkey, RELAY_LIST_KIND);
    const entries = relayList ? parseNip65RelayListTags(relayList.tags) : [];
    candidates.push(
      ...entries.flatMap((entry) =>
        entry.write
          ? [
              {
                relay: entry.relay,
                source: 'nip65-write' as const,
                role: 'read' as const
              }
            ]
          : []
      )
    );
  }

  return candidates;
}
