import { describe, it, expect } from 'vitest';
import { PodbeanProvider } from './podbean.js';

const provider = new PodbeanProvider();

describe('PodbeanProvider', () => {
  describe('platform', () => {
    it('should be "podbean"', () => {
      expect(provider.platform).toBe('podbean');
    });
  });

  it('should not require extension', () => {
    expect(provider.requiresExtension).toBe(false);
  });

  describe('parseUrl', () => {
    it('should parse a /media/share/ URL', () => {
      const result = provider.parseUrl('https://www.podbean.com/media/share/pb-ar8ve-1920b14');
      expect(result).toEqual({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' });
    });

    it('should parse an http /media/share/ URL', () => {
      const result = provider.parseUrl('http://www.podbean.com/media/share/pb-ar8ve-1920b14');
      expect(result).toEqual({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' });
    });

    it('should parse a /ew/ URL', () => {
      const result = provider.parseUrl('https://www.podbean.com/ew/pb-ar8ve-1920b14');
      expect(result).toEqual({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' });
    });

    it('should parse an http /ew/ URL', () => {
      const result = provider.parseUrl('http://www.podbean.com/ew/pb-ar8ve-1920b14');
      expect(result).toEqual({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' });
    });

    it('should parse a channel.podbean.com/e/slug URL', () => {
      const result = provider.parseUrl('https://mychannel.podbean.com/e/my-episode-title');
      expect(result).toEqual({
        platform: 'podbean',
        type: 'episode',
        id: 'mychannel/my-episode-title'
      });
    });

    it('should return null for a non-podbean URL', () => {
      expect(provider.parseUrl('https://www.spreaker.com/episode/12345678')).toBeNull();
    });

    it('should return null for a plain podbean.com URL', () => {
      expect(provider.parseUrl('https://www.podbean.com/')).toBeNull();
    });

    it('should return null for an empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should return [value, hint] for a pb- episode', () => {
      const tag = provider.toNostrTag({
        platform: 'podbean',
        type: 'episode',
        id: 'pb-ar8ve-1920b14'
      });
      expect(tag).toEqual([
        'podbean:episode:pb-ar8ve-1920b14',
        'https://www.podbean.com/media/share/pb-ar8ve-1920b14'
      ]);
    });

    it('should return [value, hint] for a channel slug episode', () => {
      const tag = provider.toNostrTag({
        platform: 'podbean',
        type: 'episode',
        id: 'mychannel/my-episode'
      });
      expect(tag).toEqual([
        'podbean:episode:mychannel/my-episode',
        'https://www.podbean.com/media/share/mychannel/my-episode'
      ]);
    });
  });

  describe('contentKind', () => {
    it('should return "podbean:episode" for an episode', () => {
      expect(
        provider.contentKind({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' })
      ).toBe('podbean:episode');
    });
  });

  describe('embedUrl', () => {
    it('should return embed URL for a pb- id', () => {
      expect(
        provider.embedUrl({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' })
      ).toBe(
        'https://www.podbean.com/player-v2/?i=pb-ar8ve-1920b14&share=0&download=0&skin=f6f6f6&btn-skin=c9a256'
      );
    });

    it('should return null for a channel slug id', () => {
      expect(
        provider.embedUrl({ platform: 'podbean', type: 'episode', id: 'mychannel/my-episode' })
      ).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return share URL for a pb- id', () => {
      expect(
        provider.openUrl({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' })
      ).toBe('https://www.podbean.com/media/share/pb-ar8ve-1920b14');
    });

    it('should return channel URL for a slug id', () => {
      expect(
        provider.openUrl({ platform: 'podbean', type: 'episode', id: 'mychannel/my-episode' })
      ).toBe('https://mychannel.podbean.com/e/my-episode');
    });
  });
});
