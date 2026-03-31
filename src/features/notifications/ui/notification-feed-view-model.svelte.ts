import { untrack } from 'svelte';

import { fetchProfiles } from '$shared/browser/profile.js';
import { getStore } from '$shared/nostr/store.js';
import { truncateString } from '$shared/utils/format.js';
import { createLogger } from '$shared/utils/logger.js';

import type { Notification, NotificationType } from '../domain/notification-model.js';
import { getLastRead, markAllAsRead } from './notifications-view-model.svelte.js';

const log = createLogger('notif-feed-vm');

export type NotificationFeedFilter = 'all' | NotificationType;

export interface NotificationFeedSource {
  readonly items: Notification[];
  readonly lastReadTs?: number;
}

export interface NotificationFeedOptions {
  pageSize?: number;
  initialLimit?: number;
  initialFilter?: NotificationFeedFilter;
  contentPreviewLength?: number;
  targetPreviewLength?: number;
  active?: () => boolean;
}

export function createNotificationFeedViewModel(
  notifications: NotificationFeedSource,
  options: NotificationFeedOptions = {}
) {
  const pageSize = options.pageSize ?? 30;
  const contentPreviewLength = options.contentPreviewLength ?? 80;
  const targetPreviewLength = options.targetPreviewLength ?? 40;
  const isActive = options.active ?? (() => true);

  let filter = $state<NotificationFeedFilter>(options.initialFilter ?? 'all');
  let limit = $state(options.initialLimit ?? pageSize);
  let lastReadTs = $state(notifications.lastReadTs ?? getLastRead());
  let targetTexts = $state<Map<string, string>>(new Map());

  let filteredItems = $derived(
    filter === 'all' ? notifications.items : notifications.items.filter((n) => n.type === filter)
  );
  let visibleItems = $derived(filteredItems.slice(0, limit));
  let remaining = $derived(Math.max(0, filteredItems.length - limit));

  $effect(() => {
    const active = isActive();
    if (!active) return;

    const pubkeys = [...new Set(visibleItems.map((n) => n.pubkey))];
    if (pubkeys.length === 0) return;

    void untrack(() => fetchProfiles(pubkeys));
  });

  // Keep reply/reaction target previews in one place so all notification consumers share it.
  $effect(() => {
    const active = isActive();
    if (!active) return;

    const items = visibleItems;
    untrack(() => {
      const targetIds = items
        .filter(
          (n): n is typeof n & { targetEventId: string } =>
            !!n.targetEventId && (n.type === 'reply' || n.type === 'reaction')
        )
        .map((n) => n.targetEventId)
        .filter((id) => !targetTexts.has(id));

      if (targetIds.length === 0) return;

      void Promise.all(
        targetIds.map(async (id) => {
          const result = await getStore().fetchById(id, { negativeTTL: 30_000 });
          return { id, event: result?.event ?? null };
        })
      )
        .then((results) => {
          const next = new Map(targetTexts);
          for (const { id, event } of results) {
            if (!event) continue;
            next.set(id, truncateString(event.content, targetPreviewLength));
          }
          targetTexts = next;
        })
        .catch((err) => {
          log.error('Failed to fetch notification target events', err);
        });
    });
  });

  function setFilter(nextFilter: NotificationFeedFilter): void {
    filter = nextFilter;
    limit = pageSize;
  }

  function loadMore(): void {
    limit += pageSize;
  }

  function markReadNow(timestamp = Math.floor(Date.now() / 1000)): void {
    lastReadTs = timestamp;
  }

  function markAllRead(): void {
    markAllAsRead();
    markReadNow();
  }

  function isUnread(createdAt: number): boolean {
    return createdAt > lastReadTs;
  }

  function contentPreview(content: string): string {
    return truncateString(content, contentPreviewLength);
  }

  return {
    get filter() {
      return filter;
    },
    get items() {
      return visibleItems;
    },
    get remaining() {
      return remaining;
    },
    get targetTexts() {
      return targetTexts;
    },
    get lastReadTs() {
      return lastReadTs;
    },
    setFilter,
    loadMore,
    markReadNow,
    markAllRead,
    isUnread,
    contentPreview
  };
}
