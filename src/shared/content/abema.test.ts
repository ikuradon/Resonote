import { describe, it, expect } from 'vitest';
import { AbemaProvider } from '$shared/content/abema.js';

const provider = new AbemaProvider();

describe('AbemaProvider', () => {
  it('should have platform "abema"', () => {
    expect(provider.platform).toBe('abema');
  });

  it('should require extension', () => {
    expect(provider.requiresExtension).toBe(true);
  });

  describe('parseUrl', () => {
    it('should parse an episode URL', () => {
      const result = provider.parseUrl('https://abema.tv/video/episode/some-episode-slug');
      expect(result).toEqual({
        platform: 'abema',
        type: 'episode',
        id: 'some-episode-slug'
      });
    });

    it('should parse a title URL', () => {
      const result = provider.parseUrl('https://abema.tv/video/title/some-title-slug');
      expect(result).toEqual({
        platform: 'abema',
        type: 'title',
        id: 'some-title-slug'
      });
    });

    it('should return null for non-Abema URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for Abema homepage', () => {
      expect(provider.parseUrl('https://abema.tv/')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct NIP-73 tag for episode', () => {
      const tag = provider.toNostrTag({
        platform: 'abema',
        type: 'episode',
        id: 'some-episode-slug'
      });
      expect(tag).toEqual([
        'abema:episode:some-episode-slug',
        'https://abema.tv/video/episode/some-episode-slug'
      ]);
    });

    it('should generate correct NIP-73 tag for title', () => {
      const tag = provider.toNostrTag({
        platform: 'abema',
        type: 'title',
        id: 'some-title-slug'
      });
      expect(tag).toEqual([
        'abema:title:some-title-slug',
        'https://abema.tv/video/title/some-title-slug'
      ]);
    });
  });

  describe('embedUrl', () => {
    it('should return null', () => {
      expect(provider.embedUrl()).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return Abema URL', () => {
      expect(
        provider.openUrl({ platform: 'abema', type: 'episode', id: 'some-episode-slug' })
      ).toBe('https://abema.tv/video/episode/some-episode-slug');
    });
  });
});
