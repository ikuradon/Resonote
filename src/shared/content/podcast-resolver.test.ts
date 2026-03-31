import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseDTagEvent } from '$shared/content/podcast-resolver.js';

const { verifierMock, mockGetEventsDB, mockGetRxNostr } = vi.hoisted(() => ({
  verifierMock: vi.fn(),
  mockGetEventsDB: vi.fn(),
  mockGetRxNostr: vi.fn()
}));

vi.mock('@rx-nostr/crypto', () => ({
  verifier: verifierMock
}));

vi.mock('$shared/nostr/store.js', () => ({
  getStoreAsync: () => ({
    getSync: (...args: unknown[]) => mockGetEventsDB(...(args as [])),
    fetchById: vi.fn().mockResolvedValue(null),
    dispose: vi.fn()
  })
}));

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: (...args: unknown[]) => mockGetRxNostr(...(args as []))
}));

const mockCreateRxBackwardReq = vi.fn();
const mockUniq = vi.fn();
vi.mock('rx-nostr', () => ({
  createRxBackwardReq: (...args: unknown[]) => mockCreateRxBackwardReq(...(args as [])),
  uniq: (...args: unknown[]) => mockUniq(...(args as []))
}));

function stubPubkeyFetch(pubkey: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pubkey })
    })
  );
}

function stubFailedPubkeyFetch() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
}

/** Set up rx-nostr mock that emits a single event asynchronously, or completes immediately. */
function setupRelayMock(event: { tags: string[][]; content: string } | null) {
  const mockReq = { emit: vi.fn(), over: vi.fn() };
  mockCreateRxBackwardReq.mockReturnValue(mockReq);
  mockUniq.mockReturnValue((source: unknown) => source);

  const mockSubscribe = vi.fn().mockImplementation(({ next, complete }) => {
    if (event) {
      void Promise.resolve().then(() => next({ event }));
    } else {
      complete();
    }
    return { unsubscribe: vi.fn() };
  });
  const mockPipe = vi.fn().mockReturnValue({ subscribe: mockSubscribe });
  const mockUse = vi.fn().mockReturnValue({ pipe: mockPipe });
  mockGetRxNostr.mockResolvedValue({ use: mockUse });
}

describe('podcast-resolver', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  describe('resolveByDTag', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.restoreAllMocks();
    });

    it('should fetch system pubkey, query rx-nostr, and return parsed result', async () => {
      stubPubkeyFetch('sys-pubkey-abc');

      const { resolveByDTag } = await import('$shared/content/podcast-resolver.js');

      const mockEvent = {
        tags: [
          ['i', 'podcast:guid:feed-guid-123', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:ep-guid-789', 'https://example.com/ep.mp3']
        ],
        content: 'Episode desc'
      };

      const rxNostrQuery = vi.fn().mockResolvedValue(mockEvent);

      const result = await resolveByDTag('https://example.com/ep.mp3', rxNostrQuery);

      expect(rxNostrQuery).toHaveBeenCalledWith({
        kinds: [39701],
        authors: ['sys-pubkey-abc'],
        '#d': ['example.com/ep.mp3']
      });
      expect(result).not.toBeNull();
      expect(result!.guid).toBe('ep-guid-789');
      expect(result!.feedUrl).toBe('https://example.com/feed.xml');
      expect(result!.enclosureUrl).toBe('https://example.com/ep.mp3');
      expect(result!.description).toBe('Episode desc');
    });

    it('should return null when system pubkey fetch fails', async () => {
      stubFailedPubkeyFetch();

      const { resolveByDTag } = await import('$shared/content/podcast-resolver.js');
      const rxNostrQuery = vi.fn();

      const result = await resolveByDTag('https://example.com/ep.mp3', rxNostrQuery);

      expect(result).toBeNull();
      expect(rxNostrQuery).not.toHaveBeenCalled();
    });

    it('should return null when rx-nostr query returns null (timeout)', async () => {
      stubPubkeyFetch('sys-pubkey');

      const { resolveByDTag } = await import('$shared/content/podcast-resolver.js');
      const rxNostrQuery = vi.fn().mockResolvedValue(null);

      const result = await resolveByDTag('https://example.com/ep.mp3', rxNostrQuery);

      expect(result).toBeNull();
    });

    it('should return null when event has invalid tags (parseDTagEvent fails)', async () => {
      stubPubkeyFetch('sys-pubkey');

      const { resolveByDTag } = await import('$shared/content/podcast-resolver.js');
      const mockEvent = {
        tags: [['d', 'something']],
        content: ''
      };
      const rxNostrQuery = vi.fn().mockResolvedValue(mockEvent);

      const result = await resolveByDTag('https://example.com/ep.mp3', rxNostrQuery);

      expect(result).toBeNull();
    });

    it('should normalize URL before querying (trailing slash, scheme removal)', async () => {
      stubPubkeyFetch('sys-pubkey');

      const { resolveByDTag } = await import('$shared/content/podcast-resolver.js');
      const rxNostrQuery = vi.fn().mockResolvedValue(null);

      await resolveByDTag('https://Example.COM/path/', rxNostrQuery);

      expect(rxNostrQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          '#d': ['example.com/path']
        })
      );
    });
  });

  describe('searchBookmarkByUrl', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.restoreAllMocks();
      mockGetEventsDB.mockReset();
      mockGetRxNostr.mockReset();
      mockCreateRxBackwardReq.mockReset();
      mockUniq.mockReset();
    });

    it('should return cached result from DB when available', async () => {
      stubPubkeyFetch('sys-pubkey');

      const cachedEvent = {
        tags: [
          ['i', 'podcast:guid:feed-guid', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:ep-guid', 'https://example.com/ep.mp3']
        ],
        content: 'Cached desc'
      };
      mockGetEventsDB.mockResolvedValue([{ event: cachedEvent, seenOn: [], firstSeen: 0 }]);

      const { searchBookmarkByUrl } = await import('$shared/content/podcast-resolver.js');
      const result = await searchBookmarkByUrl('https://example.com/ep.mp3');

      expect(result).not.toBeNull();
      expect(result!.guid).toBe('ep-guid');
      expect(result!.feedUrl).toBe('https://example.com/feed.xml');
      expect(result!.description).toBe('Cached desc');
    });

    it('should fall through to relay when DB cache misses', async () => {
      stubPubkeyFetch('sys-pubkey');

      mockGetEventsDB.mockResolvedValue([]);

      const relayEvent = {
        tags: [
          ['i', 'podcast:guid:feed-guid', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:ep-guid', 'https://example.com/ep.mp3']
        ],
        content: 'Relay desc'
      };

      setupRelayMock(relayEvent);

      const { searchBookmarkByUrl } = await import('$shared/content/podcast-resolver.js');
      const result = await searchBookmarkByUrl('https://example.com/ep.mp3');

      expect(result).not.toBeNull();
      expect(result!.guid).toBe('ep-guid');
      expect(result!.description).toBe('Relay desc');
    });

    it('should return null when system pubkey is empty', async () => {
      stubFailedPubkeyFetch();

      const { searchBookmarkByUrl } = await import('$shared/content/podcast-resolver.js');
      const result = await searchBookmarkByUrl('https://example.com/ep.mp3');

      expect(result).toBeNull();
    });

    it('should return null when relay subscription times out (complete with no events)', async () => {
      stubPubkeyFetch('sys-pubkey');

      mockGetEventsDB.mockResolvedValue([]);

      setupRelayMock(null);

      const { searchBookmarkByUrl } = await import('$shared/content/podcast-resolver.js');
      const result = await searchBookmarkByUrl('https://example.com/ep.mp3');

      expect(result).toBeNull();
    });

    it('should normalize URL with trailing slash before querying', async () => {
      stubPubkeyFetch('sys-pubkey');

      const cachedEvent = {
        tags: [
          ['i', 'podcast:guid:feed-guid', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:ep-guid', 'https://example.com/ep.mp3']
        ],
        content: ''
      };
      mockGetEventsDB.mockResolvedValue([{ event: cachedEvent, seenOn: [], firstSeen: 0 }]);

      const { searchBookmarkByUrl } = await import('$shared/content/podcast-resolver.js');
      await searchBookmarkByUrl('https://Example.COM/ep.mp3/');

      expect(mockGetEventsDB).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: [39701],
          authors: ['sys-pubkey'],
          '#d': ['example.com/ep.mp3']
        })
      );
    });

    it('should use relay result (connectStore handles caching automatically)', async () => {
      stubPubkeyFetch('sys-pubkey');

      mockGetEventsDB.mockResolvedValue([]);

      const relayEvent = {
        tags: [
          ['i', 'podcast:guid:feed-guid', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:ep-guid', 'https://example.com/ep.mp3']
        ],
        content: 'desc'
      };

      setupRelayMock(relayEvent);

      const { searchBookmarkByUrl } = await import('$shared/content/podcast-resolver.js');
      const result = await searchBookmarkByUrl('https://example.com/ep.mp3');

      // connectStore() handles caching automatically — no explicit put call
      expect(result).not.toBeNull();
      expect(result!.guid).toBe('ep-guid');
    });

    it('should return null when DB and relay both fail', async () => {
      stubPubkeyFetch('sys-pubkey');

      // Store getSync throws
      mockGetEventsDB.mockRejectedValue(new Error('DB error'));

      // Relay also fails
      mockGetRxNostr.mockRejectedValue(new Error('relay error'));

      const { searchBookmarkByUrl } = await import('$shared/content/podcast-resolver.js');
      const result = await searchBookmarkByUrl('https://example.com/ep.mp3');

      expect(result).toBeNull();
    });

    it('should skip invalid cached event and fall through to relay', async () => {
      stubPubkeyFetch('sys-pubkey');

      // DB returns event that parseDTagEvent rejects (missing required tags)
      const invalidCachedEvent = {
        tags: [['d', 'something']],
        content: ''
      };
      mockGetEventsDB.mockResolvedValue([{ event: invalidCachedEvent, seenOn: [], firstSeen: 0 }]);

      const relayEvent = {
        tags: [
          ['i', 'podcast:guid:feed-guid', 'https://example.com/feed.xml'],
          ['i', 'podcast:item:guid:ep-guid', 'https://example.com/ep.mp3']
        ],
        content: 'Relay desc'
      };

      setupRelayMock(relayEvent);

      const { searchBookmarkByUrl } = await import('$shared/content/podcast-resolver.js');
      const result = await searchBookmarkByUrl('https://example.com/ep.mp3');

      expect(result).not.toBeNull();
      expect(result!.guid).toBe('ep-guid');
    });
  });

  describe('resolveByApi — validateResolveResponse edge cases', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.restoreAllMocks();
      verifierMock.mockReset();
    });

    it('should return invalid_response for null data', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(null)
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.error).toBe('invalid_response');
    });

    it('should handle verifier throwing for malformed event', async () => {
      verifierMock.mockRejectedValue(new Error('invalid event'));

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'feed',
              signedEvents: [{ malformed: true }]
            })
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.type).toBe('feed');
      expect(result.signedEvents).toBeUndefined();
    });

    it('should return invalid_response when json() throws', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.reject(new Error('parse error'))
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.error).toBe('invalid_response');
    });

    it('should preserve valid type values: feed, redirect', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({ type: 'redirect', feedUrl: 'https://example.com/real-feed' })
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.type).toBe('redirect');
      expect(result.feedUrl).toBe('https://example.com/real-feed');
    });

    it('should set signedEvents to undefined for empty array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'episode',
              signedEvents: []
            })
        })
      );
      const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
      const result = await resolveByApi('https://example.com/feed');
      expect(result.signedEvents).toBeUndefined();
    });
  });
});
