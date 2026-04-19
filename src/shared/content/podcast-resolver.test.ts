import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  searchBookmarkDTagEventMock,
  verifySignedEventMock,
  apiSystemPubkeyGet,
  apiPodcastResolveGet
} = vi.hoisted(() => ({
  searchBookmarkDTagEventMock: vi.fn(),
  verifySignedEventMock: vi.fn(),
  apiSystemPubkeyGet: vi.fn(),
  apiPodcastResolveGet: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  searchBookmarkDTagEvent: searchBookmarkDTagEventMock,
  verifySignedEvent: verifySignedEventMock
}));

vi.mock('$shared/api/client.js', () => ({
  apiClient: {
    api: {
      system: { pubkey: { $get: apiSystemPubkeyGet } },
      podcast: { resolve: { $get: apiPodcastResolveGet } }
    }
  }
}));

describe('podcast-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiSystemPubkeyGet.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pubkey: 'abc123' })
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('getSystemPubkey caches successful responses', async () => {
    const { getSystemPubkey } = await import('$shared/content/podcast-resolver.js');
    expect(await getSystemPubkey()).toBe('abc123');
    expect(await getSystemPubkey()).toBe('abc123');
    expect(apiSystemPubkeyGet).toHaveBeenCalledTimes(1);
  });

  it('getSystemPubkey clears cache on invalid payloads', async () => {
    const { getSystemPubkey } = await import('$shared/content/podcast-resolver.js');
    apiSystemPubkeyGet
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ pubkey: 42 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ pubkey: 'recovered' }) });

    expect(await getSystemPubkey()).toBe('');
    expect(await getSystemPubkey()).toBe('recovered');
    expect(apiSystemPubkeyGet).toHaveBeenCalledTimes(2);
  });

  it('parseDTagEvent extracts guid, feedUrl, enclosureUrl and markdown description', async () => {
    const { parseDTagEvent } = await import('$shared/content/podcast-resolver.js');
    expect(
      parseDTagEvent({
        kind: 39701,
        tags: [
          ['i', 'podcast:item:guid:ep-1', 'https://example.com/ep.mp3'],
          ['i', 'podcast:guid:feed-1', 'https://example.com/feed.xml']
        ],
        content: '<p>Hello</p>'
      })
    ).toEqual({
      guid: 'ep-1',
      feedUrl: 'https://example.com/feed.xml',
      enclosureUrl: 'https://example.com/ep.mp3',
      description: 'Hello'
    });
  });

  it('searchBookmarkByUrl normalizes lookup through resonote search', async () => {
    const { searchBookmarkByUrl } = await import('$shared/content/podcast-resolver.js');
    searchBookmarkDTagEventMock.mockResolvedValue({
      tags: [
        ['i', 'podcast:item:guid:ep-1', 'https://example.com/ep.mp3'],
        ['i', 'podcast:guid:feed-1', 'https://example.com/feed.xml']
      ],
      content: ''
    });

    const result = await searchBookmarkByUrl('https://example.com/show?utm_source=test');

    expect(searchBookmarkDTagEventMock).toHaveBeenCalledWith('abc123', 'example.com/show');
    expect(result?.guid).toBe('ep-1');
  });

  it('resolveByApi keeps only cryptographically verified signed events', async () => {
    const { resolveByApi } = await import('$shared/content/podcast-resolver.js');
    verifySignedEventMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    apiPodcastResolveGet.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          type: 'feed',
          signedEvents: [
            { id: 'good', sig: 'sig', kind: 1, content: '', tags: [] },
            { id: 'bad', sig: 'sig', kind: 1, content: '', tags: [] }
          ]
        })
    });

    const result = await resolveByApi('https://example.com/feed.xml');

    expect(result.type).toBe('feed');
    expect(result.signedEvents).toEqual([
      { id: 'good', sig: 'sig', kind: 1, content: '', tags: [] }
    ]);
  });
});
