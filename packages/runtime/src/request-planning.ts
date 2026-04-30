import {
  buildLogicalRequestDescriptor,
  createRuntimeRequestKey,
  type FetchBackwardOptions,
  type Filter,
  type RequestKey,
  type RuntimeRequestDescriptorOptions,
  type SessionObservation,
  type StoredEvent
} from '@auftakt/core';

import type {
  RelayObservationPacket,
  RelayObservationRuntime,
  RelayObservationSnapshot
} from './relay-observation.js';
import {
  normalizeRelayObservationPacket,
  normalizeRelayObservationSnapshot
} from './relay-observation.js';

export interface TimelineWindow<TEvent extends StoredEvent> {
  readonly items: readonly TEvent[];
  readonly nextCursor: number | null;
}

export function sortTimelineByCreatedAtDesc<TEvent extends StoredEvent>(
  events: readonly TEvent[]
): TEvent[] {
  return [...events].sort((left, right) => {
    if (right.created_at !== left.created_at) return right.created_at - left.created_at;
    return right.id.localeCompare(left.id);
  });
}

export function mergeTimelineEvents<TEvent extends StoredEvent>(
  current: readonly TEvent[],
  incoming: readonly TEvent[]
): TEvent[] {
  const merged = new Map<string, TEvent>();
  for (const event of current) merged.set(event.id, event);
  for (const event of incoming) merged.set(event.id, event);
  return sortTimelineByCreatedAtDesc([...merged.values()]);
}

export function paginateTimelineWindow<TEvent extends StoredEvent>(
  events: readonly TEvent[],
  limit: number
): TimelineWindow<TEvent> {
  const items = sortTimelineByCreatedAtDesc(events).slice(0, limit);
  const nextCursor = items.length === limit ? (items.at(-1)?.created_at ?? null) : null;
  return { items, nextCursor };
}

export interface LatestEventSnapshot {
  readonly tags: string[][];
  readonly content: string;
  readonly created_at: number;
}

export interface EventStoreLike<TEvent extends StoredEvent = StoredEvent> {
  getByPubkeyAndKind(pubkey: string, kind: number): Promise<TEvent | null>;
  getManyByPubkeysAndKind(pubkeys: string[], kind: number): Promise<TEvent[]>;
  getByReplaceKey(pubkey: string, kind: number, dTag: string): Promise<TEvent | null>;
  getByTagValue(tagQuery: string, kind?: number): Promise<TEvent[]>;
  put(event: TEvent): Promise<unknown>;
}

export interface QueryRuntime<TEvent extends StoredEvent = StoredEvent> {
  fetchBackwardEvents<TOutput = TEvent>(
    filters: readonly Filter[],
    options?: FetchBackwardOptions
  ): Promise<TOutput[]>;
  fetchBackwardFirst<TOutput = TEvent>(
    filters: readonly Filter[],
    options?: FetchBackwardOptions
  ): Promise<TOutput | null>;
  fetchLatestEvent(pubkey: string, kind: number): Promise<LatestEventSnapshot | null>;
  getEventsDB(): Promise<EventStoreLike<TEvent>>;
}

export interface RelayRequestLike {
  readonly requestKey?: RequestKey;
  readonly coalescingScope?: string;
  emit(input: unknown): void;
  over(): void;
}

export interface SubscriptionLike {
  unsubscribe(): void;
}

export interface ObservableLike<TPacket = unknown> {
  subscribe(observer: {
    next?: (packet: TPacket) => void;
    complete?: () => void;
    error?: (error: unknown) => void;
  }): SubscriptionLike;
  pipe(...ops: unknown[]): ObservableLike<TPacket>;
}

export interface RelaySessionLike {
  use(
    req: RelayRequestLike,
    options?: { on?: { relays?: readonly string[]; defaultReadRelays?: boolean } }
  ): ObservableLike<unknown>;
}

export interface SessionRuntime<TEvent extends StoredEvent = StoredEvent>
  extends QueryRuntime<TEvent>, RelayObservationRuntime {
  getRelaySession(): Promise<RelaySessionLike>;
  createBackwardReq(options?: {
    requestKey?: RequestKey;
    coalescingScope?: string;
  }): RelayRequestLike;
  createForwardReq(options?: {
    requestKey?: RequestKey;
    coalescingScope?: string;
  }): RelayRequestLike;
  uniq(): unknown;
  merge(...streams: Array<ObservableLike<unknown>>): ObservableLike<unknown>;
}

export interface RequestExecutionPlanOptions extends RuntimeRequestDescriptorOptions {
  readonly requestKey?: RequestKey;
  readonly coalescingScope?: string;
}

export interface RequestOptimizerCapabilities {
  readonly maxFiltersPerShard?: number | null;
  readonly maxSubscriptions?: number | null;
}

export interface OptimizedRequestShard {
  readonly shardIndex: number;
  readonly shardKey: string;
  readonly filters: readonly Filter[];
}

export interface OptimizedLogicalRequestPlan {
  readonly descriptor: ReturnType<typeof buildLogicalRequestDescriptor>;
  readonly requestKey: RequestKey;
  readonly logicalKey: string;
  readonly shards: readonly OptimizedRequestShard[];
  readonly capabilities: RequestOptimizerCapabilities;
}

const REQUEST_KEY_VERSION = 'v1';
const DEFAULT_REQUEST_COALESCING_SCOPE = 'timeline:app';

export const REPAIR_REQUEST_COALESCING_SCOPE = 'timeline:repair';

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return [...(value as readonly string[])].sort((left, right) => left.localeCompare(right));
    }
    if (value.every((item) => typeof item === 'number')) {
      return [...(value as readonly number[])].sort((left, right) => left - right);
    }
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    const input = value as Record<string, unknown>;
    for (const key of Object.keys(input).sort((left, right) => left.localeCompare(right))) {
      normalized[key] = normalizeValue(input[key]);
    }
    return normalized;
  }
  return value;
}

function toStableJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function hashRequestDescriptor(payload: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizeTransportFilters(filters: readonly Filter[]): Filter[] {
  return filters.map((filter) => normalizeValue(filter) as Filter);
}

function stableSortFilters(filters: readonly Filter[]): Filter[] {
  return [...filters].sort((left, right) => toStableJson(left).localeCompare(toStableJson(right)));
}

function resolveMaxFiltersPerShard(
  capabilities: RequestOptimizerCapabilities,
  filterCount: number
): number {
  const candidate = capabilities.maxFiltersPerShard;
  if (candidate == null || !Number.isFinite(candidate) || candidate < 1) {
    return Math.max(filterCount, 1);
  }
  return Math.max(1, Math.floor(candidate));
}

export function buildRequestExecutionPlan(
  options: RequestExecutionPlanOptions,
  capabilities: RequestOptimizerCapabilities = {}
): OptimizedLogicalRequestPlan {
  const descriptor = buildLogicalRequestDescriptor(options);
  const requestKey = options.requestKey ?? createRuntimeRequestKey(options);
  const normalizedFilters = stableSortFilters(normalizeTransportFilters(options.filters));
  const coalescingScope = options.coalescingScope ?? DEFAULT_REQUEST_COALESCING_SCOPE;
  const logicalKey = `lq:${REQUEST_KEY_VERSION}:${hashRequestDescriptor(
    toStableJson({
      coalescingScope,
      mode: options.mode,
      filters: normalizedFilters,
      overlay: descriptor.overlay
    })
  )}`;
  const shardSize = resolveMaxFiltersPerShard(capabilities, normalizedFilters.length);
  const shards: OptimizedRequestShard[] = [];

  for (let index = 0; index < normalizedFilters.length; index += shardSize) {
    const shardIndex = shards.length;
    const shardFilters = normalizedFilters.slice(index, index + shardSize);
    shards.push({
      shardIndex,
      shardKey: `shard:${REQUEST_KEY_VERSION}:${hashRequestDescriptor(
        toStableJson({ logicalKey, shardIndex, filters: shardFilters })
      )}`,
      filters: shardFilters
    });
  }

  return {
    descriptor,
    requestKey,
    logicalKey,
    shards,
    capabilities: {
      maxFiltersPerShard: capabilities.maxFiltersPerShard ?? null,
      maxSubscriptions: capabilities.maxSubscriptions ?? null
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface SubscriptionHandle {
  unsubscribe(): void;
}

export interface EventSubscriptionRefs {
  relaySession: {
    use(req: unknown): {
      pipe(...ops: unknown[]): { subscribe(observer: unknown): SubscriptionHandle };
    };
  };
  relaySessionMod: {
    createBackwardReq(options?: {
      requestKey?: RequestKey;
      coalescingScope?: string;
    }): RelayRequestLike;
    createForwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): {
      emit(input: unknown): void;
      over?: () => void;
    };
    uniq(): unknown;
  };
  rxjsMerge: (...args: unknown[]) => { subscribe(observer: unknown): SubscriptionHandle };
}

export async function cacheEvent<TEvent extends StoredEvent>(
  eventsDB: EventStoreLike<TEvent>,
  event: TEvent
): Promise<void> {
  try {
    await eventsDB.put(event);
  } catch {
    // Best-effort cache writes for brownfield interop.
  }
}

export async function fetchReplaceableEventsByAuthorsAndKind<TEvent extends StoredEvent>(
  runtime: QueryRuntime<TEvent>,
  pubkeys: readonly string[],
  kind: number,
  batchSize = 50
): Promise<{
  cachedEvents: TEvent[];
  fetchedEvents: TEvent[];
  unresolvedPubkeys: string[];
}> {
  const eventsDB = await runtime.getEventsDB();
  const requested = [...new Set(pubkeys)];
  const cachedEvents = await eventsDB.getManyByPubkeysAndKind(requested, kind);
  const cachedPubkeys = new Set(cachedEvents.map((event) => event.pubkey));
  const missing = requested.filter((pubkey) => !cachedPubkeys.has(pubkey));
  const fetchedEvents: TEvent[] = [];

  for (let index = 0; index < missing.length; index += batchSize) {
    const chunk = missing.slice(index, index + batchSize);
    const events = await runtime.fetchBackwardEvents<TEvent>([{ kinds: [kind], authors: chunk }]);
    if (events.length > 0) {
      fetchedEvents.push(...events);
      continue;
    }

    await sleep(100);
    const retriedEvents = await runtime.fetchBackwardEvents<TEvent>([
      { kinds: [kind], authors: chunk }
    ]);
    fetchedEvents.push(...retriedEvents);
  }

  await Promise.all(fetchedEvents.map((event) => cacheEvent(eventsDB, event)));

  const resolvedPubkeys = new Set([...cachedEvents, ...fetchedEvents].map((event) => event.pubkey));

  return {
    cachedEvents,
    fetchedEvents,
    unresolvedPubkeys: requested.filter((pubkey) => !resolvedPubkeys.has(pubkey))
  };
}

export async function fetchEventById<TEvent>(
  runtime: QueryRuntime,
  eventId: string,
  relayHints: readonly string[]
): Promise<TEvent | null> {
  return runtime.fetchBackwardFirst<TEvent>(
    [{ ids: [eventId] }],
    relayHints.length > 0
      ? {
          overlay: {
            relays: relayHints,
            includeDefaultReadRelays: true
          },
          timeoutMs: 10_000
        }
      : { timeoutMs: 10_000 }
  );
}

export async function loadEventSubscriptionDeps<TEvent extends StoredEvent>(
  runtime: SessionRuntime<TEvent>
): Promise<EventSubscriptionRefs> {
  const relaySession = await runtime.getRelaySession();
  return {
    relaySession,
    relaySessionMod: {
      createBackwardReq: (options) => runtime.createBackwardReq(options),
      createForwardReq: (options) => runtime.createForwardReq(options),
      uniq: () => runtime.uniq()
    },
    rxjsMerge: (...args) => runtime.merge(...(args as Array<ObservableLike<unknown>>))
  };
}

function readPacketEventId(packet: unknown): string | null {
  if (typeof packet !== 'object' || packet === null || !('event' in packet)) return null;
  const event = (packet as { event?: unknown }).event;
  if (typeof event !== 'object' || event === null || !('id' in event)) return null;
  const id = (event as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

function createVisiblePacketForwarder<TEvent extends StoredEvent>(
  onPacket: (event: TEvent, relayHint?: string) => void
): (packet: unknown) => void {
  const deliveredIds = new Set<string>();
  return (packet: unknown) => {
    const eventId = readPacketEventId(packet);
    if (eventId) {
      if (deliveredIds.has(eventId)) return;
      deliveredIds.add(eventId);
    }
    const { event, from } = packet as { event: TEvent; from?: string };
    onPacket(event, from);
  };
}

function createObjectPacketForwarder<TEvent extends StoredEvent>(
  onPacket: (packet: { event: TEvent; from?: string }) => void
): (packet: unknown) => void {
  const deliveredIds = new Set<string>();
  return (packet: unknown) => {
    const eventId = readPacketEventId(packet);
    if (eventId) {
      if (deliveredIds.has(eventId)) return;
      deliveredIds.add(eventId);
    }
    onPacket(packet as { event: TEvent; from?: string });
  };
}

export function startBackfillAndLiveSubscription<TEvent extends StoredEvent>(
  refs: EventSubscriptionRefs,
  filters: Array<Record<string, unknown>>,
  maxCreatedAt: number | null,
  onPacket: (event: TEvent, relayHint?: string) => void,
  onBackwardComplete: () => void,
  onError?: (error: unknown) => void
): SubscriptionHandle[] {
  const { createBackwardReq, createForwardReq, uniq } = refs.relaySessionMod;
  const backwardFilters = maxCreatedAt
    ? filters.map((filter) => ({ ...filter, since: maxCreatedAt + 1 }))
    : filters;
  const backwardRequestKey = createRuntimeRequestKey({
    mode: 'backward',
    filters: backwardFilters,
    scope: 'timeline:startBackfillAndLiveSubscription:backward'
  });
  const forwardRequestKey = createRuntimeRequestKey({
    mode: 'forward',
    filters,
    scope: 'timeline:startBackfillAndLiveSubscription:forward'
  });

  const backward = createBackwardReq({ requestKey: backwardRequestKey });
  const forward = createForwardReq({ requestKey: forwardRequestKey });
  const forwardVisiblePacket = createVisiblePacketForwarder(onPacket);

  const backwardSub = refs.relaySession
    .use(backward)
    .pipe(uniq())
    .subscribe({
      next: forwardVisiblePacket,
      complete: onBackwardComplete,
      error: (error: unknown) => {
        onError?.(error);
        onBackwardComplete();
      }
    });

  const forwardSub = refs.relaySession
    .use(forward)
    .pipe(uniq())
    .subscribe({
      next: forwardVisiblePacket,
      error: (error: unknown) => onError?.(error)
    });

  backward.emit(backwardFilters);
  backward.over();
  forward.emit(filters);

  return [backwardSub, forwardSub];
}

export function startMergedLiveSubscription<TEvent extends StoredEvent>(
  refs: EventSubscriptionRefs,
  filters: Array<Record<string, unknown>>,
  onPacket: (event: TEvent, relayHint?: string) => void,
  onError?: (error: unknown) => void
): SubscriptionHandle {
  const { createBackwardReq, createForwardReq, uniq } = refs.relaySessionMod;
  const backwardRequestKey = createRuntimeRequestKey({
    mode: 'backward',
    filters,
    scope: 'timeline:startMergedLiveSubscription:backward'
  });
  const forwardRequestKey = createRuntimeRequestKey({
    mode: 'forward',
    filters,
    scope: 'timeline:startMergedLiveSubscription:forward'
  });
  const backward = createBackwardReq({ requestKey: backwardRequestKey });
  const forward = createForwardReq({ requestKey: forwardRequestKey });
  const forwardVisiblePacket = createVisiblePacketForwarder(onPacket);

  const sub = refs
    .rxjsMerge(
      refs.relaySession.use(backward).pipe(uniq()),
      refs.relaySession.use(forward).pipe(uniq())
    )
    .subscribe({
      next: forwardVisiblePacket,
      error: (error: unknown) => onError?.(error)
    });

  backward.emit(filters);
  backward.over();
  forward.emit(filters);

  return sub;
}

export function startDeletionReconcile<TEvent extends StoredEvent>(
  refs: EventSubscriptionRefs,
  cachedIds: string[],
  deletionKind: number,
  onDeletionEvent: (event: TEvent) => void,
  onComplete: () => void
): { sub: SubscriptionHandle; timeout: ReturnType<typeof setTimeout> } {
  const { createBackwardReq, uniq } = refs.relaySessionMod;
  const requestKey = createRuntimeRequestKey({
    mode: 'backward',
    filters: [{ kinds: [deletionKind], '#e': [...cachedIds] }],
    scope: 'timeline:startDeletionReconcile'
  });
  const reconcileBackward = createBackwardReq({ requestKey });
  const chunkSize = 50;

  let completed = false;
  function finish() {
    if (completed) return;
    completed = true;
    clearTimeout(timeout);
    sub.unsubscribe();
    onComplete();
  }

  const sub = refs.relaySession
    .use(reconcileBackward)
    .pipe(uniq())
    .subscribe({
      next: (packet: unknown) => onDeletionEvent((packet as { event: TEvent }).event),
      complete: () => finish(),
      error: () => finish()
    });

  for (let index = 0; index < cachedIds.length; index += chunkSize) {
    reconcileBackward.emit({
      kinds: [deletionKind],
      '#e': cachedIds.slice(index, index + chunkSize)
    });
  }
  reconcileBackward.over();

  const timeout = setTimeout(() => finish(), 5_000);
  return { sub, timeout };
}

export async function fetchFollowGraph<TEvent extends StoredEvent>(
  runtime: SessionRuntime<TEvent>,
  pubkey: string,
  callbacks: {
    onDirectFollows(follows: Set<string>): void;
    onWotProgress(count: number): void;
    isCancelled(): boolean;
  },
  extractFollows: (event: Pick<TEvent, 'tags'>) => Set<string>,
  followKind = 3,
  batchSize = 100
): Promise<{ directFollows: Set<string>; wot: Set<string> }> {
  const relaySession = await runtime.getRelaySession();
  const eventsDB = await runtime.getEventsDB();

  const directFollows = await new Promise<Set<string>>((resolve) => {
    const requestKey = createRuntimeRequestKey({
      mode: 'backward',
      filters: [{ kinds: [followKind], authors: [pubkey], limit: 1 }],
      scope: 'timeline:fetchFollowGraph:direct'
    });
    const req = runtime.createBackwardReq({ requestKey });
    let latestEvent: TEvent | null = null;

    const sub = relaySession.use(req).subscribe({
      next: (packet) => {
        const event = (packet as { event: TEvent }).event;
        void cacheEvent(eventsDB, event);
        if (!latestEvent || event.created_at > latestEvent.created_at) {
          latestEvent = event;
        }
      },
      complete: () => {
        sub.unsubscribe();
        resolve(latestEvent ? extractFollows(latestEvent) : new Set());
      },
      error: () => {
        sub.unsubscribe();
        resolve(latestEvent ? extractFollows(latestEvent) : new Set());
      }
    });

    req.emit({ kinds: [followKind], authors: [pubkey], limit: 1 });
    req.over();
  });

  if (callbacks.isCancelled()) return { directFollows, wot: directFollows };

  callbacks.onDirectFollows(directFollows);

  if (directFollows.size === 0) return { directFollows, wot: new Set([pubkey]) };

  const allWot = new Set([...directFollows, pubkey]);
  const followArray = [...directFollows];

  await new Promise<void>((resolve) => {
    const requestKey = createRuntimeRequestKey({
      mode: 'backward',
      filters: [{ kinds: [followKind], authors: followArray }],
      scope: 'timeline:fetchFollowGraph:wot'
    });
    const req = runtime.createBackwardReq({ requestKey });
    const sub = relaySession.use(req).subscribe({
      next: (packet) => {
        if (callbacks.isCancelled()) return;
        const event = (packet as { event: TEvent }).event;
        void cacheEvent(eventsDB, event);
        for (const tag of event.tags) {
          if (tag[0] === 'p' && tag[1]) allWot.add(tag[1]);
        }
        callbacks.onWotProgress(allWot.size);
      },
      complete: () => {
        sub.unsubscribe();
        resolve();
      },
      error: () => {
        sub.unsubscribe();
        resolve();
      }
    });

    for (let index = 0; index < followArray.length; index += batchSize) {
      req.emit({ kinds: [followKind], authors: followArray.slice(index, index + batchSize) });
    }
    req.over();
  });

  return { directFollows, wot: new Set(allWot) };
}

export async function subscribeDualFilterStreams<TEvent extends StoredEvent>(
  runtime: SessionRuntime<TEvent>,
  options: {
    primaryFilter: Record<string, unknown>;
    secondaryFilters?: Array<Record<string, unknown>>;
  },
  handlers: {
    onPrimaryPacket(packet: { event: TEvent; from?: string }): void;
    onSecondaryPacket(packet: { event: TEvent; from?: string }): void;
    onError(error: unknown): void;
  }
): Promise<SubscriptionLike[]> {
  const relaySession = await runtime.getRelaySession();
  const subscriptions: SubscriptionLike[] = [];
  const primaryBackward = runtime.createBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      filters: [options.primaryFilter],
      scope: 'timeline:subscribeDualFilterStreams:primary:backward'
    })
  });
  const primaryForward = runtime.createForwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'forward',
      filters: [options.primaryFilter],
      scope: 'timeline:subscribeDualFilterStreams:primary:forward'
    })
  });
  const forwardPrimaryPacket = createObjectPacketForwarder(handlers.onPrimaryPacket);

  subscriptions.push(
    runtime
      .merge(
        relaySession.use(primaryBackward).pipe(runtime.uniq()),
        relaySession.use(primaryForward).pipe(runtime.uniq())
      )
      .subscribe({
        next: forwardPrimaryPacket,
        error: (error) => handlers.onError(error)
      })
  );

  primaryBackward.emit(options.primaryFilter);
  primaryBackward.over();
  primaryForward.emit(options.primaryFilter);

  if (!options.secondaryFilters || options.secondaryFilters.length === 0) return subscriptions;

  const secondaryBackward = runtime.createBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      filters: options.secondaryFilters,
      scope: 'timeline:subscribeDualFilterStreams:secondary:backward'
    })
  });
  const secondaryForward = runtime.createForwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'forward',
      filters: options.secondaryFilters,
      scope: 'timeline:subscribeDualFilterStreams:secondary:forward'
    })
  });
  const forwardSecondaryPacket = createObjectPacketForwarder(handlers.onSecondaryPacket);

  subscriptions.push(
    runtime
      .merge(
        relaySession.use(secondaryBackward).pipe(runtime.uniq()),
        relaySession.use(secondaryForward).pipe(runtime.uniq())
      )
      .subscribe({
        next: forwardSecondaryPacket,
        error: (error) => handlers.onError(error)
      })
  );

  for (const filter of options.secondaryFilters) secondaryBackward.emit(filter);
  secondaryBackward.over();
  for (const filter of options.secondaryFilters) secondaryForward.emit(filter);

  return subscriptions;
}

export async function snapshotRelayStatuses(
  runtime: RelayObservationRuntime,
  urls: readonly string[]
): Promise<RelayObservationSnapshot[]> {
  const fallbackAggregate: SessionObservation = {
    state: 'booting',
    reason: 'boot',
    relays: []
  };

  return Promise.all(
    urls.map(async (url) => {
      const status = await runtime.getRelayConnectionState(url);
      return (
        status ??
        normalizeRelayObservationSnapshot({
          url,
          connection: 'idle',
          reason: 'boot',
          aggregate: fallbackAggregate
        })
      );
    })
  );
}

export async function observeRelayStatuses(
  runtime: RelayObservationRuntime,
  onPacket: (packet: RelayObservationPacket) => void
): Promise<SubscriptionLike> {
  return runtime.observeRelayConnectionStates((packet) =>
    onPacket(
      normalizeRelayObservationPacket({
        from: packet.from,
        state: packet.state,
        reason: packet.reason,
        aggregate: packet.aggregate
      })
    )
  );
}

export async function fetchLatestEventsForKinds<TEvent extends StoredEvent>(
  runtime: QueryRuntime<TEvent>,
  pubkey: string,
  kinds: readonly number[]
): Promise<TEvent[][]> {
  return Promise.all(
    kinds.map(async (kind) => {
      const first = await runtime.fetchBackwardEvents<TEvent>([
        { kinds: [kind], authors: [pubkey], limit: 1 }
      ]);
      if (first.length > 0) {
        return first;
      }

      await sleep(100);
      return runtime.fetchBackwardEvents<TEvent>([{ kinds: [kind], authors: [pubkey], limit: 1 }]);
    })
  );
}
