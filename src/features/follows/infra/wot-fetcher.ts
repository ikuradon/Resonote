/**
 * WoT fetcher — uses auftakt for follows + 2-hop WoT.
 */

import { createLogger } from '$shared/utils/logger.js';

import { extractFollows } from '../domain/follow-model.js';

const log = createLogger('wot-fetcher');
const FOLLOW_KIND = 3;
const BATCH_SIZE = 100;

export interface WotResult {
  directFollows: Set<string>;
  wot: Set<string>;
}

export interface WotProgressCallback {
  onDirectFollows: (follows: Set<string>) => void;
  onWotProgress: (count: number) => void;
  isCancelled: () => boolean;
}

export async function fetchWot(pubkey: string, callbacks: WotProgressCallback): Promise<WotResult> {
  const { fetchLatest } = await import('$shared/nostr/store.js');

  // Step 1: Fetch direct follows via fetchLatest (cache → relay)
  const latestEvent = await fetchLatest(pubkey, FOLLOW_KIND, { timeout: 10_000 });
  const directFollows = latestEvent ? extractFollows(latestEvent) : new Set<string>();

  if (callbacks.isCancelled()) return { directFollows, wot: directFollows };

  log.info('Direct follows loaded', { count: directFollows.size });
  callbacks.onDirectFollows(directFollows);

  if (directFollows.size === 0) {
    return { directFollows, wot: new Set([pubkey]) };
  }

  // Step 2: Fetch 2nd-hop contact lists via createSyncedQuery backward (batched)
  const allWot = new Set([...directFollows, pubkey]);
  const followArray = [...directFollows];

  const [{ createSyncedQuery }, { getRxNostr }, { getStoreAsync }] = await Promise.all([
    import('@ikuradon/auftakt/sync'),
    import('$shared/nostr/client.js'),
    import('$shared/nostr/store.js')
  ]);
  const { firstValueFrom, filter, timeout, catchError, of, defaultIfEmpty } = await import('rxjs');
  const [rxNostr, store] = await Promise.all([getRxNostr(), getStoreAsync()]);

  const batchPromises: Promise<void>[] = [];

  for (let i = 0; i < followArray.length; i += BATCH_SIZE) {
    const batch = followArray.slice(i, i + BATCH_SIZE);

    batchPromises.push(
      (async () => {
        if (callbacks.isCancelled()) return;

        const synced = createSyncedQuery(rxNostr, store, {
          filter: { kinds: [FOLLOW_KIND], authors: batch },
          strategy: 'backward'
        });

        try {
          const result = await firstValueFrom(
            synced.events$.pipe(
              filter((events: unknown[]) => events.length > 0),
              timeout(10_000),
              catchError(() => of(null)),
              defaultIfEmpty(null)
            )
          );

          if (!result || !Array.isArray(result) || callbacks.isCancelled()) return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const ce of result as any[]) {
            if (callbacks.isCancelled()) return;
            for (const tag of ce.event.tags) {
              if (tag[0] === 'p' && tag[1]) allWot.add(tag[1]);
            }
          }
          callbacks.onWotProgress(allWot.size);
        } finally {
          synced.dispose();
        }
      })()
    );
  }

  await Promise.all(batchPromises);

  return { directFollows, wot: new Set(allWot) };
}
