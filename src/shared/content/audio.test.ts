import { describe, expect, it } from 'vitest';

import { AudioProvider } from '$shared/content/audio.js';
import { toBase64url } from '$shared/content/url-utils.js';

const provider = new AudioProvider();

describe('AudioProvider', () => {
  describe('platform', () => {
    it('should be "audio"', () => {
      expect(provider.platform).toBe('audio');
    });

    it('displayName should be "Audio"', () => {
      expect(provider.displayName).toBe('Audio');
    });

    it('requiresExtension should be false', () => {
      expect(provider.requiresExtension).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('should parse .mp3 URL', () => {
      const url = 'https://example.com/episode.mp3';
      const result = provider.parseUrl(url);
      expect(result).toEqual({
        platform: 'audio',
        type: 'track',
        id: toBase64url(url)
      });
    });

    it('should parse .m4a URL', () => {
      const url = 'https://example.com/episode.m4a';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'audio', type: 'track', id: toBase64url(url) });
    });

    it('should parse .ogg URL', () => {
      const url = 'https://example.com/audio.ogg';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'audio', type: 'track', id: toBase64url(url) });
    });

    it('should parse .wav URL', () => {
      const url = 'https://example.com/sound.wav';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'audio', type: 'track', id: toBase64url(url) });
    });

    it('should parse .opus URL', () => {
      const url = 'https://example.com/voice.opus';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'audio', type: 'track', id: toBase64url(url) });
    });

    it('should parse .flac URL', () => {
      const url = 'https://example.com/music.flac';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'audio', type: 'track', id: toBase64url(url) });
    });

    it('should parse .aac URL', () => {
      const url = 'https://example.com/audio.aac';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'audio', type: 'track', id: toBase64url(url) });
    });

    it('should strip query params before checking extension', () => {
      const urlWithQuery = 'https://example.com/episode.mp3?token=abc';
      const urlClean = 'https://example.com/episode.mp3?token=abc';
      const result = provider.parseUrl(urlWithQuery);
      expect(result).toEqual({ platform: 'audio', type: 'track', id: toBase64url(urlClean) });
    });

    it('should return null for a non-audio URL', () => {
      expect(provider.parseUrl('https://example.com/page.html')).toBeNull();
    });

    it('should return null for a YouTube URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    it('should return null for a URL with no extension', () => {
      expect(provider.parseUrl('https://example.com/feed')).toBeNull();
    });

    it('should return null for an empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('the id should be base64url encoded original URL', () => {
      const url = 'https://example.com/audio.mp3';
      const result = provider.parseUrl(url);
      expect(result?.id).toBe(toBase64url(url));
    });
  });

  describe('toNostrTag', () => {
    it('should return [audio:<url>, <url>] format', () => {
      const url = 'https://example.com/episode.mp3';
      const contentId = { platform: 'audio', type: 'track', id: toBase64url(url) };
      const tag = provider.toNostrTag(contentId);
      expect(tag).toEqual([`audio:${url}`, url]);
    });
  });

  describe('contentKind', () => {
    it('should return "audio:track"', () => {
      expect(provider.contentKind()).toBe('audio:track');
    });
  });

  describe('embedUrl', () => {
    it('should return the decoded URL', () => {
      const url = 'https://example.com/episode.mp3';
      const contentId = { platform: 'audio', type: 'track', id: toBase64url(url) };
      expect(provider.embedUrl(contentId)).toBe(url);
    });
  });

  describe('openUrl', () => {
    it('should return the decoded URL', () => {
      const url = 'https://example.com/episode.mp3';
      const contentId = { platform: 'audio', type: 'track', id: toBase64url(url) };
      expect(provider.openUrl(contentId)).toBe(url);
    });
  });
});
