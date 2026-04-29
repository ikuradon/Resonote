import { describe, expect, it } from 'vitest';

import {
  buildNip88EndsAtTag,
  buildNip88OptionTag,
  buildNip88Poll,
  buildNip88PollTypeTag,
  buildNip88RelayTag,
  buildNip88Response,
  buildNip88ResponseFilter,
  isNip88PollType,
  NIP88_DEFAULT_POLL_TYPE,
  NIP88_POLL_KIND,
  NIP88_RESPONSE_KIND,
  normalizeNip88ResponseOptionIds,
  parseNip88Options,
  parseNip88Poll,
  parseNip88Response,
  selectNip88LatestResponsesByPubkey,
  tallyNip88Responses
} from './index.js';

describe('NIP-88 polls', () => {
  it('builds and parses poll events with options, relays, type, and expiration', () => {
    const event = buildNip88Poll({
      label: 'Pineapple on pizza',
      options: [
        { id: 'qj518h583', label: 'Yay' },
        { id: 'gga6cdnqj', label: 'Nay' }
      ],
      relays: ['wss://polls.example', 'wss://votes.example'],
      pollType: 'singlechoice',
      endsAt: 1720097117,
      tags: [
        ['option', 'ignored', 'Ignored'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP88_POLL_KIND,
      content: 'Pineapple on pizza',
      tags: [
        ['option', 'qj518h583', 'Yay'],
        ['option', 'gga6cdnqj', 'Nay'],
        ['relay', 'wss://polls.example'],
        ['relay', 'wss://votes.example'],
        ['polltype', 'singlechoice'],
        ['endsAt', '1720097117'],
        ['client', 'resonote']
      ]
    });
    expect(parseNip88Poll({ ...event, pubkey: 'alice', created_at: 123 })).toEqual({
      kind: NIP88_POLL_KIND,
      label: 'Pineapple on pizza',
      options: [
        { id: 'qj518h583', label: 'Yay' },
        { id: 'gga6cdnqj', label: 'Nay' }
      ],
      relays: ['wss://polls.example', 'wss://votes.example'],
      pollType: 'singlechoice',
      endsAt: 1720097117,
      customTags: [['client', 'resonote']],
      pubkey: 'alice',
      createdAt: 123
    });
  });

  it('builds and parses response events and response filters', () => {
    const event = buildNip88Response({
      pollEventId: 'poll-id',
      optionIds: ['gga6cdnqj', 'm3agjsdq1'],
      tags: [
        ['response', 'ignored'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP88_RESPONSE_KIND,
      content: '',
      tags: [
        ['e', 'poll-id'],
        ['response', 'gga6cdnqj'],
        ['response', 'm3agjsdq1'],
        ['client', 'resonote']
      ]
    });
    expect(
      parseNip88Response({ ...event, pubkey: 'bob', created_at: 456, id: 'response-id' })
    ).toEqual({
      kind: NIP88_RESPONSE_KIND,
      pollEventId: 'poll-id',
      optionIds: ['gga6cdnqj', 'm3agjsdq1'],
      content: '',
      customTags: [['client', 'resonote']],
      pubkey: 'bob',
      createdAt: 456,
      id: 'response-id'
    });
    expect(
      buildNip88ResponseFilter({
        pollEventId: 'poll-id',
        authors: ['alice', 'bob'],
        until: 999
      })
    ).toEqual({
      kinds: [NIP88_RESPONSE_KIND],
      '#e': ['poll-id'],
      authors: ['alice', 'bob'],
      until: 999
    });
  });

  it('normalizes and tallies latest valid responses per pubkey', () => {
    const events = [
      {
        id: 'old',
        kind: NIP88_RESPONSE_KIND,
        content: '',
        pubkey: 'alice',
        created_at: 10,
        tags: [
          ['e', 'poll-id'],
          ['response', 'a']
        ]
      },
      {
        id: 'latest',
        kind: NIP88_RESPONSE_KIND,
        content: '',
        pubkey: 'alice',
        created_at: 20,
        tags: [
          ['e', 'poll-id'],
          ['response', 'b'],
          ['response', 'b'],
          ['response', 'c']
        ]
      },
      {
        id: 'bob',
        kind: NIP88_RESPONSE_KIND,
        content: '',
        pubkey: 'bob',
        created_at: 15,
        tags: [
          ['e', 'poll-id'],
          ['response', 'a']
        ]
      },
      {
        id: 'other-poll',
        kind: NIP88_RESPONSE_KIND,
        content: '',
        pubkey: 'carol',
        created_at: 30,
        tags: [
          ['e', 'other-poll'],
          ['response', 'a']
        ]
      }
    ];

    expect(normalizeNip88ResponseOptionIds(['a', 'b'], 'singlechoice')).toEqual(['a']);
    expect(normalizeNip88ResponseOptionIds(['b', 'b', 'c'], 'multiplechoice')).toEqual(['b', 'c']);
    expect(
      selectNip88LatestResponsesByPubkey(events, { pollEventId: 'poll-id' }).map(
        (event) => event.id
      )
    ).toEqual(['bob', 'latest']);
    expect(
      tallyNip88Responses(events, {
        pollEventId: 'poll-id',
        pollType: 'multiplechoice',
        optionIds: ['a', 'b', 'c']
      })
    ).toMatchObject({
      totals: { a: 1, b: 1, c: 1 },
      totalRespondents: 2
    });
    expect(
      tallyNip88Responses(events, {
        pollEventId: 'poll-id',
        pollType: 'singlechoice',
        until: 15,
        optionIds: ['a', 'b', 'c']
      })
    ).toMatchObject({
      totals: { a: 2, b: 0, c: 0 },
      totalRespondents: 2
    });
  });

  it('exposes tag helpers and rejects malformed poll data', () => {
    expect(NIP88_DEFAULT_POLL_TYPE).toBe('singlechoice');
    expect(isNip88PollType('multiplechoice')).toBe(true);
    expect(isNip88PollType('ranked')).toBe(false);
    expect(buildNip88OptionTag({ id: 'abc123', label: 'Option' })).toEqual([
      'option',
      'abc123',
      'Option'
    ]);
    expect(buildNip88RelayTag('wss://relay')).toEqual(['relay', 'wss://relay']);
    expect(buildNip88PollTypeTag('multiplechoice')).toEqual(['polltype', 'multiplechoice']);
    expect(buildNip88EndsAtTag('123')).toEqual(['endsAt', '123']);
    expect(parseNip88Options([['option', 'abc123', 'Option']])).toEqual([
      { id: 'abc123', label: 'Option' }
    ]);
    expect(parseNip88Poll({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNip88Poll({ kind: 1068, content: '', tags: [] })).toBeNull();
    expect(parseNip88Response({ kind: 1018, content: '', tags: [] })).toBeNull();
    expect(() => buildNip88Poll({ label: 'Empty', options: [] })).toThrow(
      'NIP-88 poll requires at least one option'
    );
    expect(() =>
      buildNip88Poll({
        label: 'Duplicate',
        options: [
          { id: 'a', label: 'A' },
          { id: 'a', label: 'Again' }
        ]
      })
    ).toThrow('NIP-88 duplicate option id: a');
    expect(() => buildNip88Response({ pollEventId: 'poll', optionIds: ['bad-id'] })).toThrow(
      'NIP-88 option id must be alphanumeric: bad-id'
    );
  });
});
