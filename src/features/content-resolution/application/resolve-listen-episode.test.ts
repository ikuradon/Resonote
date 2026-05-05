import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedResolveResult } from './resolve-feed.js';

const { mockResolvePodcastFeed } = vi.hoisted(() => ({
  mockResolvePodcastFeed: vi.fn()
}));

vi.mock('$features/content-resolution/application/resolve-feed.js', () => ({
  resolvePodcastFeed: (...args: unknown[]) => mockResolvePodcastFeed(...(args as []))
}));

import { toBase64url } from '$shared/content/url-utils.js';

import { resolveListenEpisodeUrl } from './resolve-listen-episode.js';

const FEED_URL = 'https://rss.listen.style/p/foo/rss';
const FEED_PATH = `/podcast/feed/${toBase64url(FEED_URL)}`;
const EPISODE_URL = 'https://listen.style/p/foo/bar';
const LISTEN_URL = `${EPISODE_URL}?t=90.50`;

function makeFeed(episodes: FeedResolveResult['episodes']): FeedResolveResult {
  return {
    title: 'Feed',
    imageUrl: '',
    description: '',
    episodes
  };
}

function makeEpisode(overrides: Partial<FeedResolveResult['episodes'][number]> = {}) {
  return {
    title: 'Episode',
    guid: 'guid-1',
    link: EPISODE_URL,
    enclosureUrl: 'https://example.com/audio.mp3',
    pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
    duration: 120,
    description: 'Description',
    ...overrides
  };
}

describe('resolveListenEpisodeUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvePodcastFeed.mockResolvedValue(makeFeed([makeEpisode()]));
  });

  it('matching RSS item link resolves to the podcast episode path', async () => {
    const result = await resolveListenEpisodeUrl(EPISODE_URL);

    expect(result).toEqual({
      kind: 'episode',
      path: `/podcast/episode/${toBase64url(FEED_URL)}:${toBase64url('guid-1')}`,
      initialTimeSec: undefined,
      initialTimeParam: undefined
    });
    expect(mockResolvePodcastFeed).toHaveBeenCalledWith(FEED_URL);
  });

  it('preserves the original LISTEN time parameter string in the resolved path', async () => {
    const result = await resolveListenEpisodeUrl(LISTEN_URL);

    expect(result).toEqual({
      kind: 'episode',
      path: `/podcast/episode/${toBase64url(FEED_URL)}:${toBase64url('guid-1')}?t=90.50`,
      initialTimeSec: 90.5,
      initialTimeParam: '90.50'
    });
  });

  it('matches canonical episode URLs when RSS item link has query, hash, and trailing slash', async () => {
    mockResolvePodcastFeed.mockResolvedValueOnce(
      makeFeed([makeEpisode({ link: 'http://LISTEN.STYLE/p/foo/bar/?utm=1#section' })])
    );

    const result = await resolveListenEpisodeUrl(EPISODE_URL);

    expect(result).toEqual({
      kind: 'episode',
      path: `/podcast/episode/${toBase64url(FEED_URL)}:${toBase64url('guid-1')}`,
      initialTimeSec: undefined,
      initialTimeParam: undefined
    });
  });

  it('returns feed fallback with warning when the RSS item has no link', async () => {
    mockResolvePodcastFeed.mockResolvedValueOnce(makeFeed([makeEpisode({ link: undefined })]));

    const result = await resolveListenEpisodeUrl(EPISODE_URL);

    expect(result).toEqual({
      kind: 'feed-fallback',
      path: `${FEED_PATH}?warning=listen_episode_not_found`,
      warning: 'listen_episode_not_found'
    });
  });

  it('returns feed fallback with warning when no RSS item matches', async () => {
    mockResolvePodcastFeed.mockResolvedValueOnce(
      makeFeed([makeEpisode({ link: 'https://listen.style/p/foo/other' })])
    );

    const result = await resolveListenEpisodeUrl(EPISODE_URL);

    expect(result).toEqual({
      kind: 'feed-fallback',
      path: `${FEED_PATH}?warning=listen_episode_not_found`,
      warning: 'listen_episode_not_found'
    });
  });

  it('returns feed-unavailable error without warning query when feed resolution throws', async () => {
    mockResolvePodcastFeed.mockRejectedValueOnce(new Error('network error'));

    const result = await resolveListenEpisodeUrl(EPISODE_URL);

    expect(result).toEqual({
      kind: 'error',
      path: FEED_PATH,
      reason: 'listen_feed_unavailable'
    });
  });

  it('returns feed-unavailable error when feed resolution returns an error result', async () => {
    mockResolvePodcastFeed.mockResolvedValueOnce({ ...makeFeed([]), error: 'Feed not found' });

    const result = await resolveListenEpisodeUrl(EPISODE_URL);

    expect(result).toEqual({
      kind: 'error',
      path: FEED_PATH,
      reason: 'listen_feed_unavailable'
    });
  });

  it('uses the first matching RSS item in feed order', async () => {
    mockResolvePodcastFeed.mockResolvedValueOnce(
      makeFeed([makeEpisode({ guid: 'first-guid' }), makeEpisode({ guid: 'second-guid' })])
    );

    const result = await resolveListenEpisodeUrl(EPISODE_URL);

    expect(result).toEqual({
      kind: 'episode',
      path: `/podcast/episode/${toBase64url(FEED_URL)}:${toBase64url('first-guid')}`,
      initialTimeSec: undefined,
      initialTimeParam: undefined
    });
  });

  it('returns null for malformed LISTEN episode URLs', async () => {
    await expect(resolveListenEpisodeUrl('https://listen.style/p/foo/%2Fbar')).resolves.toBeNull();
    await expect(resolveListenEpisodeUrl('https://example.com/p/foo/bar')).resolves.toBeNull();
    await expect(resolveListenEpisodeUrl('https://listen.style/p/foo')).resolves.toBeNull();
    expect(mockResolvePodcastFeed).not.toHaveBeenCalled();
  });
});
