/**
 * Notifications view model — the feature entry point for notification functionality.
 * Owns subscription lifecycle, state, filtering, and read tracking.
 *
 * Replaces the legacy notification store implementation.
 */

import { createLogger, shortHex } from '$shared/utils/logger.js';
import { COMMENT_KIND, REACTION_KIND } from '$shared/nostr/events.js';
import { getRxNostr } from '$shared/nostr/gateway.js';
import { isMuted, isWordMuted } from '$shared/browser/mute.js';
import { matchesFilter, type FollowFilter } from '$shared/browser/follows.js';
import type { Notification, NotificationType } from '../domain/notification-model.js';
import { classifyNotificationEvent } from '../domain/notification-classifier.js';

const log = createLogger('notif-vm');

const LAST_READ_KEY = 'resonote-notif-last-read';
const NOTIF_FILTER_KEY = 'resonote-notif-filter';
const FOLLOW_COMMENT_CAP = 50;
const BATCH_SIZE = 100;
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;
const MAX_NOTIFICATIONS = 200;

// --- State ---
let allItems = $state<Notification[]>([]);
let loading = $state(false);
let notifFilter = $state<FollowFilter>(readFilterFromStorage());
let myPubkeyForFilter = $state<string | null>(null);

let notifIds = new Set<string>();
let subscriptions: { unsubscribe: () => void }[] = [];

// --- Storage helpers ---
function readFilterFromStorage(): FollowFilter {
  try {
    if (typeof localStorage === 'undefined') return 'all';
    const saved = localStorage.getItem(NOTIF_FILTER_KEY);
    if (saved === 'follows' || saved === 'wot') return saved;
  } catch {
    /* empty */
  }
  return 'all';
}

function readLastRead(): number {
  try {
    const v = localStorage.getItem(LAST_READ_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

// --- Public API ---

export function getNotifFilter(): FollowFilter {
  return notifFilter;
}

export function setNotifFilter(filter: FollowFilter): void {
  notifFilter = filter;
  try {
    localStorage.setItem(NOTIF_FILTER_KEY, filter);
  } catch {
    /* empty */
  }
}

export function getLastRead(): number {
  return readLastRead();
}

function filteredItems(): Notification[] {
  if (notifFilter === 'all') return allItems;
  return allItems.filter((n) => matchesFilter(n.pubkey, notifFilter, myPubkeyForFilter));
}

export function getNotifications() {
  return {
    get items() {
      return filteredItems();
    },
    get unreadCount() {
      const lastRead = readLastRead();
      return filteredItems().filter((n) => n.createdAt > lastRead).length;
    },
    get loading() {
      return loading;
    },
    get lastReadTs() {
      return readLastRead();
    }
  };
}

export function markAllAsRead(): void {
  const now = Math.floor(Date.now() / 1000);
  try {
    localStorage.setItem(LAST_READ_KEY, String(now));
  } catch {
    /* empty */
  }
  log.info('Marked all notifications as read', { timestamp: now });
}

// --- Internal ---

function addNotification(notif: Notification, type: NotificationType): void {
  if (notifIds.has(notif.id)) return;
  if (isMuted(notif.pubkey) || isWordMuted(notif.content)) return;

  notifIds.add(notif.id);

  if (type === 'follow_comment') {
    const followComments = allItems.filter((n) => n.type === 'follow_comment');
    if (followComments.length >= FOLLOW_COMMENT_CAP) {
      const oldest = followComments.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
      if (notif.createdAt <= oldest.createdAt) return;
      notifIds.delete(oldest.id);
      allItems = allItems.filter((n) => n.id !== oldest.id);
    }
  }

  allItems = [...allItems, notif].sort((a, b) => b.createdAt - a.createdAt);
  if (allItems.length > MAX_NOTIFICATIONS) {
    allItems = allItems.slice(0, MAX_NOTIFICATIONS);
  }
  log.debug('Notification added', { id: shortHex(notif.id), type: notif.type });
}

function destroySubscriptions(): void {
  for (const sub of subscriptions) sub.unsubscribe();
  subscriptions = [];
}

// --- Subscription ---

export async function subscribeNotifications(
  myPubkey: string,
  follows: Set<string>
): Promise<void> {
  destroySubscriptions();
  loading = allItems.length === 0;
  myPubkeyForFilter = myPubkey;

  const [{ merge }, rxNostrMod] = await Promise.all([import('rxjs'), import('rx-nostr')]);
  const { createRxBackwardReq, createRxForwardReq, uniq } = rxNostrMod;
  const rxNostr = await getRxNostr();

  const loginTimestamp = Math.floor(Date.now() / 1000);
  const since = loginTimestamp - SEVEN_DAYS_SEC;

  // --- Replies + Reactions + Mentions ---
  const notifBackward = createRxBackwardReq();
  const notifForward = createRxForwardReq();
  const mentionFilter = { kinds: [COMMENT_KIND, REACTION_KIND], '#p': [myPubkey], since };

  const notifSub = merge(
    rxNostr.use(notifBackward).pipe(uniq()),
    rxNostr.use(notifForward).pipe(uniq())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).subscribe((packet: any) => {
    const event = packet.event;
    const type = classifyNotificationEvent(event, myPubkey, follows);
    if (!type || type === 'follow_comment') return;

    const eTag = event.tags.find((t: string[]) => t[0] === 'e' && t[1]);
    addNotification(
      {
        id: event.id,
        type,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at,
        tags: event.tags,
        targetEventId: eTag?.[1]
      },
      type
    );
  });

  notifBackward.emit(mentionFilter);
  notifBackward.over();
  notifForward.emit(mentionFilter);
  subscriptions.push(notifSub);
  loading = false;

  // --- Follow comments ---
  if (follows.size === 0) return;

  const followArray = [...follows];
  const followBackward = createRxBackwardReq();
  const followForward = createRxForwardReq();

  const followSub = merge(
    rxNostr.use(followBackward).pipe(uniq()),
    rxNostr.use(followForward).pipe(uniq())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).subscribe((packet: any) => {
    const event = packet.event;
    if (event.pubkey === myPubkey) return;
    if (!follows.has(event.pubkey)) return;

    addNotification(
      {
        id: event.id,
        type: 'follow_comment',
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at,
        tags: event.tags
      },
      'follow_comment'
    );
  });

  for (let i = 0; i < followArray.length; i += BATCH_SIZE) {
    const batch = followArray.slice(i, i + BATCH_SIZE);
    followBackward.emit({ kinds: [COMMENT_KIND], authors: batch, since: loginTimestamp });
  }
  followBackward.over();

  for (let i = 0; i < followArray.length; i += BATCH_SIZE) {
    const batch = followArray.slice(i, i + BATCH_SIZE);
    followForward.emit({ kinds: [COMMENT_KIND], authors: batch, since: loginTimestamp });
  }

  subscriptions.push(followSub);

  log.info('Subscribed to notifications', {
    myPubkey: shortHex(myPubkey),
    followCount: follows.size,
    since
  });
}

export function destroyNotifications(): void {
  log.info('Destroying notification subscriptions');
  destroySubscriptions();
  allItems = [];
  notifIds = new Set();
  loading = false;
  myPubkeyForFilter = null;
}
