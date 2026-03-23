import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

import { resolveYouTubeFeed } from './resolve-youtube-feed.js';

describe('resolveYouTubeFeed', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('playlist type: returns title + videos on success', async () => {
    const payload = {
      title: 'My Playlist',
      videos: [
        {
          videoId: 'abc123',
          title: 'Video 1',
          published: 1700000000,
          thumbnail: 'https://i.ytimg.com/vi/abc123/default.jpg'
        }
      ]
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => payload
    });

    const result = await resolveYouTubeFeed('playlist', 'PLxxxxxx');

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('type=playlist');
    expect(url).toContain('id=PLxxxxxx');
    expect(result.title).toBe('My Playlist');
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('abc123');
    expect(result.error).toBeUndefined();
  });

  it('channel type: passes correct params', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'My Channel', videos: [] })
    });

    const result = await resolveYouTubeFeed('channel', 'UCxxxxxx');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('type=channel');
    expect(url).toContain('id=UCxxxxxx');
    expect(result.title).toBe('My Channel');
    expect(result.videos).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('returns error=fetch_failed when response is not ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500
    });

    const result = await resolveYouTubeFeed('playlist', 'PLxxxxxx');

    expect(result.title).toBe('');
    expect(result.videos).toEqual([]);
    expect(result.error).toBe('fetch_failed');
  });

  it('returns error=fetch_failed for 404 status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404
    });

    const result = await resolveYouTubeFeed('channel', 'UCnotfound');

    expect(result.error).toBe('fetch_failed');
  });

  it('returns error=network_error when fetch throws', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await resolveYouTubeFeed('playlist', 'PLxxxxxx');

    expect(result.title).toBe('');
    expect(result.videos).toEqual([]);
    expect(result.error).toBe('network_error');
  });

  it('returns error=network_error when res.json() throws', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      }
    });

    const result = await resolveYouTubeFeed('playlist', 'PLxxxxxx');

    expect(result.error).toBe('network_error');
  });

  it('returns multiple videos correctly', async () => {
    const payload = {
      title: 'Big Playlist',
      videos: [
        { videoId: 'v1', title: 'First', published: 1700000000, thumbnail: 'thumb1' },
        { videoId: 'v2', title: 'Second', published: 1700001000, thumbnail: 'thumb2' },
        { videoId: 'v3', title: 'Third', published: 1700002000, thumbnail: 'thumb3' }
      ]
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => payload
    });

    const result = await resolveYouTubeFeed('playlist', 'PLmulti');

    expect(result.videos).toHaveLength(3);
    expect(result.videos[2].videoId).toBe('v3');
  });
});
