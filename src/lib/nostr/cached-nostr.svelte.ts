import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('cached-nostr');

// ─── cachedFetchById ──────────────────────────────────────────────

/** In-memory cache for fetched events (avoids repeated relay queries) */
const fetchByIdCache = new Map<string, { content: string; kind: number } | null>();

/**
 * Fetch an event's content by ID.
 * Tries in-memory cache, then IndexedDB, then relays.
 */
export async function cachedFetchById(
  eventId: string
): Promise<{ content: string; kind: number } | null> {
  if (fetchByIdCache.has(eventId)) return fetchByIdCache.get(eventId)!;

  // Try IndexedDB first
  try {
    const { getEventsDB } = await import('./event-db.js');
    const db = await getEventsDB();
    const event = await db.getById(eventId);
    if (event) {
      const result = { content: event.content, kind: event.kind };
      fetchByIdCache.set(eventId, result);
      return result;
    }
  } catch {
    // DB not available
  }

  // Fallback: fetch from relays
  try {
    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('rx-nostr'),
      import('./client.js')
    ]);
    const rxNostr = await getRxNostr();

    const result = await new Promise<{ content: string; kind: number } | null>((resolve) => {
      const req = createRxBackwardReq();
      let found: { content: string; kind: number } | null = null;
      const timeout = setTimeout(() => {
        sub.unsubscribe();
        resolve(found);
      }, 5000);

      const sub = rxNostr.use(req).subscribe({
        next: async (packet) => {
          found = { content: packet.event.content, kind: packet.event.kind };
          // Auto-persist to IndexedDB
          try {
            const { getEventsDB } = await import('./event-db.js');
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

// ─── useCachedLatest ──────────────────────────────────────────────

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

/**
 * Reactive SWR for the latest event matching a pubkey+kind.
 * DB and relay are queried in parallel; the newest event wins.
 */
export function useCachedLatest(pubkey: string, kind: number): UseCachedLatestResult {
  let event = $state<CachedEvent | null>(null);
  let source = $state<QuerySource>('loading');
  let settled = $state(false);
  let destroyed = false;
  let sub: { unsubscribe(): void } | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  // Start DB lookup
  const startDB = async () => {
    try {
      const { getEventsDB } = await import('./event-db.js');
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

  // Start relay fetch
  const startRelay = async () => {
    try {
      const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
        import('rx-nostr'),
        import('./client.js')
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
          // Auto-persist to IndexedDB
          try {
            const { getEventsDB } = await import('./event-db.js');
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

  // Start both in parallel
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
