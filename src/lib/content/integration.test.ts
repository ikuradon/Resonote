import { describe, it, expect } from 'vitest';
import { parseContentUrl, getProvider } from './registry.js';
import { SpotifyProvider } from './spotify.js';

const spotify = new SpotifyProvider();

describe('Content integration', () => {
  describe('URL → ContentId → Nostr tag → #I filter value consistency', () => {
    it('track URL produces consistent #I filter value', () => {
      const url = 'https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA';
      const contentId = parseContentUrl(url);
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform);
      expect(provider).toBeDefined();

      const tag = provider!.toNostrTag(contentId!);
      // tag[0] is the tag name, tag[1] is the filter value used in #I filter
      expect(tag[0]).toBe('I');
      expect(tag[1]).toBe('spotify:track:4C6zDr6e86HYqLxPAhO8jA');
    });

    it('album URL produces consistent #I filter value', () => {
      const url = 'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3';
      const contentId = parseContentUrl(url);
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform);
      const tag = provider!.toNostrTag(contentId!);

      expect(tag[0]).toBe('I');
      expect(tag[1]).toBe('spotify:album:1DFixLWuPkv3KT3TnV35m3');
    });

    it('episode URL produces consistent #I filter value', () => {
      const url = 'https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA';
      const contentId = parseContentUrl(url);
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform);
      const tag = provider!.toNostrTag(contentId!);

      expect(tag[0]).toBe('I');
      expect(tag[1]).toBe('spotify:episode:4C6zDr6e86HYqLxPAhO8jA');
    });

    it('show URL produces consistent #I filter value', () => {
      const url = 'https://open.spotify.com/show/0yTcypvuUHOiR1kJa7ihvW';
      const contentId = parseContentUrl(url);
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform);
      const tag = provider!.toNostrTag(contentId!);

      expect(tag[0]).toBe('I');
      expect(tag[1]).toBe('spotify:show:0yTcypvuUHOiR1kJa7ihvW');
    });

    it('URI produces same #I filter value as equivalent URL', () => {
      const uri = 'spotify:track:4C6zDr6e86HYqLxPAhO8jA';
      const url = 'https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA';

      const idFromUri = parseContentUrl(uri);
      const idFromUrl = parseContentUrl(url);

      expect(idFromUri).not.toBeNull();
      expect(idFromUrl).not.toBeNull();

      const provider = getProvider('spotify')!;
      const tagFromUri = provider.toNostrTag(idFromUri!);
      const tagFromUrl = provider.toNostrTag(idFromUrl!);

      expect(tagFromUri[1]).toBe(tagFromUrl[1]);
    });

    it('URL with query params produces same #I filter value as clean URL', () => {
      const urlWithParams = 'https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA?si=abc123';
      const cleanUrl = 'https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA';

      const idWithParams = parseContentUrl(urlWithParams);
      const idClean = parseContentUrl(cleanUrl);

      expect(idWithParams).not.toBeNull();
      expect(idClean).not.toBeNull();

      const provider = getProvider('spotify')!;
      expect(provider.toNostrTag(idWithParams!)[1]).toBe(provider.toNostrTag(idClean!)[1]);
    });
  });

  describe('URL → embedUrl', () => {
    it('track URL generates correct embed URL', () => {
      const contentId = parseContentUrl('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform)!;
      expect(provider.embedUrl(contentId!)).toBe(
        'https://open.spotify.com/embed/track/4C6zDr6e86HYqLxPAhO8jA'
      );
    });

    it('album URL generates correct embed URL', () => {
      const contentId = parseContentUrl('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3');
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform)!;
      expect(provider.embedUrl(contentId!)).toBe(
        'https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3'
      );
    });

    it('episode URL generates correct embed URL', () => {
      const contentId = parseContentUrl('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform)!;
      expect(provider.embedUrl(contentId!)).toBe(
        'https://open.spotify.com/embed/episode/4C6zDr6e86HYqLxPAhO8jA'
      );
    });

    it('show URL generates correct embed URL', () => {
      const contentId = parseContentUrl('https://open.spotify.com/show/0yTcypvuUHOiR1kJa7ihvW');
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform)!;
      expect(provider.embedUrl(contentId!)).toBe(
        'https://open.spotify.com/embed/show/0yTcypvuUHOiR1kJa7ihvW'
      );
    });

    it('URI generates correct embed URL', () => {
      const contentId = parseContentUrl('spotify:track:4C6zDr6e86HYqLxPAhO8jA');
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform)!;
      expect(provider.embedUrl(contentId!)).toBe(
        'https://open.spotify.com/embed/track/4C6zDr6e86HYqLxPAhO8jA'
      );
    });

    it('URL with query params generates correct embed URL', () => {
      const contentId = parseContentUrl(
        'https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA?si=abc123'
      );
      expect(contentId).not.toBeNull();

      const provider = getProvider(contentId!.platform)!;
      expect(provider.embedUrl(contentId!)).toBe(
        'https://open.spotify.com/embed/track/4C6zDr6e86HYqLxPAhO8jA'
      );
    });
  });

  describe('URL → route path', () => {
    it('track URL produces correct route path', () => {
      const contentId = parseContentUrl('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
      expect(contentId).not.toBeNull();

      const path = `/${contentId!.platform}/${contentId!.type}/${contentId!.id}`;
      expect(path).toBe('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    });

    it('album URL produces correct route path', () => {
      const contentId = parseContentUrl('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3');
      expect(contentId).not.toBeNull();

      const path = `/${contentId!.platform}/${contentId!.type}/${contentId!.id}`;
      expect(path).toBe('/spotify/album/1DFixLWuPkv3KT3TnV35m3');
    });

    it('episode URL produces correct route path', () => {
      const contentId = parseContentUrl('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
      expect(contentId).not.toBeNull();

      const path = `/${contentId!.platform}/${contentId!.type}/${contentId!.id}`;
      expect(path).toBe('/spotify/episode/4C6zDr6e86HYqLxPAhO8jA');
    });

    it('show URL produces correct route path', () => {
      const contentId = parseContentUrl('https://open.spotify.com/show/0yTcypvuUHOiR1kJa7ihvW');
      expect(contentId).not.toBeNull();

      const path = `/${contentId!.platform}/${contentId!.type}/${contentId!.id}`;
      expect(path).toBe('/spotify/show/0yTcypvuUHOiR1kJa7ihvW');
    });

    it('URI produces correct route path', () => {
      const contentId = parseContentUrl('spotify:episode:4C6zDr6e86HYqLxPAhO8jA');
      expect(contentId).not.toBeNull();

      const path = `/${contentId!.platform}/${contentId!.type}/${contentId!.id}`;
      expect(path).toBe('/spotify/episode/4C6zDr6e86HYqLxPAhO8jA');
    });

    it('URL with query params produces correct route path', () => {
      const contentId = parseContentUrl(
        'https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA?si=abc123'
      );
      expect(contentId).not.toBeNull();

      const path = `/${contentId!.platform}/${contentId!.type}/${contentId!.id}`;
      expect(path).toBe('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    });
  });

  describe('toNostrTag ↔ parseUrl roundtrip', () => {
    it('track: hint URL from toNostrTag is parsed back to same ContentId', () => {
      const original = { platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' };
      const tag = spotify.toNostrTag(original);
      const hintUrl = tag[2];

      const parsed = spotify.parseUrl(hintUrl);
      expect(parsed).toEqual(original);
    });

    it('album: hint URL from toNostrTag is parsed back to same ContentId', () => {
      const original = { platform: 'spotify', type: 'album', id: '1DFixLWuPkv3KT3TnV35m3' };
      const tag = spotify.toNostrTag(original);
      const hintUrl = tag[2];

      const parsed = spotify.parseUrl(hintUrl);
      expect(parsed).toEqual(original);
    });

    it('episode: hint URL from toNostrTag is parsed back to same ContentId', () => {
      const original = { platform: 'spotify', type: 'episode', id: '4C6zDr6e86HYqLxPAhO8jA' };
      const tag = spotify.toNostrTag(original);
      const hintUrl = tag[2];

      const parsed = spotify.parseUrl(hintUrl);
      expect(parsed).toEqual(original);
    });

    it('show: hint URL from toNostrTag is parsed back to same ContentId', () => {
      const original = { platform: 'spotify', type: 'show', id: '0yTcypvuUHOiR1kJa7ihvW' };
      const tag = spotify.toNostrTag(original);
      const hintUrl = tag[2];

      const parsed = spotify.parseUrl(hintUrl);
      expect(parsed).toEqual(original);
    });

    it('via registry: hint URL round-trips through parseContentUrl', () => {
      const original = { platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' };
      const provider = getProvider(original.platform)!;
      const tag = provider.toNostrTag(original);
      const hintUrl = tag[2];

      const parsed = parseContentUrl(hintUrl);
      expect(parsed).toEqual(original);
    });

    it('URI from toNostrTag tag[1] is also parsed back to same ContentId', () => {
      const original = { platform: 'spotify', type: 'track', id: '4C6zDr6e86HYqLxPAhO8jA' };
      const tag = spotify.toNostrTag(original);
      const uri = tag[1];

      const parsed = spotify.parseUrl(uri);
      expect(parsed).toEqual(original);
    });
  });
});
