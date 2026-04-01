import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  localStorageStore,
  isMutedMock,
  isWordMutedMock,
  matchesFilterMock,
  logInfoMock,
  classifyMock,
  getRxNostrMock,
  createSyncedQueryMock,
  mockEventsSubjects,
  mockDisposeFns
} = vi.hoisted(() => {
  return {
    localStorageStore: new Map<string, string>(),
    isMutedMock: vi.fn(() => false),
    isWordMutedMock: vi.fn(() => false),
    matchesFilterMock: vi.fn((_pubkey: string, filter: string) => filter === 'all'),
    logInfoMock: vi.fn(),
    classifyMock: vi.fn((): string | null => null),
    getRxNostrMock: vi.fn(),
    createSyncedQueryMock: vi.fn(),
    mockEventsSubjects: [] as BehaviorSubject<unknown[]>[],
    mockDisposeFns: [] as Array<ReturnType<typeof vi.fn>>
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

vi.mock('$shared/nostr/store.js', () => ({
  getStoreAsync: vi.fn().mockResolvedValue({
    getSync: vi.fn().mockResolvedValue([]),
    fetchById: vi.fn().mockResolvedValue(null),
    dispose: vi.fn()
  })
}));

vi.mock('@ikuradon/auftakt/sync', () => ({
  createSyncedQuery: createSyncedQueryMock
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
  mockEventsSubjects.length = 0;
  mockDisposeFns.length = 0;
  createSyncedQueryMock.mockClear();

  getRxNostrMock.mockResolvedValue({});

  createSyncedQueryMock.mockImplementation(() => {
    const subject = new BehaviorSubject<unknown[]>([]);
    const disposeFn = vi.fn();
    mockEventsSubjects.push(subject);
    mockDisposeFns.push(disposeFn);
    return {
      events$: subject.asObservable(),
      status$: new BehaviorSubject<string>('cached').asObservable(),
      emit: vi.fn(),
      dispose: disposeFn
    };
  });
}

/**
 * Push an event into a specific SyncedQuery events$ subject.
 * The production code iterates over ce.event for each CachedEvent in the array.
 */
function pushEvent(subjectIndex: number, event: Record<string, unknown>) {
  const subject = mockEventsSubjects[subjectIndex];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!subject) throw new Error(`No subject at index ${subjectIndex}`);
  // Get current events and append
  const current = subject.getValue();
  subject.next([...current, { event, seenOn: ['wss://relay.test'], firstSeen: Date.now() }]);
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
    it('creates a SyncedQuery for mentions', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');

      await subscribeNotifications(myPubkey, new Set());

      expect(createSyncedQueryMock).toHaveBeenCalledTimes(1);
      expect(createSyncedQueryMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          filter: expect.objectContaining({
            kinds: [1111, 7],
            '#p': [myPubkey]
          }),
          strategy: 'dual'
        })
      );
    });

    it('skips follow subscription when follows.size === 0', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');

      await subscribeNotifications(myPubkey, new Set());

      // Only 1 SyncedQuery (mention), no follow query
      expect(createSyncedQueryMock).toHaveBeenCalledTimes(1);
    });

    it('creates follow subscription when follows is non-empty', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const follows = new Set([testId('ccdd')]);

      await subscribeNotifications(myPubkey, follows);

      // 2 SyncedQuery calls (mention + follow)
      expect(createSyncedQueryMock).toHaveBeenCalledTimes(2);
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

      // 1 mention query + 2 follow batch queries = 3
      expect(createSyncedQueryMock).toHaveBeenCalledTimes(3);
    });

    it('processes reply events via events$ subscription', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue('reply');

      await subscribeNotifications(myPubkey, new Set());

      // Push event into the mention query's events$ subject (index 0)
      pushEvent(0, {
        id: 'evt1'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 1111,
        content: 'hello',
        created_at: 1700000000,
        tags: [
          ['p', myPubkey],
          ['e', 'target123'.padStart(64, '0')]
        ]
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

      pushEvent(0, {
        id: 'react1'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 7,
        content: '+',
        created_at: 1700000001,
        tags: [['p', myPubkey]]
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

      pushEvent(0, {
        id: 'fc1'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 1111,
        content: 'test',
        created_at: 1700000000,
        tags: []
      });

      expect(getNotifications().items).toHaveLength(0);
    });

    it('skips null classification', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      classifyMock.mockReturnValue(null);

      await subscribeNotifications(myPubkey, new Set());

      pushEvent(0, {
        id: 'null1'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 999,
        content: '',
        created_at: 1700000000,
        tags: []
      });

      expect(getNotifications().items).toHaveLength(0);
    });

    it('processes follow_comment events from follow subscriber', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const followPubkey = testId('ccdd');
      const follows = new Set([followPubkey]);

      await subscribeNotifications(myPubkey, follows);

      // Follow subscription is at index 1
      pushEvent(1, {
        id: 'fce1'.padStart(64, '0'),
        pubkey: followPubkey,
        kind: 1111,
        content: 'follow comment',
        created_at: 1700000000,
        tags: []
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

      pushEvent(1, {
        id: 'own1'.padStart(64, '0'),
        pubkey: myPubkey,
        kind: 1111,
        content: 'my own',
        created_at: 1700000000,
        tags: []
      });

      expect(getNotifications().items).toHaveLength(0);
    });

    it('skips non-follow events in follow subscriber', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');
      const followPubkey = testId('ccdd');
      const follows = new Set([followPubkey]);

      await subscribeNotifications(myPubkey, follows);

      pushEvent(1, {
        id: 'nf1'.padStart(64, '0'),
        pubkey: testId('eeff'),
        kind: 1111,
        content: 'stranger',
        created_at: 1700000000,
        tags: []
      });

      expect(getNotifications().items).toHaveLength(0);
    });

    it('destroys previous subscriptions on re-subscribe', async () => {
      resetSubscriptionMocks();
      const myPubkey = testId('aabb');

      await subscribeNotifications(myPubkey, new Set());
      const firstDispose = mockDisposeFns[0];

      resetSubscriptionMocks();
      await subscribeNotifications(myPubkey, new Set());

      // Previous subscriptions should have been disposed
      expect(firstDispose).toHaveBeenCalled();
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

      // Push same event twice — but since BehaviorSubject replays, we need
      // to push both in a single next() to simulate them arriving together
      const subject = mockEventsSubjects[0];
      subject.next([
        { event, seenOn: ['wss://relay.test'], firstSeen: Date.now() },
        { event, seenOn: ['wss://relay.test'], firstSeen: Date.now() }
      ]);

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

      pushEvent(0, {
        id: 'muted1'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 1111,
        content: 'from muted',
        created_at: 1700000000,
        tags: [['p', myPubkey]]
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

      pushEvent(0, {
        id: 'wm1'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 1111,
        content: 'bad word here',
        created_at: 1700000000,
        tags: [['p', myPubkey]]
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

      // Add 50 follow_comments
      for (let i = 0; i < 50; i++) {
        pushEvent(1, {
          id: `fc${i}`.padStart(64, '0'),
          pubkey: followPubkey,
          kind: 1111,
          content: `comment ${i}`,
          created_at: 1700000000 + i,
          tags: []
        });
      }

      const beforeCount = getNotifications().items.filter(
        (n) => n.type === 'follow_comment'
      ).length;
      expect(beforeCount).toBe(50);

      // Add a newer follow_comment (should evict oldest)
      pushEvent(1, {
        id: 'fc_new'.padStart(64, '0'),
        pubkey: followPubkey,
        kind: 1111,
        content: 'newest comment',
        created_at: 1700000100,
        tags: []
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

      for (let i = 0; i < 50; i++) {
        pushEvent(1, {
          id: `fc${i}`.padStart(64, '0'),
          pubkey: followPubkey,
          kind: 1111,
          content: `comment ${i}`,
          created_at: 1700000100 + i,
          tags: []
        });
      }

      // Try adding an older event
      pushEvent(1, {
        id: 'fc_old'.padStart(64, '0'),
        pubkey: followPubkey,
        kind: 1111,
        content: 'old comment',
        created_at: 1700000000,
        tags: []
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

      for (let i = 0; i < 210; i++) {
        pushEvent(0, {
          id: `n${i}`.padStart(64, '0'),
          pubkey: `pub${i}`.padStart(64, '0'),
          kind: 1111,
          content: `msg ${i}`,
          created_at: 1700000000 + i,
          tags: [['p', myPubkey]]
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

      pushEvent(0, {
        id: 'f1'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 1111,
        content: 'hello',
        created_at: 1700000000,
        tags: [['p', myPubkey]]
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

      pushEvent(0, {
        id: 'old1'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 1111,
        content: 'old',
        created_at: 1700000001,
        tags: [['p', myPubkey]]
      });

      pushEvent(0, {
        id: 'new1'.padStart(64, '0'),
        pubkey: testId('eeff'),
        kind: 1111,
        content: 'new',
        created_at: 1700000010,
        tags: [['p', myPubkey]]
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

      pushEvent(0, {
        id: 'early'.padStart(64, '0'),
        pubkey: testId('ccdd'),
        kind: 1111,
        content: 'first',
        created_at: 1700000001,
        tags: [['p', myPubkey]]
      });

      pushEvent(0, {
        id: 'later'.padStart(64, '0'),
        pubkey: testId('eeff'),
        kind: 1111,
        content: 'second',
        created_at: 1700000010,
        tags: [['p', myPubkey]]
      });

      const items = getNotifications().items;
      expect(items).toHaveLength(2);
      expect(items[0].createdAt).toBeGreaterThan(items[1].createdAt);
    });
  });
});
