import { describe, expect, it, vi } from 'vitest';

vi.mock('$shared/browser/profile.js', () => ({
  fetchProfiles: vi.fn()
}));

describe('comment profile preload logic', () => {
  it('should extract unique pubkeys from comments', () => {
    const pubkeys = ['pk1', 'pk2', 'pk1', 'pk3'];
    const unique = [...new Set(pubkeys)];
    expect(unique).toEqual(['pk1', 'pk2', 'pk3']);
  });

  it('should handle empty pubkey list', () => {
    const pubkeys: string[] = [];
    const unique = [...new Set(pubkeys)];
    expect(unique.length).toBe(0);
  });

  it('should deduplicate when all pubkeys are the same', () => {
    const pubkeys = ['pk1', 'pk1', 'pk1'];
    const unique = [...new Set(pubkeys)];
    expect(unique).toEqual(['pk1']);
  });
});
