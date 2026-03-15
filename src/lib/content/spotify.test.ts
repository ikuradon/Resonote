import { describe, it, expect } from 'vitest';
import { SpotifyProvider } from './spotify.js';

const provider = new SpotifyProvider();

describe('SpotifyProvider', () => {
  describe('platform', () => {
    it('should be "spotify"', () => {
      expect(provider.platform).toBe('spotify');
    });
  });

  describe('parseUrl', () => {
    it('should parse a track URL', () => {
      const result = provider.parseUrl('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
      expect(result).toEqual({ platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' });
    });

    it('should parse an album URL', () => {
      const result = provider.parseUrl('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3');
      expect(result).toEqual({ platform: 'spotify', type: 'album', id: '1DFixLWuPkv3KT3TnV35m3' });
    });

    it('should parse an episode URL', () => {
      const result = provider.parseUrl('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
      expect(result).toEqual({
        platform: 'spotify',
        type: 'episode',
        id: '4C6zDr6e86HYqLxPAhO8jA'
      });
    });

    it('should parse a show URL', () => {
      const result = provider.parseUrl('https://open.spotify.com/show/0yTcypvuUHOiR1kJa7ihvW');
      expect(result).toEqual({ platform: 'spotify', type: 'show', id: '0yTcypvuUHOiR1kJa7ihvW' });
    });

    it('should parse a URL with query parameters', () => {
      const result = provider.parseUrl(
        'https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA?si=abc123'
      );
      expect(result).toEqual({ platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' });
    });

    it('should parse an http URL (non-https)', () => {
      const result = provider.parseUrl('http://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
      expect(result).toEqual({ platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' });
    });

    it('should parse a Spotify URI', () => {
      const result = provider.parseUrl('spotify:track:4C6zDr6e86HYqLxPAhO8jA');
      expect(result).toEqual({ platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' });
    });

    it('should parse an episode URI', () => {
      const result = provider.parseUrl('spotify:episode:4C6zDr6e86HYqLxPAhO8jA');
      expect(result).toEqual({
        platform: 'spotify',
        type: 'episode',
        id: '4C6zDr6e86HYqLxPAhO8jA'
      });
    });

    it('should parse a show URI', () => {
      const result = provider.parseUrl('spotify:show:0yTcypvuUHOiR1kJa7ihvW');
      expect(result).toEqual({ platform: 'spotify', type: 'show', id: '0yTcypvuUHOiR1kJa7ihvW' });
    });

    // --- Abnormal cases ---

    it('should return null for an empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for a non-Spotify URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    });

    it('should return null for an invalid Spotify URL (missing type)', () => {
      expect(provider.parseUrl('https://open.spotify.com/4C6zDr6e86HYqLxPAhO8jA')).toBeNull();
    });

    it('should return null for an unsupported content type', () => {
      expect(
        provider.parseUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
      ).toBeNull();
    });

    it('should return null for a malformed URI', () => {
      expect(provider.parseUrl('spotify:track:')).toBeNull();
    });

    it('should return null for a URI with extra colons', () => {
      expect(provider.parseUrl('spotify:track:abc:extra')).toBeNull();
    });

    it('should return null for random text', () => {
      expect(provider.parseUrl('not a url at all')).toBeNull();
    });

    it('should parse only alphanumeric characters from ID, ignoring trailing special chars', () => {
      const result = provider.parseUrl('https://open.spotify.com/track/abc!@#$%');
      expect(result).toEqual({ platform: 'spotify', type: 'track', id: 'abc' });
    });

    it('should return null for a URL with wrong domain', () => {
      expect(provider.parseUrl('https://fake.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA')).toBeNull();
    });

    it('should parse a URL with fragment', () => {
      const result = provider.parseUrl(
        'https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA#anchor'
      );
      expect(result).toEqual({ platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' });
    });

    it('should parse a URL with trailing slash', () => {
      const result = provider.parseUrl('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA/');
      expect(result).toEqual({ platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' });
    });

    it('should return null for URL with empty ID segment', () => {
      expect(provider.parseUrl('https://open.spotify.com/track/')).toBeNull();
    });

    it('should return null for just the domain', () => {
      expect(provider.parseUrl('https://open.spotify.com')).toBeNull();
    });

    it('should return null for just the domain with trailing slash', () => {
      expect(provider.parseUrl('https://open.spotify.com/')).toBeNull();
    });

    // --- Internationalized URL support ---

    it('should parse an intl-ja track URL', () => {
      const result = provider.parseUrl(
        'https://open.spotify.com/intl-ja/track/5vL1di86qdTvKPBVB66whI'
      );
      expect(result).toEqual({
        platform: 'spotify',
        type: 'track',
        id: '5vL1di86qdTvKPBVB66whI'
      });
    });

    it('should parse an intl-de album URL', () => {
      const result = provider.parseUrl(
        'https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3'
      );
      expect(result).toEqual({
        platform: 'spotify',
        type: 'album',
        id: '1DFixLWuPkv3KT3TnV35m3'
      });
    });

    it('should parse an intl-pt_BR episode URL', () => {
      const result = provider.parseUrl(
        'https://open.spotify.com/intl-pt_BR/episode/4C6zDr6e86HYqLxPAhO8jA'
      );
      expect(result).toEqual({
        platform: 'spotify',
        type: 'episode',
        id: '4C6zDr6e86HYqLxPAhO8jA'
      });
    });
  });

  describe('toNostrTag', () => {
    it('should return [value, hint] for a track', () => {
      const tag = provider.toNostrTag({ platform: 'spotify', type: 'track', id: 'abc123' });
      expect(tag).toEqual(['spotify:track:abc123', 'https://open.spotify.com/track/abc123']);
    });

    it('should return [value, hint] for an episode', () => {
      const tag = provider.toNostrTag({ platform: 'spotify', type: 'episode', id: 'xyz789' });
      expect(tag).toEqual(['spotify:episode:xyz789', 'https://open.spotify.com/episode/xyz789']);
    });

    it('should return [value, hint] for a show', () => {
      const tag = provider.toNostrTag({ platform: 'spotify', type: 'show', id: 'show1' });
      expect(tag).toEqual(['spotify:show:show1', 'https://open.spotify.com/show/show1']);
    });
  });

  describe('contentKind', () => {
    it('should return "spotify:track" for a track', () => {
      expect(provider.contentKind({ platform: 'spotify', type: 'track', id: 'abc123' })).toBe(
        'spotify:track'
      );
    });

    it('should return "spotify:episode" for an episode', () => {
      expect(provider.contentKind({ platform: 'spotify', type: 'episode', id: 'xyz789' })).toBe(
        'spotify:episode'
      );
    });

    it('should return "spotify:show" for a show', () => {
      expect(provider.contentKind({ platform: 'spotify', type: 'show', id: 'show1' })).toBe(
        'spotify:show'
      );
    });
  });

  describe('embedUrl', () => {
    it('should generate embed URL for a track', () => {
      expect(provider.embedUrl({ platform: 'spotify', type: 'track', id: 'abc123' })).toBe(
        'https://open.spotify.com/embed/track/abc123'
      );
    });

    it('should generate embed URL for an album', () => {
      expect(provider.embedUrl({ platform: 'spotify', type: 'album', id: 'xyz789' })).toBe(
        'https://open.spotify.com/embed/album/xyz789'
      );
    });

    it('should generate embed URL for an episode', () => {
      expect(provider.embedUrl({ platform: 'spotify', type: 'episode', id: 'ep1' })).toBe(
        'https://open.spotify.com/embed/episode/ep1'
      );
    });

    it('should generate embed URL for a show', () => {
      expect(provider.embedUrl({ platform: 'spotify', type: 'show', id: 'show1' })).toBe(
        'https://open.spotify.com/embed/show/show1'
      );
    });
  });

  describe('openUrl', () => {
    it('should generate open URL for a track', () => {
      expect(provider.openUrl({ platform: 'spotify', type: 'track', id: 'abc123' })).toBe(
        'https://open.spotify.com/track/abc123'
      );
    });

    it('should generate open URL for a show', () => {
      expect(provider.openUrl({ platform: 'spotify', type: 'show', id: 'show1' })).toBe(
        'https://open.spotify.com/show/show1'
      );
    });
  });
});
