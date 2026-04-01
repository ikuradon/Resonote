import { describe, expect, it } from 'vitest';

import { buildContentFilters } from './comment-subscription.js';

describe('buildContentFilters', () => {
  it('returns an array of 4 filters', () => {
    const filters = buildContentFilters('spotify:track:abc');
    expect(filters).toHaveLength(4);
  });

  it('first filter uses COMMENT_KIND (1111) and the given idValue', () => {
    const filters = buildContentFilters('spotify:track:abc');
    expect(filters[0]).toEqual({ kinds: [1111], '#I': ['spotify:track:abc'] });
  });

  it('second filter uses REACTION_KIND (7) and the given idValue', () => {
    const filters = buildContentFilters('spotify:track:abc');
    expect(filters[1]).toEqual({ kinds: [7], '#I': ['spotify:track:abc'] });
  });

  it('third filter uses DELETION_KIND (5) and the given idValue', () => {
    const filters = buildContentFilters('spotify:track:abc');
    expect(filters[2]).toEqual({ kinds: [5], '#I': ['spotify:track:abc'] });
  });

  it('uses the idValue provided, not a hardcoded string', () => {
    const id = 'youtube:video:xyz';
    const filters = buildContentFilters(id);
    for (const f of filters) {
      const tagValue = f['#I'] ?? f['#i'];
      expect(tagValue).toEqual([id]);
    }
  });

  it('fourth filter uses CONTENT_REACTION_KIND (17) with lowercase #i tag', () => {
    const filters = buildContentFilters('spotify:track:abc123');
    expect(filters[3]).toEqual({
      kinds: [17],
      '#i': ['spotify:track:abc123']
    });
  });
});
