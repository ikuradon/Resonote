import { describe, expect, it } from 'vitest';

import {
  buildNip28CategoryTag,
  buildNip28ChannelCreateEvent,
  buildNip28ChannelMessageEvent,
  buildNip28ChannelMessageFilter,
  buildNip28ChannelMetadataEvent,
  buildNip28ChannelMetadataFilter,
  buildNip28HideMessageEvent,
  buildNip28MuteUserEvent,
  buildNip28PubkeyTag,
  buildNip28ReplyTag,
  buildNip28RootTag,
  isNip28ChannelKind,
  NIP28_CHANNEL_CREATE_KIND,
  NIP28_CHANNEL_MESSAGE_KIND,
  NIP28_CHANNEL_METADATA_KIND,
  NIP28_HIDE_MESSAGE_KIND,
  NIP28_MUTE_USER_KIND,
  parseNip28Categories,
  parseNip28ChannelMessageEvent,
  parseNip28ChannelMetadataEvent,
  parseNip28ChannelMetadataJson,
  parseNip28EventReferences,
  parseNip28HideMessageEvent,
  parseNip28MuteUserEvent,
  parseNip28PubkeyReferences,
  stringifyNip28ChannelMetadata
} from './index.js';

describe('NIP-28 public chat', () => {
  const channelId = 'a'.repeat(64);
  const replyId = 'b'.repeat(64);
  const author = 'c'.repeat(64);
  const muted = 'd'.repeat(64);

  it('builds and parses channel creation and metadata events', () => {
    const create = buildNip28ChannelCreateEvent({
      metadata: {
        name: '  Demo Channel  ',
        about: 'A test channel',
        picture: 'https://cdn.example/channel.png',
        relays: [' wss://relay.example '],
        theme: 'music'
      },
      tags: [['client', 'resonote']]
    });
    expect(create).toEqual({
      kind: NIP28_CHANNEL_CREATE_KIND,
      content:
        '{"name":"Demo Channel","about":"A test channel","picture":"https://cdn.example/channel.png","relays":["wss://relay.example"],"theme":"music"}',
      tags: [['client', 'resonote']]
    });

    const metadata = buildNip28ChannelMetadataEvent({
      channelId,
      relayHint: 'wss://relay.example',
      metadata: { name: 'Updated', relays: ['wss://relay.example'] },
      categories: ['music', 'nostr'],
      tags: [
        ['e', 'ignored'],
        ['t', 'ignored'],
        ['client', 'resonote']
      ]
    });
    expect(metadata).toEqual({
      kind: NIP28_CHANNEL_METADATA_KIND,
      content: '{"name":"Updated","relays":["wss://relay.example"]}',
      tags: [
        ['e', channelId, 'wss://relay.example', 'root'],
        ['t', 'music'],
        ['t', 'nostr'],
        ['client', 'resonote']
      ]
    });
    expect(
      parseNip28ChannelMetadataEvent({
        ...metadata,
        pubkey: author,
        created_at: 123,
        id: 'event-id'
      })
    ).toEqual({
      kind: NIP28_CHANNEL_METADATA_KIND,
      metadata: { name: 'Updated', relays: ['wss://relay.example'] },
      channel: {
        eventId: channelId,
        relayHint: 'wss://relay.example',
        marker: 'root',
        tag: ['e', channelId, 'wss://relay.example', 'root']
      },
      categories: ['music', 'nostr'],
      customTags: [['client', 'resonote']],
      pubkey: author,
      createdAt: 123,
      id: 'event-id'
    });
  });

  it('builds and parses root and reply channel messages', () => {
    const message = buildNip28ChannelMessageEvent({
      channelId,
      content: 'hello public chat',
      relayHint: 'wss://relay.example',
      reply: {
        eventId: replyId,
        relayHint: 'wss://reply.example',
        pubkey: author,
        pubkeyRelayHint: 'wss://author.example'
      },
      tags: [
        ['e', 'ignored'],
        ['p', 'ignored'],
        ['client', 'resonote']
      ]
    });

    expect(message).toEqual({
      kind: NIP28_CHANNEL_MESSAGE_KIND,
      content: 'hello public chat',
      tags: [
        ['e', channelId, 'wss://relay.example', 'root'],
        ['e', replyId, 'wss://reply.example', 'reply'],
        ['p', author, 'wss://author.example'],
        ['client', 'resonote']
      ]
    });
    expect(
      parseNip28ChannelMessageEvent({
        ...message,
        pubkey: author,
        created_at: 1
      })
    ).toEqual({
      kind: NIP28_CHANNEL_MESSAGE_KIND,
      content: 'hello public chat',
      channel: {
        eventId: channelId,
        relayHint: 'wss://relay.example',
        marker: 'root',
        tag: ['e', channelId, 'wss://relay.example', 'root']
      },
      reply: {
        eventId: replyId,
        relayHint: 'wss://reply.example',
        marker: 'reply',
        tag: ['e', replyId, 'wss://reply.example', 'reply']
      },
      pubkeys: [
        {
          pubkey: author,
          relayHint: 'wss://author.example',
          tag: ['p', author, 'wss://author.example']
        }
      ],
      customTags: [['client', 'resonote']],
      pubkey: author,
      createdAt: 1,
      id: null
    });
  });

  it('builds and parses hide and mute moderation events', () => {
    const hide = buildNip28HideMessageEvent({
      eventId: replyId,
      reason: 'off-topic',
      tags: [['client', 'resonote']]
    });
    expect(hide).toEqual({
      kind: NIP28_HIDE_MESSAGE_KIND,
      content: '{"reason":"off-topic"}',
      tags: [
        ['e', replyId],
        ['client', 'resonote']
      ]
    });
    expect(parseNip28HideMessageEvent({ ...hide, pubkey: author })).toEqual({
      kind: NIP28_HIDE_MESSAGE_KIND,
      eventId: replyId,
      reason: 'off-topic',
      customTags: [['client', 'resonote']],
      pubkey: author,
      createdAt: null,
      id: null
    });

    const mute = buildNip28MuteUserEvent({ pubkey: muted });
    expect(mute).toEqual({
      kind: NIP28_MUTE_USER_KIND,
      content: '',
      tags: [['p', muted]]
    });
    expect(parseNip28MuteUserEvent({ ...mute, pubkey: author })).toEqual({
      kind: NIP28_MUTE_USER_KIND,
      mutedPubkey: muted,
      reason: null,
      customTags: [],
      pubkey: author,
      createdAt: null,
      id: null
    });
  });

  it('builds tags and relay filters', () => {
    expect(isNip28ChannelKind(40)).toBe(true);
    expect(isNip28ChannelKind(1)).toBe(false);
    expect(buildNip28RootTag({ channelId })).toEqual(['e', channelId, '', 'root']);
    expect(buildNip28ReplyTag({ eventId: replyId })).toEqual(['e', replyId, '', 'reply']);
    expect(buildNip28PubkeyTag(author, 'wss://relay.example')).toEqual([
      'p',
      author,
      'wss://relay.example'
    ]);
    expect(buildNip28CategoryTag('music')).toEqual(['t', 'music']);
    expect(
      buildNip28ChannelMessageFilter({
        channelId,
        authors: [author],
        since: 10,
        until: 20,
        limit: 5
      })
    ).toEqual({
      kinds: [NIP28_CHANNEL_MESSAGE_KIND],
      '#e': [channelId],
      authors: [author],
      since: 10,
      until: 20,
      limit: 5
    });
    expect(buildNip28ChannelMetadataFilter({ channelId, categories: ['music'] })).toEqual({
      kinds: [NIP28_CHANNEL_CREATE_KIND, NIP28_CHANNEL_METADATA_KIND],
      '#e': [channelId],
      '#t': ['music']
    });
  });

  it('rejects invalid structured data and parses low-level tags', () => {
    expect(() => buildNip28ChannelMessageEvent({ channelId, content: '   ' })).toThrow(
      /message content/
    );
    expect(() =>
      buildNip28ChannelCreateEvent({
        metadata: { relays: ['https://relay.example'] }
      })
    ).toThrow(/relay URL/);
    expect(parseNip28ChannelMetadataJson('{nope')).toBeNull();
    expect(parseNip28EventReferences([['e', channelId, 'wss://relay.example', 'root']])).toEqual([
      {
        eventId: channelId,
        relayHint: 'wss://relay.example',
        marker: 'root',
        tag: ['e', channelId, 'wss://relay.example', 'root']
      }
    ]);
    expect(parseNip28PubkeyReferences([['p', author]])).toEqual([
      { pubkey: author, relayHint: null, tag: ['p', author] }
    ]);
    expect(parseNip28Categories([['t', ' music ']])).toEqual(['music']);
    expect(stringifyNip28ChannelMetadata({ name: 'demo' })).toBe('{"name":"demo"}');
    expect(parseNip28ChannelMessageEvent({ kind: 1, content: 'no', tags: [] })).toBeNull();
  });
});
