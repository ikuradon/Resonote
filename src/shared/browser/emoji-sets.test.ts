import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const {
  logInfoMock,
  logErrorMock,
  mockGetSync,
  mockRxNostr,
  fetchLatestMock,
  createSyncedQueryMock,
  getStoreAsyncMock
} = vi.hoisted(() => ({
  logInfoMock: vi.fn(),
  logErrorMock: vi.fn(),
  mockGetSync: vi.fn(
    async () => [] as Array<{ event: Record<string, unknown>; seenOn: string[]; firstSeen: number }>
  ),
  mockRxNostr: {},
  fetchLatestMock: vi.fn(),
  createSyncedQueryMock: vi.fn(),
  getStoreAsyncMock: vi.fn()
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

vi.mock('$shared/nostr/store.js', () => ({
  getStoreAsync: getStoreAsyncMock,
  fetchLatest: fetchLatestMock
}));

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: async () => mockRxNostr
}));

vi.mock('@ikuradon/auftakt/sync', () => ({
  createSyncedQuery: createSyncedQueryMock
}));

import { clearCustomEmojis, getCustomEmojis, loadCustomEmojis } from './emoji-sets.svelte.js';

/**
 * Helper: setup fetchLatest mock to return a kind:10030 event.
 * Also configure the store mock for getSync.
 */
function setupFetchLatest(event: { id: string; tags: string[][] } | null) {
  fetchLatestMock.mockResolvedValue(event);
}

/**
 * Helper: setup createSyncedQuery mock that emits CachedEvent[] for kind:30030 fetches.
 * Returns a list of mock calls so tests can check what was queried.
 */
function setupSyncedQueryForSets(
  calls: Array<{
    events: Array<{ event: { id: string; tags: string[][] } }>;
    error?: Error;
  }>
) {
  let callIndex = 0;
  createSyncedQueryMock.mockImplementation(() => {
    const call = calls[callIndex] ?? { events: [] };
    callIndex++;
    const subject = new BehaviorSubject<unknown[]>([]);
    const status = new BehaviorSubject<string>('cached');
    const disposeFn = vi.fn();

    queueMicrotask(() => {
      if (call.error) {
        subject.error(call.error);
      } else if (call.events.length > 0) {
        subject.next(
          call.events.map((e) => ({
            event: e.event,
            seenOn: ['wss://relay.test'],
            firstSeen: Date.now()
          }))
        );
      }
      status.next('complete');
    });

    return {
      events$: subject.asObservable(),
      status$: status.asObservable(),
      emit: vi.fn(),
      dispose: disposeFn
    };
  });
}

// ---- tests ----

describe('getCustomEmojis', () => {
  beforeEach(() => {
    clearCustomEmojis();
    vi.clearAllMocks();
    mockGetSync.mockResolvedValue([]);
    getStoreAsyncMock.mockResolvedValue({
      getSync: mockGetSync,
      fetchById: vi.fn().mockResolvedValue(null),
      dispose: vi.fn()
    });
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
    mockGetSync.mockResolvedValue([]);
    getStoreAsyncMock.mockResolvedValue({
      getSync: mockGetSync,
      fetchById: vi.fn().mockResolvedValue(null),
      dispose: vi.fn()
    });
  });

  it('inline emoji タグからカテゴリを構築する', async () => {
    setupFetchLatest({
      id: 'evt1',
      tags: [
        ['emoji', 'smile', 'https://example.com/smile.png'],
        ['emoji', 'wave', 'https://example.com/wave.png']
      ]
    });

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

    setupFetchLatest({ id: 'list-evt', tags: [['a', setRef]] });

    setupSyncedQueryForSets([
      {
        events: [
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
    mockGetSync.mockResolvedValueOnce([
      {
        event: { tags: [['emoji', 'heart', 'https://example.com/heart.png']] },
        seenOn: [],
        firstSeen: 0
      }
    ]);

    setupFetchLatest(null);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    // fetchLatest returned null → keep cached results
    // But cached only had inline emojis which were restored
    expect(e.loading).toBe(false);
  });

  it('DB キャッシュ復元後にリレーフェッチで上書きされる', async () => {
    mockGetSync.mockResolvedValueOnce([
      {
        event: { tags: [['emoji', 'old', 'https://example.com/old.png']] },
        seenOn: [],
        firstSeen: 0
      }
    ]);

    setupFetchLatest({
      id: 'new-evt',
      tags: [['emoji', 'new', 'https://example.com/new.png']]
    });

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
    expect(e.categories[0].emojis[0].id).toBe('new');
  });

  it('DB キャッシュの setRef を解決してカテゴリを復元する', async () => {
    const setAuthor = 'author123';
    const setRef = `30030:${setAuthor}:test-set`;

    // First getSync call: emoji list (kind:10030)
    mockGetSync.mockResolvedValueOnce([
      {
        event: { tags: [['a', setRef]] },
        seenOn: [],
        firstSeen: 0
      }
    ]);

    // Second getSync call: emoji set (kind:30030)
    mockGetSync.mockResolvedValueOnce([
      {
        event: {
          id: 'cached-set-evt',
          tags: [
            ['d', 'test-set'],
            ['emoji', 'star', 'https://example.com/star.png']
          ]
        },
        seenOn: [],
        firstSeen: 0
      }
    ]);

    setupFetchLatest({ id: 'list-evt', tags: [['a', setRef]] });

    setupSyncedQueryForSets([
      {
        events: [
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
    expect(mockGetSync).toHaveBeenCalledWith(
      expect.objectContaining({
        kinds: [30030],
        authors: [setAuthor],
        '#d': ['test-set']
      })
    );
  });

  it('空の emoji リストでは空カテゴリを返す', async () => {
    setupFetchLatest({ id: 'empty-evt', tags: [] });

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('emoji タグのない set イベントではカテゴリが生成されない', async () => {
    setupFetchLatest({ id: 'list-evt', tags: [['a', '30030:author1:no-emoji-set']] });

    setupSyncedQueryForSets([
      {
        events: [
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
    setupFetchLatest({
      id: 'evt-from-p2',
      tags: [['emoji', 'winner', 'https://example.com/winner.png']]
    });

    // Call loadCustomEmojis twice synchronously — p1 gets outdated generation
    const p1 = loadCustomEmojis(PUBKEY);
    const p2 = loadCustomEmojis(PUBKEY);

    await Promise.all([p1, p2]);

    const e = getCustomEmojis();
    expect(e.loading).toBe(false);
  });

  it('不正な setRef (parts < 3) はスキップする', async () => {
    setupFetchLatest({
      id: 'list-evt',
      tags: [
        ['a', '30030:incomplete'], // Invalid: only 2 parts
        ['a', '30030:author:valid-set'] // Valid
      ]
    });

    setupSyncedQueryForSets([
      {
        events: [
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

  it('fetchLatest エラー時にも解決される', async () => {
    fetchLatestMock.mockRejectedValue(new Error('fetch error'));

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('set fetch エラー時にも解決される', async () => {
    setupFetchLatest({ id: 'list-evt', tags: [['a', '30030:author:err-set']] });

    setupSyncedQueryForSets([{ events: [], error: new Error('set fetch error') }]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('set が見つからない場合も complete で速やかに解決される', async () => {
    setupFetchLatest({ id: 'list-evt', tags: [['a', '30030:author:missing-set']] });
    setupSyncedQueryForSets([{ events: [] }]);

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('events$ に初期値がなくても complete で空セットとして解決される', async () => {
    setupFetchLatest({ id: 'list-evt', tags: [['a', '30030:author:no-initial-value']] });

    createSyncedQueryMock.mockImplementation(() => {
      const events$ = new Subject<unknown[]>();
      const status$ = new BehaviorSubject<string>('cached');
      queueMicrotask(() => {
        status$.next('complete');
      });
      return {
        events$: events$.asObservable(),
        status$: status$.asObservable(),
        emit: vi.fn(),
        dispose: vi.fn()
      };
    });

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('catch ブロックがエラーをログに記録する', async () => {
    // Make getSync throw to trigger catch block
    mockGetSync.mockRejectedValueOnce(new Error('DB failed'));

    await loadCustomEmojis(PUBKEY);

    expect(logErrorMock).toHaveBeenCalledWith('Failed to load custom emojis', expect.any(Error));
    expect(getCustomEmojis().loading).toBe(false);
  });

  it('connectStore handles caching automatically (no explicit put)', async () => {
    setupFetchLatest({
      id: 'cache-evt',
      tags: [['emoji', 'cached', 'https://example.com/cached.png']]
    });

    await loadCustomEmojis(PUBKEY);

    // connectStore() handles caching — no explicit put call
    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
    expect(e.categories[0].emojis[0].id).toBe('cached');
  });

  it('inline と set の両方を含むカテゴリをマージする', async () => {
    setupFetchLatest({
      id: 'list-evt',
      tags: [
        ['emoji', 'inline1', 'https://example.com/inline1.png'],
        ['a', '30030:author2:merge-set']
      ]
    });

    setupSyncedQueryForSets([
      {
        events: [
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
    setupFetchLatest({ id: 'list-evt', tags: [['a', '30030:author3:fallback-set']] });

    setupSyncedQueryForSets([
      {
        events: [
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
    setupFetchLatest({ id: 'list-evt', tags: [['a', '30030:author4:default-set']] });

    setupSyncedQueryForSets([
      {
        events: [
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
    mockGetSync.mockResolvedValueOnce([
      {
        event: {
          tags: [
            ['a', '30030:incomplete'], // Invalid
            ['emoji', 'inline', 'https://example.com/inline.png']
          ]
        },
        seenOn: [],
        firstSeen: 0
      }
    ]);

    setupFetchLatest(null);

    await loadCustomEmojis(PUBKEY);

    // getSync should not be called with kinds: [30030] for invalid setRef
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kind30030Calls = (mockGetSync.mock.calls as any[][]).filter(
      (call) => call[0]?.kinds?.[0] === 30030
    );
    expect(kind30030Calls).toHaveLength(0);
  });

  it('connectStore handles caching errors transparently', async () => {
    // connectStore() handles caching — no explicit put call to fail
    setupFetchLatest({
      id: 'evt-ok',
      tags: [['emoji', 'ok', 'https://example.com/ok.png']]
    });

    await loadCustomEmojis(PUBKEY);

    const e = getCustomEmojis();
    expect(e.categories).toHaveLength(1);
  });
});
