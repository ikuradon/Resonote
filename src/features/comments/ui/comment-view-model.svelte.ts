/**
 * Comment view model — the single entry point for UI to interact with comments.
 * Replaces the old createCommentsStore() as the facade for comment functionality.
 *
 * Responsibilities:
 * - Manage visible comments and reaction index (state)
 * - Delegate subscription/cache/reconcile to application/infra layers
 * - Expose a clean API for route components
 */

import type { ContentId, ContentProvider } from '$shared/content/types.js';
import type { Comment, Reaction } from '../domain/comment-model.js';
import type { ReactionStats } from '../domain/comment-model.js';
import { commentFromEvent, reactionFromEvent } from '../domain/comment-mappers.js';
import {
  emptyStats,
  applyReaction as applyReactionImmutable,
  buildReactionIndex,
  isLikeReaction
} from '../domain/reaction-rules.js';
import {
  extractDeletionTargets,
  COMMENT_KIND,
  REACTION_KIND,
  DELETION_KIND
} from '$shared/nostr/events.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';
import {
  buildContentFilters,
  loadSubscriptionDeps,
  startSubscription,
  startMergedSubscription,
  startDeletionReconcile,
  type SubscriptionRefs,
  type SubscriptionHandle
} from '../application/comment-subscription.js';
import {
  getCommentRepository,
  restoreFromCache,
  purgeDeletedFromCache,
  type EventsDB,
  type CachedEvent
} from '../infra/comment-repository.js';

const log = createLogger('comment-vm');

export function createCommentViewModel(contentId: ContentId, provider: ContentProvider) {
  // --- State ---
  let commentIds = new Set<string>();
  let commentsRaw = $state<Comment[]>([]);
  let visibleComments = $derived(commentsRaw.filter((c) => !deletedIds.has(c.id)));

  let reactionIds = new Set<string>();
  let reactionsRaw: Reaction[] = [];
  let reactionIndex = $state<Map<string, ReactionStats>>(new Map());

  let deletedIds = $state<Set<string>>(new Set());
  let loading = $state(true);

  let prevDeletedSize = 0;
  let destroyed = false;
  let loadingTimeout: ReturnType<typeof setTimeout> | undefined;

  const eventPubkeys = new Map<string, string>();

  // Infra refs
  let subscriptionRefs: SubscriptionRefs | undefined;
  let eventsDB: EventsDB | undefined;
  let subscriptions: SubscriptionHandle[] = [];
  let reconcileSub: SubscriptionHandle | undefined;
  let reconcileTimeout: ReturnType<typeof setTimeout> | undefined;

  // --- Domain operations ---
  function rebuildReactionIndex() {
    reactionIndex = buildReactionIndex(reactionsRaw, deletedIds);
  }

  function addReaction(reaction: Reaction) {
    if (reactionIds.has(reaction.id)) return;
    reactionIds.add(reaction.id);
    reactionsRaw.push(reaction);
    if (deletedIds.has(reaction.id)) return;

    const targetId = reaction.targetEventId;
    const prev = reactionIndex.get(targetId) ?? emptyStats();
    let stats = applyReactionImmutable(prev, reaction);
    if (!isLikeReaction(reaction.content)) {
      stats = { ...stats, emojis: [...stats.emojis].sort((a, b) => b.count - a.count) };
    }
    const next = new Map(reactionIndex);
    next.set(targetId, stats);
    reactionIndex = next;

    log.debug('Reaction received', { id: shortHex(reaction.id), target: shortHex(targetId) });
  }

  function handleCommentPacket(event: CachedEvent) {
    if (commentIds.has(event.id)) return;
    commentIds.add(event.id);
    eventPubkeys.set(event.id, event.pubkey);
    commentsRaw = [...commentsRaw, commentFromEvent(event)];
    log.debug('Comment received', { id: shortHex(event.id) });
  }

  function handleReactionPacket(event: CachedEvent) {
    const reaction = reactionFromEvent(event);
    if (reaction) {
      addReaction(reaction);
      eventPubkeys.set(event.id, event.pubkey);
    }
  }

  function handleDeletionPacket(event: { id: string; pubkey: string; tags: string[][] }) {
    const eTags = extractDeletionTargets(event);
    if (eTags.length === 0) return;
    const verified = eTags.filter((id) => {
      const originalPubkey = eventPubkeys.get(id);
      return !originalPubkey || originalPubkey === event.pubkey;
    });
    if (verified.length === 0) return;
    const next = new Set(deletedIds);
    for (const id of verified) next.add(id);
    deletedIds = next;
    if (deletedIds.size !== prevDeletedSize) {
      prevDeletedSize = deletedIds.size;
      rebuildReactionIndex();
    }
    const toPurge = verified.filter((id) => commentIds.has(id) || reactionIds.has(id));
    if (toPurge.length > 0) purgeDeletedFromCache(eventsDB!, toPurge);
    log.debug('Deletion event received', { deletedIds: verified.map(shortHex) });
  }

  function dispatchPacket(event: CachedEvent) {
    eventsDB?.put(event);
    switch (event.kind) {
      case COMMENT_KIND:
        handleCommentPacket(event);
        break;
      case REACTION_KIND:
        handleReactionPacket(event);
        break;
      case DELETION_KIND:
        handleDeletionPacket(event);
        break;
    }
  }

  // --- Cache restore ---
  function restoreCachedEvents(cachedEvents: CachedEvent[]) {
    const cachedDeletions: CachedEvent[] = [];
    const cachedComments: CachedEvent[] = [];
    const cachedReactions: CachedEvent[] = [];
    let maxCreatedAt: number | null = null;

    for (const event of cachedEvents) {
      if (maxCreatedAt === null || event.created_at > maxCreatedAt) {
        maxCreatedAt = event.created_at;
      }
      switch (event.kind) {
        case DELETION_KIND:
          cachedDeletions.push(event);
          break;
        case COMMENT_KIND:
          cachedComments.push(event);
          break;
        case REACTION_KIND:
          cachedReactions.push(event);
          break;
      }
    }

    // Batch-restore comments
    const newComments: Comment[] = [];
    for (const event of cachedComments) {
      if (!commentIds.has(event.id)) {
        commentIds.add(event.id);
        newComments.push(commentFromEvent(event));
      }
    }
    if (newComments.length > 0) commentsRaw = [...commentsRaw, ...newComments];

    // Restore reactions
    for (const event of cachedReactions) {
      const reaction = reactionFromEvent(event);
      if (reaction) addReaction(reaction);
    }

    // Build pubkey map for NIP-09 verification
    for (const c of commentsRaw) eventPubkeys.set(c.id, c.pubkey);
    for (const r of reactionsRaw) eventPubkeys.set(r.id, r.pubkey);

    // Process deletions with pubkey verification
    for (const event of cachedDeletions) {
      for (const id of extractDeletionTargets(event)) {
        const originalPubkey = eventPubkeys.get(id);
        if (!originalPubkey || originalPubkey === event.pubkey) {
          deletedIds.add(id);
        }
      }
    }
    if (deletedIds.size > 0) deletedIds = new Set(deletedIds);
    prevDeletedSize = deletedIds.size;

    log.info('Restored from DB', {
      comments: commentIds.size,
      reactions: reactionIds.size,
      deletions: deletedIds.size,
      maxCreatedAt
    });

    if (newComments.length > 0) loading = false;

    return maxCreatedAt;
  }

  // --- Subscribe ---
  async function subscribe() {
    try {
      const [refs, db] = await Promise.all([loadSubscriptionDeps(), getCommentRepository()]);
      subscriptionRefs = refs;
      eventsDB = db;

      const [idValue] = provider.toNostrTag(contentId);
      const tagQuery = `I:${idValue}`;

      // Restore from cache
      const cachedEvents = await restoreFromCache(db, tagQuery);
      const maxCreatedAt = restoreCachedEvents(cachedEvents);

      // Purge deleted from cache
      if (deletedIds.size > 0) {
        const idsToPurge = [...deletedIds].filter(
          (id) => commentIds.has(id) || reactionIds.has(id)
        );
        purgeDeletedFromCache(db, idsToPurge);
      }

      // Offline deletion reconcile
      const cachedIds = [...commentIds, ...reactionIds];
      if (cachedIds.length > 0) {
        const newDeletions = new Set<string>();
        const reconcile = startDeletionReconcile(
          refs,
          cachedIds,
          (event) => {
            eventsDB?.put(event);
            for (const id of extractDeletionTargets(event)) {
              const originalPubkey = eventPubkeys.get(id);
              if (!originalPubkey || originalPubkey === event.pubkey) {
                newDeletions.add(id);
              }
            }
          },
          () => {
            reconcileSub = undefined;
            reconcileTimeout = undefined;
            if (destroyed || newDeletions.size === 0) return;
            const next = new Set(deletedIds);
            for (const id of newDeletions) next.add(id);
            deletedIds = next;
            prevDeletedSize = deletedIds.size;
            rebuildReactionIndex();
            log.info('Offline deletions reconciled', { newDeletions: newDeletions.size });
            const idsToPurge = [...newDeletions].filter(
              (id) => commentIds.has(id) || reactionIds.has(id)
            );
            purgeDeletedFromCache(db, idsToPurge);
          }
        );
        reconcileSub = reconcile.sub;
        reconcileTimeout = reconcile.timeout;
      }

      // Start live subscriptions
      const filters = buildContentFilters(idValue);
      loadingTimeout = setTimeout(() => {
        loading = false;
      }, 10_000);

      const subs = startSubscription(refs, filters, maxCreatedAt, dispatchPacket, () => {
        clearTimeout(loadingTimeout);
        loading = false;
      });
      subscriptions = subs;

      log.info('Subscribed to comments', {
        contentId: `${contentId.platform}:${contentId.type}:${contentId.id}`
      });
    } catch (err) {
      log.error('Failed to subscribe to comments', err);
      for (const sub of subscriptions) sub.unsubscribe();
      subscriptions = [];
      if (reconcileSub) {
        reconcileSub.unsubscribe();
        reconcileSub = undefined;
      }
      if (reconcileTimeout) {
        clearTimeout(reconcileTimeout);
        reconcileTimeout = undefined;
      }
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = undefined;
      }
      loading = false;
    }
  }

  async function addSubscription(idValue: string): Promise<void> {
    if (!subscriptionRefs || !eventsDB) return;

    // DB cache restore
    const tagQuery = `I:${idValue}`;
    const cachedEvents = await restoreFromCache(eventsDB, tagQuery);

    // Process deletions first
    let addedDeletions = false;
    for (const ev of cachedEvents) {
      if (ev.kind === DELETION_KIND) {
        for (const id of extractDeletionTargets(ev)) {
          const originalPubkey = eventPubkeys.get(id);
          if (!originalPubkey || originalPubkey === ev.pubkey) {
            deletedIds.add(id);
            addedDeletions = true;
          }
        }
      }
    }
    if (addedDeletions) {
      deletedIds = new Set(deletedIds);
      prevDeletedSize = deletedIds.size;
      rebuildReactionIndex();
    }

    // Restore comments and reactions
    const newComments: Comment[] = [];
    for (const ev of cachedEvents) {
      if (ev.kind === COMMENT_KIND && !commentIds.has(ev.id) && !deletedIds.has(ev.id)) {
        commentIds.add(ev.id);
        eventPubkeys.set(ev.id, ev.pubkey);
        newComments.push(commentFromEvent(ev));
      }
      if (ev.kind === REACTION_KIND && !reactionIds.has(ev.id) && !deletedIds.has(ev.id)) {
        const reaction = reactionFromEvent(ev);
        if (reaction) {
          addReaction(reaction);
          eventPubkeys.set(ev.id, ev.pubkey);
        }
      }
    }
    if (newComments.length > 0) commentsRaw = [...commentsRaw, ...newComments];

    // Start merged subscription
    const filters = buildContentFilters(idValue);
    const sub = startMergedSubscription(subscriptionRefs, filters, dispatchPacket);
    subscriptions.push(sub);
  }

  function destroy() {
    log.info('Destroying comment subscriptions');
    destroyed = true;
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = undefined;
    }
    for (const sub of subscriptions) sub.unsubscribe();
    subscriptions = [];
    if (reconcileSub) {
      reconcileSub.unsubscribe();
      reconcileSub = undefined;
    }
    if (reconcileTimeout) {
      clearTimeout(reconcileTimeout);
      reconcileTimeout = undefined;
    }
    commentsRaw = [];
    commentIds = new Set();
    reactionsRaw = [];
    reactionIds = new Set();
    reactionIndex = new Map();
    deletedIds = new Set();
    prevDeletedSize = 0;
    eventPubkeys.clear();
  }

  return {
    get comments() {
      return visibleComments;
    },
    get reactionIndex() {
      return reactionIndex;
    },
    get deletedIds() {
      return deletedIds;
    },
    get loading() {
      return loading;
    },
    subscribe,
    addSubscription,
    destroy
  };
}
