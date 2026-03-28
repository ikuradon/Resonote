import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveByApiMock, publishSignedEventsMock } = vi.hoisted(() => ({
  resolveByApiMock: vi.fn(),
  publishSignedEventsMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$shared/content/resolution.js', () => ({
  resolveByApi: resolveByApiMock
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  publishSignedEvents: publishSignedEventsMock
}));

import { resolvePodcastFeed } from './resolve-feed.js';

const FEED_URL = 'https://example.com/feed.rss';

describe('resolvePodcastFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error result when resolveByApi returns error', async () => {
    resolveByApiMock.mockResolvedValue({ error: 'Feed not found' });
    const result = await resolvePodcastFeed(FEED_URL);
    expect(result).toEqual({
      title: '',
      imageUrl: '',
      description: '',
      episodes: [],
      error: 'Feed not found'
    });
  });

  it('returns feed data on success', async () => {
    const episodes = [
      {
        guid: 'ep1',
        title: 'Episode 1',
        enclosureUrl: 'https://ex.com/ep1.mp3',
        duration: 3600,
        publishedAt: 1700000000
      }
    ];
    resolveByApiMock.mockResolvedValue({
      feed: { title: 'My Podcast', imageUrl: 'https://ex.com/art.jpg' },
      episodes,
      signedEvents: []
    });
    const result = await resolvePodcastFeed(FEED_URL);
    expect(result.title).toBe('My Podcast');
    expect(result.imageUrl).toBe('https://ex.com/art.jpg');
    expect(result.episodes).toEqual(episodes);
    expect(result.error).toBeUndefined();
  });

  it('publishes signed events when present', async () => {
    const signedEvents = [{ id: 'ev1', kind: 39701 }];
    resolveByApiMock.mockResolvedValue({
      feed: { title: 'Podcast', imageUrl: '' },
      episodes: [],
      signedEvents
    });
    await resolvePodcastFeed(FEED_URL);
    expect(publishSignedEventsMock).toHaveBeenCalledWith(signedEvents);
  });

  it('does not call publishSignedEvents when signedEvents is empty', async () => {
    resolveByApiMock.mockResolvedValue({
      feed: { title: 'Podcast', imageUrl: '' },
      episodes: [],
      signedEvents: []
    });
    await resolvePodcastFeed(FEED_URL);
    expect(publishSignedEventsMock).not.toHaveBeenCalled();
  });

  it('does not call publishSignedEvents when signedEvents is absent', async () => {
    resolveByApiMock.mockResolvedValue({
      feed: { title: 'Podcast', imageUrl: '' },
      episodes: []
    });
    await resolvePodcastFeed(FEED_URL);
    expect(publishSignedEventsMock).not.toHaveBeenCalled();
  });

  it('falls back to empty string when feed.title is undefined', async () => {
    resolveByApiMock.mockResolvedValue({ feed: {}, episodes: [] });
    const result = await resolvePodcastFeed(FEED_URL);
    expect(result.title).toBe('');
  });

  it('falls back to empty string when feed.imageUrl is undefined', async () => {
    resolveByApiMock.mockResolvedValue({ feed: {}, episodes: [] });
    const result = await resolvePodcastFeed(FEED_URL);
    expect(result.imageUrl).toBe('');
  });

  it('falls back to empty array when episodes is undefined', async () => {
    resolveByApiMock.mockResolvedValue({ feed: { title: 'X', imageUrl: '' } });
    const result = await resolvePodcastFeed(FEED_URL);
    expect(result.episodes).toEqual([]);
  });

  it('does not throw when publishSignedEvents rejects (fire-and-forget)', async () => {
    publishSignedEventsMock.mockRejectedValueOnce(new Error('publish failed'));
    resolveByApiMock.mockResolvedValue({
      feed: { title: 'Podcast', imageUrl: '' },
      episodes: [],
      signedEvents: [{ id: 'ev1' }]
    });
    await expect(resolvePodcastFeed(FEED_URL)).resolves.not.toThrow();
  });
});
