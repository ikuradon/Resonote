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

const fetchByIdCache = new Map<string, FetchedEventFull | null>();
const inflight = new Map<string, Promise<FetchedEventFull | null>>();

/** Invalidate a cached entry (e.g. when a deletion event is received). */
export function invalidateFetchByIdCache(eventId: string): void {
  fetchByIdCache.delete(eventId);
}

export async function cachedFetchById(eventId: string): Promise<FetchedEventFull | null> {
  if (fetchByIdCache.has(eventId)) return fetchByIdCache.get(eventId)!;

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

async function cachedFetchByIdInner(eventId: string): Promise<FetchedEventFull | null> {
  try {
    const { getEventsDB } = await import('$shared/nostr/gateway.js');
    const db = await getEventsDB();
    const event = await db.getById(eventId);
    if (event) {
      const result = event as FetchedEventFull;
      fetchByIdCache.set(eventId, result);
      return result;
    }
  } catch {
    // DB not available
  }

  try {
    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('rx-nostr'),
      import('$shared/nostr/gateway.js')
    ]);
    const rxNostr = await getRxNostr();

    const result = await new Promise<FetchedEventFull | null>((resolve) => {
      const req = createRxBackwardReq();
      let found: FetchedEventFull | null = null;
      const timeout = setTimeout(() => {
        sub.unsubscribe();
        resolve(found);
      }, 5000);

      const sub = rxNostr.use(req).subscribe({
        next: async (packet) => {
          found = packet.event as FetchedEventFull;
          try {
            const { getEventsDB } = await import('$shared/nostr/gateway.js');
            const db = await getEventsDB();
            await db.put(packet.event);
          } catch {
            // DB not available
          }
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

    fetchByIdCache.set(eventId, result);
    if (result) {
      log.debug('Fetched target event from relay', { id: shortHex(eventId) });
    }
    return result;
  } catch {
    fetchByIdCache.set(eventId, null);
    return null;
  }
}

type QuerySource = 'loading' | 'cache' | 'relay';

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
  readonly source: QuerySource;
  readonly settled: boolean;
  destroy(): void;
}

export function useCachedLatest(pubkey: string, kind: number): UseCachedLatestResult {
  let event = $state<CachedEvent | null>(null);
  let source = $state<QuerySource>('loading');
  let settled = $state(false);
  let destroyed = false;
  let sub: { unsubscribe(): void } | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const startDB = async () => {
    try {
      const { getEventsDB } = await import('$shared/nostr/gateway.js');
      const db = await getEventsDB();
      const cached = await db.getByPubkeyAndKind(pubkey, kind);
      if (destroyed) return;
      if (cached && (event === null || cached.created_at > event.created_at)) {
        event = cached as CachedEvent;
        source = 'cache';
        log.debug('Cache hit for pubkey+kind', {
          pubkey: shortHex(pubkey),
          kind
        });
      }
    } catch {
      // DB not available
    }
  };

  const startRelay = async () => {
    try {
      const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
        import('rx-nostr'),
        import('$shared/nostr/gateway.js')
      ]);
      if (destroyed) return;
      const rxNostr = await getRxNostr();
      if (destroyed) return;

      const req = createRxBackwardReq();

      timeout = setTimeout(() => {
        if (!destroyed) {
          settled = true;
          sub?.unsubscribe();
        }
      }, 10_000);

      sub = rxNostr.use(req).subscribe({
        next: async (packet) => {
          if (destroyed) return;
          const incoming = packet.event as CachedEvent;
          if (event === null || incoming.created_at > event.created_at) {
            event = incoming;
            source = 'relay';
            log.debug('Relay update for pubkey+kind', {
              pubkey: shortHex(pubkey),
              kind
            });
          }
          try {
            const { getEventsDB } = await import('$shared/nostr/gateway.js');
            const db = await getEventsDB();
            await db.put(packet.event);
          } catch {
            // DB not available
          }
        },
        complete: () => {
          if (!destroyed) {
            settled = true;
          }
          if (timeout) clearTimeout(timeout);
        },
        error: () => {
          if (!destroyed) {
            settled = true;
          }
          if (timeout) clearTimeout(timeout);
        }
      });

      req.emit({ kinds: [kind], authors: [pubkey], limit: 1 });
      req.over();
    } catch {
      if (!destroyed) {
        settled = true;
      }
    }
  };

  startDB();
  startRelay();

  return {
    get event() {
      return event;
    },
    get source() {
      return source;
    },
    get settled() {
      return settled;
    },
    destroy() {
      destroyed = true;
      sub?.unsubscribe();
      if (timeout) clearTimeout(timeout);
    }
  };
}
