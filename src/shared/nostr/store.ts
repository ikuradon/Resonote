/**
 * Auftakt EventStore singleton.
 * Replaces event-db.ts + cached-query.svelte.ts + gateway.ts
 */

import type { EventStore } from '@ikuradon/auftakt';
import type { Event as NostrEvent } from 'nostr-typedef';

import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('nostr:store');

let store: EventStore | undefined;

export function getStore(): EventStore {
  if (!store) throw new Error('Store not initialized. Call initStore() first.');
  return store;
}

export async function initStore(): Promise<void> {
  const [{ createEventStore }, { indexedDBBackend }, { connectStore }, { getRxNostr }] =
    await Promise.all([
      import('@ikuradon/auftakt'),
      import('@ikuradon/auftakt/backends/indexeddb'),
      import('@ikuradon/auftakt/sync'),
      import('./client.js')
    ]);

  store = createEventStore({ backend: indexedDBBackend('resonote-events') });
  const rxNostr = await getRxNostr();
  connectStore(rxNostr, store, { reconcileDeletions: true });
  log.info('Auftakt store initialized');
}

export function disposeStore(): void {
  store?.dispose();
  store = undefined;
  log.info('Auftakt store disposed');
}

/**
 * Fetch the latest replaceable event for a given pubkey+kind.
 * Tries local cache first, then relay backward fetch.
 */
export async function fetchLatest(
  pubkey: string,
  kind: number,
  options?: { timeout?: number }
): Promise<NostrEvent | null> {
  const s = getStore();

  // 1. Local cache
  const cached = await s.getSync({ kinds: [kind], authors: [pubkey], limit: 1 });
  if (cached.length > 0) return cached[0].event;

  // 2. Relay fetch via SyncedQuery backward
  const [{ createSyncedQuery }, { getRxNostr }] = await Promise.all([
    import('@ikuradon/auftakt/sync'),
    import('./client.js')
  ]);
  const { firstValueFrom, filter, timeout: rxTimeout, catchError, of } = await import('rxjs');
  const rxNostr = await getRxNostr();

  const synced = createSyncedQuery(rxNostr, s, {
    filter: { kinds: [kind], authors: [pubkey], limit: 1 },
    strategy: 'backward'
  });
  try {
    const result = await firstValueFrom(
      synced.events$.pipe(
        filter((events: unknown[]) => events.length > 0),
        rxTimeout(options?.timeout ?? 5000),
        catchError(() => of(null))
      )
    );
    if (result && Array.isArray(result) && result.length > 0) {
      return (result as Array<{ event: NostrEvent }>)[0].event;
    }
    return null;
  } finally {
    synced.dispose();
  }
}
