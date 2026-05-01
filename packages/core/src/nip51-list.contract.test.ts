import { describe, expect, it } from 'vitest';

import {
  appendNip51ListTag,
  buildNip51ListEvent,
  detectNip51PrivateContentEncryption,
  getNip51ExpectedPublicTagNames,
  parseNip51ListEvent,
  parseNip51PrivateTagsJson,
  removeNip51ListTags,
  stringifyNip51PrivateTags
} from './index.js';

describe('NIP-51 list model', () => {
  it('parses standard list events with public tags and encrypted private content metadata', () => {
    const snapshot = parseNip51ListEvent({
      kind: 10003,
      pubkey: 'alice',
      created_at: 123,
      tags: [
        ['e', 'note-id', 'wss://relay.example'],
        ['a', '30023:author:article']
      ],
      content: 'nip44-ciphertext'
    });

    expect(snapshot).toEqual({
      kind: 10003,
      listType: 'standard',
      pubkey: 'alice',
      createdAt: 123,
      metadata: {
        identifier: null,
        title: null,
        image: null,
        description: null
      },
      publicTags: [
        ['e', 'note-id', 'wss://relay.example'],
        ['a', '30023:author:article']
      ],
      expectedPublicTagNames: ['e', 'a'],
      privateContent: 'nip44-ciphertext',
      privateContentEncryption: 'nip44'
    });
  });

  it('parses set metadata and requires d tags for parameterized lists', () => {
    expect(
      parseNip51ListEvent({
        kind: 30030,
        pubkey: 'alice',
        created_at: 456,
        tags: [
          ['d', 'custom'],
          ['title', 'Custom'],
          ['image', 'https://example.com/image.png'],
          ['description', 'custom emoji'],
          ['emoji', 'wave', 'https://example.com/wave.png']
        ],
        content: ''
      })
    ).toMatchObject({
      listType: 'set',
      metadata: {
        identifier: 'custom',
        title: 'Custom',
        image: 'https://example.com/image.png',
        description: 'custom emoji'
      },
      publicTags: [['emoji', 'wave', 'https://example.com/wave.png']],
      expectedPublicTagNames: ['emoji']
    });

    expect(
      parseNip51ListEvent({
        kind: 30030,
        pubkey: 'alice',
        created_at: 456,
        tags: [['emoji', 'wave', 'https://example.com/wave.png']],
        content: ''
      })
    ).toBeNull();
  });

  it('recognizes deprecated NIP-51 list forms for transition support', () => {
    expect(
      parseNip51ListEvent({
        kind: 30001,
        pubkey: 'alice',
        created_at: 789,
        tags: [
          ['d', 'bookmark'],
          ['e', 'note-id']
        ],
        content: ''
      })
    ).toMatchObject({
      kind: 30001,
      listType: 'deprecated',
      metadata: { identifier: 'bookmark' },
      expectedPublicTagNames: ['e', 'a'],
      publicTags: [['e', 'note-id']]
    });
  });

  it('serializes and parses decrypted private item JSON arrays', () => {
    const plaintext = stringifyNip51PrivateTags([
      ['p', 'pubkey'],
      ['word', 'secret']
    ]);

    expect(plaintext).toBe('[["p","pubkey"],["word","secret"]]');
    expect(parseNip51PrivateTagsJson(plaintext)).toEqual([
      ['p', 'pubkey'],
      ['word', 'secret']
    ]);
    expect(parseNip51PrivateTagsJson('{"not":"tags"}')).toBeNull();
    expect(parseNip51PrivateTagsJson('[["p"]]')).toBeNull();
  });

  it('detects deprecated NIP-04 ciphertext markers without requiring crypto in core', () => {
    expect(detectNip51PrivateContentEncryption('ciphertext?iv=base64')).toBe('nip04');
    expect(detectNip51PrivateContentEncryption('nip44-ciphertext')).toBe('nip44');
  });

  it('builds list event parameters with metadata first and chronological public items preserved', () => {
    expect(
      buildNip51ListEvent({
        kind: 30003,
        metadata: {
          identifier: 'articles',
          title: 'Articles',
          description: 'Saved articles'
        },
        publicTags: [
          ['a', '30023:author:first'],
          ['a', '30023:author:second']
        ]
      })
    ).toEqual({
      kind: 30003,
      content: '',
      tags: [
        ['d', 'articles'],
        ['title', 'Articles'],
        ['description', 'Saved articles'],
        ['a', '30023:author:first'],
        ['a', '30023:author:second']
      ]
    });
  });

  it('rejects unsupported or malformed list construction', () => {
    expect(() => buildNip51ListEvent({ kind: 30003, publicTags: [] })).toThrow(
      'requires a d tag identifier'
    );
    expect(() =>
      buildNip51ListEvent({
        kind: 10003,
        publicTags: [['e']]
      })
    ).toThrow('NIP-51 list tags require a tag name and value');
  });

  it('provides small public tag helpers for feature actions', () => {
    const tags = appendNip51ListTag([['d', 'bookmarks']], ['i', 'spotify:track:1']);
    expect(tags).toEqual([
      ['d', 'bookmarks'],
      ['i', 'spotify:track:1']
    ]);
    expect(removeNip51ListTags(tags, (tag) => tag[0] === 'i')).toEqual([['d', 'bookmarks']]);
    expect(getNip51ExpectedPublicTagNames(10000)).toEqual(['p', 't', 'word', 'e']);
  });
});
