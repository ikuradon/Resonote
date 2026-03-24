import { describe, expect, it } from 'vitest';

import { FountainFmProvider } from '$shared/content/fountain-fm.js';

const provider = new FountainFmProvider();

describe('FountainFmProvider', () => {
  it('should have platform "fountain"', () => {
    expect(provider.platform).toBe('fountain');
  });

  it('should require extension', () => {
    expect(provider.requiresExtension).toBe(true);
  });

  describe('parseUrl', () => {
    it('should parse an episode URL', () => {
      const result = provider.parseUrl('https://fountain.fm/episode/abc123');
      expect(result).toEqual({ platform: 'fountain', type: 'episode', id: 'abc123' });
    });

    it('should parse with www', () => {
      const result = provider.parseUrl('https://www.fountain.fm/episode/xyz789');
      expect(result).toEqual({ platform: 'fountain', type: 'episode', id: 'xyz789' });
    });

    it('should return null for non-Fountain URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for Fountain homepage', () => {
      expect(provider.parseUrl('https://fountain.fm/')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct NIP-73 tag', () => {
      const tag = provider.toNostrTag({ platform: 'fountain', type: 'episode', id: 'abc123' });
      expect(tag).toEqual(['fountain:episode:abc123', 'https://fountain.fm/episode/abc123']);
    });
  });

  describe('embedUrl', () => {
    it('should return null', () => {
      expect(provider.embedUrl()).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return Fountain URL', () => {
      expect(provider.openUrl({ platform: 'fountain', type: 'episode', id: 'abc123' })).toBe(
        'https://fountain.fm/episode/abc123'
      );
    });
  });
});
