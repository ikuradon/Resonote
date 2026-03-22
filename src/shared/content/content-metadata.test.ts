import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchContentMetadata,
  getContentMetadata,
  resetContentMetadataCache,
  type ContentMetadata
} from './content-metadata.js';
import type { ContentId } from './types.js';

const SPOTIFY_TRACK: ContentId = {
  platform: 'spotify',
  type: 'track',
  id: '4uLU6hMCjMI75M1A2tKUQC'
};

const MOCK_METADATA: ContentMetadata = {
  title: 'Bohemian Rhapsody',
  subtitle: 'Queen',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  provider: 'Spotify'
};

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() })
}));

beforeEach(() => {
  resetContentMetadataCache();
  vi.restoreAllMocks();
});

describe('fetchContentMetadata', () => {
  it('fetches metadata from API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(MOCK_METADATA), { status: 200 }))
    );

    const result = await fetchContentMetadata(SPOTIFY_TRACK);
    expect(result).toEqual(MOCK_METADATA);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('caches result on second call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(MOCK_METADATA), { status: 200 }))
    );

    await fetchContentMetadata(SPOTIFY_TRACK);
    const second = await fetchContentMetadata(SPOTIFY_TRACK);
    expect(second).toEqual(MOCK_METADATA);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('deduplicates concurrent requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(MOCK_METADATA), { status: 200 }))
    );

    const [a, b] = await Promise.all([
      fetchContentMetadata(SPOTIFY_TRACK),
      fetchContentMetadata(SPOTIFY_TRACK)
    ]);
    expect(a).toEqual(MOCK_METADATA);
    expect(b).toEqual(MOCK_METADATA);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns null for unsupported platform', async () => {
    const result = await fetchContentMetadata({ platform: 'netflix', type: 'show', id: '123' });
    expect(result).toBeNull();
  });

  it('caches null on 4xx client error — does not retry', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', mockFetch);

    const first = await fetchContentMetadata(SPOTIFY_TRACK);
    expect(first).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();

    // Second call should return cached null without fetching again
    const second = await fetchContentMetadata(SPOTIFY_TRACK);
    expect(second).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce(); // NOT called again
  });

  it('does not cache null on 5xx server error — retries on next call', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_METADATA), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const first = await fetchContentMetadata(SPOTIFY_TRACK);
    expect(first).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();

    // Second call should retry (not return cached null)
    const second = await fetchContentMetadata(SPOTIFY_TRACK);
    expect(second).toEqual(MOCK_METADATA);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not cache null on fetch error — retries on next call', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_METADATA), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const first = await fetchContentMetadata(SPOTIFY_TRACK);
    expect(first).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();

    // Second call should retry (not return cached null)
    const second = await fetchContentMetadata(SPOTIFY_TRACK);
    expect(second).toEqual(MOCK_METADATA);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('getContentMetadata', () => {
  it('returns null when not cached', () => {
    expect(getContentMetadata(SPOTIFY_TRACK)).toBeNull();
  });

  it('returns cached metadata after fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(MOCK_METADATA), { status: 200 }))
    );

    await fetchContentMetadata(SPOTIFY_TRACK);
    expect(getContentMetadata(SPOTIFY_TRACK)).toEqual(MOCK_METADATA);
  });
});
