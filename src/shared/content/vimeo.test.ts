import { describe, it, expect } from 'vitest';
import { VimeoProvider } from '$shared/content/vimeo.js';

const provider = new VimeoProvider();

describe('VimeoProvider', () => {
  describe('platform', () => {
    it('should be "vimeo"', () => {
      expect(provider.platform).toBe('vimeo');
    });
  });

  it('should not require extension', () => {
    expect(provider.requiresExtension).toBe(false);
  });

  describe('parseUrl', () => {
    it('should parse a standard URL', () => {
      const result = provider.parseUrl('https://vimeo.com/76979871');
      expect(result).toEqual({ platform: 'vimeo', type: 'video', id: '76979871' });
    });

    it('should parse a URL with hash', () => {
      const result = provider.parseUrl('https://vimeo.com/76979871/8272103f6e');
      expect(result).toEqual({ platform: 'vimeo', type: 'video', id: '76979871' });
    });

    it('should parse an embed URL', () => {
      const result = provider.parseUrl('https://player.vimeo.com/video/76979871');
      expect(result).toEqual({ platform: 'vimeo', type: 'video', id: '76979871' });
    });

    it('should parse a URL with www prefix', () => {
      const result = provider.parseUrl('https://www.vimeo.com/76979871');
      expect(result).toEqual({ platform: 'vimeo', type: 'video', id: '76979871' });
    });

    it('should parse a URL with query params', () => {
      const result = provider.parseUrl('https://vimeo.com/76979871?autoplay=1');
      expect(result).toEqual({ platform: 'vimeo', type: 'video', id: '76979871' });
    });

    // --- Null cases ---

    it('should return null for a YouTube URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    });

    it('should return null for an empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for a non-numeric ID', () => {
      expect(provider.parseUrl('https://vimeo.com/channels/staffpicks')).toBeNull();
    });

    it('should return null for just the domain', () => {
      expect(provider.parseUrl('https://vimeo.com')).toBeNull();
    });

    it('should return null for just the domain with trailing slash', () => {
      expect(provider.parseUrl('https://vimeo.com/')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should return [value, hint] for a video', () => {
      const tag = provider.toNostrTag({ platform: 'vimeo', type: 'video', id: '76979871' });
      expect(tag).toEqual(['vimeo:video:76979871', 'https://vimeo.com/76979871']);
    });
  });

  describe('contentKind', () => {
    it('should return "vimeo:video" for a video', () => {
      expect(provider.contentKind({ platform: 'vimeo', type: 'video', id: '76979871' })).toBe(
        'vimeo:video'
      );
    });
  });

  describe('embedUrl', () => {
    it('should generate embed URL for a video', () => {
      expect(provider.embedUrl({ platform: 'vimeo', type: 'video', id: '76979871' })).toBe(
        'https://player.vimeo.com/video/76979871'
      );
    });
  });

  describe('openUrl', () => {
    it('should generate open URL for a video', () => {
      expect(provider.openUrl({ platform: 'vimeo', type: 'video', id: '76979871' })).toBe(
        'https://vimeo.com/76979871'
      );
    });
  });
});
