import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  localStorageStore,
  isMutedMock,
  isWordMutedMock,
  matchesFilterMock,
  logInfoMock,
  classifyMock,
  getRxNostrMock,
  subscriberCallbacks,
  backwardEmitCalls,
  forwardEmitCalls,
  unsubscribeMock
} = vi.hoisted(() => {
  const subscriberCallbacks: Array<(packet: unknown) => void> = [];
  const backwardEmitCalls: unknown[] = [];
  const forwardEmitCalls: unknown[] = [];
  const unsubscribeMock = vi.fn();

  return {
    localStorageStore: new Map<string, string>(),
    isMutedMock: vi.fn(() => false),
    isWordMutedMock: vi.fn(() => false),
    matchesFilterMock: vi.fn((_pubkey: string, filter: string) => filter === 'all'),
    logInfoMock: vi.fn(),
    classifyMock: vi.fn((): string | null => null),
    getRxNostrMock: vi.fn(),
    subscriberCallbacks,
    backwardEmitCalls,
    forwardEmitCalls,
    unsubscribeMock
  };
});

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

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: getRxNostrMock
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

// Mock rxjs and rx-nostr for dynamic imports
vi.mock('rxjs', () => ({
  merge: vi.fn(() => ({
    subscribe: vi.fn((observer: { next: (packet: unknown) => void }) => {
      subscriberCallbacks.push(observer.next);
      return { unsubscribe: unsubscribeMock };
    })
  }))
}));

vi.mock('rx-nostr', () => ({
  createRxBackwardReq: vi.fn(() => ({
    emit: vi.fn((filter: unknown) => backwardEmitCalls.push(filter)),
    over: vi.fn()
  })),
  createRxForwardReq: vi.fn(() => ({
    emit: vi.fn((filter: unknown) => forwardEmitCalls.push(filter))
  })),
  uniq: vi.fn(() => (x: unknown) => x)
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
  destroyNotifications,
  getLastRead,
  getNotifFilter,
  getNotifications,
  markAllAsRead,
  setNotifFilter,
  subscribeNotifications
} from './notifications-view-model.svelte.js';

/** Generate a unique 64-char hex-like ID with no collisions from padStart */
function testId(prefix: string): string {
  return prefix.padStart(64, '0');
}

function resetSubscriptionMocks() {
  subscriberCallbacks.length = 0;
  backwardEmitCalls.length = 0;
  forwardEmitCalls.length = 0;
  unsubscribeMock.mockClear();

  const mockRxNostr = {
    use: vi.fn().mockReturnValue({ pipe: vi.fn().mockReturnThis() })
  };
  getRxNostrMock.mockResolvedValue(mockRxNostr);
}

describe('notifications-view-model', () => {
  beforeEach(() => {
    localStorageStore.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    isMutedMock.mockClear();
    isWordMutedMock.mockClear();
    isMutedMock.mockReturnValue(false);
    isWordMutedMock.mockReturnValue(false);
    matchesFilterMock.mockClear();
    matchesFilterMock.mockImplementation((_pubkey: string, filter: string) => filter === 'all');
    logInfoMock.mockClear();
    classifyMock.mockClear();
    classifyMock.mockReturnValue(null);
    destroyNotifications();
    setNotifFilter('all');
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

  describe('subscribeNotifications', () => {
    it('emits backward and forward requests for mentions', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');

      await subscribeNotifications(myPubkey, new Set());

      expect(backwardEmitCalls.length).toBeGreaterThanOrEqual(1);
      const mentionFilter = backwardEmitCalls[0] as Record<string, unknown>;
      expect(mentionFilter).toMatchObject({
        kinds: [1111, 7],
        '#p': [myPubkey]
      });
      expect(mentionFilter.since).toBeDefined();

      expect(forwardEmitCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('skips follow subscription when follows.size === 0', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');

      await subscribeNotifications(myPubkey, new Set());

      // Only 1 subscriber callback (notif sub), no follow sub
      expect(subscriberCallbacks).toHaveLength(1);
    });

    it('creates follow subscription when follows is non-empty', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const follows = new Set([testId('ccdd')]);

      await subscribeNotifications(myPubkey, follows);

      // 2 subscriber callbacks (notif + follow)
      expect(subscriberCallbacks).toHaveLength(2);
      expect(logInfoMock).toHaveBeenCalledWith(
        'Subscribed to notifications',
        expect.objectContaining({ followCount: 1 })
      );
    });

    it('batches follow authors in groups of 100', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const follows = new Set(
        Array.from({ length: 150 }, (_, i) => i.toString(16).padStart(64, '0'))
      );

      await subscribeNotifications(myPubkey, follows);

      // backward: 1 mention emit + 2 follow batch emits = 3
      // forward: 1 mention emit + 2 follow batch emits = 3
      expect(backwardEmitCalls).toHaveLength(3);
      expect(forwardEmitCalls).toHaveLength(3);
    });

    it('processes reply events via subscriber callback', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reply');

      await subscribeNotifications(myPubkey, new Set());

      const notifCb = subscriberCallbacks[0];
      notifCb({
        event: {
          id: 'evt1'.padStart(64, '0'),
          pubkey: testId('ccdd'),
          kind: 1111,
          content: 'hello',
          created_at: 1700000000,
          tags: [
            ['p', myPubkey],
            ['e', 'target123'.padStart(64, '0')]
          ]
        }
      });

      const notifs = getNotifications();
      expect(notifs.items).toHaveLength(1);
      expect(notifs.items[0].type).toBe('reply');
      expect(notifs.items[0].targetEventId).toBe('target123'.padStart(64, '0'));
    });

    it('processes reaction events', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reaction');

      await subscribeNotifications(myPubkey, new Set());

      subscriberCallbacks[0]({
        event: {
          id: 'react1'.padStart(64, '0'),
          pubkey: testId('ccdd'),
          kind: 7,
          content: '+',
          created_at: 1700000001,
          tags: [['p', myPubkey]]
        }
      });

      const notifs = getNotifications();
      expect(notifs.items).toHaveLength(1);
      expect(notifs.items[0].type).toBe('reaction');
    });

    it('skips follow_comment type in notif subscriber', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('follow_comment');

      await subscribeNotifications(myPubkey, new Set());

      subscriberCallbacks[0]({
        event: {
          id: 'fc1'.padStart(64, '0'),
          pubkey: testId('ccdd'),
          kind: 1111,
          content: 'test',
          created_at: 1700000000,
          tags: []
        }
      });

      expect(getNotifications().items).toHaveLength(0);
    });

    it('skips null classification', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue(null);

      await subscribeNotifications(myPubkey, new Set());

      subscriberCallbacks[0]({
        event: {
          id: 'null1'.padStart(64, '0'),
          pubkey: testId('ccdd'),
          kind: 999,
          content: '',
          created_at: 1700000000,
          tags: []
        }
      });

      expect(getNotifications().items).toHaveLength(0);
    });

    it('processes follow_comment events from follow subscriber', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const followPubkey = testId('ccdd');
      const follows = new Set([followPubkey]);

      await subscribeNotifications(myPubkey, follows);

      const followCb = subscriberCallbacks[1];
      followCb({
        event: {
          id: 'fce1'.padStart(64, '0'),
          pubkey: followPubkey,
          kind: 1111,
          content: 'follow comment',
          created_at: 1700000000,
          tags: []
        }
      });

      const notifs = getNotifications();
      expect(notifs.items).toHaveLength(1);
      expect(notifs.items[0].type).toBe('follow_comment');
    });

    it('skips own events in follow subscriber', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const follows = new Set([myPubkey]);

      await subscribeNotifications(myPubkey, follows);

      subscriberCallbacks[1]({
        event: {
          id: 'own1'.padStart(64, '0'),
          pubkey: myPubkey,
          kind: 1111,
          content: 'my own',
          created_at: 1700000000,
          tags: []
        }
      });

      expect(getNotifications().items).toHaveLength(0);
    });

    it('skips non-follow events in follow subscriber', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const followPubkey = testId('ccdd');
      const follows = new Set([followPubkey]);

      await subscribeNotifications(myPubkey, follows);

      subscriberCallbacks[1]({
        event: {
          id: 'nf1'.padStart(64, '0'),
          pubkey: testId('eeff'),
          kind: 1111,
          content: 'stranger',
          created_at: 1700000000,
          tags: []
        }
      });

      expect(getNotifications().items).toHaveLength(0);
    });

    it('destroys previous subscriptions on re-subscribe', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');

      await subscribeNotifications(myPubkey, new Set());

      resetSubscriptionMocks();
      await subscribeNotifications(myPubkey, new Set());

      // Previous subscriptions should have been unsubscribed
      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });

  describe('notification dedup via notifIds', () => {
    it('ignores duplicate notification ids', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reply');

      await subscribeNotifications(myPubkey, new Set());

      const event = {
        id: 'dup1'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 1111,
        content: 'hello',
        created_at: 1700000000,
        tags: [['p', myPubkey]]
      };

      subscriberCallbacks[0]({ event });
      subscriberCallbacks[0]({ event });

      expect(getNotifications().items).toHaveLength(1);
    });
  });

  describe('muted user notifications ignored', () => {
    it('skips notifications from muted users', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reply');
      isMutedMock.mockReturnValue(true);

      await subscribeNotifications(myPubkey, new Set());

      subscriberCallbacks[0]({
        event: {
          id: 'muted1'.padStart(64, '0'),
          pubkey: testId('ccdd'),
          kind: 1111,
          content: 'from muted',
          created_at: 1700000000,
          tags: [['p', myPubkey]]
        }
      });

      expect(getNotifications().items).toHaveLength(0);
      expect(isMutedMock).toHaveBeenCalled();
    });
  });

  describe('word-muted content ignored', () => {
    it('skips notifications with word-muted content', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reply');
      isWordMutedMock.mockReturnValue(true);

      await subscribeNotifications(myPubkey, new Set());

      subscriberCallbacks[0]({
        event: {
          id: 'wm1'.padStart(64, '0'),
          pubkey: testId('ccdd'),
          kind: 1111,
          content: 'bad word here',
          created_at: 1700000000,
          tags: [['p', myPubkey]]
        }
      });

      expect(getNotifications().items).toHaveLength(0);
      expect(isWordMutedMock).toHaveBeenCalled();
    });
  });

  describe('follow_comment cap (50 items)', () => {
    it('evicts oldest follow_comment when cap is reached', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const followPubkey = testId('ccdd');
      const follows = new Set([followPubkey]);

      await subscribeNotifications(myPubkey, follows);

      const followCb = subscriberCallbacks[1];

      // Add 50 follow_comments
      for (let i = 0; i < 50; i++) {
        followCb({
          event: {
            id: `fc${i}`.padStart(64, '0'),
            pubkey: followPubkey,
            kind: 1111,
            content: `comment ${i}`,
            created_at: 1700000000 + i,
            tags: []
          }
        });
      }

      const beforeCount = getNotifications().items.filter(
        (n) => n.type === 'follow_comment'
      ).length;
      expect(beforeCount).toBe(50);

      // Add a newer follow_comment (should evict oldest)
      followCb({
        event: {
          id: 'fc_new'.padStart(64, '0'),
          pubkey: followPubkey,
          kind: 1111,
          content: 'newest comment',
          created_at: 1700000100,
          tags: []
        }
      });

      const afterItems = getNotifications().items.filter((n) => n.type === 'follow_comment');
      expect(afterItems).toHaveLength(50);

      // Oldest (createdAt=1700000000) should be evicted
      const hasOldest = afterItems.some((n) => n.id === 'fc0'.padStart(64, '0'));
      expect(hasOldest).toBe(false);

      // Newest should be present
      const hasNewest = afterItems.some((n) => n.id === 'fc_new'.padStart(64, '0'));
      expect(hasNewest).toBe(true);
    });

    it('rejects follow_comment older than oldest when cap is full', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const followPubkey = testId('ccdd');
      const follows = new Set([followPubkey]);

      await subscribeNotifications(myPubkey, follows);

      const followCb = subscriberCallbacks[1];

      for (let i = 0; i < 50; i++) {
        followCb({
          event: {
            id: `fc${i}`.padStart(64, '0'),
            pubkey: followPubkey,
            kind: 1111,
            content: `comment ${i}`,
            created_at: 1700000100 + i,
            tags: []
          }
        });
      }

      // Try adding an older event
      followCb({
        event: {
          id: 'fc_old'.padStart(64, '0'),
          pubkey: followPubkey,
          kind: 1111,
          content: 'old comment',
          created_at: 1700000000,
          tags: []
        }
      });

      // Should still have 50
      const afterItems = getNotifications().items.filter((n) => n.type === 'follow_comment');
      expect(afterItems).toHaveLength(50);
      expect(afterItems.some((n) => n.id === 'fc_old'.padStart(64, '0'))).toBe(false);
    });
  });

  describe('MAX_NOTIFICATIONS (200) slicing', () => {
    it('slices items to 200 when exceeded', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reply');

      await subscribeNotifications(myPubkey, new Set());

      const notifCb = subscriberCallbacks[0];

      for (let i = 0; i < 210; i++) {
        notifCb({
          event: {
            id: `n${i}`.padStart(64, '0'),
            pubkey: `pub${i}`.padStart(64, '0'),
            kind: 1111,
            content: `msg ${i}`,
            created_at: 1700000000 + i,
            tags: [['p', myPubkey]]
          }
        });
      }

      expect(getNotifications().items).toHaveLength(200);
      // Should keep newest (highest createdAt)
      expect(getNotifications().items[0].createdAt).toBe(1700000000 + 209);
    });
  });

  describe('follows filter integration', () => {
    it('filters items when filter is set to follows', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reply');

      await subscribeNotifications(myPubkey, new Set());

      subscriberCallbacks[0]({
        event: {
          id: 'f1'.padStart(64, '0'),
          pubkey: testId('ccdd'),
          kind: 1111,
          content: 'hello',
          created_at: 1700000000,
          tags: [['p', myPubkey]]
        }
      });

      // With 'all' filter, item is visible
      setNotifFilter('all');
      expect(getNotifications().items).toHaveLength(1);

      // With 'follows' filter, matchesFilter decides
      matchesFilterMock.mockReturnValue(false);
      setNotifFilter('follows');
      expect(getNotifications().items).toHaveLength(0);

      matchesFilterMock.mockReturnValue(true);
      expect(getNotifications().items).toHaveLength(1);
    });
  });

  describe('unreadCount', () => {
    it('counts items newer than lastRead', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reply');

      await subscribeNotifications(myPubkey, new Set());

      // Set lastRead to 1700000005
      localStorageStore.set('resonote-notif-last-read', '1700000005');

      subscriberCallbacks[0]({
        event: {
          id: 'old1'.padStart(64, '0'),
          pubkey: testId('ccdd'),
          kind: 1111,
          content: 'old',
          created_at: 1700000001,
          tags: [['p', myPubkey]]
        }
      });

      subscriberCallbacks[0]({
        event: {
          id: 'new1'.padStart(64, '0'),
          pubkey: testId('eeff'),
          kind: 1111,
          content: 'new',
          created_at: 1700000010,
          tags: [['p', myPubkey]]
        }
      });

      const notifs = getNotifications();
      expect(notifs.items).toHaveLength(2);
      expect(notifs.unreadCount).toBe(1);
    });
  });

  describe('sorting', () => {
    it('sorts notifications newest first', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reply');

      await subscribeNotifications(myPubkey, new Set());

      subscriberCallbacks[0]({
        event: {
          id: 'early'.padStart(64, '0'),
          pubkey: testId('ccdd'),
          kind: 1111,
          content: 'first',
          created_at: 1700000001,
          tags: [['p', myPubkey]]
        }
      });

      subscriberCallbacks[0]({
        event: {
          id: 'later'.padStart(64, '0'),
          pubkey: testId('eeff'),
          kind: 1111,
          content: 'second',
          created_at: 1700000010,
          tags: [['p', myPubkey]]
        }
      });

      const items = getNotifications().items;
      expect(items).toHaveLength(2);
      expect(items[0].createdAt).toBeGreaterThan(items[1].createdAt);
    });
  });
});
