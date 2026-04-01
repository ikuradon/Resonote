import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const {
  applyUserRelaysMock,
  loadFollowsMock,
  loadBookmarksMock,
  loadMuteListMock,
  loadCustomEmojisMock,
  refreshRelayListMock,
  resetToDefaultRelaysMock,
  clearFollowsMock,
  clearCustomEmojisMock,
  clearProfilesMock,
  clearBookmarksMock,
  clearMuteListMock,
  initStoreMock,
  disposeStoreMock,
  clearIndexedDBMock,
  logInfoMock,
  logErrorMock
} = vi.hoisted(() => ({
  applyUserRelaysMock: vi.fn(),
  loadFollowsMock: vi.fn(),
  loadBookmarksMock: vi.fn(),
  loadMuteListMock: vi.fn(),
  loadCustomEmojisMock: vi.fn(),
  refreshRelayListMock: vi.fn(),
  resetToDefaultRelaysMock: vi.fn(),
  clearFollowsMock: vi.fn(),
  clearCustomEmojisMock: vi.fn(),
  clearProfilesMock: vi.fn(),
  clearBookmarksMock: vi.fn(),
  clearMuteListMock: vi.fn(),
  initStoreMock: vi.fn(),
  disposeStoreMock: vi.fn(),
  clearIndexedDBMock: vi.fn(),
  logInfoMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/nostr/user-relays.js', () => ({
  applyUserRelays: applyUserRelaysMock,
  resetToDefaultRelays: resetToDefaultRelaysMock
}));

vi.mock('$shared/browser/stores.js', () => ({
  loadFollows: loadFollowsMock,
  loadBookmarks: loadBookmarksMock,
  loadMuteList: loadMuteListMock,
  loadCustomEmojis: loadCustomEmojisMock,
  refreshRelayList: refreshRelayListMock,
  clearFollows: clearFollowsMock,
  clearCustomEmojis: clearCustomEmojisMock,
  clearProfiles: clearProfilesMock,
  clearBookmarks: clearBookmarksMock,
  clearMuteList: clearMuteListMock
}));

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay.example.com']
}));

vi.mock('$shared/nostr/store.js', () => ({
  initStore: initStoreMock,
  disposeStore: disposeStoreMock
}));

vi.mock('$shared/browser/dev-tools.js', () => ({
  clearIndexedDB: clearIndexedDBMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock
  }),
  shortHex: (s: string) => s.slice(0, 8)
}));

import { destroySession, initSession } from './init-session.js';

// --- helpers ---
const PUBKEY = 'aabbccdd'.repeat(8);
const RELAY_URLS = ['wss://user-relay.example.com'];

// --- tests ---

describe('initSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyUserRelaysMock.mockResolvedValue(RELAY_URLS);
    loadFollowsMock.mockResolvedValue(undefined);
    loadBookmarksMock.mockResolvedValue(undefined);
    loadMuteListMock.mockResolvedValue(undefined);
    loadCustomEmojisMock.mockResolvedValue(undefined);
  });

  it('initStore を呼び出す', async () => {
    await initSession(PUBKEY);

    expect(initStoreMock).toHaveBeenCalledOnce();
  });

  it('applyUserRelays を pubkey で呼び出す', async () => {
    await initSession(PUBKEY);

    expect(applyUserRelaysMock).toHaveBeenCalledWith(PUBKEY);
  });

  it('applyUserRelays の結果で refreshRelayList を呼び出す', async () => {
    await initSession(PUBKEY);

    expect(refreshRelayListMock).toHaveBeenCalledWith(RELAY_URLS);
  });

  it('loadFollows を pubkey で呼び出す', async () => {
    await initSession(PUBKEY);

    expect(loadFollowsMock).toHaveBeenCalledWith(PUBKEY);
  });

  it('loadCustomEmojis を pubkey で呼び出す', async () => {
    await initSession(PUBKEY);

    expect(loadCustomEmojisMock).toHaveBeenCalledWith(PUBKEY);
  });

  it('loadBookmarks を pubkey で呼び出す', async () => {
    await initSession(PUBKEY);

    expect(loadBookmarksMock).toHaveBeenCalledWith(PUBKEY);
  });

  it('loadMuteList を pubkey で呼び出す', async () => {
    await initSession(PUBKEY);

    expect(loadMuteListMock).toHaveBeenCalledWith(PUBKEY);
  });

  it('loadFollows が失敗しても全体は正常終了する', async () => {
    loadFollowsMock.mockRejectedValue(new Error('network error'));

    await expect(initSession(PUBKEY)).resolves.toBeUndefined();
    expect(logErrorMock).toHaveBeenCalledWith('Failed to load follows', expect.any(Error));
  });

  it('loadCustomEmojis が失敗しても全体は正常終了する', async () => {
    loadCustomEmojisMock.mockRejectedValue(new Error('emoji fetch failed'));

    await expect(initSession(PUBKEY)).resolves.toBeUndefined();
    expect(logErrorMock).toHaveBeenCalledWith('Failed to load custom emojis', expect.any(Error));
  });

  it('loadBookmarks が失敗しても全体は正常終了する', async () => {
    loadBookmarksMock.mockRejectedValue(new Error('bookmark fetch failed'));

    await expect(initSession(PUBKEY)).resolves.toBeUndefined();
    expect(logErrorMock).toHaveBeenCalledWith('Failed to load bookmarks', expect.any(Error));
  });

  it('loadMuteList が失敗しても全体は正常終了する', async () => {
    loadMuteListMock.mockRejectedValue(new Error('mute fetch failed'));

    await expect(initSession(PUBKEY)).resolves.toBeUndefined();
    expect(logErrorMock).toHaveBeenCalledWith('Failed to load mute list', expect.any(Error));
  });

  it('セッション初期化ログが出力される', async () => {
    await initSession(PUBKEY);

    expect(logInfoMock).toHaveBeenCalledWith('Initializing session stores');
  });
});

describe('destroySession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToDefaultRelaysMock.mockResolvedValue(undefined);
  });

  it('resetToDefaultRelays を呼び出す', async () => {
    await destroySession();

    expect(resetToDefaultRelaysMock).toHaveBeenCalledOnce();
  });

  it('clearFollows を呼び出す', async () => {
    await destroySession();

    expect(clearFollowsMock).toHaveBeenCalledOnce();
  });

  it('clearCustomEmojis を呼び出す', async () => {
    await destroySession();

    expect(clearCustomEmojisMock).toHaveBeenCalledOnce();
  });

  it('clearProfiles を呼び出す', async () => {
    await destroySession();

    expect(clearProfilesMock).toHaveBeenCalledOnce();
  });

  it('clearBookmarks を呼び出す', async () => {
    await destroySession();

    expect(clearBookmarksMock).toHaveBeenCalledOnce();
  });

  it('clearMuteList を呼び出す', async () => {
    await destroySession();

    expect(clearMuteListMock).toHaveBeenCalledOnce();
  });

  it('DEFAULT_RELAYS で refreshRelayList を呼び出す', async () => {
    await destroySession();

    expect(refreshRelayListMock).toHaveBeenCalledWith(['wss://relay.example.com']);
  });

  it('destroySession からは disposeStore を直接呼ばない', async () => {
    await destroySession();

    expect(disposeStoreMock).not.toHaveBeenCalled();
  });

  it('IndexedDB をクリアする', async () => {
    await destroySession();

    expect(clearIndexedDBMock).toHaveBeenCalledOnce();
  });

  it('セッション破棄ログが出力される', async () => {
    await destroySession();

    expect(logInfoMock).toHaveBeenCalledWith('Destroying session stores');
  });
});
