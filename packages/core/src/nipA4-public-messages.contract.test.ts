import { describe, expect, it } from 'vitest';

import {
  buildNipA4PublicMessage,
  buildNipA4PublicMessageFilter,
  buildNipA4QuoteTag,
  buildNipA4ReceiverTag,
  buildNipA4ResponseKindTag,
  hasNipA4ForbiddenEventTags,
  isNipA4PublicMessageKind,
  NIPA4_PUBLIC_MESSAGE_KIND,
  parseNipA4PublicMessage,
  parseNipA4Quotes,
  parseNipA4Receivers
} from './index.js';

describe('NIP-A4 public messages', () => {
  const hash = 'a'.repeat(64);

  it('builds kind:24 public messages with receivers, expiration, quotes, and imeta', () => {
    const event = buildNipA4PublicMessage({
      content: 'Plain public message with https://media.example/photo.jpg',
      receivers: [
        { pubkey: ' receiver-a ', relayHint: 'wss://relay.example' },
        { pubkey: 'receiver-b' }
      ],
      expiration: 1_800_000_000,
      quotes: [
        { value: 'quoted-event', relayHint: 'wss://quotes.example', pubkey: 'quoted-author' }
      ],
      attachments: [
        {
          url: 'https://media.example/photo.jpg',
          mediaType: 'IMAGE/JPEG',
          hash: hash.toUpperCase()
        }
      ],
      tags: [
        ['p', 'ignored-structured-receiver'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIPA4_PUBLIC_MESSAGE_KIND,
      content: 'Plain public message with https://media.example/photo.jpg',
      tags: [
        ['p', 'receiver-a', 'wss://relay.example'],
        ['p', 'receiver-b'],
        ['expiration', '1800000000'],
        ['q', 'quoted-event', 'wss://quotes.example', 'quoted-author'],
        ['imeta', 'url https://media.example/photo.jpg', 'm image/jpeg', `x ${hash}`],
        ['client', 'resonote']
      ]
    });
  });

  it('parses valid public message snapshots and content-matched media attachments', () => {
    const event = buildNipA4PublicMessage({
      content: 'See https://media.example/photo.jpg',
      receivers: [{ pubkey: 'receiver', relayHint: 'wss://receiver.example' }],
      expiration: 2_000,
      quotes: [{ value: '30023:author:article', pubkey: 'quoted-author' }],
      attachments: [{ url: 'https://media.example/photo.jpg', mediaType: 'image/jpeg', hash }],
      tags: [['client', 'resonote']]
    });

    const snapshot = parseNipA4PublicMessage({
      ...event,
      pubkey: 'sender',
      created_at: 1_000,
      id: 'event-id'
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        kind: NIPA4_PUBLIC_MESSAGE_KIND,
        content: 'See https://media.example/photo.jpg',
        receivers: [
          {
            pubkey: 'receiver',
            relayHint: 'wss://receiver.example',
            tag: ['p', 'receiver', 'wss://receiver.example']
          }
        ],
        expiration: 2_000,
        quotes: [
          {
            value: '30023:author:article',
            relayHint: null,
            pubkey: 'quoted-author',
            tag: ['q', '30023:author:article', '', 'quoted-author']
          }
        ],
        customTags: [['client', 'resonote']],
        pubkey: 'sender',
        createdAt: 1_000,
        id: 'event-id'
      })
    );
    expect(snapshot?.attachments).toHaveLength(1);
    expect(snapshot?.attachments[0]).toEqual(
      expect.objectContaining({
        url: 'https://media.example/photo.jpg',
        mediaType: 'image/jpeg',
        hash
      })
    );
  });

  it('rejects missing receivers and forbidden e tags', () => {
    expect(() => buildNipA4PublicMessage({ content: 'hi', receivers: [] })).toThrow(
      /at least one receiver/
    );
    expect(() =>
      buildNipA4PublicMessage({
        content: 'hi',
        receivers: [{ pubkey: 'receiver' }],
        tags: [['e', 'thread-root']]
      })
    ).toThrow(/must not use e tags/);

    expect(
      parseNipA4PublicMessage({
        kind: NIPA4_PUBLIC_MESSAGE_KIND,
        content: 'hi',
        tags: [
          ['p', 'receiver'],
          ['e', 'thread-root']
        ]
      })
    ).toBeNull();
    expect(
      parseNipA4PublicMessage({ kind: NIPA4_PUBLIC_MESSAGE_KIND, content: 'hi', tags: [] })
    ).toBeNull();
  });

  it('builds and parses receiver, quote, response kind, and relay filters', () => {
    expect(isNipA4PublicMessageKind(24)).toBe(true);
    expect(isNipA4PublicMessageKind(1)).toBe(false);
    expect(
      buildNipA4ReceiverTag({ pubkey: ' receiver ', relayHint: 'wss://relay.example' })
    ).toEqual(['p', 'receiver', 'wss://relay.example']);
    expect(buildNipA4QuoteTag({ value: 'quoted-event', pubkey: 'quoted-author' })).toEqual([
      'q',
      'quoted-event',
      '',
      'quoted-author'
    ]);
    expect(buildNipA4ResponseKindTag()).toEqual(['k', '24']);
    expect(parseNipA4Receivers([['p', 'receiver', 'wss://relay.example']])).toEqual([
      {
        pubkey: 'receiver',
        relayHint: 'wss://relay.example',
        tag: ['p', 'receiver', 'wss://relay.example']
      }
    ]);
    expect(parseNipA4Quotes([['q', 'quoted-event', 'wss://relay.example', 'author']])).toEqual([
      {
        value: 'quoted-event',
        relayHint: 'wss://relay.example',
        pubkey: 'author',
        tag: ['q', 'quoted-event', 'wss://relay.example', 'author']
      }
    ]);
    expect(hasNipA4ForbiddenEventTags([['e', 'event']])).toBe(true);
    expect(
      buildNipA4PublicMessageFilter({
        receivers: [' receiver '],
        authors: [' author '],
        since: 10,
        until: 20,
        limit: 5
      })
    ).toEqual({
      kinds: [NIPA4_PUBLIC_MESSAGE_KIND],
      '#p': ['receiver'],
      authors: ['author'],
      since: 10,
      until: 20,
      limit: 5
    });
  });
});
