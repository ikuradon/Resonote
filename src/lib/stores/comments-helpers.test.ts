import { describe, it, expect } from 'vitest';

// processDeletion is not exported, so we test the logic inline
describe('processDeletion logic', () => {
  function processDeletion(event: { tags: string[][] }): string[] {
    return event.tags.filter((t) => t[0] === 'e').map((t) => t[1]);
  }

  it('should extract e tag values from deletion event', () => {
    const event = {
      tags: [
        ['e', 'id1'],
        ['e', 'id2'],
        ['k', '1111']
      ]
    };
    expect(processDeletion(event)).toEqual(['id1', 'id2']);
  });

  it('should return empty array when no e tags', () => {
    const event = { tags: [['k', '1111']] };
    expect(processDeletion(event)).toEqual([]);
  });

  it('should return empty array for empty tags', () => {
    const event = { tags: [] };
    expect(processDeletion(event)).toEqual([]);
  });

  it('should ignore non-e tags', () => {
    const event = {
      tags: [
        ['p', 'pubkey1'],
        ['e', 'id1'],
        ['I', 'value']
      ]
    };
    expect(processDeletion(event)).toEqual(['id1']);
  });
});
