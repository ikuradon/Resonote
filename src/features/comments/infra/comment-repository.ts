/**
 * Comment repository — adapter between auftakt EventStore and comment feature.
 * Provides the EventsDB interface that comment-view-model expects.
 */

import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('comment-repo');

export interface EventsDB {
  getByTagValue(tagQuery: string): Promise<CachedEvent[]>;
  put(event: CachedEvent): void;
  deleteByIds(ids: string[]): Promise<void>;
}

export interface CachedEvent {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}

export async function getCommentRepository(): Promise<EventsDB> {
  const { getStore } = await import('$shared/nostr/store.js');
  const store = getStore();

  return {
    async getByTagValue(tagQuery: string): Promise<CachedEvent[]> {
      // tagQuery is like "I:youtube:video:abc" → split to tag name + value
      const colonIndex = tagQuery.indexOf(':');
      if (colonIndex < 0) return [];
      const tagName = tagQuery.slice(0, colonIndex);
      const tagValue = tagQuery.slice(colonIndex + 1);
      const results = await store.getSync({ [`#${tagName}`]: [tagValue] });
      return results.map((ce) => ce.event as CachedEvent);
    },
    put(): void {
      // connectStore() handles caching — no-op
    },
    async deleteByIds(): Promise<void> {
      // auftakt handles deletions via kind:5 — no-op
    }
  };
}

export async function restoreFromCache(db: EventsDB, tagQuery: string): Promise<CachedEvent[]> {
  try {
    return await db.getByTagValue(tagQuery);
  } catch (err) {
    log.error('Failed to restore from cache', err);
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function purgeDeletedFromCache(_db: EventsDB, _ids: string[]): Promise<void> {
  // auftakt handles deletions via kind:5 — no-op
}
