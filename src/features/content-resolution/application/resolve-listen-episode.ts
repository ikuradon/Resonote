import {
  buildEpisodeContentId,
  normalizeListenEpisodeUrl,
  parseListenUrl
} from '$shared/content/podcast.js';
import { toBase64url } from '$shared/content/url-utils.js';

import { resolvePodcastFeed } from './resolve-feed.js';

export type ResolveListenEpisodeResult =
  | { kind: 'episode'; path: string; initialTimeSec?: number; initialTimeParam?: string }
  | { kind: 'feed-fallback'; path: string; warning: 'listen_episode_not_found' }
  | { kind: 'error'; path: string; reason: 'listen_feed_unavailable' };

export async function resolveListenEpisodeUrl(
  inputUrl: string
): Promise<ResolveListenEpisodeResult | null> {
  const parsed = parseListenUrl(inputUrl);
  if (!parsed?.episodeUrl) return null;

  const feedPath = `/podcast/feed/${toBase64url(parsed.feedUrl)}`;
  const feed = await resolveFeed(parsed.feedUrl, feedPath);
  if (feed.kind === 'error') return feed;

  if (feed.result.error) {
    return { kind: 'error', path: feedPath, reason: 'listen_feed_unavailable' };
  }

  const episode = feed.result.episodes.find(
    (candidate) => candidate.link && normalizeListenEpisodeUrl(candidate.link) === parsed.episodeUrl
  );

  if (!episode) {
    return {
      kind: 'feed-fallback',
      path: `${feedPath}?warning=listen_episode_not_found`,
      warning: 'listen_episode_not_found'
    };
  }

  const contentId = buildEpisodeContentId(parsed.feedUrl, episode.guid);
  const basePath = `/podcast/episode/${contentId.id}`;
  const path = parsed.initialTimeParam ? `${basePath}?t=${parsed.initialTimeParam}` : basePath;

  return {
    kind: 'episode',
    path,
    initialTimeSec: parsed.initialTimeSec,
    initialTimeParam: parsed.initialTimeParam
  };
}

async function resolveFeed(feedUrl: string, feedPath: string) {
  try {
    const result = await resolvePodcastFeed(feedUrl);
    return { kind: 'ok' as const, result };
  } catch {
    return { kind: 'error' as const, path: feedPath, reason: 'listen_feed_unavailable' as const };
  }
}
