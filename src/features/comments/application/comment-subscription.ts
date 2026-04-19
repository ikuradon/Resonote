/**
 * Comment subscription management.
 * Orchestrates relay backward/forward subscriptions + offline deletion reconcile.
 */

import {
  buildCommentContentFilters as buildCommentFilters,
  type CommentSubscriptionRefs,
  type DeletionEvent,
  loadCommentSubscriptionDeps,
  startCommentDeletionReconcile,
  startCommentSubscription,
  startMergedCommentSubscription,
  type SubscriptionHandle
} from '$shared/auftakt/resonote.js';
import {
  COMMENT_KIND,
  CONTENT_REACTION_KIND,
  DELETION_KIND,
  REACTION_KIND
} from '$shared/nostr/events.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('comment-subscription');
/** Build the 4-filter array for unified subscription on a given tag value. */
export function buildContentFilters(idValue: string) {
  return buildCommentFilters(idValue, {
    comment: COMMENT_KIND,
    reaction: REACTION_KIND,
    deletion: DELETION_KIND,
    contentReaction: CONTENT_REACTION_KIND
  });
}

export async function loadSubscriptionDeps(): Promise<SubscriptionRefs> {
  return loadCommentSubscriptionDeps();
}

export type SubscriptionRefs = CommentSubscriptionRefs;
export type { SubscriptionHandle };

/**
 * Start backward + forward subscriptions for content comments.
 */
export function startSubscription(
  refs: SubscriptionRefs,
  filters: ReturnType<typeof buildContentFilters>,
  maxCreatedAt: number | null,
  onPacket: (
    event: {
      id: string;
      pubkey: string;
      content: string;
      created_at: number;
      tags: string[][];
      kind: number;
    },
    relayHint?: string
  ) => void,
  onBackwardComplete: () => void
): SubscriptionHandle[] {
  return startCommentSubscription(
    refs,
    filters,
    maxCreatedAt,
    onPacket,
    onBackwardComplete,
    (err) => log.error('Backward fetch error', err)
  );
}

/**
 * Start a merged backward+forward subscription for an additional tag value.
 */
export function startMergedSubscription(
  refs: SubscriptionRefs,
  filters: ReturnType<typeof buildContentFilters>,
  onPacket: (
    event: {
      id: string;
      pubkey: string;
      content: string;
      created_at: number;
      tags: string[][];
      kind: number;
    },
    relayHint?: string
  ) => void
): SubscriptionHandle {
  return startMergedCommentSubscription(refs, filters, onPacket, (err) =>
    log.error('Merged subscription error', err)
  );
}

/**
 * Reconcile offline deletions by querying kind:5 events targeting cached event IDs.
 */
export function startDeletionReconcile(
  refs: SubscriptionRefs,
  cachedIds: string[],
  onDeletionEvent: (event: DeletionEvent) => void,
  onComplete: () => void
): { sub: SubscriptionHandle; timeout: ReturnType<typeof setTimeout> } {
  return startCommentDeletionReconcile(refs, cachedIds, DELETION_KIND, onDeletionEvent, onComplete);
}

// Re-export infra repository for application-layer consumers (UI should not import infra directly)
export {
  type CachedEvent,
  type EventsDB,
  getCommentRepository,
  materializeDeletedIds,
  purgeDeletedFromCache,
  restoreFromCache
} from '../infra/comment-repository.js';
