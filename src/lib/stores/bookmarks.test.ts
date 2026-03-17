import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock nostr client to prevent actual relay connections
vi.mock('../nostr/client.js', () => ({
  fetchLatestEvent: vi.fn(),
  castSigned: vi.fn()
}));

import {
  isBookmarked,
  clearBookmarks,
  getBookmarks,
  parseBookmarkTags
} from './bookmarks.svelte.js';

describe('parseBookmarkTags', () => {
  it('should parse i-tags as content bookmarks', () => {
    const tags = [['i', 'spotify:track:abc', 'https://open.spotify.com/track/abc']];
    const entries = parseBookmarkTags(tags);
    expect(entries).toEqual([
      {
        type: 'content',
        value: 'spotify:track:abc',
        hint: 'https://open.spotify.com/track/abc'
      }
    ]);
  });

  it('should parse e-tags as event bookmarks', () => {
    const tags = [['e', 'event-id-123', 'wss://relay.example.com']];
    const entries = parseBookmarkTags(tags);
    expect(entries).toEqual([
      { type: 'event', value: 'event-id-123', hint: 'wss://relay.example.com' }
    ]);
  });

  it('should handle mixed tags', () => {
    const tags = [
      ['i', 'youtube:video:xyz', 'https://youtube.com/watch?v=xyz'],
      ['e', 'event-456'],
      ['t', 'hashtag'],
      ['i', 'spotify:track:abc']
    ];
    const entries = parseBookmarkTags(tags);
    expect(entries).toHaveLength(3);
    expect(entries[0].type).toBe('content');
    expect(entries[1].type).toBe('event');
    expect(entries[2].type).toBe('content');
  });

  it('should skip tags without value', () => {
    const tags = [['i'], ['e'], ['i', ''], ['e', '']];
    const entries = parseBookmarkTags(tags);
    expect(entries).toEqual([]);
  });

  it('should handle empty tags array', () => {
    expect(parseBookmarkTags([])).toEqual([]);
  });

  it('should handle hint as undefined when not present', () => {
    const tags = [['i', 'audio:https://example.com/ep.mp3']];
    const entries = parseBookmarkTags(tags);
    expect(entries[0].hint).toBeUndefined();
  });

  it('should ignore unknown tag types', () => {
    const tags = [
      ['p', 'pubkey'],
      ['k', '1111'],
      ['i', 'spotify:track:abc']
    ];
    const entries = parseBookmarkTags(tags);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe('spotify:track:abc');
  });
});

describe('isBookmarked', () => {
  beforeEach(() => {
    clearBookmarks();
  });

  it('should return false when no bookmarks', () => {
    expect(isBookmarked({ platform: 'spotify', type: 'track', id: 'abc' })).toBe(false);
  });
});

describe('clearBookmarks', () => {
  it('should reset state', () => {
    clearBookmarks();
    const bm = getBookmarks();
    expect(bm.entries).toEqual([]);
    expect(bm.loading).toBe(false);
    expect(bm.loaded).toBe(false);
  });
});
