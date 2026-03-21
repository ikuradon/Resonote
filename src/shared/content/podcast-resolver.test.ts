import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseDTagEvent } from '$shared/content/podcast-resolver.js';

const { verifierMock } = vi.hoisted(() => ({
  verifierMock: vi.fn()
}));

vi.mock('@rx-nostr/crypto', () => ({
  verifier: verifierMock
}));

describe('podcast-resolver', () => {
  describe('getSystemPubkey', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.restoreAllMocks();
    });

    it('should return pubkey on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ pubkey: 'abc123' })
        })
      );
      const { getSystemPubkey } = await import('$shared/content/podcast-resolver.js');
      const result = await getSystemPubkey();
      expect(result).toBe('abc123');
      vi.unstubAllGlobals();
    });

    it('should return empty string and allow retry on 5xx error', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ pubkey: 'recovered' })
        });
      vi.stubGlobal('fetch', fetchMock);

      const { getSystemPubkey } = await import('$shared/content/podcast-resolver.js');

      const result1 = await getSystemPubkey();
      expect(result1).toBe('');

      const result2 = await getSystemPubkey();
      expect(result2).toBe('recovered');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.unstubAllGlobals();
    });

    it('should return empty string and allow retry on network error', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ pubkey: 'recovered' })
        });
      vi.stubGlobal('fetch', fetchMock);

      const { getSystemPubkey } = await import('$shared/content/podcast-resolver.js');

      const result1 = await getSystemPubkey();
      expect(result1).toBe('');

      const result2 = await getSystemPubkey();
      expect(result2).toBe('recovered');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.unstubAllGlobals();
    });

    it('should return empty string and allow retry when pubkey is not a string', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ pubkey: 42 })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ pubkey: 'recovered' })
        });
      vi.stubGlobal('fetch', fetchMock);

      const { getSystemPubkey } = await import('$shared/content/podcast-resolver.js');

      const result1 = await getSystemPubkey();
      expect(result1).toBe('');

      const result2 = await getSystemPubkey();
      expect(result2).toBe('recovered');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.unstubAllGlobals();
    });

    it('should cache successful result', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ pubkey: 'cached' })
      });
      vi.stubGlobal('fetch', fetchMock);

      const { getSystemPubkey } = await import('$shared/content/podcast-resolver.js');

      await getSystemPubkey();
      await getSystemPubkey();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    });
  });

  describe('resolveByApi', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.restoreAllMocks();
      verifierMock.mockReset();
    });

    it('should return error on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.error).toBe('fetch_failed');
      vi.unstubAllGlobals();
    });

    it('should return invalid_response for non-object data', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve('not an object')
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.error).toBe('invalid_response');
      vi.unstubAllGlobals();
    });

    it('should fallback type to episode for invalid type value', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ type: 'invalid_type' })
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.type).toBe('episode');
      vi.unstubAllGlobals();
    });

    it('should keep verified signedEvents and discard invalid ones', async () => {
      const validEvent = { id: 'a', sig: 'sig', kind: 1, tags: [] };
      const invalidEvent = { id: 'b', sig: 'bad', kind: 1, tags: [] };
      verifierMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'episode',
              signedEvents: [validEvent, invalidEvent]
            })
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.signedEvents).toEqual([validEvent]);
      vi.unstubAllGlobals();
    });

    it('should set signedEvents to undefined when all fail verification', async () => {
      verifierMock.mockResolvedValue(false);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'episode',
              signedEvents: [{ id: 'x', sig: 'bad', kind: 1, tags: [] }]
            })
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.signedEvents).toBeUndefined();
      vi.unstubAllGlobals();
    });

    it('should set signedEvents to undefined when not an array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'episode',
              signedEvents: 'not-an-array'
            })
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.signedEvents).toBeUndefined();
      vi.unstubAllGlobals();
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

    it('should extract description from content field', () => {
      const event = {
        kind: 39701,
        tags: [
          ['d', 'example.com/episode.mp3'],
          ['i', 'podcast:guid:feed-guid-123', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:episode-guid-456', 'https://example.com/episode.mp3']
        ],
        content: 'This is the episode description'
      };

      const result = parseDTagEvent(event);
      expect(result).not.toBeNull();
      expect(result!.description).toBe('This is the episode description');
    });

    it('should return undefined description when content is empty string', () => {
      const event = {
        kind: 39701,
        tags: [
          ['d', 'example.com/episode.mp3'],
          ['i', 'podcast:guid:feed-guid-123', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:episode-guid-456', 'https://example.com/episode.mp3']
        ],
        content: ''
      };

      const result = parseDTagEvent(event);
      expect(result).not.toBeNull();
      expect(result!.description).toBeUndefined();
    });

    it('should return undefined description when content field is missing', () => {
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
      expect(result!.description).toBeUndefined();
    });

    it('should include description in DTagResult type', () => {
      const event = {
        kind: 39701,
        tags: [
          ['d', 'example.com/episode.mp3'],
          ['i', 'podcast:guid:feed-guid-123', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:episode-guid-456', 'https://example.com/episode.mp3']
        ],
        content: 'A description'
      };

      const result = parseDTagEvent(event);
      expect(result).not.toBeNull();
      // Verify the result conforms to DTagResult with description
      const { guid, feedUrl, enclosureUrl, description } = result!;
      expect(guid).toBe('episode-guid-456');
      expect(feedUrl).toBe('https://example.com/feed.xml');
      expect(enclosureUrl).toBe('https://example.com/episode.mp3');
      expect(description).toBe('A description');
    });
  });
});
