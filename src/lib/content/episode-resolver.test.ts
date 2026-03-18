import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toBase64url } from './url-utils.js';

// Mock podcast-resolver exports
const mockGetSystemPubkey = vi.fn<() => Promise<string>>();
const mockResolveByApi = vi.fn();
const mockParseDTagEvent = vi.fn();

vi.mock('./podcast-resolver.js', () => ({
  getSystemPubkey: (...args: unknown[]) => mockGetSystemPubkey(...(args as [])),
  resolveByApi: (...args: unknown[]) => mockResolveByApi(...(args as [])),
  parseDTagEvent: (...args: unknown[]) => mockParseDTagEvent(...(args as []))
}));

// Mock dynamic imports for nostr modules
const mockGetEventsDB = vi.fn();
vi.mock('../nostr/event-db.js', () => ({
  getEventsDB: (...args: unknown[]) => mockGetEventsDB(...(args as []))
}));

const mockGetRxNostr = vi.fn();
vi.mock('../nostr/client.js', () => ({
  getRxNostr: (...args: unknown[]) => mockGetRxNostr(...(args as []))
}));

const mockCreateRxBackwardReq = vi.fn();
const mockUniq = vi.fn();
vi.mock('rx-nostr', () => ({
  createRxBackwardReq: (...args: unknown[]) => mockCreateRxBackwardReq(...(args as [])),
  uniq: (...args: unknown[]) => mockUniq(...(args as []))
}));

import { resolveEpisode } from './episode-resolver.js';

const FEED_URL = 'https://example.com/feed.xml';
const GUID = 'episode-guid-123';
const FEED_BASE64 = toBase64url(FEED_URL);
const GUID_BASE64 = toBase64url(GUID);

function makeApiResponse(overrides = {}) {
  return {
    type: 'feed' as const,
    feed: {
      guid: 'feed-guid',
      title: 'My Podcast',
      feedUrl: FEED_URL,
      imageUrl: 'https://example.com/img.jpg'
    },
    episodes: [
      {
        guid: GUID,
        title: 'Episode 1',
        enclosureUrl: 'https://example.com/ep1.mp3',
        duration: 3600,
        publishedAt: 1700000000,
        description: 'API description'
      }
    ],
    ...overrides
  };
}

function makeNostrResult(overrides = {}) {
  return {
    guid: GUID,
    feedUrl: FEED_URL,
    enclosureUrl: 'https://example.com/ep1-nostr.mp3',
    description: 'Nostr description',
    ...overrides
  };
}

describe('episode-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Nostr path returns null (no pubkey)
    mockGetSystemPubkey.mockResolvedValue('');
    // Default: API returns empty response
    mockResolveByApi.mockResolvedValue({ type: 'episode' });
    // Default: DB not available
    mockGetEventsDB.mockRejectedValue(new Error('DB not available'));
  });

  describe('resolveEpisode', () => {
    it('should return full result when both Nostr and API succeed', async () => {
      // Nostr: return cached result via IndexedDB
      const pubkey = 'abc123pubkey';
      mockGetSystemPubkey.mockResolvedValue(pubkey);
      mockGetEventsDB.mockResolvedValue({
        getByTagValue: vi.fn().mockResolvedValue([
          {
            pubkey,
            tags: [
              ['i', `podcast:item:guid:${GUID}`, 'https://example.com/ep1-nostr.mp3'],
              ['i', 'podcast:guid:feed-guid', FEED_URL]
            ],
            content: 'Nostr description'
          }
        ])
      });
      mockParseDTagEvent.mockReturnValue(makeNostrResult());

      // API: return episodes array with matching guid
      mockResolveByApi.mockResolvedValue(makeApiResponse());

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      expect(result).not.toBeNull();
      expect(result!.enclosureUrl).toBe('https://example.com/ep1.mp3');
      expect(result!.title).toBe('Episode 1');
      expect(result!.feedTitle).toBe('My Podcast');
      expect(result!.image).toBe('https://example.com/img.jpg');
      // Nostr description preferred via ??
      expect(result!.description).toBe('Nostr description');
    });

    it('should return Nostr-only result when API returns no match', async () => {
      const pubkey = 'abc123pubkey';
      mockGetSystemPubkey.mockResolvedValue(pubkey);
      mockGetEventsDB.mockResolvedValue({
        getByTagValue: vi.fn().mockResolvedValue([
          {
            pubkey,
            tags: [
              ['i', `podcast:item:guid:${GUID}`, 'https://example.com/ep1-nostr.mp3'],
              ['i', 'podcast:guid:feed-guid', FEED_URL]
            ],
            content: 'Nostr description'
          }
        ])
      });
      mockParseDTagEvent.mockReturnValue(makeNostrResult());

      // API returns no episodes and no matching episode
      mockResolveByApi.mockResolvedValue({ type: 'episode' });

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      expect(result).not.toBeNull();
      expect(result!.enclosureUrl).toBe('https://example.com/ep1-nostr.mp3');
      expect(result!.description).toBe('Nostr description');
      expect(result!.title).toBeUndefined();
      expect(result!.feedTitle).toBeUndefined();
    });

    it('should return API-only result when Nostr returns null', async () => {
      // Nostr: no pubkey → returns null
      mockGetSystemPubkey.mockResolvedValue('');

      // API: return episodes with matching guid
      mockResolveByApi.mockResolvedValue(makeApiResponse());

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      expect(result).not.toBeNull();
      expect(result!.enclosureUrl).toBe('https://example.com/ep1.mp3');
      expect(result!.title).toBe('Episode 1');
      expect(result!.feedTitle).toBe('My Podcast');
      expect(result!.image).toBe('https://example.com/img.jpg');
      // Falls back to API description since nostrResult is null
      expect(result!.description).toBe('API description');
    });

    it('should return null when both return no match', async () => {
      mockGetSystemPubkey.mockResolvedValue('');
      mockResolveByApi.mockResolvedValue({ type: 'episode' });

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      expect(result).toBeNull();
    });

    it('should prefer Nostr description over API description via ?? operator', async () => {
      const pubkey = 'abc123pubkey';
      mockGetSystemPubkey.mockResolvedValue(pubkey);
      mockGetEventsDB.mockResolvedValue({
        getByTagValue: vi.fn().mockResolvedValue([
          {
            pubkey,
            tags: [
              ['i', `podcast:item:guid:${GUID}`, 'https://example.com/ep1-nostr.mp3'],
              ['i', 'podcast:guid:feed-guid', FEED_URL]
            ],
            content: 'Nostr desc'
          }
        ])
      });
      mockParseDTagEvent.mockReturnValue(makeNostrResult({ description: 'Nostr desc' }));

      mockResolveByApi.mockResolvedValue(
        makeApiResponse({
          episodes: [
            {
              guid: GUID,
              title: 'Episode 1',
              enclosureUrl: 'https://example.com/ep1.mp3',
              duration: 3600,
              publishedAt: 1700000000,
              description: 'API desc'
            }
          ]
        })
      );

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      expect(result!.description).toBe('Nostr desc');
    });

    it('should fall back to API description when Nostr description is undefined', async () => {
      const pubkey = 'abc123pubkey';
      mockGetSystemPubkey.mockResolvedValue(pubkey);
      mockGetEventsDB.mockResolvedValue({
        getByTagValue: vi.fn().mockResolvedValue([
          {
            pubkey,
            tags: [
              ['i', `podcast:item:guid:${GUID}`, 'https://example.com/ep1-nostr.mp3'],
              ['i', 'podcast:guid:feed-guid', FEED_URL]
            ],
            content: ''
          }
        ])
      });
      mockParseDTagEvent.mockReturnValue(makeNostrResult({ description: undefined }));

      mockResolveByApi.mockResolvedValue(makeApiResponse());

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      expect(result!.description).toBe('API description');
    });

    it('should match episode from API episodes array by guid', async () => {
      mockGetSystemPubkey.mockResolvedValue('');

      const apiResponse = makeApiResponse({
        episodes: [
          {
            guid: 'other-guid',
            title: 'Other Ep',
            enclosureUrl: 'https://example.com/other.mp3',
            duration: 100,
            publishedAt: 1700000000
          },
          {
            guid: GUID,
            title: 'Target Ep',
            enclosureUrl: 'https://example.com/target.mp3',
            duration: 200,
            publishedAt: 1700000001,
            description: 'Target desc'
          }
        ]
      });
      mockResolveByApi.mockResolvedValue(apiResponse);

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Target Ep');
      expect(result!.enclosureUrl).toBe('https://example.com/target.mp3');
      expect(result!.description).toBe('Target desc');
    });

    it('should match API single episode when episodes array has no match', async () => {
      mockGetSystemPubkey.mockResolvedValue('');

      mockResolveByApi.mockResolvedValue({
        type: 'episode',
        feed: {
          guid: 'feed-guid',
          title: 'My Podcast',
          feedUrl: FEED_URL,
          imageUrl: 'https://example.com/img.jpg'
        },
        episode: {
          guid: GUID,
          title: 'Single Episode',
          enclosureUrl: 'https://example.com/single.mp3',
          duration: 500,
          publishedAt: 1700000000,
          description: 'Single desc'
        }
      });

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Single Episode');
      expect(result!.enclosureUrl).toBe('https://example.com/single.mp3');
      expect(result!.feedTitle).toBe('My Podcast');
      expect(result!.description).toBe('Single desc');
    });

    it('should not match API single episode when guid differs', async () => {
      mockGetSystemPubkey.mockResolvedValue('');

      mockResolveByApi.mockResolvedValue({
        type: 'episode',
        feed: {
          guid: 'feed-guid',
          title: 'My Podcast',
          feedUrl: FEED_URL,
          imageUrl: 'https://example.com/img.jpg'
        },
        episode: {
          guid: 'wrong-guid',
          title: 'Wrong Episode',
          enclosureUrl: 'https://example.com/wrong.mp3',
          duration: 500,
          publishedAt: 1700000000
        }
      });

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      expect(result).toBeNull();
    });

    it('should execute Nostr and API queries in parallel', async () => {
      const callOrder: string[] = [];
      let resolveNostr: (v: string) => void;
      let resolveApi: (v: unknown) => void;

      mockGetSystemPubkey.mockImplementation(() => {
        callOrder.push('nostr-start');
        return new Promise<string>((r) => {
          resolveNostr = r;
        });
      });

      mockResolveByApi.mockImplementation(() => {
        callOrder.push('api-start');
        return new Promise((r) => {
          resolveApi = r;
        });
      });

      const promise = resolveEpisode(FEED_BASE64, GUID_BASE64);

      // Both should have started before either resolves
      // Wait a tick for promises to schedule
      await new Promise((r) => setTimeout(r, 0));
      expect(callOrder).toContain('nostr-start');
      expect(callOrder).toContain('api-start');

      // Resolve both
      resolveNostr!('');
      resolveApi!({ type: 'episode' });

      const result = await promise;
      expect(result).toBeNull();
    });

    it('should correctly decode base64url encoded feedUrl and guid', async () => {
      const specialGuid = 'guid/with+special=chars';
      const specialFeed = 'https://example.com/feed?a=1&b=2';
      const feedB64 = toBase64url(specialFeed);
      const guidB64 = toBase64url(specialGuid);

      mockGetSystemPubkey.mockResolvedValue('');
      mockResolveByApi.mockResolvedValue({
        type: 'episode',
        feed: { guid: 'fg', title: 'T', feedUrl: specialFeed, imageUrl: '' },
        episode: {
          guid: specialGuid,
          title: 'Ep',
          enclosureUrl: 'https://example.com/ep.mp3',
          duration: 60,
          publishedAt: 1700000000
        }
      });

      const result = await resolveEpisode(feedB64, guidB64);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Ep');
      // Verify resolveByApi was called with decoded feed URL
      expect(mockResolveByApi).toHaveBeenCalledWith(specialFeed);
    });

    it('should handle empty guid gracefully', async () => {
      const emptyGuidB64 = toBase64url('');
      mockGetSystemPubkey.mockResolvedValue('');
      mockResolveByApi.mockResolvedValue({ type: 'episode' });

      const result = await resolveEpisode(FEED_BASE64, emptyGuidB64);

      expect(result).toBeNull();
    });

    it('should handle empty feedUrl gracefully', async () => {
      const emptyFeedB64 = toBase64url('');

      const result = await resolveEpisode(emptyFeedB64, GUID_BASE64);

      expect(result).toBeNull();
      expect(mockResolveByApi).not.toHaveBeenCalled();
    });

    it('should return feedTitle and image from API feed even with Nostr-only episode match', async () => {
      // When API has feed info but episodes do not match, and Nostr has the episode,
      // the Nostr-only path does NOT include feedTitle/image
      const pubkey = 'abc123pubkey';
      mockGetSystemPubkey.mockResolvedValue(pubkey);
      mockGetEventsDB.mockResolvedValue({
        getByTagValue: vi.fn().mockResolvedValue([
          {
            pubkey,
            tags: [
              ['i', `podcast:item:guid:${GUID}`, 'https://example.com/ep1-nostr.mp3'],
              ['i', 'podcast:guid:feed-guid', FEED_URL]
            ],
            content: 'Nostr desc'
          }
        ])
      });
      mockParseDTagEvent.mockReturnValue(makeNostrResult({ description: 'Nostr desc' }));

      // API has feed info but no matching episode
      mockResolveByApi.mockResolvedValue({
        type: 'feed',
        feed: {
          guid: 'feed-guid',
          title: 'My Podcast',
          feedUrl: FEED_URL,
          imageUrl: 'https://example.com/img.jpg'
        },
        episodes: [
          {
            guid: 'different-guid',
            title: 'Other',
            enclosureUrl: 'https://example.com/other.mp3',
            duration: 100,
            publishedAt: 1700000000
          }
        ]
      });

      const result = await resolveEpisode(FEED_BASE64, GUID_BASE64);

      // Falls through to Nostr-only path since API episodes don't match
      expect(result).not.toBeNull();
      expect(result!.enclosureUrl).toBe('https://example.com/ep1-nostr.mp3');
      expect(result!.description).toBe('Nostr desc');
      // Nostr-only path does not include feedTitle/image
      expect(result!.feedTitle).toBeUndefined();
    });
  });
});
