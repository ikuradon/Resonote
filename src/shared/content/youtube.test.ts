import { describe, it, expect } from 'vitest';
import { YouTubeProvider } from '$shared/content/youtube.js';

const provider = new YouTubeProvider();

describe('YouTubeProvider', () => {
  describe('platform', () => {
    it('should be "youtube"', () => {
      expect(provider.platform).toBe('youtube');
    });
  });

  it('should not require extension', () => {
    expect(provider.requiresExtension).toBe(false);
  });

  describe('parseUrl', () => {
    it('should parse a standard watch URL', () => {
      const result = provider.parseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a short youtu.be URL', () => {
      const result = provider.parseUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a mobile URL', () => {
      const result = provider.parseUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a URL without www prefix', () => {
      const result = provider.parseUrl('https://youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a shorts URL', () => {
      const result = provider.parseUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse an embed URL', () => {
      const result = provider.parseUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a URL with extra query parameters', () => {
      const result = provider.parseUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
      );
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a youtu.be URL with query parameters', () => {
      const result = provider.parseUrl('https://youtu.be/dQw4w9WgXcQ?t=42');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse an http URL (non-https)', () => {
      const result = provider.parseUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a YouTube Music URL', () => {
      const result = provider.parseUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse a YouTube Music URL with feature param', () => {
      const result = provider.parseUrl(
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share'
      );
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    });

    it('should parse an ID with hyphens and underscores', () => {
      const result = provider.parseUrl('https://www.youtube.com/watch?v=a-B_c1D2e3f');
      expect(result).toEqual({ platform: 'youtube', type: 'video', id: 'a-B_c1D2e3f' });
    });

    // --- Abnormal cases ---

    it('should return null for an empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for a non-YouTube URL', () => {
      expect(provider.parseUrl('https://open.spotify.com/track/abc123')).toBeNull();
    });

    it('should return null for a YouTube URL without video ID', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch')).toBeNull();
    });

    it('should return null for a YouTube URL with empty v param', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=')).toBeNull();
    });

    it('should return null for a YouTube channel URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/@channelname')).toBeNull();
    });

    it('should return null for a YouTube playlist URL', () => {
      expect(
        provider.parseUrl(
          'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
        )
      ).toBeNull();
    });

    it('should return null for random text', () => {
      expect(provider.parseUrl('not a url at all')).toBeNull();
    });

    it('should return null for a youtu.be URL with no ID', () => {
      expect(provider.parseUrl('https://youtu.be/')).toBeNull();
    });

    it('should return null for a fake domain', () => {
      expect(provider.parseUrl('https://fakeyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    });

    it('should return null for just the domain', () => {
      expect(provider.parseUrl('https://www.youtube.com')).toBeNull();
    });

    it('should return null for just the domain with trailing slash', () => {
      expect(provider.parseUrl('https://www.youtube.com/')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should return [value, hint] for a video', () => {
      const tag = provider.toNostrTag({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
      expect(tag).toEqual([
        'youtube:video:dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      ]);
    });
  });

  describe('contentKind', () => {
    it('should return "youtube:video" for a video', () => {
      expect(provider.contentKind({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' })).toBe(
        'youtube:video'
      );
    });
  });

  describe('embedUrl', () => {
    it('should generate embed URL for a video', () => {
      expect(provider.embedUrl({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' })).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ'
      );
    });
  });

  describe('openUrl', () => {
    it('should generate watch URL for a video', () => {
      expect(provider.openUrl({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' })).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
    });
  });
});
