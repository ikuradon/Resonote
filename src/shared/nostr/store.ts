/**
 * Auftakt EventStore singleton.
 * Replaces event-db.ts + cached-query.svelte.ts + gateway.ts
 */

import type { EventStore } from '@ikuradon/auftakt';
import type { Event as NostrEvent } from 'nostr-typedef';

import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('nostr:store');

let store: EventStore | undefined;
let initPromise: Promise<void> | undefined;
let disconnectStore: (() => void) | undefined;

/**
 * Get the EventStore singleton. If initStore() hasn't completed yet,
 * lazily triggers initialization and waits (same pattern as old getEventsDB).
 */
export async function getStoreAsync(): Promise<EventStore> {
  if (store) return store;
  await initStore();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- initStore guarantees store is set
  return store!;
}

/**
 * Get the EventStore synchronously. Throws if not yet initialized.
 * For code that must be synchronous; prefer getStoreAsync() otherwise.
 */
export function getStore(): EventStore {
  if (!store) throw new Error('Store not initialized. Call initStore() first.');
  return store;
}

export async function initStore(): Promise<void> {
  if (store) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let nextStore: EventStore | undefined;
    let nextDisconnectStore: (() => void) | undefined;

    try {
      const [{ createEventStore }, { dexieBackend }, { connectStore }, { getRxNostr }] =
        await Promise.all([
          import('@ikuradon/auftakt'),
          import('@ikuradon/auftakt/backends/dexie'),
          import('@ikuradon/auftakt/sync'),
          import('./client.js')
        ]);

      nextStore = createEventStore({ backend: dexieBackend({ dbName: 'resonote-events' }) });
      const rxNostr = await getRxNostr();
      nextDisconnectStore = connectStore(rxNostr, nextStore, { reconcileDeletions: true });

      store = nextStore;
      disconnectStore = nextDisconnectStore;
      log.info('Auftakt store initialized');
    } catch (err) {
      nextDisconnectStore?.();
      nextStore?.dispose();
      initPromise = undefined;
      throw err;
    }
  })();

  return initPromise;
}

export function disposeStore(): void {
  disconnectStore?.();
  disconnectStore = undefined;
  store?.dispose();
  store = undefined;
  initPromise = undefined;
  log.info('Auftakt store disposed');
}

/**
 * Fetch the latest replaceable event for a given pubkey+kind.
 * Tries local cache first, then relay backward fetch.
 */
export async function fetchLatest(
  pubkey: string,
  kind: number,
  options?: { timeout?: number; signal?: AbortSignal; directFallback?: boolean }
): Promise<NostrEvent | null> {
  const timeoutMs = options?.timeout ?? 5000;
  const s = await getStoreAsync();

  // 1. Local cache
  const cached = await s.getSync({ kinds: [kind], authors: [pubkey], limit: 1 });
  if (cached.length > 0) return cached[0].event;

  // 2. Relay fetch via SyncedQuery backward
  const [{ createSyncedQuery }, { fetchLatestEvent, getRxNostr }] = await Promise.all([
    import('@ikuradon/auftakt/sync'),
    import('./client.js')
  ]);
  const { firstValueFrom, filter, race, timer, Observable, take } = await import('rxjs');
  const { map } = await import('rxjs/operators');
  const rxNostr = await getRxNostr();
  const deadline = Date.now() + timeoutMs;
  const completeSentinel = Symbol('fetchLatest.complete');

  const synced = createSyncedQuery(rxNostr, s, {
    filter: { kinds: [kind], authors: [pubkey], limit: 1 },
    strategy: 'backward',
    signal: options?.signal
  });
  try {
    const eventFound$ = synced.events$.pipe(
      filter((events: unknown[]) => events.length > 0),
      take(1),
      map((events: unknown[]) => (events as Array<{ event: NostrEvent }>)[0]?.event ?? null)
    );
    const complete$ = synced.status$.pipe(
      filter((status: unknown) => status === 'complete'),
      take(1),
      map(() => completeSentinel)
    );
    const timeout$ = timer(timeoutMs).pipe(map(() => null));
    const racers = [eventFound$, complete$, timeout$];

    if (options?.signal) {
      const abort$ = new Observable<null>((subscriber) => {
        const onAbort = () => subscriber.next(null);
        options.signal?.addEventListener('abort', onAbort, { once: true });
        return () => options.signal?.removeEventListener('abort', onAbort);
      });
      racers.push(abort$);
    }

    const result = (await firstValueFrom(race(racers))) as
      | NostrEvent
      | null
      | typeof completeSentinel;
    if (result === completeSentinel) {
      const refreshed = await s.getSync({ kinds: [kind], authors: [pubkey], limit: 1 });
      if (refreshed.length > 0) return refreshed[0].event;
      if (!options?.directFallback) return null;
      return await fetchLatestEvent(pubkey, kind, {
        timeout: Math.max(1, deadline - Date.now())
      });
    }
    return result;
  } finally {
    synced.dispose();
  }
}
