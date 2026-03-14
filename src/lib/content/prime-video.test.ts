import { describe, it, expect } from 'vitest';
import { PrimeVideoProvider } from './prime-video.js';

const provider = new PrimeVideoProvider();

describe('PrimeVideoProvider', () => {
  it('should have platform "prime-video"', () => {
    expect(provider.platform).toBe('prime-video');
  });

  it('should require extension', () => {
    expect(provider.requiresExtension).toBe(true);
  });

  describe('parseUrl', () => {
    it('should parse amazon.com video detail URL', () => {
      const result = provider.parseUrl('https://www.amazon.com/gp/video/detail/B08F9GL5PQ');
      expect(result).toEqual({ platform: 'prime-video', type: 'video', id: 'B08F9GL5PQ' });
    });

    it('should parse amazon.co.jp video detail URL', () => {
      const result = provider.parseUrl('https://www.amazon.co.jp/gp/video/detail/B08F9GL5PQ');
      expect(result).toEqual({ platform: 'prime-video', type: 'video', id: 'B08F9GL5PQ' });
    });

    it('should parse amazon.com dp URL', () => {
      const result = provider.parseUrl('https://www.amazon.com/dp/B08F9GL5PQ');
      expect(result).toEqual({ platform: 'prime-video', type: 'video', id: 'B08F9GL5PQ' });
    });

    it('should parse amazon.co.jp dp URL', () => {
      const result = provider.parseUrl('https://www.amazon.co.jp/dp/B08F9GL5PQ');
      expect(result).toEqual({ platform: 'prime-video', type: 'video', id: 'B08F9GL5PQ' });
    });

    it('should parse primevideo.com detail URL', () => {
      const result = provider.parseUrl('https://www.primevideo.com/detail/B08F9GL5PQ');
      expect(result).toEqual({ platform: 'prime-video', type: 'video', id: 'B08F9GL5PQ' });
    });

    it('should return null for non-Prime Video URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct NIP-73 tag', () => {
      const tag = provider.toNostrTag({
        platform: 'prime-video',
        type: 'video',
        id: 'B08F9GL5PQ'
      });
      expect(tag).toEqual(['amazon:B08F9GL5PQ', 'https://www.primevideo.com/detail/B08F9GL5PQ']);
    });
  });

  describe('embedUrl', () => {
    it('should return null', () => {
      expect(provider.embedUrl()).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return primevideo.com URL', () => {
      expect(provider.openUrl({ platform: 'prime-video', type: 'video', id: 'B08F9GL5PQ' })).toBe(
        'https://www.primevideo.com/detail/B08F9GL5PQ'
      );
    });
  });
});
