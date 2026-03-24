import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockResolveEpisode,
  mockResolveByApi,
  mockSearchBookmarkByUrl,
  mockBuildEpisodeContentId,
  mockPublishSignedEvents,
  mockFromBase64url,
  mockToBase64url,
  mockLogError
} = vi.hoisted(() => ({
  mockResolveEpisode: vi.fn(),
  mockResolveByApi: vi.fn(),
  mockSearchBookmarkByUrl: vi.fn(),
  mockBuildEpisodeContentId: vi.fn(),
  mockPublishSignedEvents: vi.fn(),
  mockFromBase64url: vi.fn(),
  mockToBase64url: vi.fn(),
  mockLogError: vi.fn()
}));

vi.mock('$shared/content/resolution.js', () => ({
  resolveEpisode: (...args: unknown[]) => mockResolveEpisode(...(args as [])),
  resolveByApi: (...args: unknown[]) => mockResolveByApi(...(args as [])),
  searchBookmarkByUrl: (...args: unknown[]) => mockSearchBookmarkByUrl(...(args as [])),
  buildEpisodeContentId: (...args: unknown[]) => mockBuildEpisodeContentId(...(args as []))
}));

vi.mock('$shared/content/url-utils.js', () => ({
  fromBase64url: (...args: unknown[]) => mockFromBase64url(...(args as [])),
  toBase64url: (...args: unknown[]) => mockToBase64url(...(args as []))
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  publishSignedEvents: (...args: unknown[]) => mockPublishSignedEvents(...(args as []))
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ error: mockLogError })
}));

import { resolveAudioUrl, resolvePodcastEpisode } from './resolve-content.js';

const FEED_URL = 'https://example.com/feed.xml';
const GUID = 'episode-guid-123';
const ENCLOSURE_URL = 'https://example.com/ep.mp3';
const AUDIO_URL = 'https://example.com/audio.mp3';
const FEED_BASE64 = 'ZmVlZEJhc2U2NA';
const GUID_BASE64 = 'Z3VpZEJhc2U2NA';

function makeEpisodeInfo(overrides = {}) {
  return {
    enclosureUrl: ENCLOSURE_URL,
    title: 'Episode Title',
    feedTitle: 'Feed Title',
    image: 'https://example.com/img.jpg',
    description: 'Episode description',
    ...overrides
  };
}

describe('resolvePodcastEpisode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToBase64url.mockImplementation((s: string) => btoa(s));
  });

  it('returns emptyResult when contentIdParam has wrong number of parts', async () => {
    const result = await resolvePodcastEpisode('onlyonepart');
    expect(result).toEqual({ metadata: {}, additionalSubscriptions: [], signedEvents: [] });
    expect(mockResolveEpisode).not.toHaveBeenCalled();
  });

  it('returns emptyResult when contentIdParam has too many parts', async () => {
    const result = await resolvePodcastEpisode('a:b:c');
    expect(result).toEqual({ metadata: {}, additionalSubscriptions: [], signedEvents: [] });
    expect(mockResolveEpisode).not.toHaveBeenCalled();
  });

  it('returns emptyResult when resolveEpisode returns null', async () => {
    mockResolveEpisode.mockResolvedValue(null);
    const result = await resolvePodcastEpisode(`${FEED_BASE64}:${GUID_BASE64}`);
    expect(result).toEqual({ metadata: {}, additionalSubscriptions: [], signedEvents: [] });
  });

  it('returns full ResolutionResult when resolveEpisode succeeds', async () => {
    mockResolveEpisode.mockResolvedValue(makeEpisodeInfo());
    const result = await resolvePodcastEpisode(`${FEED_BASE64}:${GUID_BASE64}`);

    expect(result.metadata).toEqual({
      title: 'Episode Title',
      feedTitle: 'Feed Title',
      image: 'https://example.com/img.jpg',
      description: 'Episode description',
      enclosureUrl: ENCLOSURE_URL
    });
    expect(result.additionalSubscriptions).toEqual([`audio:${ENCLOSURE_URL}`]);
    expect(result.signedEvents).toEqual([]);
  });

  it('calls resolveEpisode with the two colon-separated parts', async () => {
    mockResolveEpisode.mockResolvedValue(makeEpisodeInfo());
    await resolvePodcastEpisode('feedpart:guidpart');
    expect(mockResolveEpisode).toHaveBeenCalledWith('feedpart', 'guidpart');
  });

  it('handles episode with no optional metadata fields', async () => {
    mockResolveEpisode.mockResolvedValue({ enclosureUrl: ENCLOSURE_URL });
    const result = await resolvePodcastEpisode(`${FEED_BASE64}:${GUID_BASE64}`);

    expect(result.metadata.enclosureUrl).toBe(ENCLOSURE_URL);
    expect(result.metadata.title).toBeUndefined();
    expect(result.metadata.feedTitle).toBeUndefined();
    expect(result.metadata.image).toBeUndefined();
    expect(result.metadata.description).toBeUndefined();
  });
});

describe('resolveAudioUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromBase64url.mockReturnValue(AUDIO_URL);
    mockToBase64url.mockImplementation((s: string) => `b64:${s}`);
    mockSearchBookmarkByUrl.mockResolvedValue(null);
    mockResolveByApi.mockResolvedValue({ type: 'episode' as const });
    mockPublishSignedEvents.mockResolvedValue(undefined);
    mockBuildEpisodeContentId.mockImplementation((feedUrl: string, guid: string) => ({
      platform: 'podcast',
      type: 'episode',
      id: `b64:${feedUrl}:b64:${guid}`
    }));
  });

  it('returns partial emptyResult when fromBase64url returns null', async () => {
    mockFromBase64url.mockReturnValue(null);
    const result = await resolveAudioUrl('invalidbase64');
    expect(result.metadata).toEqual({ enclosureUrl: undefined });
    expect(result.additionalSubscriptions).toEqual([]);
    expect(result.signedEvents).toEqual([]);
  });

  it('returns result with enclosureUrl when no bookmark and empty api response', async () => {
    const result = await resolveAudioUrl('somebase64');
    expect(result.metadata.enclosureUrl).toBe(AUDIO_URL);
    expect(result.additionalSubscriptions).toEqual([]);
  });

  describe('bookmark resolution path', () => {
    const BOOKMARK = { guid: GUID, feedUrl: FEED_URL };

    beforeEach(() => {
      mockSearchBookmarkByUrl.mockResolvedValue(BOOKMARK);
      mockBuildEpisodeContentId.mockReturnValue({
        platform: 'podcast',
        type: 'episode',
        id: 'episodeId123'
      });
      mockResolveEpisode.mockResolvedValue(null);
    });

    it('sets resolvedPath from bookmark', async () => {
      const result = await resolveAudioUrl('somebase64');
      expect(result.resolvedPath).toBe('/podcast/episode/episodeId123');
    });

    it('adds podcast:item:guid subscription from bookmark', async () => {
      const result = await resolveAudioUrl('somebase64');
      expect(result.additionalSubscriptions).toContain(`podcast:item:guid:${GUID}`);
    });

    it('merges metadata from resolveEpisode when available', async () => {
      mockResolveEpisode.mockResolvedValue(makeEpisodeInfo());
      mockToBase64url.mockImplementation((s: string) => `b64:${s}`);

      const result = await resolveAudioUrl('somebase64');

      expect(result.metadata.title).toBe('Episode Title');
      expect(result.metadata.feedTitle).toBe('Feed Title');
      expect(result.metadata.image).toBe('https://example.com/img.jpg');
      expect(result.metadata.description).toBe('Episode description');
    });

    it('does not overwrite existing metadata with bookmark metadata', async () => {
      mockResolveEpisode.mockResolvedValue(makeEpisodeInfo({ title: 'New Title' }));
      // enclosureUrl is already set in result.metadata before merging
      const result = await resolveAudioUrl('somebase64');
      // Title should be set since it wasn't in the initial metadata
      expect(result.metadata.title).toBe('New Title');
    });

    it('returns result unchanged when signal is cancelled after searchBookmarkByUrl', async () => {
      const signal = { cancelled: false };
      let resolveSearch: (v: typeof BOOKMARK) => void;
      mockSearchBookmarkByUrl.mockImplementation(
        () =>
          new Promise((r) => {
            resolveSearch = r;
          })
      );

      const promise = resolveAudioUrl('somebase64', signal);
      signal.cancelled = true;
      resolveSearch!(BOOKMARK);
      const result = await promise;

      // When cancelled after bookmark found, result still has base enclosureUrl
      expect(result.metadata.enclosureUrl).toBe(AUDIO_URL);
    });

    it('skips metadata merge when signal is cancelled before resolveEpisode completes', async () => {
      const signal = { cancelled: false };
      mockResolveEpisode.mockImplementation(async () => {
        signal.cancelled = true;
        return makeEpisodeInfo();
      });

      const result = await resolveAudioUrl('somebase64', signal);
      // metadata should not be merged since signal was cancelled during resolveEpisode
      expect(result.metadata.title).toBeUndefined();
    });

    it('silently swallows resolveEpisode error in bookmark path', async () => {
      mockResolveEpisode.mockRejectedValue(new Error('network error'));
      const result = await resolveAudioUrl('somebase64');
      // Should not throw, resolvedPath still set from bookmark
      expect(result.resolvedPath).toBe('/podcast/episode/episodeId123');
    });
  });

  describe('API resolution path (no bookmark)', () => {
    beforeEach(() => {
      mockSearchBookmarkByUrl.mockResolvedValue(null);
    });

    it('merges episode title from API response', async () => {
      mockResolveByApi.mockResolvedValue({
        type: 'episode' as const,
        episode: {
          guid: GUID,
          title: 'API Title',
          enclosureUrl: ENCLOSURE_URL,
          duration: 100,
          publishedAt: 0
        }
      });
      const result = await resolveAudioUrl('somebase64');
      expect(result.metadata.title).toBe('API Title');
    });

    it('merges feed title from API response', async () => {
      mockResolveByApi.mockResolvedValue({
        type: 'feed' as const,
        feed: { guid: 'fg', title: 'Feed Name', feedUrl: FEED_URL, imageUrl: '' }
      });
      const result = await resolveAudioUrl('somebase64');
      expect(result.metadata.feedTitle).toBe('Feed Name');
    });

    it('merges feed image from API response', async () => {
      mockResolveByApi.mockResolvedValue({
        type: 'feed' as const,
        feed: {
          guid: 'fg',
          title: 'Feed',
          feedUrl: FEED_URL,
          imageUrl: 'https://example.com/img.jpg'
        }
      });
      const result = await resolveAudioUrl('somebase64');
      expect(result.metadata.image).toBe('https://example.com/img.jpg');
    });

    it('merges audio metadata title when episode title absent', async () => {
      mockResolveByApi.mockResolvedValue({
        type: 'episode' as const,
        metadata: { title: 'ID3 Title', artist: 'Artist Name' }
      });
      const result = await resolveAudioUrl('somebase64');
      expect(result.metadata.title).toBe('ID3 Title');
      expect(result.metadata.feedTitle).toBe('Artist Name');
    });

    it('merges audio metadata image', async () => {
      mockResolveByApi.mockResolvedValue({
        type: 'episode' as const,
        metadata: { image: 'https://example.com/cover.jpg' }
      });
      const result = await resolveAudioUrl('somebase64');
      expect(result.metadata.image).toBe('https://example.com/cover.jpg');
    });

    it('does not overwrite title already set by episode with metadata title', async () => {
      mockResolveByApi.mockResolvedValue({
        type: 'episode' as const,
        episode: {
          guid: GUID,
          title: 'Episode Title',
          enclosureUrl: ENCLOSURE_URL,
          duration: 100,
          publishedAt: 0
        },
        metadata: { title: 'ID3 Title' }
      });
      const result = await resolveAudioUrl('somebase64');
      expect(result.metadata.title).toBe('Episode Title');
    });

    it('sets resolvedPath when API returns both episode.guid and feed.feedUrl', async () => {
      mockBuildEpisodeContentId.mockReturnValue({
        platform: 'podcast',
        type: 'episode',
        id: 'resolvedEpId'
      });
      mockResolveByApi.mockResolvedValue({
        type: 'episode' as const,
        episode: {
          guid: GUID,
          title: 'T',
          enclosureUrl: ENCLOSURE_URL,
          duration: 100,
          publishedAt: 0
        },
        feed: { guid: 'fg', title: 'F', feedUrl: FEED_URL, imageUrl: '' }
      });
      const result = await resolveAudioUrl('somebase64');
      expect(result.resolvedPath).toBe('/podcast/episode/resolvedEpId');
      expect(result.additionalSubscriptions).toContain(`podcast:item:guid:${GUID}`);
    });

    it('does not set resolvedPath when feed.feedUrl is missing', async () => {
      mockResolveByApi.mockResolvedValue({
        type: 'episode' as const,
        episode: {
          guid: GUID,
          title: 'T',
          enclosureUrl: ENCLOSURE_URL,
          duration: 100,
          publishedAt: 0
        }
      });
      const result = await resolveAudioUrl('somebase64');
      expect(result.resolvedPath).toBeUndefined();
      expect(result.additionalSubscriptions).toContain(`podcast:item:guid:${GUID}`);
    });

    it('publishes signedEvents from API response', async () => {
      const signedEvents = [{ kind: 39701, tags: [], content: '' }];
      mockResolveByApi.mockResolvedValue({
        type: 'episode' as const,
        signedEvents
      });
      mockPublishSignedEvents.mockResolvedValue(undefined);

      await resolveAudioUrl('somebase64');

      expect(mockPublishSignedEvents).toHaveBeenCalledWith(signedEvents);
    });

    it('does not call publishSignedEvents when signedEvents is empty', async () => {
      mockResolveByApi.mockResolvedValue({
        type: 'episode' as const,
        signedEvents: []
      });
      await resolveAudioUrl('somebase64');
      expect(mockPublishSignedEvents).not.toHaveBeenCalled();
    });

    it('returns result with enclosureUrl when signal is cancelled after API response', async () => {
      const signal = { cancelled: false };
      mockResolveByApi.mockImplementation(async () => {
        signal.cancelled = true;
        return { type: 'episode' as const };
      });
      const result = await resolveAudioUrl('somebase64', signal);
      expect(result.metadata.enclosureUrl).toBe(AUDIO_URL);
    });

    it('logs error and returns result with enclosureUrl on thrown error', async () => {
      mockResolveByApi.mockRejectedValue(new Error('network failure'));
      const result = await resolveAudioUrl('somebase64');
      expect(result.metadata.enclosureUrl).toBe(AUDIO_URL);
      expect(mockLogError).toHaveBeenCalled();
    });

    it('handles searchBookmarkByUrl throwing by catching in outer try-catch', async () => {
      mockSearchBookmarkByUrl.mockRejectedValue(new Error('bookmark error'));
      const result = await resolveAudioUrl('somebase64');
      expect(result.metadata.enclosureUrl).toBe(AUDIO_URL);
      expect(mockLogError).toHaveBeenCalled();
    });
  });
});
