import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('fetch-event');

/** In-memory cache for fetched events (avoids repeated relay queries) */
const cache = new Map<string, { content: string; kind: number } | null>();

/**
 * Fetch an event's content by ID.
 * Tries IndexedDB cache first, then relays. Results are cached in memory.
 */
export async function fetchEventContent(
  eventId: string
): Promise<{ content: string; kind: number } | null> {
  if (cache.has(eventId)) return cache.get(eventId)!;

  // Try IndexedDB first
  try {
    const { getEventsDB } = await import('./event-db.js');
    const db = await getEventsDB();
    const event = await db.getById(eventId);
    if (event) {
      const result = { content: event.content, kind: event.kind };
      cache.set(eventId, result);
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
        next: (packet) => {
          found = { content: packet.event.content, kind: packet.event.kind };
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

    cache.set(eventId, result);
    if (result) {
      log.debug('Fetched target event from relay', { id: shortHex(eventId) });
    }
    return result;
  } catch {
    cache.set(eventId, null);
    return null;
  }
}
