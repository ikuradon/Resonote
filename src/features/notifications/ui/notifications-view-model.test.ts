import { beforeEach, describe, expect, it, vi } from 'vitest';

const { localStorageStore, isMutedMock, isWordMutedMock, matchesFilterMock, logInfoMock } =
  vi.hoisted(() => ({
    localStorageStore: new Map<string, string>(),
    isMutedMock: vi.fn(() => false),
    isWordMutedMock: vi.fn(() => false),
    matchesFilterMock: vi.fn((_pubkey: string, filter: string) => filter === 'all'),
    logInfoMock: vi.fn()
  }));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }),
  shortHex: (s: string) => s.slice(0, 8)
}));

vi.mock('$shared/nostr/events.js', () => ({
  COMMENT_KIND: 1111,
  REACTION_KIND: 7
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getRxNostr: vi.fn()
}));

vi.mock('$shared/browser/mute.js', () => ({
  isMuted: isMutedMock,
  isWordMuted: isWordMutedMock
}));

vi.mock('$shared/browser/follows.js', () => ({
  matchesFilter: matchesFilterMock
}));

vi.mock('../domain/notification-classifier.js', () => ({
  classifyNotificationEvent: vi.fn(() => null)
}));

// localStorage mock
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => localStorageStore.set(key, value)),
  removeItem: vi.fn((key: string) => localStorageStore.delete(key)),
  clear: vi.fn(() => localStorageStore.clear())
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

import {
  getNotifFilter,
  setNotifFilter,
  getLastRead,
  getNotifications,
  markAllAsRead,
  destroyNotifications
} from './notifications-view-model.svelte.js';

describe('notifications-view-model', () => {
  beforeEach(() => {
    localStorageStore.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    isMutedMock.mockClear();
    isWordMutedMock.mockClear();
    matchesFilterMock.mockClear();
    logInfoMock.mockClear();
    destroyNotifications();
  });

  describe('initial state', () => {
    it('returns empty items initially', () => {
      const notifs = getNotifications();
      expect(notifs.items).toEqual([]);
    });

    it('loading is false initially after destroy', () => {
      const notifs = getNotifications();
      expect(notifs.loading).toBe(false);
    });

    it('unreadCount is 0 initially', () => {
      const notifs = getNotifications();
      expect(notifs.unreadCount).toBe(0);
    });
  });

  describe('getNotifFilter / setNotifFilter', () => {
    it('defaults to all when no localStorage value', () => {
      expect(getNotifFilter()).toBe('all');
    });

    it('setNotifFilter updates filter and persists to localStorage', () => {
      setNotifFilter('follows');
      expect(getNotifFilter()).toBe('follows');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('resonote-notif-filter', 'follows');
    });

    it('setNotifFilter to wot works', () => {
      setNotifFilter('wot');
      expect(getNotifFilter()).toBe('wot');
    });
  });

  describe('getLastRead', () => {
    it('returns 0 when no stored value', () => {
      expect(getLastRead()).toBe(0);
    });

    it('returns stored timestamp', () => {
      localStorageStore.set('resonote-notif-last-read', '1700000000');
      expect(getLastRead()).toBe(1700000000);
    });
  });

  describe('markAllAsRead', () => {
    it('saves current timestamp to localStorage', () => {
      const before = Math.floor(Date.now() / 1000);
      markAllAsRead();
      const after = Math.floor(Date.now() / 1000);
      const saved = parseInt(localStorageStore.get('resonote-notif-last-read') ?? '0', 10);
      expect(saved).toBeGreaterThanOrEqual(before);
      expect(saved).toBeLessThanOrEqual(after);
    });

    it('calls logger info', () => {
      markAllAsRead();
      expect(logInfoMock).toHaveBeenCalledWith(
        'Marked all notifications as read',
        expect.any(Object)
      );
    });
  });

  describe('getNotifications', () => {
    it('lastReadTs reflects localStorage value', () => {
      localStorageStore.set('resonote-notif-last-read', '9999');
      const notifs = getNotifications();
      expect(notifs.lastReadTs).toBe(9999);
    });
  });

  describe('destroyNotifications', () => {
    it('resets state and logs info', () => {
      destroyNotifications();
      const notifs = getNotifications();
      expect(notifs.items).toEqual([]);
      expect(notifs.loading).toBe(false);
      expect(logInfoMock).toHaveBeenCalledWith('Destroying notification subscriptions');
    });
  });
});
