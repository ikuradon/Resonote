import type { ReadSettlement, ReadSettlementLocalProvenance } from '@auftakt/core';
import { createRuntimeRequestKey, reduceReadSettlement } from '@auftakt/timeline';

import { createLogger, shortHex } from '$shared/utils/logger.js';

const log = createLogger('cached-nostr');

export interface FetchedEventFull {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}

export interface SettledReadResult<TEvent> {
  readonly event: TEvent | null;
  readonly settlement: ReadSettlement;
}

export type CachedFetchByIdResult = SettledReadResult<FetchedEventFull>;

const NULL_CACHE_TTL_MS = 30_000;

const fetchByIdCache = new Map<string, FetchedEventFull | null>();
const nullCacheTimestamps = new Map<string, number>();
const inflight = new Map<string, Promise<CachedFetchByIdResult>>();
// Track IDs invalidated while an in-flight fetch is pending — prevents cache re-pollution
const invalidatedDuringFetch = new Set<string>();

/** Invalidate a cached entry (e.g. when a deletion event is received). */
export function invalidateFetchByIdCache(eventId: string): void {
  fetchByIdCache.delete(eventId);
  nullCacheTimestamps.delete(eventId);
  if (inflight.has(eventId)) {
    invalidatedDuringFetch.add(eventId);
  }
}

/** Reset cache state (for tests). */
export function resetFetchByIdCache(): void {
  fetchByIdCache.clear();
  nullCacheTimestamps.clear();
  inflight.clear();
  invalidatedDuringFetch.clear();
}

export async function cachedFetchById(eventId: string): Promise<CachedFetchByIdResult> {
  if (fetchByIdCache.has(eventId)) {
    const cached = fetchByIdCache.get(eventId) ?? null;
    if (cached !== null) {
      return {
        event: cached,
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: false,
          relayRequired: false,
          localHitProvenance: 'memory'
        })
      };
    }
    // Null entry — check TTL
    const ts = nullCacheTimestamps.get(eventId);
    if (ts !== undefined && Date.now() - ts < NULL_CACHE_TTL_MS) {
      return {
        event: null,
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: false,
          relayRequired: false,
          nullTtlHit: true
        })
      };
    }
    // Expired — evict and re-fetch
    fetchByIdCache.delete(eventId);
    nullCacheTimestamps.delete(eventId);
  }

  // Dedup: if another call for the same eventId is already in flight, await it
  const pending = inflight.get(eventId);
  if (pending) return pending;

  const promise = cachedFetchByIdInner(eventId);
  inflight.set(eventId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(eventId);
  }
}

async function cachedFetchByIdInner(eventId: string): Promise<CachedFetchByIdResult> {
  try {
    const { getEventsDB } = await import('$shared/nostr/event-db.js');
    const db = await getEventsDB();
    const event = await db.getById(eventId);
    if (event) {
      const result = event as FetchedEventFull;
      const invalidated = invalidatedDuringFetch.delete(eventId);
      if (!invalidated) {
        fetchByIdCache.set(eventId, result);
        nullCacheTimestamps.delete(eventId);
      }
      return {
        event: result,
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: false,
          relayRequired: false,
          localHitProvenance: 'store',
          invalidatedDuringFetch: invalidated
        })
      };
    }
  } catch {
    // DB not available
  }

  try {
    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('@auftakt/adapter-relay'),
      import('$shared/nostr/client.js')
    ]);
    const rxNostr = await getRxNostr();

    const result = await new Promise<FetchedEventFull | null>((resolve) => {
      const requestKey = createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ ids: [eventId] }],
        scope: 'shared:nostr:cached-query:cachedFetchById'
      });
      const req = createRxBackwardReq({ requestKey });
      let found: FetchedEventFull | null = null;
      const timeout = setTimeout(() => {
        sub.unsubscribe();
        resolve(found);
      }, 5000);

      const sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          found = packet.event as FetchedEventFull;
          void (async () => {
            try {
              const { getEventsDB } = await import('$shared/nostr/event-db.js');
              const db = await getEventsDB();
              await db.put(packet.event);
            } catch {
              // DB not available
            }
          })();
        },
        complete: () => {
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(found);
        },
        error: () => {
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(found);
        }
      });

      req.emit({ ids: [eventId] });
      req.over();
    });

    const invalidated = invalidatedDuringFetch.delete(eventId);
    if (!invalidated) {
      fetchByIdCache.set(eventId, result);
      if (result) {
        log.debug('Fetched target event from relay', { id: shortHex(eventId) });
        nullCacheTimestamps.delete(eventId);
      } else {
        nullCacheTimestamps.set(eventId, Date.now());
      }
    }
    return {
      event: result,
      settlement: reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: true,
        localHitProvenance: null,
        relayHit: result !== null,
        invalidatedDuringFetch: invalidated
      })
    };
  } catch {
    const invalidated = invalidatedDuringFetch.delete(eventId);
    if (!invalidated) {
      fetchByIdCache.set(eventId, null);
      nullCacheTimestamps.set(eventId, Date.now());
    }
    return {
      event: null,
      settlement: reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: true,
        localHitProvenance: null,
        relayHit: false,
        invalidatedDuringFetch: invalidated
      })
    };
  }
}

interface CachedEvent {
  tags: string[][];
  content: string;
  created_at: number;
  pubkey: string;
  id: string;
  kind: number;
}

export interface UseCachedLatestResult {
  readonly event: CachedEvent | null;
  readonly settlement: ReadSettlement;
  destroy(): void;
}

export function useCachedLatest(pubkey: string, kind: number): UseCachedLatestResult {
  let event = $state<CachedEvent | null>(null);
  let localSettled = $state(false);
  let relaySettled = $state(false);
  let localHitProvenance = $state<ReadSettlementLocalProvenance | null>(null);
  let relayHit = $state(false);
  let destroyed = false;
  let sub: { unsubscribe(): void } | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const startDB = async () => {
    try {
      const { getEventsDB } = await import('$shared/nostr/event-db.js');
      const db = await getEventsDB();
      const cached = await db.getByPubkeyAndKind(pubkey, kind);
      if (destroyed) return;
      if (cached && (event === null || cached.created_at > event.created_at)) {
        event = cached as CachedEvent;
        localHitProvenance = 'store';
        log.debug('Cache hit for pubkey+kind', {
          pubkey: shortHex(pubkey),
          kind
        });
      }
    } catch {
      // DB not available
    } finally {
      if (!destroyed) {
        localSettled = true;
      }
    }
  };

  const startRelay = async () => {
    try {
      const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
        import('@auftakt/adapter-relay'),
        import('$shared/nostr/client.js')
      ]);
      if (destroyed) return;
      const rxNostr = await getRxNostr();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- destroyed may become true during preceding awaits
      if (destroyed) return;

      const requestKey = createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ kinds: [kind], authors: [pubkey], limit: 1 }],
        scope: 'shared:nostr:cached-query:useCachedLatest'
      });
      const req = createRxBackwardReq({ requestKey });

      timeout = setTimeout(() => {
        sub?.unsubscribe();
        if (!destroyed) {
          relaySettled = true;
        }
      }, 10_000);

      sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          if (destroyed) return;
          const incoming = packet.event as CachedEvent;
          if (event === null || incoming.created_at > event.created_at) {
            event = incoming;
            log.debug('Relay update for pubkey+kind', {
              pubkey: shortHex(pubkey),
              kind
            });
          }
          relayHit = true;
          void (async () => {
            try {
              const { getEventsDB } = await import('$shared/nostr/event-db.js');
              const db = await getEventsDB();
              await db.put(packet.event);
            } catch {
              // DB not available
            }
          })();
        },
        complete: () => {
          if (timeout) clearTimeout(timeout);
          if (!destroyed) {
            relaySettled = true;
          }
        },
        error: () => {
          if (timeout) clearTimeout(timeout);
          if (!destroyed) {
            relaySettled = true;
          }
        }
      });

      req.emit({ kinds: [kind], authors: [pubkey], limit: 1 });
      req.over();
    } catch {
      if (!destroyed) {
        relaySettled = true;
      }
    }
  };

  void startDB();
  void startRelay();

  return {
    get event() {
      return event;
    },
    get settlement() {
      return reduceReadSettlement({
        localSettled,
        relaySettled,
        relayRequired: true,
        localHitProvenance,
        relayHit
      });
    },
    destroy() {
      destroyed = true;
      sub?.unsubscribe();
      if (timeout) clearTimeout(timeout);
    }
  };
}
