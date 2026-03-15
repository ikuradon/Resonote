import { describe, expect, it } from 'vitest';
import { decodeContentLink, encodeContentLink, iTagToContentPath } from './content-link.js';
import type { ContentId } from '../content/types.js';

const SPOTIFY_CONTENT_ID: ContentId = {
  platform: 'spotify',
  type: 'track',
  id: '4iV5W9uYEdYUVa79Axb7Rh'
};

const RELAY_1 = 'wss://relay.example.com';
const RELAY_2 = 'wss://relay2.example.org';

describe('encodeContentLink / decodeContentLink', () => {
  it('roundtrip: encode then decode → original values', () => {
    const encoded = encodeContentLink(SPOTIFY_CONTENT_ID, [RELAY_1]);
    const decoded = decodeContentLink(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.contentId).toEqual(SPOTIFY_CONTENT_ID);
    expect(decoded!.relays).toEqual([RELAY_1]);
  });

  it('encode with multiple relays → all preserved', () => {
    const encoded = encodeContentLink(SPOTIFY_CONTENT_ID, [RELAY_1, RELAY_2]);
    const decoded = decodeContentLink(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.relays).toEqual([RELAY_1, RELAY_2]);
  });

  it('encode with no relays → empty array', () => {
    const encoded = encodeContentLink(SPOTIFY_CONTENT_ID, []);
    const decoded = decodeContentLink(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.relays).toEqual([]);
    expect(decoded!.contentId).toEqual(SPOTIFY_CONTENT_ID);
  });

  it('decode invalid string → null', () => {
    const result = decodeContentLink('notvalid');
    expect(result).toBeNull();
  });

  it('decode wrong prefix → null', () => {
    // npub1 prefixed string should return null
    const wrongPrefix = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqxf6ky7';
    const result = decodeContentLink(wrongPrefix);
    expect(result).toBeNull();
  });

  it('content ID with special characters in id → preserved', () => {
    const specialId: ContentId = {
      platform: 'youtube',
      type: 'video',
      id: 'dQw4w9WgXcQ'
    };
    const encoded = encodeContentLink(specialId, []);
    const decoded = decodeContentLink(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.contentId).toEqual(specialId);
  });

  it('encoded string starts with "ncontent1"', () => {
    const encoded = encodeContentLink(SPOTIFY_CONTENT_ID, []);
    expect(encoded).toMatch(/^ncontent1/);
  });
});

describe('iTagToContentPath', () => {
  it('should parse standard 3-part I-tag value', () => {
    expect(iTagToContentPath('spotify:track:4iV5W9uYEdYUVa79Axb7Rh')).toBe(
      '/spotify/track/4iV5W9uYEdYUVa79Axb7Rh'
    );
  });

  it('should parse single-colon I-tag value (SoundCloud format)', () => {
    expect(iTagToContentPath('soundcloud:artist/track-name')).toBe(
      '/soundcloud/track/artist%2Ftrack-name'
    );
  });

  it('should return null for invalid I-tag value', () => {
    expect(iTagToContentPath('nocolon')).toBeNull();
  });
});
