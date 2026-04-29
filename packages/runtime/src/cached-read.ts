import type { ReadSettlement, ReconcileEmission, StoredEvent } from '@auftakt/core';
import { createRuntimeRequestKey, reduceReadSettlement, validateRelayEvent } from '@auftakt/core';

export interface CoordinatorReadRuntime {
  getEventsDB(): Promise<{
    getById(id: string): Promise<StoredEvent | null>;
    getByPubkeyAndKind(pubkey: string, kind: number): Promise<StoredEvent | null>;
    put(event: StoredEvent): Promise<unknown>;
    putQuarantine?(record: unknown): Promise<void>;
    putWithReconcile?(event: StoredEvent): Promise<{
      stored: boolean;
      emissions?: ReconcileEmission[];
    }>;
  }>;
  getRxNostr(): Promise<{
    use(
      req: { emit(input: unknown): void; over(): void },
      options?: unknown
    ): {
      subscribe(observer: {
        next?: (packet: { event?: unknown; from?: string }) => void;
        complete?: () => void;
        error?: (error: unknown) => void;
      }): { unsubscribe(): void };
    };
  }>;
  createRxBackwardReq(options?: { requestKey?: string }): {
    emit(input: unknown): void;
    over(): void;
  };
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

interface CachedFetchState {
  readonly cache: Map<string, StoredEvent | null>;
  readonly nullCacheTimestamps: Map<string, number>;
  readonly inflight: Map<string, Promise<SettledReadResult<StoredEvent>>>;
  readonly invalidatedDuringFetch: Set<string>;
}

interface LatestReadState<TEvent extends StoredEvent = StoredEvent> {
  event: TEvent | null;
  localSettled: boolean;
  relaySettled: boolean;
  localHit: boolean;
  relayHit: boolean;
  destroyed: boolean;
  sub?: { unsubscribe(): void };
  timeout?: ReturnType<typeof setTimeout>;
  readonly listeners: Set<() => void>;
}

const NULL_CACHE_TTL_MS = 30_000;
const cachedFetchStates = new WeakMap<CoordinatorReadRuntime, CachedFetchState>();

function isCoordinatorReadRuntime(value: unknown): value is CoordinatorReadRuntime {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getEventsDB' in value &&
    'getRxNostr' in value &&
    'createRxBackwardReq' in value
  );
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

function readCachedById(
  state: CachedFetchState,
  eventId: string
): { readonly hit: true; readonly event: StoredEvent | null } | { readonly hit: false } {
  if (!state.cache.has(eventId)) return { hit: false };
  const cached = state.cache.get(eventId) ?? null;
  if (cached !== null) return { hit: true, event: cached };
  const ts = state.nullCacheTimestamps.get(eventId);
  if (ts !== undefined && Date.now() - ts < NULL_CACHE_TTL_MS) return { hit: true, event: null };
  state.cache.delete(eventId);
  state.nullCacheTimestamps.delete(eventId);
  return { hit: false };
}

async function materializeIncomingEvent(
  runtime: CoordinatorReadRuntime,
  event: StoredEvent
): Promise<boolean> {
  try {
    const db = await runtime.getEventsDB();
    if (typeof db.putWithReconcile === 'function') {
      return (await db.putWithReconcile(event)).stored;
    }
    return (await db.put(event)) !== false;
  } catch {
    return true;
  }
}

async function quarantineRelayEvent(
  runtime: CoordinatorReadRuntime,
  record: unknown
): Promise<void> {
  try {
    const db = await runtime.getEventsDB();
    await db.putQuarantine?.(record);
  } catch {
    // Relay validation failures remain blocked even if diagnostics cannot be persisted.
  }
}

async function ingestRelayPacketEvent(
  runtime: CoordinatorReadRuntime,
  event: unknown,
  relayUrl: string
): Promise<StoredEvent | null> {
  const validation = await validateRelayEvent(event);
  if (!validation.ok) {
    await quarantineRelayEvent(runtime, {
      relayUrl,
      eventId:
        typeof event === 'object' &&
        event !== null &&
        typeof (event as { id?: unknown }).id === 'string'
          ? (event as { id: string }).id
          : null,
      reason: validation.reason,
      rawEvent: event
    });
    return null;
  }
  const stored = await materializeIncomingEvent(runtime, validation.event);
  return stored ? validation.event : null;
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
        scope: 'runtime:cachedFetchById'
      });
      const req = runtime.createRxBackwardReq({ requestKey });
      let found: StoredEvent | null = null;
      const pending = new Set<Promise<void>>();
      const finish = () => {
        clearTimeout(timeout);
        sub.unsubscribe();
        void Promise.allSettled([...pending]).then(() => resolve(found));
      };
      const sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          const task = (async () => {
            const stored = await ingestRelayPacketEvent(runtime, packet.event, packet.from ?? '');
            if (stored) found = stored;
          })();
          pending.add(task);
          void task.finally(() => pending.delete(task));
        },
        complete: finish,
        error: finish
      });
      const timeout = setTimeout(finish, 5_000);
      req.emit({ ids: [eventId] });
      req.over();
    });
    const invalidated = state.invalidatedDuringFetch.delete(eventId);
    if (!invalidated) {
      if (event) {
        state.cache.set(eventId, event);
        state.nullCacheTimestamps.delete(eventId);
      } else {
        state.cache.set(eventId, null);
        state.nullCacheTimestamps.set(eventId, Date.now());
      }
    }
    return event;
  } catch {
    return null;
  }
}

async function performCachedFetchById(
  runtime: CoordinatorReadRuntime,
  eventId: string
): Promise<SettledReadResult<StoredEvent>> {
  const state = getCachedFetchState(runtime);
  const pending = state.inflight.get(eventId);
  if (pending) return pending;
  const promise = (async () => {
    const cached = readCachedById(state, eventId);
    if (cached.hit) {
      return {
        event: cached.event,
        settlement:
          cached.event === null
            ? reduceReadSettlement({ localSettled: true, relaySettled: true, nullTtlHit: true })
            : reduceReadSettlement({
                localSettled: true,
                relaySettled: true,
                relayRequired: false,
                localHitProvenance: 'memory'
              })
      };
    }

    const db = await runtime.getEventsDB();
    const local = await db.getById(eventId).catch(() => null);
    const invalidated = state.invalidatedDuringFetch.delete(eventId);
    if (invalidated) {
      return {
        event: local,
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: false,
          relayRequired: true,
          invalidatedDuringFetch: true
        })
      };
    }
    if (local) {
      state.cache.set(eventId, local);
      state.nullCacheTimestamps.delete(eventId);
      return {
        event: local,
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: true,
          relayRequired: false,
          localHitProvenance: 'store'
        })
      };
    }

    const relay = await fetchAndCacheByIdFromRelay(runtime, state, eventId);
    return {
      event: relay,
      settlement: reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: true,
        relayHit: relay !== null
      })
    };
  })();
  state.inflight.set(eventId, promise);
  try {
    return await promise;
  } finally {
    state.inflight.delete(eventId);
  }
}

export async function cachedFetchById<TResult>(
  coordinatorOrRuntime:
    | { cachedFetchById(eventId: string): Promise<TResult> }
    | CoordinatorReadRuntime,
  eventId: string
): Promise<TResult> {
  if (isCoordinatorReadRuntime(coordinatorOrRuntime)) {
    return (await performCachedFetchById(coordinatorOrRuntime, eventId)) as TResult;
  }
  return coordinatorOrRuntime.cachedFetchById(eventId);
}

export function invalidateFetchByIdCache(
  coordinatorOrRuntime:
    | { invalidateFetchByIdCache(eventId: string): void }
    | CoordinatorReadRuntime,
  eventId: string
): void {
  if (isCoordinatorReadRuntime(coordinatorOrRuntime)) {
    const state = getCachedFetchState(coordinatorOrRuntime);
    state.cache.delete(eventId);
    state.nullCacheTimestamps.delete(eventId);
    if (state.inflight.has(eventId)) state.invalidatedDuringFetch.add(eventId);
    return;
  }
  coordinatorOrRuntime.invalidateFetchByIdCache(eventId);
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
    localHit: false,
    relayHit: false,
    destroyed: false,
    listeners: new Set()
  };
  const notify = () => state.listeners.forEach((listener) => listener());
  const snapshot = (): SettledReadResult<TEvent> => ({
    event: state.event,
    settlement: reduceReadSettlement({
      localSettled: state.localSettled,
      relaySettled: state.relaySettled,
      relayRequired: true,
      localHitProvenance: state.localHit ? 'store' : null,
      relayHit: state.relayHit
    })
  });
  const settleRelay = () => {
    if (state.destroyed) return;
    state.relaySettled = true;
    notify();
  };

  void (async () => {
    try {
      const db = await runtime.getEventsDB();
      const cached = await db.getByPubkeyAndKind(pubkey, kind);
      if (!state.destroyed && cached) {
        state.event = cached as TEvent;
        state.localHit = true;
        notify();
      }
    } catch {
      // DB not available.
    } finally {
      if (!state.destroyed) {
        state.localSettled = true;
        notify();
      }
    }
  })();

  void (async () => {
    try {
      const rxNostr = await runtime.getRxNostr();
      if (state.destroyed) return;
      const requestKey = createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ kinds: [kind], authors: [pubkey], limit: 1 }],
        scope: 'runtime:useCachedLatest'
      });
      const req = runtime.createRxBackwardReq({ requestKey });
      state.timeout = setTimeout(() => {
        state.sub?.unsubscribe();
        settleRelay();
      }, 10_000);
      state.sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          void (async () => {
            const stored = await ingestRelayPacketEvent(runtime, packet.event, packet.from ?? '');
            if (!stored || state.destroyed) return;
            const incoming = stored as TEvent;
            if (state.event === null || incoming.created_at > state.event.created_at) {
              state.event = incoming;
              notify();
            }
            state.relayHit = true;
            notify();
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
  })();

  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    destroy() {
      state.destroyed = true;
      state.sub?.unsubscribe();
      if (state.timeout) clearTimeout(state.timeout);
      state.listeners.clear();
    }
  };
}

export function useCachedLatest<TResult>(
  coordinatorOrRuntime:
    | { useCachedLatest(pubkey: string, kind: number): TResult }
    | CoordinatorReadRuntime,
  pubkey: string,
  kind: number
): TResult {
  if (isCoordinatorReadRuntime(coordinatorOrRuntime)) {
    return createLatestReadDriver(coordinatorOrRuntime, pubkey, kind) as TResult;
  }
  return coordinatorOrRuntime.useCachedLatest(pubkey, kind);
}

export async function fetchLatestEvent<TEvent>(
  coordinator: { fetchLatestEvent(pubkey: string, kind: number): Promise<TEvent | null> },
  pubkey: string,
  kind: number
): Promise<TEvent | null> {
  return coordinator.fetchLatestEvent(pubkey, kind);
}
