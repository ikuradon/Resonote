import { describe, expect, it } from 'vitest';

import {
  buildNip24ExternalIdTag,
  buildNip24HashtagTag,
  buildNip24ProfileMetadata,
  buildNip24TitleTag,
  buildNip24WebUrlTag,
  isNip24ContactListEvent,
  isNip24ProfileMetadataEvent,
  NIP24_CONTACT_LIST_KIND,
  NIP24_EXTERNAL_ID_TAG,
  NIP24_HASHTAG_TAG,
  NIP24_PROFILE_METADATA_KIND,
  NIP24_TITLE_TAG,
  NIP24_WEB_URL_TAG,
  normalizeNip24Hashtag,
  parseNip24DeprecatedFollowRelayMapJson,
  parseNip24GenericTags,
  parseNip24ProfileMetadataJson,
  stringifyNip24ProfileMetadata
} from './index.js';

describe('NIP-24 extra metadata and tags', () => {
  it('parses kind:0 extra profile metadata and deprecated aliases', () => {
    expect(
      parseNip24ProfileMetadataJson(
        JSON.stringify({
          name: 'alice',
          display_name: 'Alice Display',
          displayName: 'Deprecated Alice',
          username: 'alice_old',
          picture: 'https://example.com/picture.png',
          about: 'hello',
          nip05: 'alice@example.com',
          website: 'https://example.com',
          banner: 'https://example.com/banner.png',
          bot: false,
          birthday: { year: 2000, month: 2, day: 29 }
        })
      )
    ).toMatchObject({
      name: 'alice',
      displayName: 'Alice Display',
      picture: 'https://example.com/picture.png',
      about: 'hello',
      nip05: 'alice@example.com',
      website: 'https://example.com',
      banner: 'https://example.com/banner.png',
      bot: false,
      birthday: { year: 2000, month: 2, day: 29 },
      deprecated: {
        displayName: 'Deprecated Alice',
        username: 'alice_old'
      }
    });
  });

  it('builds and stringifies kind:0 metadata with display_name and without deprecated aliases', () => {
    const metadata = buildNip24ProfileMetadata({
      name: ' alice ',
      displayName: ' Alice Display ',
      website: ' https://example.com ',
      banner: ' https://example.com/banner.png ',
      bot: true,
      birthday: { year: 1999, month: 12, day: 31 },
      extra: {
        displayName: 'stale',
        username: 'stale',
        custom: 'kept'
      }
    });

    expect(metadata).toEqual({
      custom: 'kept',
      name: 'alice',
      display_name: 'Alice Display',
      website: 'https://example.com',
      banner: 'https://example.com/banner.png',
      bot: true,
      birthday: { year: 1999, month: 12, day: 31 }
    });
    expect(JSON.parse(stringifyNip24ProfileMetadata({ displayName: 'Alice' }))).toEqual({
      display_name: 'Alice'
    });
  });

  it('parses deprecated kind:3 relay maps so callers can ignore them in favor of NIP-65', () => {
    expect(
      parseNip24DeprecatedFollowRelayMapJson(
        JSON.stringify({
          'wss://relay.example': { read: true, write: false },
          'wss://write.example': { write: true },
          notRelay: 'ignored'
        })
      )
    ).toEqual([
      { relay: 'wss://relay.example', read: true, write: false },
      { relay: 'wss://write.example', read: false, write: true }
    ]);
    expect(parseNip24DeprecatedFollowRelayMapJson('[]')).toBeNull();
  });

  it('builds generic r/i/title/t tags with lowercase hashtag normalization', () => {
    expect(buildNip24WebUrlTag(' https://example.com ')).toEqual([
      NIP24_WEB_URL_TAG,
      'https://example.com'
    ]);
    expect(buildNip24ExternalIdTag(' spotify:track:abc ', ' https://spotify.example/abc ')).toEqual(
      [NIP24_EXTERNAL_ID_TAG, 'spotify:track:abc', 'https://spotify.example/abc']
    );
    expect(buildNip24TitleTag(' Title ')).toEqual([NIP24_TITLE_TAG, 'Title']);
    expect(buildNip24HashtagTag('#Nostr')).toEqual([NIP24_HASHTAG_TAG, 'nostr']);
    expect(normalizeNip24Hashtag(' Topic ')).toBe('topic');
  });

  it('parses generic tags and reports uppercase hashtags as invalid', () => {
    expect(
      parseNip24GenericTags({
        tags: [
          ['r', 'https://example.com'],
          ['i', 'spotify:track:abc', 'https://spotify.example/abc'],
          ['title', 'Playlist'],
          ['t', 'nostr'],
          ['t', 'Nostr']
        ]
      })
    ).toEqual({
      webUrls: ['https://example.com'],
      externalIds: [{ value: 'spotify:track:abc', hint: 'https://spotify.example/abc' }],
      titles: ['Playlist'],
      hashtags: ['nostr'],
      invalidHashtags: ['Nostr']
    });
  });

  it('exposes kind constants and guards for profile/contact events', () => {
    expect(NIP24_PROFILE_METADATA_KIND).toBe(0);
    expect(NIP24_CONTACT_LIST_KIND).toBe(3);
    expect(isNip24ProfileMetadataEvent({ kind: 0, content: '{}', tags: [] })).toBe(true);
    expect(isNip24ContactListEvent({ kind: 3, content: '{}', tags: [] })).toBe(true);
  });

  it('rejects malformed JSON and empty tag values', () => {
    expect(parseNip24ProfileMetadataJson('not-json')).toBeNull();
    expect(() => buildNip24WebUrlTag(' ')).toThrow('NIP-24 web URL must not be empty');
    expect(() => buildNip24ExternalIdTag(' ')).toThrow('NIP-24 external id must not be empty');
    expect(() => buildNip24TitleTag(' ')).toThrow('NIP-24 title must not be empty');
    expect(() => buildNip24HashtagTag('#')).toThrow('NIP-24 hashtag must not be empty');
  });
});
