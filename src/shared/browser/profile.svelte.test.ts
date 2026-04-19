import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchBackwardEventsMock,
  getEventsDBMock,
  getManyByPubkeysAndKindMock,
  putMock,
  logWarnMock,
  logErrorMock
} = vi.hoisted(() => ({
  fetchBackwardEventsMock: vi.fn(),
  getEventsDBMock: vi.fn(),
  getManyByPubkeysAndKindMock: vi.fn(),
  putMock: vi.fn().mockResolvedValue(undefined),
  logWarnMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  fetchBackwardEvents: fetchBackwardEventsMock,
  getEventsDB: getEventsDBMock
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

function setupMocks(
  dbEvents: ReturnType<typeof makeKind0Event>[],
  relayEvents: ReturnType<typeof makeKind0Event>[],
  opts: { error?: Error } = {}
) {
  getManyByPubkeysAndKindMock.mockResolvedValue(dbEvents);
  getEventsDBMock.mockResolvedValue({
    getManyByPubkeysAndKind: getManyByPubkeysAndKindMock,
    put: putMock
  });
  if (opts.error) fetchBackwardEventsMock.mockRejectedValue(opts.error);
  else fetchBackwardEventsMock.mockResolvedValue(relayEvents);
}

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
    expect(profile?.name).toBe('Alice');
    expect(profile?.displayName).toBe('Alice Display');
    expect(profile?.picture).toBe('https://example.com/alice.png');
    expect(profile?.nip05).toBe('alice@example.com');
  });

  it('picture が unsafe な URL の場合は undefined になる', async () => {
    const event = makeKind0Event(PUBKEY_A, { name: 'Bob', picture: 'javascript:alert(1)' });
    setupMocks([event], []);

    await fetchProfile(PUBKEY_A);

    expect(getProfile(PUBKEY_A)?.picture).toBeUndefined();
  });

  it('DB キャッシュに不正な JSON があっても warn を出してスキップする', async () => {
    getManyByPubkeysAndKindMock.mockResolvedValue([
      {
        id: 'evt-bad',
        pubkey: PUBKEY_A,
        kind: 0,
        created_at: 1_000_000,
        content: 'NOT_JSON',
        tags: [],
        sig: 'sig'
      }
    ]);
    getEventsDBMock.mockResolvedValue({
      getManyByPubkeysAndKind: getManyByPubkeysAndKindMock,
      put: putMock
    });
    fetchBackwardEventsMock.mockResolvedValue([]);

    await fetchProfile(PUBKEY_A);

    expect(logWarnMock).toHaveBeenCalledWith('Malformed cached profile JSON', expect.any(Object));
  });
});

describe('fetchProfile — relay から取得', () => {
  beforeEach(() => {
    clearProfiles();
    vi.clearAllMocks();
  });

  it('DB にキャッシュがない場合 relay から kind:0 を取得してプロファイルを設定する', async () => {
    const event = makeKind0Event(PUBKEY_A, { name: 'Alice', display_name: 'Alice Relay' });
    setupMocks([], [event]);

    await fetchProfile(PUBKEY_A);

    expect(getProfile(PUBKEY_A)?.displayName).toBe('Alice Relay');
  });

  it('relay にプロファイルが存在しない場合は空オブジェクトをセットする', async () => {
    setupMocks([], []);

    await fetchProfile(PUBKEY_A);

    expect(getProfile(PUBKEY_A)).toEqual({});
  });

  it('relay fetch 中にエラーが発生しても warn を出す', async () => {
    setupMocks([], [], { error: new Error('relay error') });

    await fetchProfile(PUBKEY_A);

    expect(logWarnMock).toHaveBeenCalledWith(
      'Profile fetch subscription error',
      expect.any(Object)
    );
  });

  it('relay fetch が失敗した pubkey は空プロファイルで固定しない', async () => {
    setupMocks([], [], { error: new Error('relay error') });

    await fetchProfiles([PUBKEY_A, PUBKEY_B]);

    expect(getProfile(PUBKEY_A)).toBeUndefined();
    expect(getProfile(PUBKEY_B)).toBeUndefined();
  });

  it('relay からの不正な JSON プロファイルは warn を出してスキップする', async () => {
    getEventsDBMock.mockResolvedValue({
      getManyByPubkeysAndKind: getManyByPubkeysAndKindMock,
      put: putMock
    });
    getManyByPubkeysAndKindMock.mockResolvedValue([]);
    fetchBackwardEventsMock.mockResolvedValue([
      {
        id: 'evt-bad',
        pubkey: PUBKEY_A,
        kind: 0,
        created_at: 1_000_000,
        content: 'NOT_JSON',
        tags: [],
        sig: 'sig'
      }
    ]);

    await fetchProfile(PUBKEY_A);

    expect(logWarnMock).toHaveBeenCalledWith('Malformed profile JSON', expect.any(Object));
  });

  it('relay から取得したプロファイルは DB に保存される', async () => {
    const event = makeKind0Event(PUBKEY_B, { name: 'Bob' });
    setupMocks([], [event]);

    await fetchProfiles([PUBKEY_B]);

    expect(putMock).toHaveBeenCalledWith(event);
  });

  it('複数 pubkey を同時に fetch できる', async () => {
    const eventA = makeKind0Event(PUBKEY_A, { name: 'Alice' });
    const eventB = makeKind0Event(PUBKEY_B, { name: 'Bob' });
    setupMocks([], [eventA, eventB]);

    await fetchProfiles([PUBKEY_A, PUBKEY_B]);

    expect(getProfile(PUBKEY_A)?.name).toBe('Alice');
    expect(getProfile(PUBKEY_B)?.name).toBe('Bob');
  });

  it('relay helper が一部結果だけ返した場合も取得済みプロファイルを保持する', async () => {
    const eventA = makeKind0Event(PUBKEY_A, { name: 'Alice' });
    setupMocks([], [eventA]);

    await fetchProfiles([PUBKEY_A, PUBKEY_B]);

    expect(getProfile(PUBKEY_A)?.name).toBe('Alice');
    expect(getProfile(PUBKEY_B)).toEqual({});
  });
});

import { getProfileDisplay } from './profile.svelte.js';

describe('getProfileDisplay', () => {
  beforeEach(() => {
    clearProfiles();
    vi.clearAllMocks();
  });

  it('returns fallback display when profile is missing', () => {
    const display = getProfileDisplay(PUBKEY_A);
    expect(display.displayName).toContain('npub1');
    expect(display.picture).toBeUndefined();
  });

  it('returns hydrated picture when profile is loaded', async () => {
    const event = makeKind0Event(PUBKEY_A, {
      name: 'Alice',
      picture: 'https://example.com/alice.png'
    });
    setupMocks([event], []);

    await fetchProfile(PUBKEY_A);

    const display = getProfileDisplay(PUBKEY_A);
    expect(display.picture).toBe('https://example.com/alice.png');
  });

  it('logout 想定の clearProfiles 後は picture fallback に戻る', async () => {
    const event = makeKind0Event(PUBKEY_A, {
      name: 'Alice',
      picture: 'https://example.com/alice.png'
    });
    setupMocks([event], []);

    await fetchProfile(PUBKEY_A);
    expect(getProfileDisplay(PUBKEY_A).picture).toBe('https://example.com/alice.png');

    clearProfiles();

    expect(getProfileDisplay(PUBKEY_A).picture).toBeUndefined();
  });

  it('別アカウントに picture がない場合は前アカウントの avatar を再利用しない', async () => {
    const eventA = makeKind0Event(PUBKEY_A, {
      name: 'Alice',
      picture: 'https://example.com/alice.png'
    });
    setupMocks([], [eventA]);

    await fetchProfiles([PUBKEY_A, PUBKEY_B]);

    expect(getProfileDisplay(PUBKEY_A).picture).toBe('https://example.com/alice.png');
    expect(getProfileDisplay(PUBKEY_B).picture).toBeUndefined();
  });

  it('returns undefined picture when picture is invalid', async () => {
    const event = makeKind0Event(PUBKEY_A, {
      name: 'Alice',
      picture: 'javascript:alert(1)'
    });
    setupMocks([event], []);

    await fetchProfile(PUBKEY_A);

    const display = getProfileDisplay(PUBKEY_A);
    expect(display.picture).toBeUndefined();
  });
});
