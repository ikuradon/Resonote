import { describe, it, expect } from 'vitest';
import { NetflixProvider } from '$shared/content/netflix.js';

const provider = new NetflixProvider();

describe('NetflixProvider', () => {
  it('should have platform "netflix"', () => {
    expect(provider.platform).toBe('netflix');
  });

  it('should require extension', () => {
    expect(provider.requiresExtension).toBe(true);
  });

  describe('parseUrl', () => {
    it('should parse a watch URL', () => {
      const result = provider.parseUrl('https://www.netflix.com/watch/80100172');
      expect(result).toEqual({ platform: 'netflix', type: 'title', id: '80100172' });
    });

    it('should parse a title URL', () => {
      const result = provider.parseUrl('https://www.netflix.com/title/80100172');
      expect(result).toEqual({ platform: 'netflix', type: 'title', id: '80100172' });
    });

    it('should parse without www', () => {
      const result = provider.parseUrl('https://netflix.com/watch/80100172');
      expect(result).toEqual({ platform: 'netflix', type: 'title', id: '80100172' });
    });

    it('should return null for non-Netflix URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for Netflix homepage', () => {
      expect(provider.parseUrl('https://www.netflix.com/')).toBeNull();
    });
  });

  describe('toNostrTag', () => {
    it('should generate correct NIP-73 tag', () => {
      const tag = provider.toNostrTag({ platform: 'netflix', type: 'title', id: '80100172' });
      expect(tag).toEqual(['netflix:title:80100172', 'https://www.netflix.com/title/80100172']);
    });
  });

  describe('embedUrl', () => {
    it('should return null', () => {
      expect(provider.embedUrl()).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return title URL', () => {
      expect(provider.openUrl({ platform: 'netflix', type: 'title', id: '80100172' })).toBe(
        'https://www.netflix.com/title/80100172'
      );
    });
  });
});
