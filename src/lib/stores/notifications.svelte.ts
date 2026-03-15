import { createLogger, shortHex } from '../utils/logger.js';
import { COMMENT_KIND } from '../nostr/events.js';

const log = createLogger('notifications');
const REACTION_KIND = 7;

export type NotificationType = 'reply' | 'reaction' | 'mention' | 'follow_comment';

export interface Notification {
  id: string;
  type: NotificationType;
  pubkey: string;
  content: string;
  createdAt: number;
  tags: string[][];
}

const LAST_READ_KEY = 'resonote-notif-last-read';
const FOLLOW_COMMENT_CAP = 50;
const BATCH_SIZE = 100;
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

let items = $state<Notification[]>([]);
let loading = $state(false);

let notifIds = new Set<string>();
let subscriptions: { unsubscribe: () => void }[] = [];

export function getLastRead(): number {
  if (typeof localStorage === 'undefined') return 0;
  const v = localStorage.getItem(LAST_READ_KEY);
  return v ? parseInt(v, 10) : 0;
}

export function getNotifications() {
  return {
    get items() {
      return items;
    },
    get unreadCount() {
      const lastRead = getLastRead();
      return items.filter((n) => n.createdAt > lastRead).length;
    },
    get loading() {
      return loading;
    },
    get lastReadTs() {
      return getLastRead();
    }
  };
}

export function markAllAsRead(): void {
  const now = Math.floor(Date.now() / 1000);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_READ_KEY, String(now));
  }
  log.info('Marked all notifications as read', { timestamp: now });
}

function classifyEvent(
  event: {
    id: string;
    pubkey: string;
    content: string;
    created_at: number;
    kind: number;
    tags: string[][];
  },
  myPubkey: string,
  follows: Set<string>
): NotificationType | null {
  if (event.pubkey === myPubkey) return null;

  const hasPTag = event.tags.some((t) => t[0] === 'p' && t[1] === myPubkey);
  const hasETag = event.tags.some((t) => t[0] === 'e' && t[1]);

  if (event.kind === REACTION_KIND && hasPTag) return 'reaction';
  if (event.kind === COMMENT_KIND) {
    if (hasPTag && hasETag) return 'reply';
    if (hasPTag && !hasETag) return 'mention';
    if (follows.has(event.pubkey)) return 'follow_comment';
  }

  return null;
}

function addNotification(notif: Notification, type: NotificationType): void {
  if (notifIds.has(notif.id)) return;
  notifIds.add(notif.id);

  if (type === 'follow_comment') {
    const followComments = items.filter((n) => n.type === 'follow_comment');
    if (followComments.length >= FOLLOW_COMMENT_CAP) {
      // Keep newest 50: find oldest follow_comment and remove if new one is newer
      const oldest = followComments.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
      if (notif.createdAt <= oldest.createdAt) return;
      // Remove oldest follow_comment
      notifIds.delete(oldest.id);
      items = items.filter((n) => n.id !== oldest.id);
    }
  }

  items = [...items, notif].sort((a, b) => b.createdAt - a.createdAt);
  log.debug('Notification added', { id: shortHex(notif.id), type: notif.type });
}

export async function subscribeNotifications(
  myPubkey: string,
  follows: Set<string>
): Promise<void> {
  // Clean up any existing subscriptions before starting new ones
  destroyNotifications();
  loading = true;

  const [{ merge }, rxNostrMod, { getRxNostr }] = await Promise.all([
    import('rxjs'),
    import('rx-nostr'),
    import('../nostr/client.js')
  ]);

  const { createRxBackwardReq, createRxForwardReq, uniq } = rxNostrMod;
  const rxNostr = await getRxNostr();

  const loginTimestamp = Math.floor(Date.now() / 1000);
  const lastRead = getLastRead();
  const since = lastRead > 0 ? lastRead : loginTimestamp - SEVEN_DAYS_SEC;

  // --- Replies + Reactions + Mentions (kind:1111, 7 tagged with myPubkey) ---
  const notifBackward = createRxBackwardReq();
  const notifForward = createRxForwardReq();
  const notifFilter = { kinds: [COMMENT_KIND, REACTION_KIND], '#p': [myPubkey], since };

  const notifSub = merge(
    rxNostr.use(notifBackward).pipe(uniq()),
    rxNostr.use(notifForward).pipe(uniq())
  ).subscribe((packet) => {
    const event = packet.event;
    const type = classifyEvent(event, myPubkey, follows);
    if (!type || type === 'follow_comment') return;

    addNotification(
      {
        id: event.id,
        type,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at,
        tags: event.tags
      },
      type
    );
  });

  notifBackward.emit(notifFilter);
  notifBackward.over();
  notifForward.emit(notifFilter);

  subscriptions.push(notifSub);

  loading = false;

  // --- Follow comments (kind:1111 authored by follows) ---
  if (follows.size === 0) return;

  const followArray = [...follows];
  const followBackward = createRxBackwardReq();
  const followForward = createRxForwardReq();

  const followSub = merge(
    rxNostr.use(followBackward).pipe(uniq()),
    rxNostr.use(followForward).pipe(uniq())
  ).subscribe((packet) => {
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

  // Batch authors in groups of 100
  for (let i = 0; i < followArray.length; i += BATCH_SIZE) {
    const batch = followArray.slice(i, i + BATCH_SIZE);
    followBackward.emit({ kinds: [COMMENT_KIND], authors: batch, since: loginTimestamp });
  }
  followBackward.over();

  // Forward: emit batches of 100 authors
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
  for (const sub of subscriptions) sub.unsubscribe();
  subscriptions = [];
  items = [];
  notifIds = new Set();
  loading = false;
}
