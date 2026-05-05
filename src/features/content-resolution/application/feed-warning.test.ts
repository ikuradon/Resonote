import { describe, expect, it } from 'vitest';

import { getFeedWarningKey } from '$features/content-resolution/application/feed-warning.js';

describe('getFeedWarningKey', () => {
  it('should return a translation key only for allowlisted feed warning codes', () => {
    expect(getFeedWarningKey('listen_episode_not_found')).toBe(
      'podcast.warning.listen_episode_not_found'
    );
    expect(getFeedWarningKey('listen_feed_unavailable')).toBeNull();
    expect(getFeedWarningKey('<script>')).toBeNull();
    expect(getFeedWarningKey(null)).toBeNull();
  });
});
