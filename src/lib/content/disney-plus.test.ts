import { describe, it, expect } from 'vitest';
import { DisneyPlusProvider } from './disney-plus.js';

const provider = new DisneyPlusProvider();

describe('DisneyPlusProvider', () => {
  it('should have platform "disneyplus"', () => {
    expect(provider.platform).toBe('disneyplus');
  });

  it('should require extension', () => {
    expect(provider.requiresExtension).toBe(true);
  });

  describe('parseUrl', () => {
    it('should parse a video URL', () => {
      const result = provider.parseUrl('https://www.disneyplus.com/video/abc123-def456');
      expect(result).toEqual({
        platform: 'disneyplus',
        type: 'video',
        id: 'abc123-def456'
      });
    });

    it('should parse a play URL', () => {
      const result = provider.parseUrl('https://www.disneyplus.com/play/abc123-def456');
      expect(result).toEqual({
        platform: 'disneyplus',
        type: 'video',
        id: 'abc123-def456'
      });
    });

    it('should parse without www', () => {
      const result = provider.parseUrl('https://disneyplus.com/video/abc123');
      expect(result).toEqual({ platform: 'disneyplus', type: 'video', id: 'abc123' });
    });

    it('should return null for non-Disney+ URL', () => {
      expect(provider.parseUrl('https://www.netflix.com/watch/123')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct NIP-73 tag', () => {
      const tag = provider.toNostrTag({
        platform: 'disneyplus',
        type: 'video',
        id: 'abc123-def456'
      });
      expect(tag).toEqual([
        'I',
        'disneyplus:abc123-def456',
        'https://www.disneyplus.com/video/abc123-def456'
      ]);
    });
  });

  describe('embedUrl', () => {
    it('should return null', () => {
      expect(provider.embedUrl()).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return video URL', () => {
      expect(provider.openUrl({ platform: 'disneyplus', type: 'video', id: 'abc123-def456' })).toBe(
        'https://www.disneyplus.com/video/abc123-def456'
      );
    });
  });
});
