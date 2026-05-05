import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveContentNavigation } from '$features/content-resolution/application/content-navigation.js';
import type * as ContentRegistry from '$shared/content/registry.js';
import { toBase64url } from '$shared/content/url-utils.js';

const { parseContentUrlMock, resolveListenEpisodeUrlMock } = vi.hoisted(() => ({
  parseContentUrlMock: vi.fn(),
  resolveListenEpisodeUrlMock: vi.fn()
}));

vi.mock('$shared/content/registry.js', async () => {
  const actual = await vi.importActual<typeof ContentRegistry>('$shared/content/registry.js');
  return {
    ...actual,
    parseContentUrl: parseContentUrlMock
  };
});

vi.mock('./resolve-listen-episode.js', () => ({
  resolveListenEpisodeUrl: resolveListenEpisodeUrlMock
}));

describe('resolveContentNavigation', () => {
  beforeEach(async () => {
    const actual = await vi.importActual<typeof ContentRegistry>('$shared/content/registry.js');
    parseContentUrlMock.mockImplementation(actual.parseContentUrl);
    resolveListenEpisodeUrlMock.mockReset();
  });

  it('should return null for empty input', async () => {
    await expect(resolveContentNavigation('   ')).resolves.toBeNull();
  });

  it('should resolve a LISTEN episode URL before provider parsing', async () => {
    resolveListenEpisodeUrlMock.mockResolvedValueOnce({
      kind: 'episode',
      path: '/podcast/episode/feed:episode'
    });

    await expect(resolveContentNavigation('listen.style/p/foo/bar')).resolves.toEqual({
      path: '/podcast/episode/feed:episode'
    });

    expect(resolveListenEpisodeUrlMock).toHaveBeenCalledWith('https://listen.style/p/foo/bar');
    expect(parseContentUrlMock).not.toHaveBeenCalled();
  });

  it('should keep LISTEN feed URLs on the feed route without episode resolver', async () => {
    const feedUrl = 'https://rss.listen.style/p/foo/rss';

    await expect(resolveContentNavigation('https://listen.style/p/foo')).resolves.toEqual({
      path: `/podcast/feed/${toBase64url(feedUrl)}`
    });

    expect(resolveListenEpisodeUrlMock).not.toHaveBeenCalled();
  });

  it('should use the resolver error path without adding warning query', async () => {
    const feedPath = `/podcast/feed/${toBase64url('https://rss.listen.style/p/foo/rss')}`;
    resolveListenEpisodeUrlMock.mockResolvedValueOnce({
      kind: 'error',
      path: feedPath,
      reason: 'listen_feed_unavailable'
    });

    await expect(resolveContentNavigation('https://listen.style/p/foo/bar')).resolves.toEqual({
      path: feedPath
    });

    expect(resolveListenEpisodeUrlMock).toHaveBeenCalledWith('https://listen.style/p/foo/bar');
  });

  it('should build a direct content path when the input matches a non-LISTEN provider URL', async () => {
    await expect(resolveContentNavigation('https://youtu.be/dQw4w9WgXcQ?t=42')).resolves.toEqual({
      path: '/youtube/video/dQw4w9WgXcQ?t=42'
    });

    expect(resolveListenEpisodeUrlMock).not.toHaveBeenCalled();
  });

  it('should fall back to the resolve route for valid non-LISTEN unknown URLs', async () => {
    await expect(resolveContentNavigation('example.com/some-page')).resolves.toEqual({
      path: '/resolve/aHR0cHM6Ly9leGFtcGxlLmNvbS9zb21lLXBhZ2U'
    });

    expect(resolveListenEpisodeUrlMock).not.toHaveBeenCalled();
  });

  it('should return an unsupported error for invalid input', async () => {
    await expect(resolveContentNavigation('not a url at all')).resolves.toEqual({
      errorKey: 'track.unsupported'
    });
  });
});
