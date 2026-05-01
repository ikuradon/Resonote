import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toBase64url } from '$shared/content/url-utils.js';

const {
  searchEpisodeBookmarkByGuidMock,
  mockGetSystemPubkey,
  mockResolveByApi,
  mockParseDTagEvent
} = vi.hoisted(() => ({
  searchEpisodeBookmarkByGuidMock: vi.fn(),
  mockGetSystemPubkey: vi.fn<() => Promise<string>>(),
  mockResolveByApi: vi.fn(),
  mockParseDTagEvent: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  searchEpisodeBookmarkByGuid: searchEpisodeBookmarkByGuidMock
}));

vi.mock('$shared/content/podcast-resolver.js', () => ({
  getSystemPubkey: (...args: unknown[]) => mockGetSystemPubkey(...(args as [])),
  resolveByApi: (...args: unknown[]) => mockResolveByApi(...(args as [])),
  parseDTagEvent: (...args: unknown[]) => mockParseDTagEvent(...(args as []))
}));

import { resolveEpisode } from '$shared/content/episode-resolver.js';

const FEED_URL = 'https://example.com/feed.xml';
const GUID = 'episode-guid-123';
const FEED_BASE64 = toBase64url(FEED_URL);
const GUID_BASE64 = toBase64url(GUID);

describe('episode-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSystemPubkey.mockResolvedValue('abc123');
    mockResolveByApi.mockResolvedValue({ type: 'episode' });
    searchEpisodeBookmarkByGuidMock.mockResolvedValue(null);
    mockParseDTagEvent.mockReturnValue(null);
  });

  it('returns null when base64 identifiers are invalid', async () => {
    await expect(resolveEpisode('@@invalid@@', GUID_BASE64)).resolves.toBeNull();
    await expect(resolveEpisode(FEED_BASE64, '@@invalid@@')).resolves.toBeNull();
  });

  it('prefers API enclosure/title while keeping Nostr description fallback', async () => {
    searchEpisodeBookmarkByGuidMock.mockResolvedValue({ tags: [], content: 'nostr' });
    mockParseDTagEvent.mockReturnValue({
      guid: GUID,
      feedUrl: FEED_URL,
      enclosureUrl: 'https://example.com/ep1-nostr.mp3',
      description: 'Nostr description'
    });
    mockResolveByApi.mockResolvedValue({
      type: 'feed',
      feed: { title: 'My Podcast', imageUrl: 'https://example.com/img.jpg' },
      episodes: [
        {
          guid: GUID,
          title: 'Episode 1',
          enclosureUrl: 'https://example.com/ep1.mp3',
          duration: 3600,
          publishedAt: 1700000000,
          description: 'API description'
        }
      ]
    });

    await expect(resolveEpisode(FEED_BASE64, GUID_BASE64)).resolves.toEqual({
      enclosureUrl: 'https://example.com/ep1.mp3',
      title: 'Episode 1',
      feedTitle: 'My Podcast',
      image: 'https://example.com/img.jpg',
      description: 'Nostr description'
    });
  });

  it('falls back to Nostr-only result when API has no match', async () => {
    searchEpisodeBookmarkByGuidMock.mockResolvedValue({ tags: [], content: 'nostr' });
    mockParseDTagEvent.mockReturnValue({
      guid: GUID,
      feedUrl: FEED_URL,
      enclosureUrl: 'https://example.com/ep1-nostr.mp3',
      description: 'Nostr description'
    });

    await expect(resolveEpisode(FEED_BASE64, GUID_BASE64)).resolves.toEqual({
      enclosureUrl: 'https://example.com/ep1-nostr.mp3',
      description: 'Nostr description'
    });
  });

  it('queries resonote bookmark search with system pubkey and guid', async () => {
    await resolveEpisode(FEED_BASE64, GUID_BASE64);

    expect(searchEpisodeBookmarkByGuidMock).toHaveBeenCalledWith('abc123', GUID);
    expect(mockResolveByApi).toHaveBeenCalledWith(FEED_URL);
  });
});
