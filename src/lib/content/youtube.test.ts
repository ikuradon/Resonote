import { describe, it, expect } from 'vitest';
import { YouTubeProvider } from './youtube.js';

const provider = new YouTubeProvider();

describe('YouTubeProvider', () => {
  it('should have platform "youtube"', () => {
    expect(provider.platform).toBe('youtube');
  });

  it('should not require extension', () => {
    expect(provider.requiresExtension).toBe(false);
  });

  describe('parseUrl', () => {
    it('should parse a standard watch URL', () => {
      const result = provider.parseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a watch URL without www', () => {
      const result = provider.parseUrl('https://youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a youtu.be short URL', () => {
      const result = provider.parseUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse an embed URL', () => {
      const result = provider.parseUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a shorts URL', () => {
      const result = provider.parseUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a mobile URL', () => {
      const result = provider.parseUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a music.youtube.com URL', () => {
      const result = provider.parseUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a URL with extra query parameters', () => {
      const result = provider.parseUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
      );
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should return null for non-YouTube URL', () => {
      expect(provider.parseUrl('https://open.spotify.com/track/abc123')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for YouTube channel URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/channel/UCtest')).toBeNull();
    });

    it('should return null for YouTube homepage', () => {
      expect(provider.parseUrl('https://www.youtube.com/')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct NIP-73 tag', () => {
      const tag = provider.toNostrTag({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
      expect(tag).toEqual([
        'I',
        'youtube:video:dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      ]);
    });
  });

  describe('embedUrl', () => {
    it('should return embed URL', () => {
      expect(provider.embedUrl({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' })).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ'
      );
    });
  });

  describe('openUrl', () => {
    it('should return watch URL', () => {
      expect(provider.openUrl({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' })).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
    });
  });
});
