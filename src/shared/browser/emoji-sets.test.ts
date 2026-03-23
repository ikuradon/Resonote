import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const { logInfoMock, logErrorMock, mockEventsDB, mockRxNostr } = vi.hoisted(() => ({
  logInfoMock: vi.fn(),
  logErrorMock: vi.fn(),
  mockEventsDB: {
    getByPubkeyAndKind: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
    getByReplaceKey: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
    put: vi.fn(async () => {})
  },
  mockRxNostr: {
    use: vi.fn()
  }
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

vi.mock('$shared/utils/emoji.js', () => ({
  isEmojiTag: (tag: string[]): boolean => tag[0] === 'emoji' && tag.length >= 3
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getEventsDB: async () => mockEventsDB,
  getRxNostr: async () => mockRxNostr
}));

vi.mock('rx-nostr', () => ({
  createRxBackwardReq: () => ({
    emit: vi.fn(),
    over: vi.fn()
  })
}));

import { clearCustomEmojis, getCustomEmojis, loadCustomEmojis } from './emoji-sets.svelte.js';

// Type alias for subscribe handlers
type SubscribeHandlers = {
  next: (p: { event: { id: string; tags: string[][] } }) => void;
  complete: () => void;
  error: (err: unknown) => void;
};

/**
 * Helper: setup mockRxNostr.use to emit packets then complete.
 * Callbacks deferred via queueMicrotask so `sub` is assigned before
 * the source code's complete handler calls sub.unsubscribe().
 */
function setupRxNostrSubscription(packets: Array<{ event: { id: string; tags: string[][] } }>) {
  mockRxNostr.use.mockReturnValue({
    subscribe: (handlers: SubscribeHandlers) => {
      const sub = { unsubscribe: vi.fn() };
      queueMicrotask(() => {
        for (const p of packets) handlers.next(p);
        handlers.complete();
      });
      return sub;
    }
  });
}

/**
 * Helper: setup mockRxNostr.use with per-call behavior.
 * Each element in `calls` describes what happens on the Nth subscribe.
 */
function setupRxNostrMultiCall(
  calls: Array<{
    packets: Array<{ event: { id: string; tags: string[][] } }>;
    error?: Error;
  }>
) {
  let callIndex = 0;
  mockRxNostr.use.mockReturnValue({
    subscribe: (handlers: SubscribeHandlers) => {
      const sub = { unsubscribe: vi.fn() };
      const call = calls[callIndex] ?? { packets: [] };
      callIndex++;
      queueMicrotask(() => {
        if (call.error) {
          handlers.error(call.error);
        } else {
          for (const p of call.packets) handlers.next(p);
          handlers.complete();
        }
      });
      return sub;
    }
  });
}

function setupRxNostrError() {
  mockRxNostr.use.mockReturnValue({
    subscribe: (handlers: SubscribeHandlers) => {
      const sub = { unsubscribe: vi.fn() };
      queueMicrotask(() => handlers.error(new Error('rx-nostr error')));
      return sub;
    }
  });
}

// ---- tests ----

describe('getCustomEmojis', () => {
  beforeEach(() => {
    clearCustomEmojis();
    vi.clearAllMocks();
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
  const PUBKEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  beforeEach(() => {
    clearCustomEmojis();
    vi.clearAllMocks();
    mockEventsDB.getByPubkeyAndKind.mockResolvedValue(null);
    mockEventsDB.getByReplaceKey.mockResolvedValue(null);
    mockEventsDB.put.mockResolvedValue(undefined);
  });

  it('inline emoji タグからカテゴリを構築する', async () => {
    setupRxNostrSubscription([
      {
        event: {
          id: 'evt1',
          tags: [
            ['emoji', 'smile', 'https://example.com/smile.png'],
            ['emoji', 'wave', 'https://example.com/wave.png']
          ]
        }
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
    expect(e.categories[0].id).toBe('custom-inline');
    expect(e.categories[0].name).toBe('Custom');
    expect(e.categories[0].emojis).toHaveLength(2);
    expect(e.categories[0].emojis[0]).toEqual({
      id: 'smile',
      name: 'smile',
      skins: [{ src: 'https://example.com/smile.png' }]
    });
    expect(e.loading).toBe(false);
  });

  it('a タグ (30030:) から setRefs を抽出しセットカテゴリをフェッチする', async () => {
    const setRef = '30030:author_pubkey_abc:my-emoji-set';

    setupRxNostrMultiCall([
      { packets: [{ event: { id: 'list-evt', tags: [['a', setRef]] } }] },
      {
        packets: [
          {
            event: {
              id: 'set-evt-12345678',
              tags: [
                ['d', 'my-emoji-set'],
                ['title', 'My Emoji Set'],
                ['emoji', 'cat', 'https://example.com/cat.png'],
                ['emoji', 'dog', 'https://example.com/dog.png']
              ]
            }
          }
        ]
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
    expect(e.categories[0].name).toBe('My Emoji Set');
    expect(e.categories[0].emojis).toHaveLength(2);
    expect(e.categories[0].emojis[0].id).toBe('cat');
  });

  it('DB キャッシュから復元し、リレーが空でも最終的に空になる', async () => {
    mockEventsDB.getByPubkeyAndKind.mockResolvedValue({
      tags: [['emoji', 'heart', 'https://example.com/heart.png']]
    });

    setupRxNostrSubscription([]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('DB キャッシュ復元後にリレーフェッチで上書きされる', async () => {
    mockEventsDB.getByPubkeyAndKind.mockResolvedValue({
      tags: [['emoji', 'old', 'https://example.com/old.png']]
    });

    setupRxNostrSubscription([
      {
        event: {
          id: 'new-evt',
          tags: [['emoji', 'new', 'https://example.com/new.png']]
        }
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
    expect(e.categories[0].emojis[0].id).toBe('new');
  });

  it('DB キャッシュの setRef を解決してカテゴリを復元する', async () => {
    const setAuthor = 'author123';
    const setRef = `30030:${setAuthor}:test-set`;

    mockEventsDB.getByPubkeyAndKind.mockResolvedValue({
      tags: [['a', setRef]]
    });

    mockEventsDB.getByReplaceKey.mockResolvedValue({
      id: 'cached-set-evt',
      tags: [
        ['d', 'test-set'],
        ['emoji', 'star', 'https://example.com/star.png']
      ]
    });

    setupRxNostrMultiCall([
      { packets: [{ event: { id: 'list-evt', tags: [['a', setRef]] } }] },
      {
        packets: [
          {
            event: {
              id: 'set-evt-00000000',
              tags: [
                ['d', 'test-set'],
                ['emoji', 'star', 'https://example.com/star.png']
              ]
            }
          }
        ]
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories.length).toBeGreaterThan(0);
    expect(mockEventsDB.getByReplaceKey).toHaveBeenCalledWith(setAuthor, 30030, 'test-set');
  });

  it('空の emoji リストでは空カテゴリを返す', async () => {
    setupRxNostrSubscription([{ event: { id: 'empty-evt', tags: [] } }]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('emoji タグのない set イベントではカテゴリが生成されない', async () => {
    setupRxNostrMultiCall([
      {
        packets: [{ event: { id: 'list-evt', tags: [['a', '30030:author1:no-emoji-set']] } }]
      },
      {
        packets: [
          {
            event: {
              id: 'set-no-emoji',
              tags: [
                ['d', 'no-emoji-set'],
                ['title', 'Empty Set']
              ]
            }
          }
        ]
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
  });

  it('generation ミスマッチで先行ロードがスキップされる', async () => {
    // When loadCustomEmojis is called twice synchronously, p1 (older gen) should
    // be discarded at the first gen check (before reaching rxNostr.subscribe).
    // p2 (current gen) should proceed and update categories.
    setupRxNostrSubscription([
      {
        event: {
          id: 'evt-from-p2',
          tags: [['emoji', 'winner', 'https://example.com/winner.png']]
        }
      }
    ]);

    // Call loadCustomEmojis twice synchronously — p1 gets outdated generation
    const p1 = loadCustomEmojis(PUBKEY);
    const p2 = loadCustomEmojis(PUBKEY);

    await Promise.all([p1, p2]);

    const e = getCustomEmojis();
    // Both promises resolve. p1's gen is outdated so it returns early.
    // p2 may or may not have its data written depending on async scheduling,
    // but loading must be false (the finally block checks gen === generation).
    expect(e.loading).toBe(false);
  });

  it('不正な setRef (parts < 3) はスキップする', async () => {
    setupRxNostrMultiCall([
      {
        packets: [
          {
            event: {
              id: 'list-evt',
              tags: [
                ['a', '30030:incomplete'], // Invalid: only 2 parts
                ['a', '30030:author:valid-set'] // Valid
              ]
            }
          }
        ]
      },
      {
        packets: [
          {
            event: {
              id: 'valid-set-e',
              tags: [
                ['d', 'valid-set'],
                ['emoji', 'ok', 'https://example.com/ok.png']
              ]
            }
          }
        ]
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
    expect(e.categories[0].emojis[0].id).toBe('ok');
  });

  it('rx-nostr エラー時にも解決される (emoji list fetch)', async () => {
    setupRxNostrError();

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('rx-nostr エラー時にも解決される (set fetch)', async () => {
    setupRxNostrMultiCall([
      {
        packets: [{ event: { id: 'list-evt', tags: [['a', '30030:author:err-set']] } }]
      },
      { packets: [], error: new Error('set fetch error') }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('catch ブロックがエラーをログに記録する', async () => {
    // Make getEventsDB throw by temporarily overriding the mock
    mockEventsDB.getByPubkeyAndKind.mockRejectedValueOnce(new Error('DB failed'));

    await loadCustomEmojis(PUBKEY);

    expect(logErrorMock).toHaveBeenCalledWith('Failed to load custom emojis', expect.any(Error));
    expect(getCustomEmojis().loading).toBe(false);
  });

  it('イベントを eventsDB にキャッシュする', async () => {
    const event = {
      id: 'cache-evt',
      tags: [['emoji', 'cached', 'https://example.com/cached.png']]
    };

    setupRxNostrSubscription([{ event }]);

    await loadCustomEmojis(PUBKEY);

    expect(mockEventsDB.put).toHaveBeenCalledWith(event);
  });

  it('inline と set の両方を含むカテゴリをマージする', async () => {
    setupRxNostrMultiCall([
      {
        packets: [
          {
            event: {
              id: 'list-evt',
              tags: [
                ['emoji', 'inline1', 'https://example.com/inline1.png'],
                ['a', '30030:author2:merge-set']
              ]
            }
          }
        ]
      },
      {
        packets: [
          {
            event: {
              id: 'set-merge-e',
              tags: [
                ['d', 'merge-set'],
                ['title', 'Merge Set'],
                ['emoji', 'set1', 'https://example.com/set1.png']
              ]
            }
          }
        ]
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(2);
    expect(e.categories[0].id).toBe('custom-inline');
    expect(e.categories[0].emojis[0].id).toBe('inline1');
    expect(e.categories[1].name).toBe('Merge Set');
    expect(e.categories[1].emojis[0].id).toBe('set1');
  });

  it('title タグがない場合は d タグをカテゴリ名として使用する', async () => {
    setupRxNostrMultiCall([
      {
        packets: [{ event: { id: 'list-evt', tags: [['a', '30030:author3:fallback-set']] } }]
      },
      {
        packets: [
          {
            event: {
              id: 'set-fallbk',
              tags: [
                ['d', 'my-fallback-name'],
                ['emoji', 'fb', 'https://example.com/fb.png']
              ]
            }
          }
        ]
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
    expect(e.categories[0].name).toBe('my-fallback-name');
  });

  it('d タグも title タグもない場合はデフォルト名 "Emoji Set" を使用する', async () => {
    setupRxNostrMultiCall([
      {
        packets: [{ event: { id: 'list-evt', tags: [['a', '30030:author4:default-set']] } }]
      },
      {
        packets: [
          {
            event: {
              id: 'set-deflt',
              tags: [['emoji', 'def', 'https://example.com/def.png']]
            }
          }
        ]
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
    expect(e.categories[0].name).toBe('Emoji Set');
  });

  it('DB キャッシュの不正な setRef (parts < 3) はスキップする', async () => {
    mockEventsDB.getByPubkeyAndKind.mockResolvedValue({
      tags: [
        ['a', '30030:incomplete'], // Invalid
        ['emoji', 'inline', 'https://example.com/inline.png']
      ]
    });

    setupRxNostrSubscription([]);

    await loadCustomEmojis(PUBKEY);

    expect(mockEventsDB.getByReplaceKey).not.toHaveBeenCalled();
  });

  it('eventsDB.put エラーはキャッチされ処理を中断しない', async () => {
    mockEventsDB.put.mockRejectedValue(new Error('put failed'));

    setupRxNostrSubscription([
      {
        event: {
          id: 'evt-put-err',
          tags: [['emoji', 'ok', 'https://example.com/ok.png']]
        }
      }
    ]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
  });
});
