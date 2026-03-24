import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const { mockLoadBookmarks, mockPublishAddBookmark, mockPublishRemoveBookmark, mockAuthPubkey } =
  vi.hoisted(() => ({
    mockLoadBookmarks: vi.fn(async (): Promise<{ tags: string[][] } | null> => null),
    mockPublishAddBookmark: vi.fn(async (): Promise<string[][]> => []),
    mockPublishRemoveBookmark: vi.fn(async (): Promise<string[][]> => []),
    mockAuthPubkey: { value: null as string | null }
  }));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }),
  shortHex: (s: string): string => s.slice(0, 8)
}));

vi.mock('$features/bookmarks/application/bookmark-actions.js', () => ({
  loadBookmarks: mockLoadBookmarks,
  publishAddBookmark: mockPublishAddBookmark,
  publishRemoveBookmark: mockPublishRemoveBookmark
}));

vi.mock('./auth.svelte.js', () => ({
  getAuth: () => ({
    get pubkey() {
      return mockAuthPubkey.value;
    }
  })
}));

import type { ContentId } from '$shared/content/types.js';

import {
  addBookmark,
  clearBookmarks,
  getBookmarks,
  isBookmarked,
  loadBookmarks,
  removeBookmark
} from './bookmarks.svelte.js';

const PUBKEY = 'abcdef1234567890';
const contentId: ContentId = { platform: 'spotify', type: 'track', id: 'track-1' };
const CONTENT_VALUE = 'spotify:track:track-1';
const OPEN_URL = 'https://open.spotify.com/track/track-1';

const mockProvider = {
  openUrl: () => OPEN_URL
};

describe('bookmarks store', () => {
  beforeEach(() => {
    clearBookmarks();
    mockAuthPubkey.value = null;
    // Reset all mocks including once-queued return values
    mockLoadBookmarks.mockReset().mockResolvedValue(null);
    mockPublishAddBookmark.mockReset().mockResolvedValue([]);
    mockPublishRemoveBookmark.mockReset().mockResolvedValue([]);
  });

  // --- getBookmarks ---
  describe('getBookmarks', () => {
    it('初期状態は空 entries, loading=false, loaded=false', () => {
      const bookmarks = getBookmarks();
      expect(bookmarks.entries).toEqual([]);
      expect(bookmarks.loading).toBe(false);
      expect(bookmarks.loaded).toBe(false);
    });
  });

  // --- isBookmarked ---
  describe('isBookmarked', () => {
    it('ブックマークが存在しない場合 false を返す', () => {
      expect(isBookmarked(contentId)).toBe(false);
    });

    it('ブックマーク追加後 true を返す', async () => {
      mockAuthPubkey.value = PUBKEY;
      mockPublishAddBookmark.mockResolvedValueOnce([['i', CONTENT_VALUE, OPEN_URL]]);

      await addBookmark(contentId, mockProvider);

      expect(isBookmarked(contentId)).toBe(true);
    });

    it('異なる contentId に対して false を返す', async () => {
      mockAuthPubkey.value = PUBKEY;
      mockPublishAddBookmark.mockResolvedValueOnce([['i', CONTENT_VALUE, OPEN_URL]]);

      await addBookmark(contentId, mockProvider);

      const otherId: ContentId = { platform: 'youtube', type: 'video', id: 'vid-1' };
      expect(isBookmarked(otherId)).toBe(false);
    });
  });

  // --- clearBookmarks ---
  describe('clearBookmarks', () => {
    it('state をデフォルトにリセットする', () => {
      clearBookmarks();
      const bookmarks = getBookmarks();
      expect(bookmarks.entries).toEqual([]);
      expect(bookmarks.loading).toBe(false);
      expect(bookmarks.loaded).toBe(false);
    });

    it('複数回呼び出しても安全', () => {
      clearBookmarks();
      clearBookmarks();
      const bookmarks = getBookmarks();
      expect(bookmarks.entries).toEqual([]);
    });
  });

  // --- loadBookmarks ---
  describe('loadBookmarks', () => {
    it('pubkey のブックマークを読み込む', async () => {
      mockLoadBookmarks.mockResolvedValueOnce({
        tags: [
          ['i', CONTENT_VALUE, OPEN_URL],
          ['i', 'youtube:video:vid-1', 'https://youtube.com/watch?v=vid-1']
        ]
      });

      await loadBookmarks(PUBKEY);

      const bookmarks = getBookmarks();
      expect(bookmarks.entries).toHaveLength(2);
      expect(bookmarks.entries[0]).toEqual({
        type: 'content',
        value: CONTENT_VALUE,
        hint: OPEN_URL
      });
      expect(bookmarks.loading).toBe(false);
      expect(bookmarks.loaded).toBe(true);
    });

    it('イベントが null の場合 entries は空', async () => {
      mockLoadBookmarks.mockResolvedValueOnce(null);

      await loadBookmarks(PUBKEY);

      const bookmarks = getBookmarks();
      expect(bookmarks.entries).toEqual([]);
      expect(bookmarks.loaded).toBe(true);
    });

    it('generation ミスマッチで更新をスキップする', async () => {
      let resolveFirst!: (v: { tags: string[][] } | null) => void;
      const pendingPromise = new Promise<{ tags: string[][] } | null>((resolve) => {
        resolveFirst = resolve;
      });

      let callIndex = 0;
      mockLoadBookmarks.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) return pendingPromise;
        return Promise.resolve({
          tags: [['i', 'youtube:video:second', 'https://youtube.com/second']]
        });
      });

      const p1 = loadBookmarks(PUBKEY);
      // Yield so p1 reaches await load(pubkey)
      await new Promise((r) => setTimeout(r, 10));
      const p2 = loadBookmarks(PUBKEY);
      await p2;

      // Now resolve p1's pending promise
      resolveFirst({ tags: [['i', CONTENT_VALUE, OPEN_URL]] });
      await p1;

      const bookmarks = getBookmarks();
      // Second load wins; first is skipped by generation mismatch
      expect(bookmarks.entries).toHaveLength(1);
      expect(bookmarks.entries[0].value).toBe('youtube:video:second');
    });

    it('エラー発生時は loading=false, loaded=true になる', async () => {
      mockLoadBookmarks.mockRejectedValueOnce(new Error('load error'));

      await expect(loadBookmarks(PUBKEY)).rejects.toThrow('load error');

      const bookmarks = getBookmarks();
      expect(bookmarks.loading).toBe(false);
      expect(bookmarks.loaded).toBe(true);
    });

    it('loadBookmarks が pubkey で呼ばれる', async () => {
      await loadBookmarks(PUBKEY);

      expect(mockLoadBookmarks).toHaveBeenCalledWith(PUBKEY);
    });

    it('e タグのブックマークエントリも解析される', async () => {
      mockLoadBookmarks.mockResolvedValueOnce({
        tags: [['e', 'event-id-123', 'wss://relay.example.com']]
      });

      await loadBookmarks(PUBKEY);

      const bookmarks = getBookmarks();
      expect(bookmarks.entries).toHaveLength(1);
      expect(bookmarks.entries[0]).toEqual({
        type: 'event',
        value: 'event-id-123',
        hint: 'wss://relay.example.com'
      });
    });
  });

  // --- addBookmark ---
  describe('addBookmark', () => {
    it('ログイン済みでブックマークを追加する', async () => {
      mockAuthPubkey.value = PUBKEY;
      mockPublishAddBookmark.mockResolvedValueOnce([['i', CONTENT_VALUE, OPEN_URL]]);

      await addBookmark(contentId, mockProvider);

      expect(mockPublishAddBookmark).toHaveBeenCalledWith(contentId, OPEN_URL, PUBKEY);
      const bookmarks = getBookmarks();
      expect(bookmarks.entries).toHaveLength(1);
      expect(bookmarks.entries[0].value).toBe(CONTENT_VALUE);
    });

    it('未ログインで Error をスローする', async () => {
      mockAuthPubkey.value = null;

      await expect(addBookmark(contentId, mockProvider)).rejects.toThrow('Not logged in');
    });

    it('publishAddBookmark のエラーが伝播する', async () => {
      mockAuthPubkey.value = PUBKEY;
      mockPublishAddBookmark.mockRejectedValueOnce(new Error('publish error'));

      await expect(addBookmark(contentId, mockProvider)).rejects.toThrow('publish error');
    });

    it('provider.openUrl が正しく呼ばれる', async () => {
      mockAuthPubkey.value = PUBKEY;
      const openUrlSpy = vi.fn(() => OPEN_URL);
      const spyProvider = { openUrl: openUrlSpy };
      mockPublishAddBookmark.mockResolvedValueOnce([['i', CONTENT_VALUE, OPEN_URL]]);

      await addBookmark(contentId, spyProvider);

      expect(openUrlSpy).toHaveBeenCalledWith(contentId);
    });
  });

  // --- removeBookmark ---
  describe('removeBookmark', () => {
    it('ログイン済みでブックマークを削除する', async () => {
      mockAuthPubkey.value = PUBKEY;
      mockPublishAddBookmark.mockResolvedValueOnce([['i', CONTENT_VALUE, OPEN_URL]]);
      await addBookmark(contentId, mockProvider);

      mockPublishRemoveBookmark.mockResolvedValueOnce([]);
      await removeBookmark(contentId);

      expect(mockPublishRemoveBookmark).toHaveBeenCalledWith(contentId, PUBKEY);
      const bookmarks = getBookmarks();
      expect(bookmarks.entries).toEqual([]);
    });

    it('未ログインで Error をスローする', async () => {
      mockAuthPubkey.value = null;

      await expect(removeBookmark(contentId)).rejects.toThrow('Not logged in');
    });

    it('publishRemoveBookmark のエラーが伝播する', async () => {
      mockAuthPubkey.value = PUBKEY;
      mockPublishRemoveBookmark.mockRejectedValueOnce(new Error('remove error'));

      await expect(removeBookmark(contentId)).rejects.toThrow('remove error');
    });

    it('他のブックマークは残る', async () => {
      mockAuthPubkey.value = PUBKEY;

      // Add two bookmarks first
      mockPublishAddBookmark.mockResolvedValueOnce([
        ['i', CONTENT_VALUE, OPEN_URL],
        ['i', 'youtube:video:vid-1', 'https://youtube.com/watch?v=vid-1']
      ]);
      await addBookmark(contentId, mockProvider);
      expect(getBookmarks().entries).toHaveLength(2);

      // Remove one bookmark - publishRemoveBookmark returns remaining tags
      const remaining = [['i', 'youtube:video:vid-1', 'https://youtube.com/watch?v=vid-1']];
      mockPublishRemoveBookmark.mockResolvedValueOnce(remaining);

      await removeBookmark(contentId);

      const bookmarks = getBookmarks();
      expect(bookmarks.entries).toHaveLength(1);
      expect(bookmarks.entries[0].value).toBe('youtube:video:vid-1');
      // Verify the removed bookmark is no longer present
      expect(isBookmarked(contentId)).toBe(false);
    });
  });
});
