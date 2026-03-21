import { describe, expect, it } from 'vitest';
import { DEFAULT_RELAYS, getContentPathFromTags } from './helpers.js';

describe('DEFAULT_RELAYS', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(DEFAULT_RELAYS)).toBe(true);
    expect(DEFAULT_RELAYS.length).toBeGreaterThan(0);
  });

  it('should contain only wss:// URLs', () => {
    for (const relay of DEFAULT_RELAYS) {
      expect(relay).toMatch(/^wss:\/\//);
    }
  });

  it('should not contain duplicate entries', () => {
    const unique = new Set(DEFAULT_RELAYS);
    expect(unique.size).toBe(DEFAULT_RELAYS.length);
  });
});

describe('getContentPathFromTags', () => {
  it('returns path from I tag with 3-part value', () => {
    const tags = [['I', 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh']];
    expect(getContentPathFromTags(tags)).toBe('/spotify/track/4iV5W9uYEdYUVa79Axb7Rh');
  });

  it('returns path from I tag with 2-part value (no type)', () => {
    const tags = [['I', 'soundcloud:artist/track']];
    expect(getContentPathFromTags(tags)).toBe('/soundcloud/track/artist%2Ftrack');
  });

  it('ignores lowercase i tag, returns null', () => {
    const tags = [['i', 'spotify:track:abc123']];
    expect(getContentPathFromTags(tags)).toBeNull();
  });

  it('returns null when no I tag present', () => {
    const tags = [
      ['p', 'somepubkey'],
      ['e', 'someeventid']
    ];
    expect(getContentPathFromTags(tags)).toBeNull();
  });

  it('returns null for empty tags array', () => {
    expect(getContentPathFromTags([])).toBeNull();
  });

  it('ignores I tag without value', () => {
    const tags = [['I']];
    expect(getContentPathFromTags(tags)).toBeNull();
  });

  it('uses the first I tag when multiple present', () => {
    const tags = [
      ['I', 'spotify:track:first'],
      ['I', 'youtube:video:second']
    ];
    expect(getContentPathFromTags(tags)).toBe('/spotify/track/first');
  });

  it('URL-encodes special characters in the id segment', () => {
    const tags = [['I', 'youtube:video:abc def+xyz']];
    expect(getContentPathFromTags(tags)).toBe('/youtube/video/abc%20def%2Bxyz');
  });
});
