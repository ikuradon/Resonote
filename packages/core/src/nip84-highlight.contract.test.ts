import { describe, expect, it } from 'vitest';

import {
  buildNip84AddressSourceTag,
  buildNip84EventSourceTag,
  buildNip84HighlightEvent,
  buildNip84PubkeyAttributionTag,
  buildNip84PubkeyMentionTag,
  buildNip84SourceUrlTag,
  buildNip84UrlMentionTag,
  isNip84HighlightEvent,
  NIP84_HIGHLIGHT_KIND,
  NIP84_MENTION_MARKER,
  NIP84_SOURCE_MARKER,
  parseNip84HighlightEvent,
  parseNip84PubkeyAttributions,
  parseNip84PubkeyMentions,
  parseNip84SourceUrlTags,
  parseNip84UrlMentions
} from './index.js';

describe('NIP-84 highlights', () => {
  it('builds and parses highlight events with sources, attribution, context, and quote metadata', () => {
    const event = buildNip84HighlightEvent({
      content: 'Orange highlights',
      eventSources: [{ eventId: 'source-event', relayHint: 'wss://relay.example' }],
      addressSources: [
        {
          address: '30023:alice:purple-text',
          relayHint: 'wss://articles.example',
          marker: 'root'
        }
      ],
      urlSources: [{ url: 'https://example.com/article?clean=1' }],
      attributions: [
        { pubkey: 'author-pubkey', relayHint: 'wss://authors.example', role: 'author' },
        { pubkey: 'editor-pubkey', role: 'editor' }
      ],
      context: 'Purple text, orange highlights, and surrounding paragraph context.',
      comment: 'This is the part worth quoting.',
      pubkeyMentions: [{ pubkey: 'mention-pubkey', relayHint: 'wss://mentions.example' }],
      urlMentions: [{ url: 'https://example.com/mentioned' }],
      tags: [
        ['p', 'ignored-structured'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP84_HIGHLIGHT_KIND,
      content: 'Orange highlights',
      tags: [
        ['e', 'source-event', 'wss://relay.example'],
        ['a', '30023:alice:purple-text', 'wss://articles.example', 'root'],
        ['r', 'https://example.com/article?clean=1', NIP84_SOURCE_MARKER],
        ['p', 'author-pubkey', 'wss://authors.example', 'author'],
        ['p', 'editor-pubkey', '', 'editor'],
        ['context', 'Purple text, orange highlights, and surrounding paragraph context.'],
        ['comment', 'This is the part worth quoting.'],
        ['p', 'mention-pubkey', 'wss://mentions.example', NIP84_MENTION_MARKER],
        ['r', 'https://example.com/mentioned', NIP84_MENTION_MARKER],
        ['client', 'resonote']
      ]
    });

    expect(parseNip84HighlightEvent({ ...event, pubkey: 'alice', created_at: 123 })).toEqual({
      kind: NIP84_HIGHLIGHT_KIND,
      content: 'Orange highlights',
      eventSources: [{ eventId: 'source-event', relayHint: 'wss://relay.example', marker: null }],
      addressSources: [
        {
          address: '30023:alice:purple-text',
          relayHint: 'wss://articles.example',
          marker: 'root'
        }
      ],
      urlSources: [{ url: 'https://example.com/article?clean=1', marker: NIP84_SOURCE_MARKER }],
      attributions: [
        { pubkey: 'author-pubkey', relayHint: 'wss://authors.example', role: 'author' },
        { pubkey: 'editor-pubkey', relayHint: null, role: 'editor' }
      ],
      context: 'Purple text, orange highlights, and surrounding paragraph context.',
      comment: 'This is the part worth quoting.',
      pubkeyMentions: [{ pubkey: 'mention-pubkey', relayHint: 'wss://mentions.example' }],
      urlMentions: [{ url: 'https://example.com/mentioned' }],
      customTags: [['client', 'resonote']],
      pubkey: 'alice',
      createdAt: 123
    });
  });

  it('exposes source, attribution, and mention tag helpers', () => {
    expect(buildNip84EventSourceTag({ eventId: 'event-id', marker: 'root' })).toEqual([
      'e',
      'event-id',
      '',
      'root'
    ]);
    expect(buildNip84AddressSourceTag({ address: '30023:alice:article' })).toEqual([
      'a',
      '30023:alice:article'
    ]);
    expect(buildNip84SourceUrlTag({ url: 'https://example.com', marker: null })).toEqual([
      'r',
      'https://example.com'
    ]);
    expect(buildNip84PubkeyAttributionTag({ pubkey: 'alice' })).toEqual(['p', 'alice']);
    expect(buildNip84PubkeyMentionTag({ pubkey: 'bob' })).toEqual([
      'p',
      'bob',
      '',
      NIP84_MENTION_MARKER
    ]);
    expect(buildNip84UrlMentionTag({ url: 'https://example.com/comment-url' })).toEqual([
      'r',
      'https://example.com/comment-url',
      NIP84_MENTION_MARKER
    ]);
  });

  it('parses source tags separately from quote-highlight mentions and rejects malformed events', () => {
    const tags = [
      ['r', 'https://example.com/source', NIP84_SOURCE_MARKER],
      ['r', 'https://example.com/legacy-source'],
      ['r', 'https://example.com/comment-url', NIP84_MENTION_MARKER],
      ['p', 'author', '', 'author'],
      ['p', 'mentioned', '', NIP84_MENTION_MARKER],
      ['p', '']
    ];

    expect(parseNip84SourceUrlTags(tags)).toEqual([
      { url: 'https://example.com/source', marker: NIP84_SOURCE_MARKER },
      { url: 'https://example.com/legacy-source', marker: null }
    ]);
    expect(parseNip84UrlMentions(tags)).toEqual([{ url: 'https://example.com/comment-url' }]);
    expect(parseNip84PubkeyAttributions(tags)).toEqual([
      { pubkey: 'author', relayHint: null, role: 'author' }
    ]);
    expect(parseNip84PubkeyMentions(tags)).toEqual([{ pubkey: 'mentioned', relayHint: null }]);
    expect(isNip84HighlightEvent({ kind: NIP84_HIGHLIGHT_KIND })).toBe(true);
    expect(parseNip84HighlightEvent({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNip84HighlightEvent({ kind: 9802, content: '', tags: [] })).toEqual({
      kind: NIP84_HIGHLIGHT_KIND,
      content: '',
      eventSources: [],
      addressSources: [],
      urlSources: [],
      attributions: [],
      context: null,
      comment: null,
      pubkeyMentions: [],
      urlMentions: [],
      customTags: [],
      pubkey: null,
      createdAt: null
    });
    expect(() => buildNip84EventSourceTag({ eventId: '' })).toThrow(
      'NIP-84 event source id must not be empty'
    );
    expect(() => buildNip84UrlMentionTag({ url: '   ' })).toThrow(
      'NIP-84 mention URL must not be empty'
    );
  });
});
