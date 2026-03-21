import { describe, it, expect, beforeEach } from 'vitest';
import { clearBookmarks, getBookmarks, isBookmarked } from './bookmarks.svelte.js';

describe('bookmarks store', () => {
  beforeEach(() => {
    clearBookmarks();
  });

  it('should return false when no bookmarks exist', () => {
    expect(isBookmarked({ platform: 'spotify', type: 'track', id: 'abc' })).toBe(false);
  });

  it('should reset state to its defaults', () => {
    clearBookmarks();
    const bookmarks = getBookmarks();
    expect(bookmarks.entries).toEqual([]);
    expect(bookmarks.loading).toBe(false);
    expect(bookmarks.loaded).toBe(false);
  });
});
