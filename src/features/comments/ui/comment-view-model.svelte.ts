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
import {
  COMMENT_KIND,
  CONTENT_REACTION_KIND,
  DELETION_KIND,
  extractDeletionTargets,
  REACTION_KIND
} from '$shared/nostr/events.js';
import { getStore } from '$shared/nostr/store.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

import {
  buildContentFilters,
  type CachedEvent,
  type EventsDB,
  getCommentRepository,
  loadSubscriptionDeps,
  purgeDeletedFromCache,
  restoreFromCache,
  startDeletionReconcile,
  startMergedSubscription,
  startSubscription,
  type SubscriptionHandle,
  type SubscriptionRefs
} from '../application/comment-subscription.js';
import {
  commentFromEvent,
  contentReactionFromEvent,
  placeholderFromOrphan,
  reactionFromEvent
} from '../domain/comment-mappers.js';
import type {
  Comment,
  ContentReaction,
  PlaceholderComment,
  Reaction
} from '../domain/comment-model.js';
import type { ReactionStats } from '../domain/comment-model.js';
import { verifyDeletionTargets } from '../domain/deletion-rules.js';
import {
  applyReaction as applyReactionImmutable,
  buildReactionIndex,
  emptyStats,
  isLikeReaction
} from '../domain/reaction-rules.js';

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
  let placeholders = $state<Map<string, PlaceholderComment>>(new Map());
  let fetchedParentIds = new Set<string>();

  let contentReactionIds = new Set<string>();
  let contentReactionsRaw = $state<ContentReaction[]>([]);
  let visibleContentReactions = $derived(
    contentReactionsRaw.filter((cr) => !deletedIds.has(cr.id))
  );

  let prevDeletedSize = 0;
  let destroyed = false;
  let loadingTimeout: ReturnType<typeof setTimeout> | undefined;

  const eventPubkeys = new Map<string, string>();
  /** Pending deletions for unobserved events — all candidates per target for pubkey matching */
  const pendingDeletions = new Map<string, Array<{ pubkey: string }>>();

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

  function applyPendingDeletion(eventId: string, eventPubkey: string): void {
    const candidates = pendingDeletions.get(eventId);
    if (!candidates) return;
    pendingDeletions.delete(eventId);
    const match = candidates.some((c) => c.pubkey === eventPubkey);
    if (match) {
      const next = new Set(deletedIds);
      next.add(eventId);
      deletedIds = next;
      if (deletedIds.size !== prevDeletedSize) {
        prevDeletedSize = deletedIds.size;
        rebuildReactionIndex();
      }
      if (eventsDB) void purgeDeletedFromCache(eventsDB, [eventId]);
      log.debug('Pending deletion applied', { id: shortHex(eventId) });
    }
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

  function handleCommentPacket(event: CachedEvent, relayHint?: string) {
    if (commentIds.has(event.id)) return;
    commentIds.add(event.id);
    eventPubkeys.set(event.id, event.pubkey);
    applyPendingDeletion(event.id, event.pubkey);
    commentsRaw = [...commentsRaw, commentFromEvent(event, relayHint)];
    log.debug('Comment received', { id: shortHex(event.id) });
  }

  function handleReactionPacket(event: CachedEvent) {
    const reaction = reactionFromEvent(event);
    if (reaction) {
      addReaction(reaction);
      eventPubkeys.set(event.id, event.pubkey);
      applyPendingDeletion(event.id, event.pubkey);
    }
  }

  function handleContentReactionPacket(event: CachedEvent) {
    if (contentReactionIds.has(event.id)) return;
    contentReactionIds.add(event.id);
    eventPubkeys.set(event.id, event.pubkey);
    applyPendingDeletion(event.id, event.pubkey);
    contentReactionsRaw = [...contentReactionsRaw, contentReactionFromEvent(event)];
  }

  function handleDeletionPacket(event: { id: string; pubkey: string; tags: string[][] }) {
    const verified = verifyDeletionTargets(event, eventPubkeys);

    // Store unverified targets as pending (original event not yet observed).
    // All candidates are kept per target so the correct author's deletion
    // is applied when the target event is finally observed.
    const allTargets = extractDeletionTargets(event);
    for (const id of allTargets) {
      if (!eventPubkeys.has(id)) {
        const existing = pendingDeletions.get(id) ?? [];
        existing.push({ pubkey: event.pubkey });
        pendingDeletions.set(id, existing);
      }
    }

    if (verified.length === 0) return;
    const next = new Set(deletedIds);
    for (const id of verified) next.add(id);
    deletedIds = next;
    if (deletedIds.size !== prevDeletedSize) {
      prevDeletedSize = deletedIds.size;
      rebuildReactionIndex();
    }
    const toPurge = verified.filter(
      (id) => commentIds.has(id) || reactionIds.has(id) || contentReactionIds.has(id)
    );
    if (toPurge.length > 0 && eventsDB) void purgeDeletedFromCache(eventsDB, toPurge);
    log.debug('Deletion event received', { deletedIds: verified.map(shortHex) });

    // auftakt store handles deletedIds internally — no explicit cache invalidation needed

    // Update orphan placeholders to 'deleted' when kind:5 arrives later
    let updatedPlaceholders: Map<string, PlaceholderComment> | null = null;
    for (const id of verified) {
      const ph = placeholders.get(id);
      if (ph && ph.status !== 'deleted') {
        updatedPlaceholders ??= new Map(placeholders);
        updatedPlaceholders.set(id, { ...ph, status: 'deleted' });
      } else if (!ph && fetchedParentIds.has(id)) {
        // Parent was fetched successfully then deleted — re-create as 'deleted' placeholder
        const original = commentsRaw.find((c) => c.id === id);
        updatedPlaceholders ??= new Map(placeholders);
        updatedPlaceholders.set(id, {
          id,
          status: 'deleted' as const,
          positionMs: original?.positionMs ?? null
        });
      }
    }
    if (updatedPlaceholders) placeholders = updatedPlaceholders;
  }

  function dispatchPacket(event: CachedEvent, relayHint?: string) {
    eventsDB?.put(event);
    switch (event.kind) {
      case COMMENT_KIND:
        handleCommentPacket(event, relayHint);
        break;
      case REACTION_KIND:
        handleReactionPacket(event);
        break;
      case CONTENT_REACTION_KIND:
        handleContentReactionPacket(event);
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
    const cachedContentReactions: CachedEvent[] = [];
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
        case CONTENT_REACTION_KIND:
          cachedContentReactions.push(event);
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

    // Restore content reactions
    const newContentReactions: ContentReaction[] = [];
    for (const event of cachedContentReactions) {
      if (!contentReactionIds.has(event.id)) {
        contentReactionIds.add(event.id);
        eventPubkeys.set(event.id, event.pubkey);
        newContentReactions.push(contentReactionFromEvent(event));
      }
    }
    if (newContentReactions.length > 0) {
      contentReactionsRaw = [...contentReactionsRaw, ...newContentReactions];
    }

    // Build pubkey map for NIP-09 verification
    for (const c of commentsRaw) eventPubkeys.set(c.id, c.pubkey);
    for (const r of reactionsRaw) eventPubkeys.set(r.id, r.pubkey);

    // Process deletions with pubkey verification
    for (const event of cachedDeletions) {
      for (const id of verifyDeletionTargets(event, eventPubkeys)) {
        deletedIds.add(id);
      }
    }
    if (deletedIds.size > 0) {
      deletedIds = new Set(deletedIds);
      rebuildReactionIndex();
    }
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
      const tagQueryLower = `i:${idValue}`;

      // Restore from cache (uppercase I for kind:1111/7/5, lowercase i for kind:17)
      const [cachedUpper, cachedLower] = await Promise.all([
        restoreFromCache(db, tagQuery),
        restoreFromCache(db, tagQueryLower)
      ]);
      const cachedEvents = [...cachedUpper, ...cachedLower];
      const maxCreatedAt = restoreCachedEvents(cachedEvents);

      // Purge deleted from cache
      if (deletedIds.size > 0) {
        const idsToPurge = [...deletedIds].filter(
          (id) => commentIds.has(id) || reactionIds.has(id) || contentReactionIds.has(id)
        );
        void purgeDeletedFromCache(db, idsToPurge);
      }

      // Offline deletion reconcile
      const cachedIds = [...commentIds, ...reactionIds, ...contentReactionIds];
      if (cachedIds.length > 0) {
        const newDeletions = new Set<string>();
        const reconcile = startDeletionReconcile(
          refs,
          cachedIds,
          (event) => {
            eventsDB?.put(event);
            for (const id of verifyDeletionTargets(event, eventPubkeys)) {
              newDeletions.add(id);
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
              (id) => commentIds.has(id) || reactionIds.has(id) || contentReactionIds.has(id)
            );
            void purgeDeletedFromCache(db, idsToPurge);
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

    // DB cache restore (uppercase I for kind:1111/7/5, lowercase i for kind:17)
    const tagQuery = `I:${idValue}`;
    const tagQueryLower = `i:${idValue}`;
    const [cachedUpper, cachedLower] = await Promise.all([
      restoreFromCache(eventsDB, tagQuery),
      restoreFromCache(eventsDB, tagQueryLower)
    ]);
    const cachedEvents = [...cachedUpper, ...cachedLower];
    if (destroyed) return;

    // Process deletions first
    let addedDeletions = false;
    for (const ev of cachedEvents) {
      if (ev.kind === DELETION_KIND) {
        for (const id of verifyDeletionTargets(ev, eventPubkeys)) {
          deletedIds.add(id);
          addedDeletions = true;
        }
      }
    }
    if (addedDeletions) {
      deletedIds = new Set(deletedIds);
      prevDeletedSize = deletedIds.size;
      rebuildReactionIndex();
    }

    // Restore comments, reactions, and content reactions
    const newComments: Comment[] = [];
    const newContentReactions: ContentReaction[] = [];
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
      if (
        ev.kind === CONTENT_REACTION_KIND &&
        !contentReactionIds.has(ev.id) &&
        !deletedIds.has(ev.id)
      ) {
        contentReactionIds.add(ev.id);
        eventPubkeys.set(ev.id, ev.pubkey);
        newContentReactions.push(contentReactionFromEvent(ev));
      }
    }
    if (newComments.length > 0) commentsRaw = [...commentsRaw, ...newComments];
    if (newContentReactions.length > 0)
      contentReactionsRaw = [...contentReactionsRaw, ...newContentReactions];

    // Start merged subscription
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- destroyed may become true during preceding awaits
    if (destroyed) return;
    const filters = buildContentFilters(idValue);
    const sub = startMergedSubscription(subscriptionRefs, filters, dispatchPacket);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- destroyed may become true during preceding awaits
    if (destroyed) {
      sub.unsubscribe();
      return;
    }
    subscriptions.push(sub);
  }

  async function fetchOrphanParent(parentId: string, estimatedPositionMs: number | null) {
    if (fetchedParentIds.has(parentId)) {
      // Update positionMs if a better estimate arrives (e.g. timed reply after non-timed reply)
      const existing = placeholders.get(parentId);
      if (existing?.positionMs === null && estimatedPositionMs !== null) {
        const updated = new Map(placeholders);
        updated.set(parentId, { ...existing, positionMs: estimatedPositionMs });
        placeholders = updated;
      }
      return;
    }

    // Parent was received then deleted — show deleted placeholder immediately, no fetch needed
    if (deletedIds.has(parentId)) {
      fetchedParentIds.add(parentId);
      const next = new Map(placeholders);
      next.set(parentId, {
        id: parentId,
        status: 'deleted' as const,
        positionMs: estimatedPositionMs
      });
      placeholders = next;
      return;
    }

    // Parent exists and is visible — no placeholder needed
    if (commentIds.has(parentId)) return;

    fetchedParentIds.add(parentId);

    // Register loading placeholder
    const next = new Map(placeholders);
    next.set(parentId, placeholderFromOrphan(parentId, estimatedPositionMs));
    placeholders = next;

    const fetched = await getStore().fetchById(parentId, { negativeTTL: 30_000 });
    const result = fetched?.event ?? null;

    if (destroyed) return;

    if (result?.kind === COMMENT_KIND) {
      if (!deletedIds.has(parentId)) {
        // Success and not deleted → merge into commentsRaw, remove placeholder
        if (!commentIds.has(result.id)) {
          commentIds.add(result.id);
          eventPubkeys.set(result.id, result.pubkey);
          commentsRaw = [...commentsRaw, commentFromEvent(result as CachedEvent)];
        }
        const updated = new Map(placeholders);
        updated.delete(parentId);
        placeholders = updated;
      } else {
        // Fetched but deleted during await → show deleted placeholder
        const ph = placeholders.get(parentId);
        const updated = new Map(placeholders);
        updated.set(parentId, {
          ...(ph ?? placeholderFromOrphan(parentId, estimatedPositionMs)),
          status: 'deleted' as const
        });
        placeholders = updated;
      }
    } else {
      // Failed or non-comment kind
      const status = deletedIds.has(parentId) ? 'deleted' : 'not-found';
      const ph = placeholders.get(parentId);
      const updated = new Map(placeholders);
      updated.set(parentId, {
        ...(ph ?? placeholderFromOrphan(parentId, estimatedPositionMs)),
        status
      });
      placeholders = updated;
    }
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
    placeholders = new Map();
    fetchedParentIds = new Set();
    prevDeletedSize = 0;
    eventPubkeys.clear();
    pendingDeletions.clear();
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
    get placeholders() {
      return placeholders;
    },
    get contentReactions() {
      return visibleContentReactions;
    },
    getRelayHint: (eventId: string) => commentsRaw.find((c) => c.id === eventId)?.relayHint,
    subscribe,
    addSubscription,
    fetchOrphanParent,
    destroy
  };
}
