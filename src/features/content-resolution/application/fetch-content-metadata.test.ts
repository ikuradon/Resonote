import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentId } from '$shared/content/types.js';

import { fetchContentMetadata } from './fetch-content-metadata.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fetchContentMetadata', () => {
  it('returns metadata from oEmbed API for spotify', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Track Title',
        subtitle: 'Artist',
        thumbnailUrl: 'https://i.scdn.co/image/test',
        provider: 'Spotify'
      })
    });

    const contentId: ContentId = { platform: 'spotify', type: 'track', id: 'abc123' };
    const result = await fetchContentMetadata(contentId);

    expect(result).toEqual({
      title: 'Track Title',
      subtitle: 'Artist',
      thumbnailUrl: 'https://i.scdn.co/image/test',
      description: null
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/oembed/resolve?platform=spotify&type=track&id=abc123'
    );
  });

  it('returns metadata for niconico', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Nico Video',
        subtitle: 'NicoUser',
        thumbnailUrl: 'https://nicovideo.cdn.nimg.jp/thumb.jpg'
      })
    });

    const contentId: ContentId = { platform: 'niconico', type: 'video', id: 'sm12345' };
    const result = await fetchContentMetadata(contentId);
    expect(result?.title).toBe('Nico Video');
  });

  it('returns null for unsupported platforms', async () => {
    const contentId: ContentId = { platform: 'netflix', type: 'show', id: '123' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null for podcast platform (self-resolved)', async () => {
    const contentId: ContentId = { platform: 'podcast', type: 'episode', id: 'abc' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null for audio platform (self-resolved)', async () => {
    const contentId: ContentId = { platform: 'audio', type: 'file', id: 'abc' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when API returns error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 });

    const contentId: ContentId = { platform: 'youtube', type: 'video', id: 'abc' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const contentId: ContentId = { platform: 'vimeo', type: 'video', id: '123' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
  });
});
