import { describe, it, expect } from 'vitest';
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
});
