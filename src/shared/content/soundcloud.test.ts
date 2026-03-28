import { describe, expect, it } from 'vitest';

import { SoundCloudProvider } from '$shared/content/soundcloud.js';

const provider = new SoundCloudProvider();

describe('SoundCloudProvider', () => {
  it('should have platform "soundcloud"', () => {
    expect(provider.platform).toBe('soundcloud');
  });

  it('should not require extension', () => {
    expect(provider.requiresExtension).toBe(false);
  });

  describe('parseUrl', () => {
    it('should parse a track URL', () => {
      const result = provider.parseUrl('https://soundcloud.com/artist-name/track-name');
      expect(result).toEqual({
        platform: 'soundcloud',
        type: 'track',
        id: 'artist-name/track-name'
      });
    });

    it('should parse a track URL with www', () => {
      const result = provider.parseUrl('https://www.soundcloud.com/artist-name/track-name');
      expect(result).toEqual({
        platform: 'soundcloud',
        type: 'track',
        id: 'artist-name/track-name'
      });
    });

    it('should parse a sets URL', () => {
      const result = provider.parseUrl('https://soundcloud.com/artist-name/sets/playlist-name');
      expect(result).toEqual({
        platform: 'soundcloud',
        type: 'set',
        id: 'artist-name/sets/playlist-name'
      });
    });

    it('should parse a sets URL with www', () => {
      const result = provider.parseUrl('https://www.soundcloud.com/artist-name/sets/playlist-name');
      expect(result).toEqual({
        platform: 'soundcloud',
        type: 'set',
        id: 'artist-name/sets/playlist-name'
      });
    });

    it('should parse a sets URL with trailing slash', () => {
      const result = provider.parseUrl('https://soundcloud.com/artist-name/sets/playlist-name/');
      expect(result).toEqual({
        platform: 'soundcloud',
        type: 'set',
        id: 'artist-name/sets/playlist-name'
      });
    });

    it('should parse a sets URL with query params', () => {
      const result = provider.parseUrl(
        'https://soundcloud.com/artist-name/sets/playlist-name?si=abc'
      );
      expect(result).toEqual({
        platform: 'soundcloud',
        type: 'set',
        id: 'artist-name/sets/playlist-name'
      });
    });

    it('should return null for /sets/ without playlist name', () => {
      expect(provider.parseUrl('https://soundcloud.com/artist-name/sets')).toBeNull();
    });

    it('should return null for non-SoundCloud URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for SoundCloud homepage', () => {
      expect(provider.parseUrl('https://soundcloud.com/')).toBeNull();
    });

    it('should return null for user profile (single path segment)', () => {
      expect(provider.parseUrl('https://soundcloud.com/artist-name')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct NIP-73 tag', () => {
      const tag = provider.toNostrTag({
        platform: 'soundcloud',
        type: 'track',
        id: 'artist-name/track-name'
      });
      expect(tag).toEqual([
        'soundcloud:track:artist-name/track-name',
        'https://soundcloud.com/artist-name/track-name'
      ]);
    });

    it('should generate correct NIP-73 tag for sets', () => {
      const tag = provider.toNostrTag({
        platform: 'soundcloud',
        type: 'set',
        id: 'artist-name/sets/playlist-name'
      });
      expect(tag).toEqual([
        'soundcloud:set:artist-name/sets/playlist-name',
        'https://soundcloud.com/artist-name/sets/playlist-name'
      ]);
    });
  });

  describe('contentKind', () => {
    it('should return correct contentKind for set', () => {
      expect(provider.contentKind({ platform: 'soundcloud', type: 'set', id: 'a/sets/b' })).toBe(
        'soundcloud:set'
      );
    });

    it('should return correct contentKind for track', () => {
      expect(provider.contentKind({ platform: 'soundcloud', type: 'track', id: 'a/b' })).toBe(
        'soundcloud:track'
      );
    });
  });

  describe('embedUrl', () => {
    it('should return null (resolved via oEmbed at runtime)', () => {
      const result = provider.embedUrl({
        platform: 'soundcloud',
        type: 'track',
        id: 'artist/track'
      });
      expect(result).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return SoundCloud URL', () => {
      expect(provider.openUrl({ platform: 'soundcloud', type: 'track', id: 'artist/track' })).toBe(
        'https://soundcloud.com/artist/track'
      );
    });
  });
});
