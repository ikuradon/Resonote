// @public — Stable API for route/component/feature consumers
import { searchEpisodeBookmarkByGuid } from '$shared/auftakt/resonote.js';
import type { DTagResult } from '$shared/content/podcast-resolver.js';
import { getSystemPubkey, parseDTagEvent, resolveByApi } from '$shared/content/podcast-resolver.js';
import { fromBase64url } from '$shared/content/url-utils.js';
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
    const event = await searchEpisodeBookmarkByGuid(pubkey, guid);
    return event ? parseDTagEvent({ kind: 39701, tags: event.tags, content: event.content }) : null;
  } catch {
    return null;
  }
}
