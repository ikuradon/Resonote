import { describe, expect, it } from 'vitest';

import {
  buildNipA0ParentReferenceTags,
  buildNipA0RootReferenceTags,
  buildNipA0VoiceImetaTag,
  buildNipA0VoiceMessage,
  buildNipA0VoiceMessageFilter,
  buildNipA0VoiceReply,
  isNipA0VoiceMessageKind,
  NIPA0_RECOMMENDED_MAX_DURATION_SECONDS,
  NIPA0_RECOMMENDED_MEDIA_TYPE,
  NIPA0_REPLY_VOICE_MESSAGE_KIND,
  NIPA0_ROOT_VOICE_MESSAGE_KIND,
  parseNipA0VoiceMessage,
  parseNipA0VoicePreview
} from './index.js';

describe('NIP-A0 voice messages', () => {
  it('builds and parses root voice messages with optional NIP-92 preview metadata', () => {
    const event = buildNipA0VoiceMessage({
      audioUrl: 'https://media.example/voice.m4a',
      mediaType: 'audio/mp4',
      waveform: [0, 7, 35, 100],
      duration: 8,
      tags: [
        ['t', 'voice'],
        ['g', 'u4pruydqqvj']
      ]
    });

    expect(event).toEqual({
      kind: NIPA0_ROOT_VOICE_MESSAGE_KIND,
      content: 'https://media.example/voice.m4a',
      tags: [
        [
          'imeta',
          'url https://media.example/voice.m4a',
          'm audio/mp4',
          'waveform 0 7 35 100',
          'duration 8'
        ],
        ['t', 'voice'],
        ['g', 'u4pruydqqvj']
      ]
    });
    expect(
      parseNipA0VoiceMessage({ ...event, pubkey: 'alice', created_at: 123, id: 'voice-id' })
    ).toEqual({
      kind: NIPA0_ROOT_VOICE_MESSAGE_KIND,
      audioUrl: 'https://media.example/voice.m4a',
      preview: {
        mediaType: 'audio/mp4',
        waveform: [0, 7, 35, 100],
        duration: 8,
        tag: [
          'imeta',
          'url https://media.example/voice.m4a',
          'm audio/mp4',
          'waveform 0 7 35 100',
          'duration 8'
        ]
      },
      root: null,
      parent: null,
      customTags: [
        ['t', 'voice'],
        ['g', 'u4pruydqqvj']
      ],
      pubkey: 'alice',
      createdAt: 123,
      id: 'voice-id'
    });
  });

  it('builds and parses reply voice messages with NIP-22 root and parent tags', () => {
    const event = buildNipA0VoiceReply({
      audioUrl: 'https://media.example/reply.m4a',
      waveform: ['1', '2', '3'],
      duration: '12.5',
      root: {
        tagName: 'E',
        value: 'root-event',
        relayHint: 'wss://relay.example',
        pubkey: 'root-author',
        kind: NIPA0_ROOT_VOICE_MESSAGE_KIND
      },
      parent: {
        tagName: 'e',
        value: 'parent-event',
        relayHint: 'wss://relay.example',
        pubkey: 'parent-author',
        kind: NIPA0_REPLY_VOICE_MESSAGE_KIND
      },
      tags: [
        ['k', 'ignored'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIPA0_REPLY_VOICE_MESSAGE_KIND,
      content: 'https://media.example/reply.m4a',
      tags: [
        ['E', 'root-event', 'wss://relay.example', 'root-author'],
        ['K', '1222'],
        ['P', 'root-author'],
        ['e', 'parent-event', 'wss://relay.example', 'parent-author'],
        ['k', '1244'],
        ['p', 'parent-author'],
        ['imeta', 'url https://media.example/reply.m4a', 'waveform 1 2 3', 'duration 12.5'],
        ['client', 'resonote']
      ]
    });
    expect(parseNipA0VoiceMessage({ ...event, pubkey: 'bob', created_at: 456 })).toMatchObject({
      kind: NIPA0_REPLY_VOICE_MESSAGE_KIND,
      audioUrl: 'https://media.example/reply.m4a',
      preview: {
        mediaType: null,
        waveform: [1, 2, 3],
        duration: 12.5
      },
      root: {
        tagName: 'E',
        value: 'root-event',
        kind: '1222',
        relayHint: 'wss://relay.example',
        pubkey: 'root-author'
      },
      parent: {
        tagName: 'e',
        value: 'parent-event',
        kind: '1244',
        relayHint: 'wss://relay.example',
        pubkey: 'parent-author'
      },
      customTags: [['client', 'resonote']],
      pubkey: 'bob',
      createdAt: 456
    });
  });

  it('exposes preview, NIP-22 tag, and filter helpers', () => {
    expect(NIPA0_RECOMMENDED_MEDIA_TYPE).toBe('audio/mp4');
    expect(NIPA0_RECOMMENDED_MAX_DURATION_SECONDS).toBe(60);
    expect(isNipA0VoiceMessageKind(1222)).toBe(true);
    expect(isNipA0VoiceMessageKind(1)).toBe(false);
    expect(
      buildNipA0VoiceImetaTag({
        audioUrl: 'https://media.example/voice.ogg',
        mediaType: 'audio/ogg',
        waveform: [0, 100],
        duration: 3
      })
    ).toEqual([
      'imeta',
      'url https://media.example/voice.ogg',
      'm audio/ogg',
      'waveform 0 100',
      'duration 3'
    ]);
    expect(
      buildNipA0RootReferenceTags({
        tagName: 'I',
        value: 'https://example.com/thread',
        kind: 'web'
      })
    ).toEqual([
      ['I', 'https://example.com/thread'],
      ['K', 'web']
    ]);
    expect(
      buildNipA0ParentReferenceTags({
        tagName: 'i',
        value: 'https://example.com/thread',
        kind: 'web'
      })
    ).toEqual([
      ['i', 'https://example.com/thread'],
      ['k', 'web']
    ]);
    expect(buildNipA0VoiceMessageFilter({ authors: ['alice'], limit: 2 })).toEqual({
      kinds: [1222, 1244],
      authors: ['alice'],
      limit: 2
    });
    expect(
      parseNipA0VoicePreview(
        [buildNipA0VoiceImetaTag({ audioUrl: 'https://media.example/voice.m4a', duration: 2 })],
        'https://media.example/voice.m4a'
      )
    ).toMatchObject({ duration: 2, waveform: [] });
  });

  it('rejects malformed voice messages and preview input', () => {
    expect(parseNipA0VoiceMessage({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNipA0VoiceMessage({ kind: 1222, content: ' ', tags: [] })).toBeNull();
    expect(
      parseNipA0VoiceMessage({
        kind: 1244,
        content: 'https://media.example/reply.m4a',
        tags: [['e', 'parent']]
      })
    ).toBeNull();
    expect(() =>
      buildNipA0VoiceMessage({
        audioUrl: 'https://media.example/voice.m4a',
        waveform: [101]
      })
    ).toThrow('NIP-A0 waveform values must be integers from 0 to 100');
    expect(() =>
      buildNipA0VoiceMessage({
        audioUrl: 'https://media.example/voice.m4a',
        duration: -1
      })
    ).toThrow('NIP-A0 duration must be a non-negative finite number of seconds');
    expect(() => buildNipA0VoiceMessageFilter({ kinds: [1 as never] })).toThrow(
      'Unsupported NIP-A0 voice message kind: 1'
    );
  });
});
