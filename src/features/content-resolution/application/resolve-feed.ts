/**
 * Feed resolution — loads podcast feed metadata and episodes.
 * Extracts the API call + publish logic from PodcastEpisodeList.svelte.
 */

import { publishSignedEvents } from '$shared/auftakt/resonote.js';
import { resolveByApi } from '$shared/content/resolution.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('resolve-feed');

export interface FeedEpisode {
  title: string;
  guid: string;
  rawGuid?: string;
  link?: string;
  enclosureUrl: string;
  pubDate: string;
  duration: number;
  description: string;
}

export interface FeedResolveResult {
  title: string;
  imageUrl: string;
  description: string;
  episodes: FeedEpisode[];
  error?: string;
}

export async function resolvePodcastFeed(feedUrl: string): Promise<FeedResolveResult> {
  const data = await resolveByApi(feedUrl);

  if (data.error) {
    return { title: '', imageUrl: '', description: '', episodes: [], error: data.error };
  }

  // Publish signed bookmark events internally
  if (data.signedEvents && data.signedEvents.length > 0) {
    publishSignedEvents(data.signedEvents).catch((e) =>
      log.error('Failed to publish signed events', e)
    );
  }

  return {
    title: data.feed?.title ?? '',
    imageUrl: data.feed?.imageUrl ?? '',
    description: data.feed?.description ?? '',
    episodes: data.episodes ?? []
  };
}
