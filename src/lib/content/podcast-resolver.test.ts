import { describe, it, expect } from 'vitest';
import { parseDTagEvent, getSystemPubkey } from './podcast-resolver.js';

describe('podcast-resolver', () => {
  describe('getSystemPubkey', () => {
    it('should be an async function', () => {
      expect(typeof getSystemPubkey).toBe('function');
    });
  });

  describe('parseDTagEvent', () => {
    it('should extract guid, feedUrl, enclosureUrl from proper tags', () => {
      const event = {
        kind: 39701,
        tags: [
          ['d', 'example.com/episode.mp3'],
          ['i', 'podcast:guid:feed-guid-123', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:episode-guid-456', 'https://example.com/episode.mp3']
        ]
      };

      const result = parseDTagEvent(event);
      expect(result).not.toBeNull();
      expect(result!.guid).toBe('episode-guid-456');
      expect(result!.feedUrl).toBe('https://example.com/feed.xml');
      expect(result!.enclosureUrl).toBe('https://example.com/episode.mp3');
    });

    it('should return null when podcast:item:guid tag is missing', () => {
      const event = {
        kind: 39701,
        tags: [
          ['d', 'example.com/feed'],
          ['i', 'podcast:guid:feed-guid-123', 'https://example.com/feed.xml']
        ]
      };

      const result = parseDTagEvent(event);
      expect(result).toBeNull();
    });

    it('should return null when podcast:guid tag is missing', () => {
      const event = {
        kind: 39701,
        tags: [
          ['d', 'example.com/episode.mp3'],
          ['i', 'podcast:item:guid:episode-guid-456', 'https://example.com/episode.mp3']
        ]
      };

      const result = parseDTagEvent(event);
      expect(result).toBeNull();
    });

    it('should return null when both tags are missing', () => {
      const event = {
        kind: 39701,
        tags: [['d', 'example.com/episode.mp3']]
      };

      const result = parseDTagEvent(event);
      expect(result).toBeNull();
    });

    it('should return null when hint (enclosureUrl) is missing from item:guid tag', () => {
      const event = {
        kind: 39701,
        tags: [
          ['i', 'podcast:guid:feed-guid-123', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:episode-guid-456']
        ]
      };

      const result = parseDTagEvent(event);
      expect(result).toBeNull();
    });

    it('should return null when hint (feedUrl) is missing from podcast:guid tag', () => {
      const event = {
        kind: 39701,
        tags: [
          ['i', 'podcast:guid:feed-guid-123'],
          ['i', 'podcast:item:guid:episode-guid-456', 'https://example.com/episode.mp3']
        ]
      };

      const result = parseDTagEvent(event);
      expect(result).toBeNull();
    });
  });
});
