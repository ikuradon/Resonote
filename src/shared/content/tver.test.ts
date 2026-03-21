import { describe, it, expect } from 'vitest';
import { TVerProvider } from '$shared/content/tver.js';

const provider = new TVerProvider();

describe('TVerProvider', () => {
  it('should have platform "tver"', () => {
    expect(provider.platform).toBe('tver');
  });

  it('should require extension', () => {
    expect(provider.requiresExtension).toBe(true);
  });

  describe('parseUrl', () => {
    it('should parse an episodes URL', () => {
      const result = provider.parseUrl('https://tver.jp/episodes/ep12345678');
      expect(result).toEqual({ platform: 'tver', type: 'episode', id: 'ep12345678' });
    });

    it('should parse an lp episodes URL', () => {
      const result = provider.parseUrl('https://tver.jp/lp/episodes/ep12345678');
      expect(result).toEqual({ platform: 'tver', type: 'episode', id: 'ep12345678' });
    });

    it('should parse with www', () => {
      const result = provider.parseUrl('https://www.tver.jp/episodes/ep12345678');
      expect(result).toEqual({ platform: 'tver', type: 'episode', id: 'ep12345678' });
    });

    it('should return null for non-TVer URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for TVer homepage', () => {
      expect(provider.parseUrl('https://tver.jp/')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct NIP-73 tag', () => {
      const tag = provider.toNostrTag({ platform: 'tver', type: 'episode', id: 'ep12345678' });
      expect(tag).toEqual(['tver:episode:ep12345678', 'https://tver.jp/episodes/ep12345678']);
    });
  });

  describe('embedUrl', () => {
    it('should return null', () => {
      expect(provider.embedUrl()).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return TVer URL', () => {
      expect(provider.openUrl({ platform: 'tver', type: 'episode', id: 'ep12345678' })).toBe(
        'https://tver.jp/episodes/ep12345678'
      );
    });
  });
});
