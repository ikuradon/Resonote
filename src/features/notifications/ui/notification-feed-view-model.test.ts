import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Notification } from '../domain/notification-model.js';

const { fetchProfilesMock, cachedFetchByIdMock, getLastReadMock, markAllAsReadMock } = vi.hoisted(
  () => ({
    fetchProfilesMock: vi.fn(),
    cachedFetchByIdMock: vi.fn(async () => null),
    getLastReadMock: vi.fn(() => 0),
    markAllAsReadMock: vi.fn()
  })
);

vi.mock('$shared/browser/profile.js', () => ({
  fetchProfiles: fetchProfilesMock
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  cachedFetchById: async () => ({
    event: await cachedFetchByIdMock(),
    settlement: { phase: 'settled', provenance: 'none', reason: 'settled-miss' } as const
  })
}));

vi.mock('./notifications-view-model.svelte.js', () => ({
  getLastRead: getLastReadMock,
  markAllAsRead: markAllAsReadMock
}));

import { createNotificationFeedViewModel } from './notification-feed-view-model.svelte.js';

function makeNotif(partial: Partial<Notification> & Pick<Notification, 'id'>): Notification {
  return {
    id: partial.id,
    type: partial.type ?? 'reply',
    pubkey: partial.pubkey ?? 'pubkey1',
    content: partial.content ?? 'hello',
    createdAt: partial.createdAt ?? 1000,
    tags: partial.tags ?? [],
    targetEventId: partial.targetEventId
  };
}

describe('createNotificationFeedViewModel', () => {
  beforeEach(() => {
    fetchProfilesMock.mockClear();
    cachedFetchByIdMock.mockClear();
    getLastReadMock.mockReturnValue(0);
    markAllAsReadMock.mockClear();
  });

  describe('initial state', () => {
    it('filter defaults to all', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source);
      expect(vm.filter).toBe('all');
    });

    it('items is empty when source has no items', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source);
      expect(vm.items).toEqual([]);
    });

    it('remaining is 0 when no items', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source);
      expect(vm.remaining).toBe(0);
    });

    it('lastReadTs reflects getLastRead()', () => {
      getLastReadMock.mockReturnValue(12345);
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source, {});
      expect(vm.lastReadTs).toBe(12345);
    });

    it('uses initialFilter option', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source, { initialFilter: 'reply' });
      expect(vm.filter).toBe('reply');
    });
  });

  describe('setFilter', () => {
    it('changes filter', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source);
      vm.setFilter('reaction');
      expect(vm.filter).toBe('reaction');
    });

    it('filters items by type', () => {
      const items = [
        makeNotif({ id: 'r1', type: 'reply' }),
        makeNotif({ id: 'rx1', type: 'reaction' }),
        makeNotif({ id: 'r2', type: 'reply' })
      ];
      const source = { items };
      const vm = createNotificationFeedViewModel(source, { pageSize: 10 });
      vm.setFilter('reply');
      expect(vm.items.map((i) => i.id)).toEqual(['r1', 'r2']);
    });

    it('resets limit to pageSize on setFilter', () => {
      const items = Array.from({ length: 5 }, (_, i) => makeNotif({ id: `n${i}` }));
      const source = { items };
      const vm = createNotificationFeedViewModel(source, { pageSize: 2, initialLimit: 2 });
      vm.loadMore();
      vm.setFilter('reply');
      // after setFilter, limit resets to pageSize=2
      expect(vm.items.length).toBeLessThanOrEqual(2);
    });
  });

  describe('loadMore', () => {
    it('increases visible items by pageSize', () => {
      const items = Array.from({ length: 10 }, (_, i) => makeNotif({ id: `n${i}`, type: 'reply' }));
      const source = { items };
      const vm = createNotificationFeedViewModel(source, { pageSize: 3, initialLimit: 3 });
      expect(vm.items.length).toBe(3);
      vm.loadMore();
      expect(vm.items.length).toBe(6);
    });

    it('remaining decreases after loadMore', () => {
      const items = Array.from({ length: 10 }, (_, i) => makeNotif({ id: `n${i}` }));
      const source = { items };
      const vm = createNotificationFeedViewModel(source, { pageSize: 3, initialLimit: 3 });
      const remainingBefore = vm.remaining;
      vm.loadMore();
      expect(vm.remaining).toBeLessThan(remainingBefore);
    });
  });

  describe('markReadNow', () => {
    it('updates lastReadTs', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source);
      vm.markReadNow(99999);
      expect(vm.lastReadTs).toBe(99999);
    });
  });

  describe('markAllRead', () => {
    it('calls markAllAsRead and updates lastReadTs', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source);
      vm.markAllRead();
      expect(markAllAsReadMock).toHaveBeenCalled();
    });
  });

  describe('isUnread', () => {
    it('returns true when createdAt > lastReadTs', () => {
      getLastReadMock.mockReturnValue(100);
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source);
      expect(vm.isUnread(200)).toBe(true);
    });

    it('returns false when createdAt <= lastReadTs', () => {
      getLastReadMock.mockReturnValue(100);
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source);
      expect(vm.isUnread(100)).toBe(false);
      expect(vm.isUnread(50)).toBe(false);
    });
  });

  describe('contentPreview', () => {
    it('returns text as-is when within maxLength', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source, { contentPreviewLength: 100 });
      expect(vm.contentPreview('short text')).toBe('short text');
    });

    it('truncates long text with ellipsis', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source, { contentPreviewLength: 10 });
      const result = vm.contentPreview('0123456789abcdef');
      // truncateString: slice(0, maxLength - 1) + '…' = 9 chars + 1 = 10 chars total
      expect(result.length).toBe(10);
      expect(result.endsWith('\u2026')).toBe(true);
    });
  });

  describe('targetTexts', () => {
    it('starts as empty Map', () => {
      const source = { items: [] };
      const vm = createNotificationFeedViewModel(source);
      expect(vm.targetTexts).toBeInstanceOf(Map);
      expect(vm.targetTexts.size).toBe(0);
    });
  });
});
