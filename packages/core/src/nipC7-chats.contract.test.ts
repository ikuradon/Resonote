import { describe, expect, it } from 'vitest';

import {
  buildNipC7ChatMessage,
  buildNipC7ChatMessageFilter,
  buildNipC7ChatReply,
  buildNipC7ReplyQuoteTag,
  isNipC7ChatMessageKind,
  NIPC7_CHAT_MESSAGE_KIND,
  parseNipC7ChatMessage,
  parseNipC7ReplyQuoteTags
} from './index.js';

describe('NIP-C7 chats', () => {
  it('builds kind:9 chat messages', () => {
    expect(
      buildNipC7ChatMessage({
        content: 'GM',
        tags: [
          ['q', 'ignored-parent'],
          ['client', 'resonote']
        ]
      })
    ).toEqual({
      kind: NIPC7_CHAT_MESSAGE_KIND,
      content: 'GM',
      tags: [['client', 'resonote']]
    });
  });

  it('builds and parses kind:9 replies with q tags', () => {
    const event = buildNipC7ChatReply({
      content: 'nostr:nevent1...\nyes',
      parent: {
        eventId: 'parent-event',
        relayHint: 'wss://relay.example',
        pubkey: 'parent-author'
      },
      tags: [['client', 'resonote']]
    });

    expect(event).toEqual({
      kind: NIPC7_CHAT_MESSAGE_KIND,
      content: 'nostr:nevent1...\nyes',
      tags: [
        ['q', 'parent-event', 'wss://relay.example', 'parent-author'],
        ['client', 'resonote']
      ]
    });
    expect(
      parseNipC7ChatMessage({
        ...event,
        pubkey: 'author',
        created_at: 123,
        id: 'event-id'
      })
    ).toEqual({
      kind: NIPC7_CHAT_MESSAGE_KIND,
      content: 'nostr:nevent1...\nyes',
      reply: {
        eventId: 'parent-event',
        relayHint: 'wss://relay.example',
        pubkey: 'parent-author',
        tag: ['q', 'parent-event', 'wss://relay.example', 'parent-author']
      },
      quotes: [
        {
          eventId: 'parent-event',
          relayHint: 'wss://relay.example',
          pubkey: 'parent-author',
          tag: ['q', 'parent-event', 'wss://relay.example', 'parent-author']
        }
      ],
      customTags: [['client', 'resonote']],
      pubkey: 'author',
      createdAt: 123,
      id: 'event-id'
    });
  });

  it('rejects blank content and non-chat events', () => {
    expect(() => buildNipC7ChatMessage({ content: '   ' })).toThrow(/message content/);
    expect(parseNipC7ChatMessage({ kind: 1, content: 'GM', tags: [] })).toBeNull();
    expect(
      parseNipC7ChatMessage({ kind: NIPC7_CHAT_MESSAGE_KIND, content: '', tags: [] })
    ).toBeNull();
  });

  it('builds reply quote tags and relay filters', () => {
    expect(isNipC7ChatMessageKind(9)).toBe(true);
    expect(isNipC7ChatMessageKind(1)).toBe(false);
    expect(buildNipC7ReplyQuoteTag({ eventId: 'parent', pubkey: 'parent-author' })).toEqual([
      'q',
      'parent',
      '',
      'parent-author'
    ]);
    expect(parseNipC7ReplyQuoteTags([['q', 'parent', 'wss://relay.example', 'author']])).toEqual([
      {
        eventId: 'parent',
        relayHint: 'wss://relay.example',
        pubkey: 'author',
        tag: ['q', 'parent', 'wss://relay.example', 'author']
      }
    ]);
    expect(
      buildNipC7ChatMessageFilter({
        authors: [' author '],
        since: 10,
        until: 20,
        limit: 5
      })
    ).toEqual({
      kinds: [NIPC7_CHAT_MESSAGE_KIND],
      authors: ['author'],
      since: 10,
      until: 20,
      limit: 5
    });
  });
});
