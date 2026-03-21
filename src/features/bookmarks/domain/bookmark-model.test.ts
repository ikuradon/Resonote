import { describe, it, expect } from 'vitest';
import {
  parseBookmarkTags,
  isAlreadyBookmarked,
  addBookmarkTag,
  removeBookmarkTag
} from './bookmark-model.js';

describe('parseBookmarkTags', () => {
  it('should parse i-tags as content bookmarks', () => {
    const tags = [['i', 'spotify:track:abc', 'https://open.spotify.com/track/abc']];
    const result = parseBookmarkTags(tags);
    expect(result).toEqual([
      { type: 'content', value: 'spotify:track:abc', hint: 'https://open.spotify.com/track/abc' }
    ]);
  });

  it('should parse e-tags as event bookmarks', () => {
    const tags = [['e', 'event-id-123', 'wss://relay.example.com']];
    const result = parseBookmarkTags(tags);
    expect(result).toEqual([
      { type: 'event', value: 'event-id-123', hint: 'wss://relay.example.com' }
    ]);
  });

  it('should skip unknown tags', () => {
    const tags = [
      ['p', 'pubkey'],
      ['i', 'content:id'],
      ['d', 'identifier']
    ];
    const result = parseBookmarkTags(tags);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('content');
  });

  it('should skip tags without value', () => {
    const tags = [['i'], ['e']];
    expect(parseBookmarkTags(tags)).toEqual([]);
  });

  it('should handle mixed tag lists', () => {
    const tags = [
      ['i', 'youtube:video:xyz', 'https://youtube.com/watch?v=xyz'],
      ['e', 'event-456'],
      ['t', 'hashtag'],
      ['i', 'spotify:track:abc']
    ];
    const result = parseBookmarkTags(tags);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('content');
    expect(result[1].type).toBe('event');
    expect(result[2].type).toBe('content');
  });

  it('should handle empty tag arrays', () => {
    expect(parseBookmarkTags([])).toEqual([]);
  });

  it('should keep hint undefined when not present', () => {
    const result = parseBookmarkTags([['i', 'audio:https://example.com/ep.mp3']]);
    expect(result[0].hint).toBeUndefined();
  });
});

describe('isAlreadyBookmarked', () => {
  it('should return true when value exists', () => {
    const tags = [['i', 'spotify:track:abc', 'hint']];
    expect(isAlreadyBookmarked(tags, 'spotify:track:abc')).toBe(true);
  });

  it('should return false when value does not exist', () => {
    const tags = [['i', 'spotify:track:abc', 'hint']];
    expect(isAlreadyBookmarked(tags, 'youtube:video:xyz')).toBe(false);
  });
});

describe('addBookmarkTag', () => {
  it('should append new i-tag', () => {
    const existing = [['d', 'bookmarks']];
    const result = addBookmarkTag(existing, 'spotify:track:abc', 'https://example.com');
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(['i', 'spotify:track:abc', 'https://example.com']);
  });

  it('should not mutate original', () => {
    const existing = [['d', 'bookmarks']];
    addBookmarkTag(existing, 'val', 'hint');
    expect(existing).toHaveLength(1);
  });
});

describe('removeBookmarkTag', () => {
  it('should remove matching i-tag', () => {
    const tags = [
      ['d', 'bookmarks'],
      ['i', 'spotify:track:abc', 'hint'],
      ['i', 'other', 'hint2']
    ];
    const result = removeBookmarkTag(tags, 'spotify:track:abc');
    expect(result).toHaveLength(2);
    expect(result.some((t) => t[1] === 'spotify:track:abc')).toBe(false);
  });

  it('should not mutate original', () => {
    const tags = [['i', 'val', 'hint']];
    removeBookmarkTag(tags, 'val');
    expect(tags).toHaveLength(1);
  });
});
