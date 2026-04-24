import {
  normalizeRelayObservationPacket,
  normalizeRelayObservationSnapshot
} from './relay-observation.js';
import {
  createRuntimeRequestKey,
  type FetchBackwardOptions,
  type Filter
} from './relay-request.js';
import type {
  RelayObservationPacket,
  RelayObservationRuntime,
  RelayObservationSnapshot,
  RequestKey,
  SessionObservation,
  StoredEvent
} from './vocabulary.js';

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
  getRxNostr(): Promise<RelaySessionLike>;
  createRxBackwardReq(options?: {
    requestKey?: RequestKey;
    coalescingScope?: string;
  }): RelayRequestLike;
  createRxForwardReq(options?: {
    requestKey?: RequestKey;
    coalescingScope?: string;
  }): RelayRequestLike;
  uniq(): unknown;
  merge(...streams: Array<ObservableLike<unknown>>): ObservableLike<unknown>;
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
  rxNostr: {
    use(req: unknown): {
      pipe(...ops: unknown[]): { subscribe(observer: unknown): SubscriptionHandle };
    };
  };
  rxNostrMod: {
    createRxBackwardReq(options?: {
      requestKey?: RequestKey;
      coalescingScope?: string;
    }): RelayRequestLike;
    createRxForwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): {
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
    // Best-effort cache writes for brownfield compatibility.
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

    // One-shot replaceable reads can miss very early during relay bootstrap in E2E.
    // Retry once after a short delay to absorb startup timing without broad behavior changes.
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
  const rxNostr = await runtime.getRxNostr();
  return {
    rxNostr,
    rxNostrMod: {
      createRxBackwardReq: (options) => runtime.createRxBackwardReq(options),
      createRxForwardReq: (options) => runtime.createRxForwardReq(options),
      uniq: () => runtime.uniq()
    },
    rxjsMerge: (...args) => runtime.merge(...(args as Array<ObservableLike<unknown>>))
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
  const { createRxBackwardReq, createRxForwardReq, uniq } = refs.rxNostrMod;
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

  const backward = createRxBackwardReq({ requestKey: backwardRequestKey });
  const forward = createRxForwardReq({ requestKey: forwardRequestKey });

  const backwardSub = refs.rxNostr
    .use(backward)
    .pipe(uniq())
    .subscribe({
      next: (packet: unknown) => {
        const { event, from } = packet as { event: TEvent; from?: string };
        onPacket(event, from);
      },
      complete: onBackwardComplete,
      error: (error: unknown) => {
        onError?.(error);
        onBackwardComplete();
      }
    });

  const forwardSub = refs.rxNostr
    .use(forward)
    .pipe(uniq())
    .subscribe({
      next: (packet: unknown) => {
        const { event, from } = packet as { event: TEvent; from?: string };
        onPacket(event, from);
      },
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
  const { createRxBackwardReq, createRxForwardReq, uniq } = refs.rxNostrMod;
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
  const backward = createRxBackwardReq({ requestKey: backwardRequestKey });
  const forward = createRxForwardReq({ requestKey: forwardRequestKey });

  const sub = refs
    .rxjsMerge(refs.rxNostr.use(backward).pipe(uniq()), refs.rxNostr.use(forward).pipe(uniq()))
    .subscribe({
      next: (packet: unknown) => {
        const { event, from } = packet as { event: TEvent; from?: string };
        onPacket(event, from);
      },
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
  const { createRxBackwardReq, uniq } = refs.rxNostrMod;
  const requestKey = createRuntimeRequestKey({
    mode: 'backward',
    filters: [{ kinds: [deletionKind], '#e': [...cachedIds] }],
    scope: 'timeline:startDeletionReconcile'
  });
  const reconcileBackward = createRxBackwardReq({ requestKey });
  const chunkSize = 50;

  let completed = false;
  function finish() {
    if (completed) return;
    completed = true;
    clearTimeout(timeout);
    sub.unsubscribe();
    onComplete();
  }

  const sub = refs.rxNostr
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
  const rxNostr = await runtime.getRxNostr();
  const eventsDB = await runtime.getEventsDB();

  const directFollows = await new Promise<Set<string>>((resolve) => {
    const requestKey = createRuntimeRequestKey({
      mode: 'backward',
      filters: [{ kinds: [followKind], authors: [pubkey], limit: 1 }],
      scope: 'timeline:fetchFollowGraph:direct'
    });
    const req = runtime.createRxBackwardReq({ requestKey });
    let latestEvent: TEvent | null = null;

    const sub = rxNostr.use(req).subscribe({
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
    const req = runtime.createRxBackwardReq({ requestKey });
    const sub = rxNostr.use(req).subscribe({
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
  const rxNostr = await runtime.getRxNostr();
  const subscriptions: SubscriptionLike[] = [];
  const primaryBackward = runtime.createRxBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      filters: [options.primaryFilter],
      scope: 'timeline:subscribeDualFilterStreams:primary:backward'
    })
  });
  const primaryForward = runtime.createRxForwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'forward',
      filters: [options.primaryFilter],
      scope: 'timeline:subscribeDualFilterStreams:primary:forward'
    })
  });

  subscriptions.push(
    runtime
      .merge(
        rxNostr.use(primaryBackward).pipe(runtime.uniq()),
        rxNostr.use(primaryForward).pipe(runtime.uniq())
      )
      .subscribe({
        next: (packet) => handlers.onPrimaryPacket(packet as { event: TEvent; from?: string }),
        error: (error) => handlers.onError(error)
      })
  );

  primaryBackward.emit(options.primaryFilter);
  primaryBackward.over();
  primaryForward.emit(options.primaryFilter);

  if (!options.secondaryFilters || options.secondaryFilters.length === 0) return subscriptions;

  const secondaryBackward = runtime.createRxBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      filters: options.secondaryFilters,
      scope: 'timeline:subscribeDualFilterStreams:secondary:backward'
    })
  });
  const secondaryForward = runtime.createRxForwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'forward',
      filters: options.secondaryFilters,
      scope: 'timeline:subscribeDualFilterStreams:secondary:forward'
    })
  });

  subscriptions.push(
    runtime
      .merge(
        rxNostr.use(secondaryBackward).pipe(runtime.uniq()),
        rxNostr.use(secondaryForward).pipe(runtime.uniq())
      )
      .subscribe({
        next: (packet) => handlers.onSecondaryPacket(packet as { event: TEvent; from?: string }),
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
