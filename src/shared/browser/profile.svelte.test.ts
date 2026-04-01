import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const { mockGetSync, fetchLatestBatchMock, logWarnMock, logErrorMock } = vi.hoisted(() => {
  return {
    mockGetSync: vi.fn(),
    fetchLatestBatchMock: vi.fn(),
    logWarnMock: vi.fn(),
    logErrorMock: vi.fn()
  };
});

vi.mock('$shared/nostr/store.js', () => ({
  getStoreAsync: vi.fn().mockResolvedValue({
    getSync: mockGetSync,
    fetchById: vi.fn().mockResolvedValue(null),
    dispose: vi.fn()
  })
}));

vi.mock('@ikuradon/auftakt/sync', () => ({
  fetchLatestBatch: fetchLatestBatchMock
}));

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: vi.fn().mockResolvedValue({})
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

import { clearProfiles, fetchProfile, fetchProfiles, getProfile } from './profile.svelte.js';

// --- helpers ---
const PUBKEY_A = 'aaaa1111'.repeat(8);
const PUBKEY_B = 'bbbb2222'.repeat(8);

function makeKind0Event(pubkey: string, content: Record<string, unknown>) {
  return {
    id: `evt-${pubkey.slice(0, 4)}`,
    pubkey,
    kind: 0,
    created_at: 1_000_000,
    content: JSON.stringify(content),
    tags: [],
    sig: 'sig'
  };
}

/** DB mock + relay mock setup */
function setupMocks(
  dbEvents: ReturnType<typeof makeKind0Event>[],
  relayPackets: { event: ReturnType<typeof makeKind0Event> }[],
  opts: { error?: Error } = {}
) {
  const { error } = opts;

  // DB mock — wrap events in CachedEvent format
  mockGetSync.mockResolvedValue(dbEvents.map((event) => ({ event, seenOn: [], firstSeen: 0 })));

  // relay mock via fetchLatestBatch — returns CachedEvent[] for batch
  fetchLatestBatchMock.mockImplementation(async () => {
    if (error) throw error;
    return relayPackets.map((p) => ({
      event: p.event,
      seenOn: ['wss://relay.test'],
      firstSeen: Date.now()
    }));
  });
}

// --- tests ---

describe('getProfile', () => {
  beforeEach(() => {
    clearProfiles();
    vi.clearAllMocks();
  });

  it('初期状態では undefined を返す', () => {
    expect(getProfile(PUBKEY_A)).toBeUndefined();
  });

  it('存在しない pubkey は undefined を返す', () => {
    expect(getProfile('nonexistent')).toBeUndefined();
  });
});

describe('clearProfiles', () => {
  beforeEach(() => {
    clearProfiles();
    vi.clearAllMocks();
  });

  it('clearProfiles 後は全プロファイルが undefined になる', async () => {
    const event = makeKind0Event(PUBKEY_A, { name: 'Alice', display_name: 'Alice Display' });
    setupMocks([event], []);

    await fetchProfile(PUBKEY_A);
    expect(getProfile(PUBKEY_A)).toBeDefined();

    clearProfiles();
    expect(getProfile(PUBKEY_A)).toBeUndefined();
  });

  it('clearProfiles は pending を空にする（再 fetch が通る）', async () => {
    const event = makeKind0Event(PUBKEY_A, { name: 'Alice' });
    setupMocks([event], []);

    await fetchProfile(PUBKEY_A);
    clearProfiles();

    // clearProfiles 後はもう一度 fetch が呼べる（モックを再設定）
    setupMocks([event], []);
    await fetchProfile(PUBKEY_A);
    expect(getProfile(PUBKEY_A)).toBeDefined();
  });
});

describe('fetchProfile — DB キャッシュあり', () => {
  beforeEach(() => {
    clearProfiles();
    vi.clearAllMocks();
  });

  it('kind:0 キャッシュからプロファイルを復元する', async () => {
    const event = makeKind0Event(PUBKEY_A, {
      name: 'Alice',
      display_name: 'Alice Display',
      picture: 'https://example.com/alice.png',
      nip05: 'alice@example.com'
    });
    setupMocks([event], []);

    await fetchProfile(PUBKEY_A);

    const profile = getProfile(PUBKEY_A);
    expect(profile).toBeDefined();
    expect(profile?.name).toBe('Alice');
    expect(profile?.displayName).toBe('Alice Display');
    expect(profile?.picture).toBe('https://example.com/alice.png');
    expect(profile?.nip05).toBe('alice@example.com');
  });

  it('picture が unsafe な URL の場合は undefined になる', async () => {
    const event = makeKind0Event(PUBKEY_A, {
      name: 'Bob',
      picture: 'javascript:alert(1)'
    });
    setupMocks([event], []);

    await fetchProfile(PUBKEY_A);

    const profile = getProfile(PUBKEY_A);
    expect(profile?.picture).toBeUndefined();
  });

  it('DB キャッシュに不正な JSON があっても warn を出してスキップする', async () => {
    const badEvent = {
      id: 'evt-bad',
      pubkey: PUBKEY_A,
      kind: 0,
      created_at: 1_000_000,
      content: 'NOT_JSON',
      tags: [],
      sig: 'sig'
    };
    mockGetSync.mockResolvedValue([{ event: badEvent, seenOn: [], firstSeen: 0 }]);

    // Relay mock — returns no events
    fetchLatestBatchMock.mockResolvedValue([]);

    await fetchProfile(PUBKEY_A);
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(logWarnMock).toHaveBeenCalledWith('Malformed cached profile JSON', expect.any(Object));
  });

  it('既に fetch 済みの pubkey は再 fetch しない', async () => {
    const event = makeKind0Event(PUBKEY_A, { name: 'Alice' });
    setupMocks([event], []);

    await fetchProfile(PUBKEY_A);
    const callCount = mockGetSync.mock.calls.length;

    // 2回目の fetch は DB にアクセスしない
    await fetchProfile(PUBKEY_A);
    expect(mockGetSync.mock.calls.length).toBe(callCount);
  });
});

describe('fetchProfile — relay から取得', () => {
  beforeEach(() => {
    clearProfiles();
    vi.clearAllMocks();
  });

  it('DB にキャッシュがない場合 relay から kind:0 を取得してプロファイルを設定する', async () => {
    const event = makeKind0Event(PUBKEY_A, { name: 'Alice', display_name: 'Alice Relay' });
    setupMocks([], [{ event }]);

    await fetchProfile(PUBKEY_A);
    // Wait for async subscription events
    await new Promise<void>((r) => setTimeout(r, 50));

    const profile = getProfile(PUBKEY_A);
    expect(profile).toBeDefined();
    expect(profile?.name).toBe('Alice');
    expect(profile?.displayName).toBe('Alice Relay');
  });

  it('relay にプロファイルが存在しない場合は空オブジェクトをセットする', async () => {
    setupMocks([], []);

    await fetchProfile(PUBKEY_A);
    await new Promise<void>((r) => setTimeout(r, 50));

    const profile = getProfile(PUBKEY_A);
    expect(profile).toBeDefined();
    expect(profile).toEqual({});
  });

  it('relay fetch 中にエラーが発生しても warn を出す', async () => {
    setupMocks([], [], { error: new Error('relay error') });

    await fetchProfile(PUBKEY_A);
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(logWarnMock).toHaveBeenCalledWith('Profile batch fetch failed', expect.any(Object));
  });

  it('relay からの不正な JSON プロファイルは warn を出してスキップする', async () => {
    const badEvent = {
      id: 'evt-bad',
      pubkey: PUBKEY_A,
      kind: 0,
      created_at: 1_000_000,
      content: 'NOT_JSON',
      tags: [],
      sig: 'sig'
    };
    setupMocks([], [{ event: badEvent as ReturnType<typeof makeKind0Event> }]);

    await fetchProfile(PUBKEY_A);
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(logWarnMock).toHaveBeenCalledWith('Malformed profile JSON', expect.any(Object));
  });

  it('relay から取得したプロファイルは connectStore で自動キャッシュされる', async () => {
    const event = makeKind0Event(PUBKEY_B, { name: 'Bob' });
    setupMocks([], [{ event }]);

    await fetchProfiles([PUBKEY_B]);
    await new Promise<void>((r) => setTimeout(r, 50));

    // connectStore() handles caching automatically — no explicit put call
    expect(getProfile(PUBKEY_B)?.name).toBe('Bob');
  });

  it('複数 pubkey を同時に fetch できる', async () => {
    const eventA = makeKind0Event(PUBKEY_A, { name: 'Alice' });
    const eventB = makeKind0Event(PUBKEY_B, { name: 'Bob' });
    setupMocks([], [{ event: eventA }, { event: eventB }]);

    await fetchProfiles([PUBKEY_A, PUBKEY_B]);
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(getProfile(PUBKEY_A)?.name).toBe('Alice');
    expect(getProfile(PUBKEY_B)?.name).toBe('Bob');
  });
});
