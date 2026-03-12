import { describe, it, expect } from 'vitest';
import { getProvider, parseContentUrl } from './registry.js';

describe('registry', () => {
  describe('getProvider', () => {
    it('should return the Spotify provider', () => {
      const provider = getProvider('spotify');
      expect(provider).toBeDefined();
      expect(provider!.platform).toBe('spotify');
    });

    it('should return undefined for unknown platform', () => {
      expect(getProvider('youtube')).toBeUndefined();
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

    it('should return null for a non-supported URL', () => {
      expect(parseContentUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
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
