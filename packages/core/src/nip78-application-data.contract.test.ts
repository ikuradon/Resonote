import { describe, expect, it } from 'vitest';

import {
  buildNip78ApplicationDataEvent,
  NIP78_APPLICATION_DATA_KIND,
  parseNip78ApplicationDataEvent,
  parseNip78Identifier
} from './index.js';

describe('NIP-78 application data events', () => {
  it('builds addressable application data with a canonical d tag', () => {
    expect(
      buildNip78ApplicationDataEvent({
        identifier: ' com.example.settings ',
        content: '{"theme":"dark"}',
        tags: [
          ['client', 'Resonote'],
          ['d', 'ignored-duplicate']
        ]
      })
    ).toEqual({
      kind: NIP78_APPLICATION_DATA_KIND,
      content: '{"theme":"dark"}',
      tags: [
        ['d', 'com.example.settings'],
        ['client', 'Resonote']
      ]
    });
  });

  it('parses app data snapshots and preserves arbitrary custom tags', () => {
    expect(
      parseNip78ApplicationDataEvent({
        kind: NIP78_APPLICATION_DATA_KIND,
        pubkey: 'author-pubkey',
        created_at: 123,
        content: 'opaque payload',
        tags: [
          ['d', 'app/context'],
          ['schema', 'v2'],
          ['encrypted', 'true']
        ]
      })
    ).toEqual({
      identifier: 'app/context',
      content: 'opaque payload',
      pubkey: 'author-pubkey',
      createdAt: 123,
      tags: [
        ['d', 'app/context'],
        ['schema', 'v2'],
        ['encrypted', 'true']
      ],
      customTags: [
        ['schema', 'v2'],
        ['encrypted', 'true']
      ]
    });
  });

  it('requires a non-empty d tag on build and parse', () => {
    expect(() => buildNip78ApplicationDataEvent({ identifier: ' ' })).toThrow(
      'NIP-78 application data identifier must not be empty'
    );

    expect(parseNip78Identifier([['d', '  app-id  ']])).toBe('app-id');
    expect(parseNip78Identifier([['client', 'Resonote']])).toBeNull();
    expect(
      parseNip78ApplicationDataEvent({
        kind: NIP78_APPLICATION_DATA_KIND,
        content: '',
        tags: [['d', '']]
      })
    ).toBeNull();
    expect(
      parseNip78ApplicationDataEvent({
        kind: 1,
        content: '',
        tags: [['d', 'app']]
      })
    ).toBeNull();
  });
});
