import { describe, expect, it } from 'vitest';

import { verifyDeletionTargets } from './deletion-rules.js';

describe('verifyDeletionTargets', () => {
  it('should accept deletion when author matches', () => {
    const pubkeys = new Map([['ev1', 'pk1']]);
    const event = { pubkey: 'pk1', tags: [['e', 'ev1']] };
    expect(verifyDeletionTargets(event, pubkeys)).toEqual(['ev1']);
  });

  it('should reject deletion when author does not match', () => {
    const pubkeys = new Map([['ev1', 'pk1']]);
    const event = { pubkey: 'pk2', tags: [['e', 'ev1']] };
    expect(verifyDeletionTargets(event, pubkeys)).toEqual([]);
  });

  it('should accept deletion when original event is unknown', () => {
    const pubkeys = new Map<string, string>();
    const event = { pubkey: 'pk1', tags: [['e', 'ev1']] };
    expect(verifyDeletionTargets(event, pubkeys)).toEqual(['ev1']);
  });

  it('should handle multiple e-tags with mixed verification', () => {
    const pubkeys = new Map([
      ['ev1', 'pk1'],
      ['ev2', 'pk2']
    ]);
    const event = {
      pubkey: 'pk1',
      tags: [
        ['e', 'ev1'],
        ['e', 'ev2'],
        ['e', 'ev3']
      ]
    };
    const result = verifyDeletionTargets(event, pubkeys);
    expect(result).toContain('ev1');
    expect(result).not.toContain('ev2');
    expect(result).toContain('ev3');
  });

  it('should return empty for event with no e-tags', () => {
    const pubkeys = new Map<string, string>();
    const event = { pubkey: 'pk1', tags: [['p', 'someone']] };
    expect(verifyDeletionTargets(event, pubkeys)).toEqual([]);
  });

  it('accepts deletion when original pubkey is unknown (not in eventPubkeys map)', () => {
    // Event ID not present in map at all → originalPubkey is undefined → accept
    const pubkeys = new Map([['other-event', 'someone-else']]);
    const event = { pubkey: 'pk-unknown', tags: [['e', 'ev-not-in-map']] };
    expect(verifyDeletionTargets(event, pubkeys)).toEqual(['ev-not-in-map']);
  });

  it('rejects deletion when pubkeys do not match', () => {
    const pubkeys = new Map([['ev-conflict', 'original-author']]);
    const event = { pubkey: 'different-author', tags: [['e', 'ev-conflict']] };
    // original-author !== different-author → reject
    expect(verifyDeletionTargets(event, pubkeys)).toEqual([]);
  });

  it('handles empty tags array', () => {
    const pubkeys = new Map([['ev1', 'pk1']]);
    const event = { pubkey: 'pk1', tags: [] };
    // No e-tags → nothing to delete
    expect(verifyDeletionTargets(event, pubkeys)).toEqual([]);
  });
});
