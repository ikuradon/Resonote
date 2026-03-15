import { describe, it, expect } from 'vitest';
import { PodcastProvider, buildEpisodeContentId } from './podcast.js';
import { toBase64url, fromBase64url } from './url-utils.js';

const provider = new PodcastProvider();

describe('PodcastProvider', () => {
  describe('platform', () => {
    it('should be "podcast"', () => {
      expect(provider.platform).toBe('podcast');
    });

    it('displayName should be "Podcast"', () => {
      expect(provider.displayName).toBe('Podcast');
    });

    it('requiresExtension should be false', () => {
      expect(provider.requiresExtension).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('should parse .rss feed URL', () => {
      const url = 'https://example.com/feed.rss';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'podcast', type: 'feed', id: toBase64url(url) });
    });

    it('should parse .xml feed URL', () => {
      const url = 'https://example.com/podcast.xml';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'podcast', type: 'feed', id: toBase64url(url) });
    });

    it('should parse .atom feed URL', () => {
      const url = 'https://example.com/feed.atom';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'podcast', type: 'feed', id: toBase64url(url) });
    });

    it('should parse .json feed URL', () => {
      const url = 'https://example.com/feed.json';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'podcast', type: 'feed', id: toBase64url(url) });
    });

    it('should parse URL with /feed path segment', () => {
      const url = 'https://example.com/podcast/feed';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'podcast', type: 'feed', id: toBase64url(url) });
    });

    it('should parse URL with /rss path segment', () => {
      const url = 'https://example.com/podcast/rss';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'podcast', type: 'feed', id: toBase64url(url) });
    });

    it('should parse URL with /atom path segment', () => {
      const url = 'https://example.com/podcast/atom';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'podcast', type: 'feed', id: toBase64url(url) });
    });

    it('should parse URL with /feed/ path (trailing slash)', () => {
      const url = 'https://example.com/podcast/feed/';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'podcast', type: 'feed', id: toBase64url(url) });
    });

    it('should parse feed URL with query params (preserve full URL in id)', () => {
      const url = 'https://example.com/feed.rss?token=abc';
      const result = provider.parseUrl(url);
      expect(result).toEqual({ platform: 'podcast', type: 'feed', id: toBase64url(url) });
    });

    it('should return null for a non-feed URL', () => {
      expect(provider.parseUrl('https://example.com/episode.mp3')).toBeNull();
    });

    it('should return null for a YouTube URL', () => {
      expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    });

    it('should return null for an empty string', () => {
      expect(provider.parseUrl('')).toBeNull();
    });

    it('should return null for a URL with unrecognized extension', () => {
      expect(provider.parseUrl('https://example.com/page.html')).toBeNull();
    });
  });

  describe('toNostrTag (feed type)', () => {
    it('should return [podcast:guid:<feedUrl>, <feedUrl>] for feed', () => {
      const feedUrl = 'https://example.com/feed.rss';
      const contentId = { platform: 'podcast', type: 'feed', id: toBase64url(feedUrl) };
      const tag = provider.toNostrTag(contentId);
      expect(tag).toEqual([`podcast:guid:${feedUrl}`, feedUrl]);
    });
  });

  describe('toNostrTag (episode type)', () => {
    it('should return [podcast:item:guid:<guid>, <feedUrl>] for episode', () => {
      const feedUrl = 'https://example.com/feed.rss';
      const guid = 'abc-123-def';
      const contentId = buildEpisodeContentId(feedUrl, guid);
      const tag = provider.toNostrTag(contentId);
      expect(tag).toEqual([`podcast:item:guid:${guid}`, feedUrl]);
    });
  });

  describe('contentKind', () => {
    it('should return "podcast:feed" for feed type', () => {
      const contentId = {
        platform: 'podcast',
        type: 'feed',
        id: toBase64url('https://example.com/feed.rss')
      };
      expect(provider.contentKind(contentId)).toBe('podcast:feed');
    });

    it('should return "podcast:item:guid" for episode type', () => {
      const contentId = buildEpisodeContentId('https://example.com/feed.rss', 'guid-123');
      expect(provider.contentKind(contentId)).toBe('podcast:item:guid');
    });
  });

  describe('embedUrl', () => {
    it('should return null for feed', () => {
      expect(provider.embedUrl()).toBeNull();
    });

    it('should return null for episode', () => {
      expect(provider.embedUrl()).toBeNull();
    });
  });

  describe('openUrl', () => {
    it('should return decoded feed URL for feed type', () => {
      const feedUrl = 'https://example.com/feed.rss';
      const contentId = { platform: 'podcast', type: 'feed', id: toBase64url(feedUrl) };
      expect(provider.openUrl(contentId)).toBe(feedUrl);
    });

    it('should return decoded feed URL for episode type', () => {
      const feedUrl = 'https://example.com/feed.rss';
      const contentId = buildEpisodeContentId(feedUrl, 'guid-123');
      expect(provider.openUrl(contentId)).toBe(feedUrl);
    });
  });
});

describe('buildEpisodeContentId', () => {
  it('should build a ContentId with platform podcast and type episode', () => {
    const feedUrl = 'https://example.com/feed.rss';
    const guid = 'episode-guid-abc';
    const contentId = buildEpisodeContentId(feedUrl, guid);
    expect(contentId.platform).toBe('podcast');
    expect(contentId.type).toBe('episode');
  });

  it('should encode feedUrl and guid as base64url separated by colon', () => {
    const feedUrl = 'https://example.com/feed.rss';
    const guid = 'episode-guid-abc';
    const contentId = buildEpisodeContentId(feedUrl, guid);
    expect(contentId.id).toBe(`${toBase64url(feedUrl)}:${toBase64url(guid)}`);
  });

  it('should allow round-trip decode of feedUrl and guid', () => {
    const feedUrl = 'https://example.com/feed.rss';
    const guid = 'episode-guid-abc';
    const contentId = buildEpisodeContentId(feedUrl, guid);
    const [encodedFeed, encodedGuid] = contentId.id.split(':');
    expect(fromBase64url(encodedFeed)).toBe(feedUrl);
    expect(fromBase64url(encodedGuid)).toBe(guid);
  });

  it('should handle special characters in guid', () => {
    const feedUrl = 'https://example.com/feed.rss';
    const guid = 'https://example.com/episodes/episode-1';
    const contentId = buildEpisodeContentId(feedUrl, guid);
    const [encodedFeed, encodedGuid] = contentId.id.split(':');
    expect(fromBase64url(encodedFeed)).toBe(feedUrl);
    expect(fromBase64url(encodedGuid)).toBe(guid);
  });
});
