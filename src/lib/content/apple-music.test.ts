import { describe, it, expect } from 'vitest';
import { AppleMusicProvider } from './apple-music.js';

const provider = new AppleMusicProvider();

describe('AppleMusicProvider', () => {
  it('should have platform "apple-music"', () => {
    expect(provider.platform).toBe('apple-music');
  });

  it('should require extension', () => {
    expect(provider.requiresExtension).toBe(true);
  });

  describe('parseUrl', () => {
    it('should parse an album URL as album', () => {
      const result = provider.parseUrl(
        'https://music.apple.com/us/album/some-album-name/1234567890'
      );
      expect(result).toEqual({ platform: 'apple-music', type: 'album', id: '1234567890' });
    });

    it('should parse an album URL with track param as song', () => {
      const result = provider.parseUrl(
        'https://music.apple.com/us/album/some-album-name/1234567890?i=9876543210'
      );
      expect(result).toEqual({ platform: 'apple-music', type: 'song', id: '9876543210' });
    });

    it('should parse a JP locale URL', () => {
      const result = provider.parseUrl('https://music.apple.com/jp/album/some-album/1234567890');
      expect(result).toEqual({ platform: 'apple-music', type: 'album', id: '1234567890' });
    });

    it('should return null for non-Apple Music URL', () => {
      expect(provider.parseUrl('https://www.spotify.com/track/abc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for Apple Music homepage', () => {
      expect(provider.parseUrl('https://music.apple.com/')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct tag for album', () => {
      const tag = provider.toNostrTag({
        platform: 'apple-music',
        type: 'album',
        id: '1234567890'
      });
      expect(tag).toEqual([
        'I',
        'apple-music:album:1234567890',
        'https://music.apple.com/us/album/1234567890'
      ]);
    });

    it('should generate correct tag for song', () => {
      const tag = provider.toNostrTag({
        platform: 'apple-music',
        type: 'song',
        id: '9876543210'
      });
      expect(tag).toEqual([
        'I',
        'apple-music:song:9876543210',
        'https://music.apple.com/us/song/9876543210'
      ]);
    });
  });

  describe('embedUrl', () => {
    it('should return null', () => {
      expect(provider.embedUrl()).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return Apple Music URL', () => {
      expect(provider.openUrl({ platform: 'apple-music', type: 'album', id: '1234567890' })).toBe(
        'https://music.apple.com/us/album/1234567890'
      );
    });
  });
});
