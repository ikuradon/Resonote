import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProfileMetadataSourcesMock, logWarnMock, logErrorMock } = vi.hoisted(() => ({
  fetchProfileMetadataSourcesMock: vi.fn(),
  logWarnMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchProfileMetadataSources: fetchProfileMetadataSourcesMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: logWarnMock,
    error: logErrorMock
  }),
  shortHex: (s: string) => s.slice(0, 8)
}));

vi.mock('$shared/nostr/nip05.js', () => ({
  verifyNip05: vi.fn().mockResolvedValue({ valid: true })
}));

import {
  clearProfiles,
  fetchProfile,
  fetchProfiles,
  getProfile,
  getProfileDisplay
} from './profile.svelte.js';

const PUBKEY_A = 'aaaa1111'.repeat(8);
const PUBKEY_B = 'bbbb2222'.repeat(8);

function makeKind0Event(
  pubkey: string,
  content: Record<string, unknown> | string,
  createdAt = 1_000_000
) {
  return {
    id: `evt-${pubkey.slice(0, 4)}`,
    pubkey,
    kind: 0,
    created_at: createdAt,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    tags: [],
    sig: 'sig'
  };
}

function setupFetchResult(args: {
  cachedEvents?: ReturnType<typeof makeKind0Event>[];
  fetchedEvents?: ReturnType<typeof makeKind0Event>[];
  fallbackEvents?: Array<{
    pubkey: string;
    tags: string[][];
    content: string;
    created_at: number;
  }>;
  unresolvedPubkeys?: string[];
}) {
  fetchProfileMetadataSourcesMock.mockResolvedValue({
    cachedEvents: args.cachedEvents ?? [],
    fetchedEvents: args.fetchedEvents ?? [],
    fallbackEvents: args.fallbackEvents ?? [],
    unresolvedPubkeys: args.unresolvedPubkeys ?? []
  });
}

describe('profile.svelte', () => {
  beforeEach(() => {
    clearProfiles();
    fetchProfileMetadataSourcesMock.mockReset();
    vi.clearAllMocks();
  });

  it('returns undefined before anything is fetched', () => {
    expect(getProfile(PUBKEY_A)).toBeUndefined();
  });

  it('hydrates profile from cachedEvents', async () => {
    setupFetchResult({
      cachedEvents: [
        makeKind0Event(PUBKEY_A, {
          name: 'Alice',
          display_name: 'Alice Display',
          picture: 'https://example.com/alice.png',
          nip05: 'alice@example.com',
          website: 'https://example.com',
          banner: 'https://example.com/banner.png',
          bot: false,
          birthday: { year: 2000, month: 2, day: 29 }
        })
      ]
    });

    await fetchProfile(PUBKEY_A);

    expect(getProfile(PUBKEY_A)).toEqual(
      expect.objectContaining({
        name: 'Alice',
        displayName: 'Alice Display',
        picture: 'https://example.com/alice.png',
        nip05: 'alice@example.com',
        website: 'https://example.com',
        banner: 'https://example.com/banner.png',
        bot: false,
        birthday: { year: 2000, month: 2, day: 29 }
      })
    );
  });

  it('hydrates profile from fetchedEvents when cache is empty', async () => {
    setupFetchResult({
      fetchedEvents: [makeKind0Event(PUBKEY_A, { name: 'Alice Relay' })]
    });

    await fetchProfile(PUBKEY_A);

    expect(getProfile(PUBKEY_A)).toEqual(expect.objectContaining({ name: 'Alice Relay' }));
  });

  it('hydrates profile from coordinator-owned latest-event fallback sources', async () => {
    setupFetchResult({
      fallbackEvents: [
        {
          pubkey: PUBKEY_B,
          created_at: 1_000_000,
          content: JSON.stringify({ name: 'Fallback Name' }),
          tags: []
        }
      ]
    });

    await fetchProfile(PUBKEY_B);

    expect(getProfile(PUBKEY_B)).toEqual(expect.objectContaining({ name: 'Fallback Name' }));
  });

  it('keeps newest profile metadata when multiple sources return the same pubkey', async () => {
    setupFetchResult({
      cachedEvents: [makeKind0Event(PUBKEY_A, { name: 'New Cached' }, 2_000_000)],
      fetchedEvents: [makeKind0Event(PUBKEY_A, { name: 'Old Relay' }, 1_000_000)],
      fallbackEvents: [
        {
          pubkey: PUBKEY_A,
          created_at: 1_500_000,
          content: JSON.stringify({ name: 'Middle Fallback' }),
          tags: []
        }
      ]
    });

    await fetchProfile(PUBKEY_A);

    expect(getProfile(PUBKEY_A)).toEqual(expect.objectContaining({ name: 'New Cached' }));
  });

  it('stores empty profiles for unresolved pubkeys', async () => {
    setupFetchResult({ unresolvedPubkeys: [PUBKEY_B] });

    await fetchProfiles([PUBKEY_B]);

    expect(getProfile(PUBKEY_B)).toEqual({});
  });

  it('retries unresolved placeholder profile and hydrates when metadata appears later', async () => {
    setupFetchResult({ unresolvedPubkeys: [PUBKEY_B] });
    await fetchProfiles([PUBKEY_B]);
    expect(getProfile(PUBKEY_B)).toEqual({});

    setupFetchResult({ fetchedEvents: [makeKind0Event(PUBKEY_B, { name: 'Recovered Name' })] });
    await fetchProfiles([PUBKEY_B]);

    expect(getProfile(PUBKEY_B)).toEqual(expect.objectContaining({ name: 'Recovered Name' }));
  });

  it('queues retry when requested while fetch is pending and hydrates after settle', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    fetchProfileMetadataSourcesMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({
        cachedEvents: [],
        fetchedEvents: [makeKind0Event(PUBKEY_A, { name: 'After Pending Retry' })],
        fallbackEvents: [],
        unresolvedPubkeys: []
      });

    const first = fetchProfiles([PUBKEY_A]);
    await fetchProfiles([PUBKEY_A]);

    resolveFirst?.({
      cachedEvents: [],
      fetchedEvents: [],
      fallbackEvents: [],
      unresolvedPubkeys: [PUBKEY_A]
    });
    await first;

    await vi.waitFor(() => {
      expect(getProfile(PUBKEY_A)).toEqual(
        expect.objectContaining({ name: 'After Pending Retry' })
      );
    });
  });

  it('warns and skips malformed cached profile JSON', async () => {
    setupFetchResult({ cachedEvents: [makeKind0Event(PUBKEY_A, 'NOT_JSON')] });

    await fetchProfile(PUBKEY_A);

    expect(logWarnMock).toHaveBeenCalledWith('Malformed cached profile JSON', expect.any(Object));
    expect(getProfile(PUBKEY_A)).toBeUndefined();
  });

  it('warns and skips malformed fetched profile JSON', async () => {
    setupFetchResult({ fetchedEvents: [makeKind0Event(PUBKEY_A, 'NOT_JSON')] });

    await fetchProfile(PUBKEY_A);

    expect(logWarnMock).toHaveBeenCalledWith('Malformed profile JSON', expect.any(Object));
    expect(getProfile(PUBKEY_A)).toBeUndefined();
  });

  it('releases every started pending pubkey when malformed fetched metadata is mixed with unresolved keys', async () => {
    fetchProfileMetadataSourcesMock.mockResolvedValueOnce({
      cachedEvents: [],
      fetchedEvents: [makeKind0Event(PUBKEY_A, 'NOT_JSON')],
      fallbackEvents: [],
      unresolvedPubkeys: [PUBKEY_B]
    });

    await fetchProfiles([PUBKEY_A, PUBKEY_B]);
    setupFetchResult({ fetchedEvents: [makeKind0Event(PUBKEY_A, { name: 'Recovered Name' })] });
    await fetchProfile(PUBKEY_A);

    expect(fetchProfileMetadataSourcesMock).toHaveBeenCalledTimes(2);
    expect(getProfile(PUBKEY_A)).toEqual(expect.objectContaining({ name: 'Recovered Name' }));
    expect(getProfile(PUBKEY_B)).toEqual({});
  });

  it('logs and preserves undefined profile state when metadata fetch rejects', async () => {
    fetchProfileMetadataSourcesMock.mockRejectedValue(new Error('relay error'));

    await fetchProfiles([PUBKEY_A, PUBKEY_B]);

    expect(logWarnMock).toHaveBeenCalledWith(
      'Profile fetch subscription error',
      expect.any(Object)
    );
    expect(getProfile(PUBKEY_A)).toBeUndefined();
    expect(getProfile(PUBKEY_B)).toBeUndefined();
  });

  it('clearProfiles removes hydrated state', async () => {
    setupFetchResult({ cachedEvents: [makeKind0Event(PUBKEY_A, { name: 'Alice' })] });

    await fetchProfile(PUBKEY_A);
    clearProfiles();

    expect(getProfile(PUBKEY_A)).toBeUndefined();
  });

  it('getProfileDisplay falls back to npub-style abbreviated display when profile missing', () => {
    const display = getProfileDisplay(PUBKEY_A);
    expect(display.displayName).toMatch(/^npub/);
  });
});
