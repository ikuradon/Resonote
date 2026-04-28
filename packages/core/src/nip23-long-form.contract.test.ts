import { describe, expect, it } from 'vitest';

import {
  buildNip23LongFormEvent,
  isNip23LongFormKind,
  NIP23_LONG_FORM_DRAFT_KIND,
  NIP23_LONG_FORM_KIND,
  parseNip23LongFormEvent,
  parseNip23LongFormMetadata
} from './index.js';

describe('NIP-23 long-form content events', () => {
  it('builds addressable article events with standardized metadata tags', () => {
    expect(
      buildNip23LongFormEvent({
        identifier: ' article-id ',
        content: '# Title\n\nMarkdown body',
        createdAt: 100,
        title: ' Article Title ',
        image: ' https://example.test/image.png ',
        summary: ' Short summary ',
        publishedAt: 90,
        topics: ['nostr', ' nostr ', '', 'longform'],
        tags: [
          ['e', 'event-id', 'wss://relay.example'],
          ['title', 'ignored duplicate'],
          ['client', 'Resonote']
        ]
      })
    ).toEqual({
      kind: NIP23_LONG_FORM_KIND,
      created_at: 100,
      content: '# Title\n\nMarkdown body',
      tags: [
        ['d', 'article-id'],
        ['title', 'Article Title'],
        ['image', 'https://example.test/image.png'],
        ['summary', 'Short summary'],
        ['published_at', '90'],
        ['t', 'nostr'],
        ['t', 'nostr'],
        ['t', 'longform'],
        ['e', 'event-id', 'wss://relay.example'],
        ['client', 'Resonote']
      ]
    });
  });

  it('parses articles, draft articles, reference tags, custom tags, and metadata', () => {
    expect(isNip23LongFormKind(NIP23_LONG_FORM_KIND)).toBe(true);
    expect(isNip23LongFormKind(NIP23_LONG_FORM_DRAFT_KIND)).toBe(true);
    expect(isNip23LongFormKind(1)).toBe(false);

    expect(
      parseNip23LongFormEvent({
        kind: NIP23_LONG_FORM_DRAFT_KIND,
        pubkey: 'author',
        created_at: 120,
        content: 'Markdown body',
        tags: [
          ['d', 'draft-id'],
          ['title', 'Draft Title'],
          ['published_at', '90'],
          ['t', 'nostr'],
          ['t', 'nostr'],
          ['a', '30023:author:article-id', 'wss://relay.example'],
          ['client', 'Resonote']
        ]
      })
    ).toEqual({
      kind: NIP23_LONG_FORM_DRAFT_KIND,
      content: 'Markdown body',
      metadata: {
        identifier: 'draft-id',
        title: 'Draft Title',
        image: null,
        summary: null,
        publishedAt: 90,
        topics: ['nostr']
      },
      pubkey: 'author',
      createdAt: 120,
      tags: [
        ['d', 'draft-id'],
        ['title', 'Draft Title'],
        ['published_at', '90'],
        ['t', 'nostr'],
        ['t', 'nostr'],
        ['a', '30023:author:article-id', 'wss://relay.example'],
        ['client', 'Resonote']
      ],
      referenceTags: [['a', '30023:author:article-id', 'wss://relay.example']],
      customTags: [['client', 'Resonote']]
    });
  });

  it('rejects unsupported kinds, missing d tags, invalid identifiers, and invalid timestamps', () => {
    expect(() => buildNip23LongFormEvent({ identifier: '', content: '' })).toThrow(
      'NIP-23 long-form identifier must not be empty'
    );
    expect(() =>
      buildNip23LongFormEvent({
        identifier: 'article',
        content: '',
        publishedAt: -1
      })
    ).toThrow('NIP-23 published_at must be a non-negative safe integer');
    expect(
      parseNip23LongFormEvent({
        kind: NIP23_LONG_FORM_KIND,
        content: '',
        tags: [['title', 'missing d']]
      })
    ).toBeNull();
    expect(
      parseNip23LongFormEvent({
        kind: 1,
        content: '',
        tags: [['d', 'article']]
      })
    ).toBeNull();
    expect(
      parseNip23LongFormMetadata([
        ['d', 'article'],
        ['published_at', 'invalid']
      ])
    ).toBeNull();
  });
});
