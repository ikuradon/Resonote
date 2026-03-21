import { describe, it, expect } from 'vitest';
import { SpreakerProvider } from '$shared/content/spreaker.js';

const provider = new SpreakerProvider();

describe('SpreakerProvider', () => {
  describe('platform', () => {
    it('should be "spreaker"', () => {
      expect(provider.platform).toBe('spreaker');
    });
  });

  it('should not require extension', () => {
    expect(provider.requiresExtension).toBe(false);
  });

  describe('parseUrl', () => {
    it('should parse a standard episode URL', () => {
      const result = provider.parseUrl('https://www.spreaker.com/episode/12345678');
      expect(result).toEqual({ platform: 'spreaker', type: 'episode', id: '12345678' });
    });

    it('should parse a URL with slug', () => {
      const result = provider.parseUrl('https://www.spreaker.com/episode/my-title--12345678');
      expect(result).toEqual({ platform: 'spreaker', type: 'episode', id: '12345678' });
    });

    it('should return null for a show URL', () => {
      expect(provider.parseUrl('https://www.spreaker.com/podcast/show--12345')).toBeNull();
    });

    it('should return null for a non-Spreaker URL', () => {
      expect(provider.parseUrl('https://www.soundcloud.com/artist/track')).toBeNull();
    });

    it('should return null for an empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should return [value, hint] for an episode', () => {
      const tag = provider.toNostrTag({ platform: 'spreaker', type: 'episode', id: '12345678' });
      expect(tag).toEqual([
        'spreaker:episode:12345678',
        'https://www.spreaker.com/episode/12345678'
      ]);
    });
  });

  describe('contentKind', () => {
    it('should return "spreaker:episode" for an episode', () => {
      expect(provider.contentKind({ platform: 'spreaker', type: 'episode', id: '12345678' })).toBe(
        'spreaker:episode'
      );
    });
  });

  describe('embedUrl', () => {
    it('should generate embed URL for an episode', () => {
      expect(provider.embedUrl({ platform: 'spreaker', type: 'episode', id: '12345678' })).toBe(
        'https://widget.spreaker.com/player?episode_id=12345678&theme=dark'
      );
    });
  });

  describe('openUrl', () => {
    it('should generate open URL for an episode', () => {
      expect(provider.openUrl({ platform: 'spreaker', type: 'episode', id: '12345678' })).toBe(
        'https://www.spreaker.com/episode/12345678'
      );
    });
  });
});
