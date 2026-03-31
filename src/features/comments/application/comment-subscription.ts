/**
 * Comment subscription helpers.
 * Filter builders and re-exports for the comment feature.
 *
 * Subscription lifecycle is managed by createSyncedQuery (auftakt)
 * in comment-view-model.svelte.ts.
 */

import {
  COMMENT_KIND,
  CONTENT_REACTION_KIND,
  DELETION_KIND,
  REACTION_KIND
} from '$shared/nostr/events.js';

/** Build the 4-filter array for unified subscription on a given tag value. */
export function buildContentFilters(idValue: string) {
  return [
    { kinds: [COMMENT_KIND], '#I': [idValue] },
    { kinds: [REACTION_KIND], '#I': [idValue] },
    { kinds: [DELETION_KIND], '#I': [idValue] },
    { kinds: [CONTENT_REACTION_KIND], '#i': [idValue] }
  ];
}

// Re-export infra repository for application-layer consumers (UI should not import infra directly)
export {
  type CachedEvent,
  type EventsDB,
  getCommentRepository,
  purgeDeletedFromCache,
  restoreFromCache
} from '../infra/comment-repository.js';
