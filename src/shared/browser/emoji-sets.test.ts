import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logInfoMock, logErrorMock, fetchCustomEmojiCategoriesMock } = vi.hoisted(() => ({
  logInfoMock: vi.fn(),
  logErrorMock: vi.fn(),
  fetchCustomEmojiCategoriesMock: vi.fn()
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock
  }),
  shortHex: (s: string): string => s.slice(0, 8)
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchCustomEmojiCategories: (...args: unknown[]) =>
    fetchCustomEmojiCategoriesMock(...(args as []))
}));

import {
  clearCustomEmojis,
  getCustomEmojis,
  loadCustomEmojis,
  setCustomEmojis
} from './emoji-sets.svelte.js';

const PUBKEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

function makeCategory(id: string, emojiId: string, url = `https://example.com/${emojiId}.png`) {
  return {
    id,
    name: id,
    emojis: [{ id: emojiId, name: emojiId, skins: [{ src: url }] }]
  };
}

describe('getCustomEmojis', () => {
  beforeEach(() => {
    clearCustomEmojis();
    vi.clearAllMocks();
    fetchCustomEmojiCategoriesMock.mockResolvedValue([]);
  });

  it('初期状態は空カテゴリで loading=false', () => {
    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });
});

describe('clearCustomEmojis', () => {
  beforeEach(() => {
    clearCustomEmojis();
    vi.clearAllMocks();
    fetchCustomEmojiCategoriesMock.mockResolvedValue([]);
  });

  it('stateを初期値にリセットする', () => {
    clearCustomEmojis();
    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('clearCustomEmojisを複数回呼び出しても安全', () => {
    clearCustomEmojis();
    clearCustomEmojis();
    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });
});

describe('loadCustomEmojis', () => {
  beforeEach(() => {
    clearCustomEmojis();
    vi.clearAllMocks();
    fetchCustomEmojiCategoriesMock.mockResolvedValue([]);
  });

  it('Auftakt facade が返したカテゴリを反映する', async () => {
    fetchCustomEmojiCategoriesMock.mockResolvedValue([
      makeCategory('custom-inline', 'smile'),
      makeCategory('set-favorites', 'wave')
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(2);
    expect(e.categories[0].emojis[0].id).toBe('smile');
    expect(e.categories[1].emojis[0].id).toBe('wave');
    expect(e.loading).toBe(false);
  });

  it('カテゴリが空なら空状態を維持する', async () => {
    fetchCustomEmojiCategoriesMock.mockResolvedValue([]);

    await loadCustomEmojis(PUBKEY);

    expect(getCustomEmojis().categories).toEqual([]);
    expect(getCustomEmojis().loading).toBe(false);
  });

  it('generation ミスマッチで先行ロードがスキップされる', async () => {
    fetchCustomEmojiCategoriesMock.mockImplementation(async () => [makeCategory('late', 'winner')]);

    const p1 = loadCustomEmojis(PUBKEY);
    const p2 = loadCustomEmojis(PUBKEY);

    await Promise.all([p1, p2]);

    expect(getCustomEmojis().loading).toBe(false);
  });

  it('エラー時はログして loading=false に戻す', async () => {
    fetchCustomEmojiCategoriesMock.mockRejectedValue(new Error('fetch failed'));

    await loadCustomEmojis(PUBKEY);

    expect(logErrorMock).toHaveBeenCalledWith('Failed to load custom emojis', expect.any(Error));
    expect(getCustomEmojis().categories).toEqual([]);
    expect(getCustomEmojis().loading).toBe(false);
  });

  it('pubkey を façade に渡す', async () => {
    await loadCustomEmojis(PUBKEY);
    expect(fetchCustomEmojiCategoriesMock).toHaveBeenCalledWith(PUBKEY);
  });
});

describe('setCustomEmojis', () => {
  beforeEach(() => {
    clearCustomEmojis();
    vi.clearAllMocks();
  });

  it('replaces categories without fetching', () => {
    setCustomEmojis([makeCategory('custom-inline', 'wave')]);

    expect(getCustomEmojis().categories).toEqual([makeCategory('custom-inline', 'wave')]);
    expect(fetchCustomEmojiCategoriesMock).not.toHaveBeenCalled();
  });

  it('cancels an in-flight load when diagnostics replaces categories', async () => {
    let resolveLoad: (categories: unknown[]) => void = () => {};
    fetchCustomEmojiCategoriesMock.mockImplementation(
      () => new Promise((resolve) => (resolveLoad = resolve))
    );

    const load = loadCustomEmojis(PUBKEY);
    setCustomEmojis([makeCategory('diagnostics', 'spark')]);
    resolveLoad([makeCategory('late', 'old')]);
    await load;

    expect(getCustomEmojis().categories).toEqual([makeCategory('diagnostics', 'spark')]);
    expect(getCustomEmojis().loading).toBe(false);
  });
});
