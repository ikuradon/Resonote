import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveEncodedNavigation } from '$features/content-resolution/application/resolve-encoded-navigation.js';

const { resolveByApiMock } = vi.hoisted(() => ({
  resolveByApiMock: vi.fn()
}));

vi.mock('$shared/content/resolution.js', () => ({
  resolveByApi: resolveByApiMock
}));

describe('resolveEncodedNavigation', () => {
  beforeEach(() => {
    resolveByApiMock.mockReset();
  });

  it('should return parse_failed when the encoded url is invalid', async () => {
    await expect(resolveEncodedNavigation('@@not-base64@@')).resolves.toEqual({
      errorKey: 'resolve.error.parse_failed'
    });
  });

  it('should return a podcast redirect path when the API resolves a feed', async () => {
    resolveByApiMock.mockResolvedValue({
      type: 'redirect',
      feedUrl: 'https://example.com/feed.xml'
    });

    await expect(
      resolveEncodedNavigation('aHR0cHM6Ly9leGFtcGxlLmNvbS9zb21lLXVybA')
    ).resolves.toEqual({
      path: '/podcast/feed/aHR0cHM6Ly9leGFtcGxlLmNvbS9mZWVkLnhtbA'
    });
  });

  it('should map rss_not_found to resolve.error.not_found', async () => {
    resolveByApiMock.mockResolvedValue({
      error: 'rss_not_found'
    });

    await expect(
      resolveEncodedNavigation('aHR0cHM6Ly9leGFtcGxlLmNvbS9zb21lLXVybA')
    ).resolves.toEqual({
      errorKey: 'resolve.error.not_found'
    });
  });

  it('should return parse_failed when the API throws', async () => {
    resolveByApiMock.mockRejectedValue(new Error('network'));

    await expect(
      resolveEncodedNavigation('aHR0cHM6Ly9leGFtcGxlLmNvbS9zb21lLXVybA')
    ).resolves.toEqual({
      errorKey: 'resolve.error.parse_failed'
    });
  });
});
