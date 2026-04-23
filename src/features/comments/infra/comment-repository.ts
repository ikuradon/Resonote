/**
 * IndexedDB repository for comment events.
 * Encapsulates all IndexedDB operations related to comments.
 */

import type { ReconcileEmission } from '@auftakt/timeline';

import {
  type CommentCacheEvent,
  deleteCommentEventsByIds,
  readCommentEventsByTag,
  storeCommentEvent} from '$shared/auftakt/resonote.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('comment-repo');

export type CachedEvent = CommentCacheEvent;

export function cacheCommentEvent(event: CachedEvent): Promise<unknown> {
  return storeCommentEvent(event);
}

export async function restoreFromCache(tagQuery: string): Promise<CachedEvent[]> {
  try {
    return await readCommentEventsByTag(tagQuery);
  } catch (err) {
    log.error('Failed to restore from cache', err);
    return [];
  }
}

export async function purgeDeletedFromCache(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await deleteCommentEventsByIds(ids);
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
