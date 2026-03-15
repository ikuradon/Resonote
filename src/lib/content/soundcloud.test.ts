import { describe, it, expect } from 'vitest';
import { SoundCloudProvider } from './soundcloud.js';

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

    it('should return null for a sets URL', () => {
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
  });

  describe('embedUrl', () => {
    it('should return SoundCloud embed URL', () => {
      const result = provider.embedUrl({
        platform: 'soundcloud',
        type: 'track',
        id: 'artist/track'
      });
      expect(result).toBe(
        'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack&auto_play=false&show_artwork=true&show_playcount=false&show_user=true&color=%23c9a256'
      );
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
