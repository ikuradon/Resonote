import { describe, it, expect } from 'vitest';
import { extractFollows, matchesFilter } from './follows.svelte.js';

describe('extractFollows', () => {
  it('should extract pubkeys from p tags', () => {
    const result = extractFollows({
      tags: [
        ['p', 'pk1'],
        ['p', 'pk2'],
        ['e', 'something']
      ]
    });
    expect(result).toEqual(new Set(['pk1', 'pk2']));
  });

  it('should deduplicate pubkeys', () => {
    const result = extractFollows({
      tags: [
        ['p', 'pk1'],
        ['p', 'pk1']
      ]
    });
    expect(result.size).toBe(1);
  });

  it('should skip p tags without value', () => {
    const result = extractFollows({
      tags: [['p']]
    });
    expect(result.size).toBe(0);
  });

  it('should return empty set for no tags', () => {
    expect(extractFollows({ tags: [] }).size).toBe(0);
  });
});

describe('matchesFilter', () => {
  it('should pass all pubkeys for "all" filter', () => {
    expect(matchesFilter('random', 'all', null)).toBe(true);
  });

  it('should always pass own pubkey regardless of filter', () => {
    expect(matchesFilter('me', 'follows', 'me')).toBe(true);
    expect(matchesFilter('me', 'wot', 'me')).toBe(true);
  });

  it('should return true for "all" even without myPubkey', () => {
    expect(matchesFilter('anyone', 'all', null)).toBe(true);
  });

  it('should reject unknown pubkeys for "follows" filter', () => {
    expect(matchesFilter('unknown', 'follows', null)).toBe(false);
  });

  it('should reject unknown pubkeys for "wot" filter', () => {
    expect(matchesFilter('unknown', 'wot', null)).toBe(false);
  });
});
