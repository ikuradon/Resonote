// @public — Stable API for route/component/feature consumers
import type { DTagResult } from '$shared/content/podcast-resolver.js';
import { getSystemPubkey, parseDTagEvent, resolveByApi } from '$shared/content/podcast-resolver.js';
import { fromBase64url } from '$shared/content/url-utils.js';
import { getStoreAsync } from '$shared/nostr/store.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('episode-resolver');

export interface EpisodeInfo {
  enclosureUrl: string;
  title?: string;
  feedTitle?: string;
  image?: string;
  description?: string;
}

export async function resolveEpisode(
  feedBase64: string,
  guidBase64: string
): Promise<EpisodeInfo | null> {
  const guid = fromBase64url(guidBase64);
  const feedUrl = fromBase64url(feedBase64);
  if (!guid || !feedUrl) return null;

  const [nostrResult, apiResult] = await Promise.all([
    queryNostrForEpisode(guid).catch((e) => {
      log.warn('Nostr episode query failed', e);
      return null;
    }),
    resolveByApi(feedUrl).catch((err) => {
      log.warn('resolveByApi failed', err);
      return null;
    })
  ]);

  if (apiResult) {
    const feedTitle = apiResult.feed?.title;
    const image = apiResult.feed?.imageUrl;

    if (apiResult.episodes) {
      const match = apiResult.episodes.find((ep) => ep.guid === guid);
      if (match) {
        return {
          enclosureUrl: match.enclosureUrl,
          title: match.title,
          feedTitle,
          image,
          description: nostrResult?.description ?? match.description
        };
      }
    }
    if (apiResult.episode?.guid === guid) {
      return {
        enclosureUrl: apiResult.episode.enclosureUrl,
        title: apiResult.episode.title,
        feedTitle,
        image,
        description: nostrResult?.description ?? apiResult.episode.description
      };
    }
  }

  if (nostrResult) {
    return {
      enclosureUrl: nostrResult.enclosureUrl,
      description: nostrResult.description
    };
  }

  return null;
}

async function queryNostrForEpisode(guid: string): Promise<DTagResult | null> {
  try {
    const pubkey = await getSystemPubkey();
    if (!pubkey) return null;

    const store = await getStoreAsync();

    try {
      const cached = await store.getSync({
        kinds: [39701],
        authors: [pubkey],
        '#i': [`podcast:item:guid:${guid}`]
      });
      for (const ce of cached) {
        const result = parseDTagEvent({
          kind: 39701,
          tags: ce.event.tags,
          content: ce.event.content
        });
        if (result) return result;
      }
    } catch {
      // Cache query failed — continue to relay fetch
    }

    const [{ createSyncedQuery }, { getRxNostr }] = await Promise.all([
      import('@ikuradon/auftakt/sync'),
      import('$shared/nostr/client.js')
    ]);
    const {
      firstValueFrom,
      filter: rxFilter,
      timeout,
      catchError,
      of,
      defaultIfEmpty
    } = await import('rxjs');
    const [rxNostr, auftaktStore] = await Promise.all([getRxNostr(), getStoreAsync()]);

    const queryFilter = {
      kinds: [39701],
      authors: [pubkey],
      '#i': [`podcast:item:guid:${guid}`],
      limit: 1
    };

    const synced = createSyncedQuery(rxNostr, auftaktStore, {
      filter: queryFilter,
      strategy: 'backward'
    });

    try {
      const result = await firstValueFrom(
        synced.events$.pipe(
          rxFilter((events: unknown[]) => events.length > 0),
          timeout(5000),
          catchError(() => of(null)),
          defaultIfEmpty(null)
        )
      );

      if (!result || !Array.isArray(result) || result.length === 0) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event = (result as any[])[0].event;
      return parseDTagEvent({
        kind: 39701,
        tags: event.tags,
        content: event.content
      });
    } finally {
      synced.dispose();
    }
  } catch {
    return null;
  }
}
