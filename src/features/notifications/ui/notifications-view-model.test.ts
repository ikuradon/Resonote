import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  localStorageStore,
  isMutedMock,
  isWordMutedMock,
  matchesFilterMock,
  logInfoMock,
  logErrorMock,
  classifyMock,
  subscribeNotificationStreamsMock,
  unsubscribeA,
  unsubscribeB
} = vi.hoisted(() => ({
  localStorageStore: new Map<string, string>(),
  isMutedMock: vi.fn(() => false),
  isWordMutedMock: vi.fn(() => false),
  matchesFilterMock: vi.fn((_pubkey: string, filter: string) => filter === 'all'),
  logInfoMock: vi.fn(),
  logErrorMock: vi.fn(),
  classifyMock: vi.fn((): string | null => null),
  subscribeNotificationStreamsMock: vi.fn(),
  unsubscribeA: vi.fn(),
  unsubscribeB: vi.fn()
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

vi.mock('$shared/nostr/events.js', () => ({
  COMMENT_KIND: 1111,
  REACTION_KIND: 7
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  subscribeNotificationStreams: subscribeNotificationStreamsMock
}));

vi.mock('$shared/browser/mute.js', () => ({
  isMuted: isMutedMock,
  isWordMuted: isWordMutedMock
}));

vi.mock('$shared/browser/follows.js', () => ({
  matchesFilter: matchesFilterMock
}));

vi.mock('../domain/notification-classifier.js', () => ({
  classifyNotificationEvent: classifyMock
}));

const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => localStorageStore.set(key, value)),
  removeItem: vi.fn((key: string) => localStorageStore.delete(key)),
  clear: vi.fn(() => localStorageStore.clear())
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

import {
  destroyNotifications,
  getLastRead,
  getNotifFilter,
  getNotifications,
  markAllAsRead,
  setNotifFilter,
  subscribeNotifications
} from './notifications-view-model.svelte.js';

interface NotificationPacket {
  event: ReturnType<typeof mentionEvent>;
}

interface NotificationCallbacks {
  onMentionPacket: (packet: NotificationPacket) => void;
  onFollowCommentPacket: (packet: NotificationPacket) => void;
  onError: (error: Error) => void;
}

function mentionEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'evt1'.padStart(64, '0'),
    pubkey: 'ccdd'.padStart(64, '0'),
    kind: 1111,
    content: 'hello',
    created_at: 1700000000,
    tags: [['e', 'target123'.padStart(64, '0')]],
    ...overrides
  };
}

describe('notifications-view-model', () => {
  beforeEach(() => {
    localStorageStore.clear();
    vi.clearAllMocks();
    destroyNotifications();
    setNotifFilter('all');
    subscribeNotificationStreamsMock.mockResolvedValue([
      { unsubscribe: unsubscribeA },
      { unsubscribe: unsubscribeB }
    ]);
  });

  it('starts empty', () => {
    const notifs = getNotifications();
    expect(notifs.items).toEqual([]);
    expect(notifs.unreadCount).toBe(0);
    expect(notifs.loading).toBe(false);
  });

  it('persists notification filter and last-read timestamp', () => {
    setNotifFilter('follows');
    expect(getNotifFilter()).toBe('follows');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('resonote-notif-filter', 'follows');

    markAllAsRead();
    expect(getLastRead()).toBeGreaterThan(0);
    expect(logInfoMock).toHaveBeenCalledWith(
      'Marked all notifications as read',
      expect.any(Object)
    );
  });

  it('delegates subscription setup to resonote with computed timing parameters', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const myPubkey = 'aabb'.padStart(64, '0');
    const follows = new Set(['ccdd'.padStart(64, '0')]);

    await subscribeNotifications(myPubkey, follows);

    expect(subscribeNotificationStreamsMock).toHaveBeenCalledWith(
      {
        myPubkey,
        follows,
        mentionKinds: [1111, 7],
        followCommentKind: 1111,
        mentionSince: 1_700_000_000 - 7 * 24 * 60 * 60,
        followCommentSince: 1_700_000_000
      },
      expect.any(Object)
    );
    nowSpy.mockRestore();
  });

  it('adds mention notifications through the resonote callback', async () => {
    const myPubkey = 'aabb'.padStart(64, '0');
    classifyMock.mockReturnValue('reply');

    await subscribeNotifications(myPubkey, new Set());
    const callbacks = subscribeNotificationStreamsMock.mock.calls[0][1] as NotificationCallbacks;
    callbacks.onMentionPacket({ event: mentionEvent() });

    const notifs = getNotifications();
    expect(notifs.items).toHaveLength(1);
    expect(notifs.items[0]).toEqual(
      expect.objectContaining({ type: 'reply', targetEventId: 'target123'.padStart(64, '0') })
    );
  });

  it('skips null and follow_comment mention classifications', async () => {
    const myPubkey = 'aabb'.padStart(64, '0');
    await subscribeNotifications(myPubkey, new Set());
    const callbacks = subscribeNotificationStreamsMock.mock.calls[0][1] as NotificationCallbacks;

    classifyMock.mockReturnValue(null);
    callbacks.onMentionPacket({ event: mentionEvent({ id: 'n1'.padStart(64, '0') }) });
    classifyMock.mockReturnValue('follow_comment');
    callbacks.onMentionPacket({ event: mentionEvent({ id: 'n2'.padStart(64, '0') }) });

    expect(getNotifications().items).toEqual([]);
  });

  it('adds follow_comment notifications only for followed authors other than self', async () => {
    const myPubkey = 'aabb'.padStart(64, '0');
    const followed = 'ccdd'.padStart(64, '0');
    await subscribeNotifications(myPubkey, new Set([followed]));
    const callbacks = subscribeNotificationStreamsMock.mock.calls[0][1] as NotificationCallbacks;

    callbacks.onFollowCommentPacket({
      event: mentionEvent({ pubkey: followed, id: 'f1'.padStart(64, '0') })
    });
    callbacks.onFollowCommentPacket({
      event: mentionEvent({ pubkey: myPubkey, id: 'f2'.padStart(64, '0') })
    });
    callbacks.onFollowCommentPacket({
      event: mentionEvent({ pubkey: 'eeff'.padStart(64, '0'), id: 'f3'.padStart(64, '0') })
    });

    const notifs = getNotifications();
    expect(notifs.items).toHaveLength(1);
    expect(notifs.items[0].type).toBe('follow_comment');
  });

  it('deduplicates and filters muted notifications', async () => {
    const myPubkey = 'aabb'.padStart(64, '0');
    classifyMock.mockReturnValue('reply');
    await subscribeNotifications(myPubkey, new Set());
    const callbacks = subscribeNotificationStreamsMock.mock.calls[0][1] as NotificationCallbacks;
    const event = mentionEvent({ id: 'dup1'.padStart(64, '0') });

    callbacks.onMentionPacket({ event });
    callbacks.onMentionPacket({ event });
    expect(getNotifications().items).toHaveLength(1);

    isMutedMock.mockReturnValue(true);
    callbacks.onMentionPacket({ event: mentionEvent({ id: 'dup2'.padStart(64, '0') }) });
    expect(getNotifications().items).toHaveLength(1);
  });

  it('destroys previous subscriptions on re-subscribe and logs runtime errors', async () => {
    const myPubkey = 'aabb'.padStart(64, '0');
    await subscribeNotifications(myPubkey, new Set());

    const callbacks = subscribeNotificationStreamsMock.mock.calls[0][1] as NotificationCallbacks;
    const error = new Error('subscription failed');
    callbacks.onError(error);
    expect(logErrorMock).toHaveBeenCalledWith('Notification subscription error', error);

    await subscribeNotifications(myPubkey, new Set());
    expect(unsubscribeA).toHaveBeenCalled();
    expect(unsubscribeB).toHaveBeenCalled();
  });

  it('destroyNotifications clears state and unsubscribes', async () => {
    await subscribeNotifications('aabb'.padStart(64, '0'), new Set());

    destroyNotifications();

    expect(getNotifications().items).toEqual([]);
    expect(unsubscribeA).toHaveBeenCalled();
    expect(unsubscribeB).toHaveBeenCalled();
    expect(logInfoMock).toHaveBeenCalledWith('Destroying notification subscriptions');
  });
});
