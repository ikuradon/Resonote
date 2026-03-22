import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const { authState, fetchLatestEventMock, publishMuteListMock, logInfoMock, logWarnMock } =
  vi.hoisted(() => ({
    authState: { pubkey: null as string | null },
    fetchLatestEventMock: vi.fn(),
    publishMuteListMock: vi.fn(),
    logInfoMock: vi.fn(),
    logWarnMock: vi.fn()
  }));

vi.mock('./auth.svelte.js', () => ({
  getAuth: () => authState
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  fetchLatestEvent: fetchLatestEventMock
}));

vi.mock('$features/mute/application/mute-actions.js', () => ({
  publishMuteList: publishMuteListMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: logWarnMock,
    error: vi.fn()
  }),
  shortHex: (s: string): string => s.slice(0, 8)
}));

import {
  clearMuteList,
  getMuteList,
  hasNip44Support,
  isMuted,
  isWordMuted,
  loadMuteList,
  muteUser
} from './mute.svelte.js';

// ---- helpers ----
const MY_PUBKEY = 'aabbccdd'.repeat(8);
const USER_A = '11111111'.repeat(8);
const USER_B = '22222222'.repeat(8);

function makeKind10000Event(pubkeys: string[], words: string[], content = '') {
  return {
    id: 'mute-event-id',
    pubkey: MY_PUBKEY,
    kind: 10000,
    created_at: 1_000_000,
    content,
    tags: [...pubkeys.map((pk) => ['p', pk]), ...words.map((w) => ['word', w])],
    sig: 'sig'
  };
}

// ---- tests ----

describe('getMuteList', () => {
  beforeEach(() => {
    clearMuteList();
  });

  it('初期状態が空で loading=false', () => {
    const m = getMuteList();
    expect(m.mutedPubkeys.size).toBe(0);
    expect(m.mutedWords).toEqual([]);
    expect(m.loading).toBe(false);
  });
});

describe('clearMuteList', () => {
  beforeEach(() => {
    clearMuteList();
  });

  it('stateを初期値にリセットする', () => {
    clearMuteList();
    const m = getMuteList();
    expect(m.mutedPubkeys.size).toBe(0);
    expect(m.mutedWords).toEqual([]);
    expect(m.loading).toBe(false);
  });
});

describe('isMuted', () => {
  const savedWindow = globalThis.window;

  beforeEach(() => {
    clearMuteList();
    authState.pubkey = null;
  });

  afterEach(() => {
    authState.pubkey = null;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: savedWindow
    });
  });

  it('ミュートされていないpubkeyはfalseを返す', () => {
    expect(isMuted(USER_A)).toBe(false);
  });

  it('ミュート後はtrueを返す', async () => {
    authState.pubkey = MY_PUBKEY;

    // window.nostr.nip44 を設定してhasNip44Supportをtrueにする
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        nostr: {
          nip44: {
            encrypt: vi.fn().mockResolvedValue('encrypted'),
            decrypt: vi.fn()
          }
        }
      }
    });

    publishMuteListMock.mockResolvedValue(undefined);

    await muteUser(USER_A);

    expect(isMuted(USER_A)).toBe(true);
  });
});

describe('isWordMuted', () => {
  beforeEach(() => {
    clearMuteList();
  });

  it('mutedWordsが空の場合はfalseを返す', () => {
    expect(isWordMuted('hello world')).toBe(false);
  });

  it('ミュートワードを含む文字列はtrueを返す', async () => {
    // loadMuteList でワードをセットする
    fetchLatestEventMock.mockResolvedValue(makeKind10000Event([], ['spam']));

    await loadMuteList(MY_PUBKEY);

    expect(isWordMuted('this is spam content')).toBe(true);
  });

  it('ミュートワードを含まない文字列はfalseを返す', async () => {
    fetchLatestEventMock.mockResolvedValue(makeKind10000Event([], ['spam']));

    await loadMuteList(MY_PUBKEY);

    expect(isWordMuted('this is clean content')).toBe(false);
  });

  it('大文字小文字を無視してマッチする', async () => {
    fetchLatestEventMock.mockResolvedValue(makeKind10000Event([], ['spam']));

    await loadMuteList(MY_PUBKEY);

    expect(isWordMuted('This is SPAM')).toBe(true);
  });
});

describe('hasNip44Support', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow
    });
  });

  it('window.nostr.nip44が存在する場合はtrueを返す', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        nostr: {
          nip44: {
            encrypt: vi.fn(),
            decrypt: vi.fn()
          }
        }
      }
    });

    expect(hasNip44Support()).toBe(true);
  });

  it('window.nostr.nip44が存在しない場合はfalseを返す', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        nostr: {}
      }
    });

    expect(hasNip44Support()).toBe(false);
  });

  it('window.nostrが存在しない場合はfalseを返す', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {}
    });

    expect(hasNip44Support()).toBe(false);
  });
});

describe('loadMuteList', () => {
  beforeEach(() => {
    clearMuteList();
    vi.clearAllMocks();
  });

  it('公開タグからpubkeyとwordをロードする', async () => {
    fetchLatestEventMock.mockResolvedValue(makeKind10000Event([USER_A, USER_B], ['badword']));

    await loadMuteList(MY_PUBKEY);

    const m = getMuteList();
    expect(m.mutedPubkeys.has(USER_A)).toBe(true);
    expect(m.mutedPubkeys.has(USER_B)).toBe(true);
    expect(m.mutedWords).toContain('badword');
    expect(m.loading).toBe(false);
  });

  it('イベントが存在しない場合は空のままにする', async () => {
    fetchLatestEventMock.mockResolvedValue(null);

    await loadMuteList(MY_PUBKEY);

    const m = getMuteList();
    expect(m.mutedPubkeys.size).toBe(0);
    expect(m.mutedWords).toEqual([]);
    expect(m.loading).toBe(false);
  });

  it('wordは小文字に正規化される', async () => {
    fetchLatestEventMock.mockResolvedValue(makeKind10000Event([], ['BadWord', 'UPPER']));

    await loadMuteList(MY_PUBKEY);

    const m = getMuteList();
    expect(m.mutedWords).toContain('badword');
    expect(m.mutedWords).toContain('upper');
  });

  it('ロード完了後はloading=falseになる', async () => {
    fetchLatestEventMock.mockResolvedValue(null);

    await loadMuteList(MY_PUBKEY);

    expect(getMuteList().loading).toBe(false);
  });
});

describe('muteUser', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    clearMuteList();
    vi.clearAllMocks();
    authState.pubkey = MY_PUBKEY;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        nostr: {
          nip44: {
            encrypt: vi.fn().mockResolvedValue('encrypted'),
            decrypt: vi.fn()
          }
        }
      }
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow
    });
  });

  it('ユーザーをミュートセットに追加する', async () => {
    publishMuteListMock.mockResolvedValue(undefined);

    await muteUser(USER_A);

    expect(getMuteList().mutedPubkeys.has(USER_A)).toBe(true);
  });

  it('既にミュート済みのユーザーを再度ミュートしてもpublishしない', async () => {
    publishMuteListMock.mockResolvedValue(undefined);
    await muteUser(USER_A);
    vi.clearAllMocks();

    await muteUser(USER_A);

    expect(publishMuteListMock).not.toHaveBeenCalled();
  });
});
