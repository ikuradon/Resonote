/**
 * Feed resolution — loads podcast feed metadata and episodes.
 * Extracts the API call + publish logic from PodcastEpisodeList.svelte.
 */

import { resolveByApi } from '$shared/content/resolution.js';
import { publishSignedEvents } from '$shared/nostr/gateway.js';

export interface FeedEpisode {
  guid: string;
  title: string;
  enclosureUrl: string;
  duration: number;
  publishedAt: number;
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
    publishSignedEvents(data.signedEvents).catch(() => {});
  }

  return {
    title: data.feed?.title ?? '',
    imageUrl: data.feed?.imageUrl ?? '',
    description: data.feed?.description ?? '',
    episodes: data.episodes ?? []
  };
}
