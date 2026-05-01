import { describe, expect, it } from 'vitest';

import {
  buildNip7dThreadEvent,
  buildNip7dThreadReplyTags,
  isNip7dThreadEvent,
  isNip7dThreadReply,
  NIP7D_THREAD_KIND,
  NIP7D_THREAD_REPLY_KIND,
  parseNip7dThreadEvent,
  parseNip7dThreadReplyRoot
} from './index.js';

describe('NIP-7D thread events', () => {
  it('builds kind:11 thread events with optional titles', () => {
    expect(
      buildNip7dThreadEvent({
        content: 'Good morning',
        title: ' GM ',
        createdAt: 100,
        tags: [
          ['title', 'ignored duplicate'],
          ['t', 'nostr']
        ]
      })
    ).toEqual({
      kind: NIP7D_THREAD_KIND,
      created_at: 100,
      content: 'Good morning',
      tags: [
        ['title', 'GM'],
        ['t', 'nostr']
      ]
    });
  });

  it('parses thread snapshots', () => {
    expect(
      parseNip7dThreadEvent({
        kind: NIP7D_THREAD_KIND,
        pubkey: 'thread-author',
        created_at: 100,
        content: 'Good morning',
        tags: [
          ['title', 'GM'],
          ['client', 'Resonote']
        ]
      })
    ).toEqual({
      content: 'Good morning',
      title: 'GM',
      pubkey: 'thread-author',
      createdAt: 100,
      tags: [
        ['title', 'GM'],
        ['client', 'Resonote']
      ],
      customTags: [['client', 'Resonote']]
    });

    expect(parseNip7dThreadEvent({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(isNip7dThreadEvent({ kind: NIP7D_THREAD_KIND })).toBe(true);
  });

  it('builds NIP-22 root comment tags for thread replies', () => {
    expect(
      buildNip7dThreadReplyTags({
        threadId: ' thread-id ',
        threadPubkey: ' thread-pubkey ',
        relayUrl: ' wss://relay.example ',
        tags: [
          ['K', 'ignored'],
          ['E', 'ignored'],
          ['client', 'Resonote']
        ]
      })
    ).toEqual([
      ['K', '11'],
      ['E', 'thread-id', 'wss://relay.example', 'thread-pubkey'],
      ['client', 'Resonote']
    ]);
  });

  it('parses thread reply root tags', () => {
    const reply = {
      kind: NIP7D_THREAD_REPLY_KIND,
      tags: [
        ['K', '11'],
        ['E', 'thread-id', 'wss://relay.example', 'thread-pubkey']
      ]
    };

    expect(parseNip7dThreadReplyRoot(reply)).toEqual({
      threadId: 'thread-id',
      relayUrl: 'wss://relay.example',
      threadPubkey: 'thread-pubkey'
    });
    expect(isNip7dThreadReply(reply)).toBe(true);
    expect(
      parseNip7dThreadReplyRoot({ kind: NIP7D_THREAD_REPLY_KIND, tags: [['K', '1']] })
    ).toBeNull();
    expect(() =>
      buildNip7dThreadReplyTags({
        threadId: '',
        threadPubkey: 'thread-pubkey'
      })
    ).toThrow('NIP-7D thread id must not be empty');
  });
});
