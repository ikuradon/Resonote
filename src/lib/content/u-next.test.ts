import { describe, it, expect } from 'vitest';
import { UNextProvider } from './u-next.js';

const provider = new UNextProvider();

describe('UNextProvider', () => {
  it('should have platform "unext"', () => {
    expect(provider.platform).toBe('unext');
  });

  it('should require extension', () => {
    expect(provider.requiresExtension).toBe(true);
  });

  describe('parseUrl', () => {
    it('should parse a title-only URL', () => {
      const result = provider.parseUrl('https://video.unext.jp/play/SID0012345');
      expect(result).toEqual({ platform: 'unext', type: 'title', id: 'SID0012345' });
    });

    it('should parse a title+episode URL', () => {
      const result = provider.parseUrl('https://video.unext.jp/play/SID0012345/ED00067890');
      expect(result).toEqual({
        platform: 'unext',
        type: 'episode',
        id: 'SID0012345/ED00067890'
      });
    });

    it('should return null for non-U-NEXT URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for U-NEXT homepage', () => {
      expect(provider.parseUrl('https://video.unext.jp/')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct tag for title', () => {
      const tag = provider.toNostrTag({ platform: 'unext', type: 'title', id: 'SID0012345' });
      expect(tag).toEqual(['unext:SID0012345', 'https://video.unext.jp/play/SID0012345']);
    });

    it('should generate correct tag for episode', () => {
      const tag = provider.toNostrTag({
        platform: 'unext',
        type: 'episode',
        id: 'SID0012345/ED00067890'
      });
      expect(tag).toEqual([
        'unext:SID0012345/ED00067890',
        'https://video.unext.jp/play/SID0012345/ED00067890'
      ]);
    });
  });

  describe('embedUrl', () => {
    it('should return null', () => {
      expect(provider.embedUrl()).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return U-NEXT URL', () => {
      expect(provider.openUrl({ platform: 'unext', type: 'title', id: 'SID0012345' })).toBe(
        'https://video.unext.jp/play/SID0012345'
      );
    });
  });
});
