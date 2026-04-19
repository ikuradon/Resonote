import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProfileMetadataEventsMock, logWarnMock, logErrorMock } = vi.hoisted(() => ({
  fetchProfileMetadataEventsMock: vi.fn(),
  logWarnMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchProfileMetadataEvents: fetchProfileMetadataEventsMock
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

function makeKind0Event(pubkey: string, content: Record<string, unknown> | string) {
  return {
    id: `evt-${pubkey.slice(0, 4)}`,
    pubkey,
    kind: 0,
    created_at: 1_000_000,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    tags: [],
    sig: 'sig'
  };
}

function setupFetchResult(args: {
  cachedEvents?: ReturnType<typeof makeKind0Event>[];
  fetchedEvents?: ReturnType<typeof makeKind0Event>[];
  unresolvedPubkeys?: string[];
}) {
  fetchProfileMetadataEventsMock.mockResolvedValue({
    cachedEvents: args.cachedEvents ?? [],
    fetchedEvents: args.fetchedEvents ?? [],
    unresolvedPubkeys: args.unresolvedPubkeys ?? []
  });
}

describe('profile.svelte', () => {
  beforeEach(() => {
    clearProfiles();
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
          nip05: 'alice@example.com'
        })
      ]
    });

    await fetchProfile(PUBKEY_A);

    expect(getProfile(PUBKEY_A)).toEqual(
      expect.objectContaining({
        name: 'Alice',
        displayName: 'Alice Display',
        picture: 'https://example.com/alice.png',
        nip05: 'alice@example.com'
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

  it('stores empty profiles for unresolved pubkeys', async () => {
    setupFetchResult({ unresolvedPubkeys: [PUBKEY_B] });

    await fetchProfiles([PUBKEY_B]);

    expect(getProfile(PUBKEY_B)).toEqual({});
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

  it('logs and preserves undefined profile state when metadata fetch rejects', async () => {
    fetchProfileMetadataEventsMock.mockRejectedValue(new Error('relay error'));

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
