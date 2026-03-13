import { describe, it, expect } from 'vitest';
import { getProvider, parseContentUrl } from './registry.js';

describe('registry', () => {
  describe('getProvider', () => {
    it('should return the Spotify provider', () => {
      const provider = getProvider('spotify');
      expect(provider).toBeDefined();
      expect(provider!.platform).toBe('spotify');
    });

    it('should return the YouTube provider', () => {
      const provider = getProvider('youtube');
      expect(provider).toBeDefined();
      expect(provider!.platform).toBe('youtube');
    });

    it('should return undefined for unknown platform', () => {
      expect(getProvider('tidal')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(getProvider('')).toBeUndefined();
    });

    it('should be case-sensitive', () => {
      expect(getProvider('Spotify')).toBeUndefined();
      expect(getProvider('SPOTIFY')).toBeUndefined();
    });
  });

  describe('parseContentUrl', () => {
    it('should parse a Spotify track URL', () => {
      const result = parseContentUrl('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
      expect(result).toEqual({ platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' });
    });

    it('should parse a Spotify episode URL', () => {
      const result = parseContentUrl('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
      expect(result).toEqual({
        platform: 'spotify',
        type: 'episode',
        id: '4C6zDr6e86HYqLxPAhO8jA'
      });
    });

    it('should parse a Spotify URI', () => {
      const result = parseContentUrl('spotify:track:abc123');
      expect(result).toEqual({ platform: 'spotify', type: 'track', id: 'abc123' });
    });

    // --- Abnormal cases ---

    it('should return null for an empty string', () => {
      expect(parseContentUrl('')).toBeNull();
    });

    it('should parse a YouTube watch URL', () => {
      const result = parseContentUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a youtu.be short URL', () => {
      const result = parseContentUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should return null for a non-supported URL', () => {
      expect(parseContentUrl('https://example.com/page')).toBeNull();
    });

    it('should return null for random text', () => {
      expect(parseContentUrl('hello world')).toBeNull();
    });

    it('should return null for a URL with unsupported Spotify type', () => {
      expect(
        parseContentUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
      ).toBeNull();
    });
  });
});
