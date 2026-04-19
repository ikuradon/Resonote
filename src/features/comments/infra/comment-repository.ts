/**
 * IndexedDB repository for comment events.
 * Encapsulates all IndexedDB operations related to comments.
 */

import type { ReconcileEmission } from '@auftakt/timeline';

import { openEventsDb } from '$shared/auftakt/resonote.js';
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
  return openEventsDb();
}

export async function restoreFromCache(db: EventsDB, tagQuery: string): Promise<CachedEvent[]> {
  try {
    return await db.getByTagValue(tagQuery);
  } catch (err) {
    log.error('Failed to restore from cache', err);
    return [];
  }
}

export async function purgeDeletedFromCache(db: EventsDB, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await db.deleteByIds(ids);
    log.info('Purged deleted events from DB', { count: ids.length });
  } catch (err) {
    log.error('Failed to purge deletion targets', err);
  }
}

export function materializeDeletedIds(
  current: ReadonlySet<string>,
  emissions: readonly ReconcileEmission[]
): Set<string> {
  const next = new Set(current);
  for (const emission of emissions) {
    if (emission.state === 'deleted') {
      next.add(emission.subjectId);
    }
  }
  return next;
}
