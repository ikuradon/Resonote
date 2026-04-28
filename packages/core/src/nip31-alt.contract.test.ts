import { describe, expect, it } from 'vitest';

import {
  appendNip31AltTag,
  buildNip31AltTag,
  NIP31_ALT_TAG,
  parseNip31AltTag,
  withNip31AltTag
} from './index.js';

describe('NIP-31 unknown event fallback text', () => {
  it('builds and parses human-readable alt tags', () => {
    expect(buildNip31AltTag('  Resonote content reaction  ')).toEqual([
      NIP31_ALT_TAG,
      'Resonote content reaction'
    ]);
    expect(
      parseNip31AltTag({
        tags: [['alt', 'Resonote content reaction']]
      })
    ).toBe('Resonote content reaction');
  });

  it('rejects empty alt summaries', () => {
    expect(() => buildNip31AltTag('  ')).toThrow('NIP-31 alt tag summary must not be empty');
    expect(parseNip31AltTag({ tags: [['alt', '']] })).toBeNull();
    expect(parseNip31AltTag({ tags: [] })).toBeNull();
  });

  it('adds one alt tag without mutating existing tags', () => {
    const tags = [['i', 'spotify:track:abc']] as const;

    expect(appendNip31AltTag(tags, 'Content reaction')).toEqual([
      ['i', 'spotify:track:abc'],
      ['alt', 'Content reaction']
    ]);
    expect(tags).toEqual([['i', 'spotify:track:abc']]);
  });

  it('replaces stale alt tags on event parameters', () => {
    expect(
      withNip31AltTag(
        {
          kind: 17,
          content: '+',
          tags: [
            ['alt', 'old'],
            ['i', 'spotify:track:abc']
          ]
        },
        'Resonote content reaction'
      )
    ).toEqual({
      kind: 17,
      content: '+',
      tags: [
        ['i', 'spotify:track:abc'],
        ['alt', 'Resonote content reaction']
      ]
    });
  });
});
