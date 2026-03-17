import type { ContentId, ContentProvider } from '../content/types.js';
import {
  parsePosition,
  extractDeletionTargets,
  COMMENT_KIND,
  REACTION_KIND,
  DELETION_KIND
} from '../nostr/events.js';
import { isEmojiTag } from '../utils/emoji.js';
import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('comments');

export interface Comment {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  /** Playback position in milliseconds when comment was posted, or null */
  positionMs: number | null;
  emojiTags: string[][];
  /** Parent comment ID if this is a reply, or null for top-level comments */
  replyTo: string | null;
  /** Content warning reason (NIP-36). Empty string = CW without reason. null = no CW. */
  contentWarning: string | null;
}

export interface Reaction {
  id: string;
  pubkey: string;
  content: string;
  targetEventId: string;
  emojiUrl?: string;
}

export interface ReactionStats {
  likes: number;
  emojis: { content: string; url?: string; count: number }[];
  reactors: Set<string>;
}

export function emptyStats(): ReactionStats {
  return { likes: 0, emojis: [], reactors: new Set() };
}

function isLikeReaction(content: string): boolean {
  return content === '+' || content === '';
}

/** Apply a single reaction to a stats object (mutates in place). */
export function applyReaction(stats: ReactionStats, r: Reaction): void {
  stats.reactors.add(r.pubkey);
  if (isLikeReaction(r.content)) {
    stats.likes++;
  } else {
    const existing = stats.emojis.find((e) =>
      e.url ? e.url === r.emojiUrl : e.content === r.content
    );
    if (existing) {
      existing.count++;
    } else {
      stats.emojis.push({ content: r.content, url: r.emojiUrl, count: 1 });
    }
  }
}

export function buildReactionIndex(
  reactions: Reaction[],
  deletedIds: Set<string>
): Map<string, ReactionStats> {
  const index = new Map<string, ReactionStats>();
  for (const r of reactions) {
    if (deletedIds.has(r.id)) continue;
    let stats = index.get(r.targetEventId);
    if (!stats) {
      stats = emptyStats();
      index.set(r.targetEventId, stats);
    }
    applyReaction(stats, r);
  }
  for (const stats of index.values()) {
    stats.emojis.sort((a, b) => b.count - a.count);
  }
  return index;
}

export function createCommentsStore(contentId: ContentId, provider: ContentProvider) {
  // --- Comments ---
  let commentIds = new Set<string>();
  let commentsRaw = $state<Comment[]>([]);
  let visibleComments = $derived(commentsRaw.filter((c) => !deletedIds.has(c.id)));

  // --- Reactions ---
  let reactionIds = new Set<string>();
  let reactionsRaw: Reaction[] = [];
  let reactionIndex = $state<Map<string, ReactionStats>>(new Map());

  let deletedIds = $state<Set<string>>(new Set());
  let loading = $state(true);
  let subscriptions: { unsubscribe: () => void }[] = [];

  let prevDeletedSize = 0;
  let destroyed = false;
  let loadingTimeout: ReturnType<typeof setTimeout> | undefined;

  // NIP-09 pubkey verification: maps event ID → pubkey
  const eventPubkeys = new Map<string, string>();

  // Shared refs for addSubscription (populated by subscribe())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rxNostrRef: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventsDBRef: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rxNostrModRef: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rxjsRef: any;

  // Reconciliation cleanup handles
  let reconcileSub: { unsubscribe: () => void } | undefined;
  let reconcileTimeout: ReturnType<typeof setTimeout> | undefined;

  function rebuildReactionIndex() {
    reactionIndex = buildReactionIndex(reactionsRaw, deletedIds);
  }

  function addReaction(reaction: Reaction) {
    if (reactionIds.has(reaction.id)) return;
    reactionIds.add(reaction.id);
    reactionsRaw.push(reaction);

    if (deletedIds.has(reaction.id)) return;

    // Incrementally update the index (mutate a shallow copy of stats)
    const targetId = reaction.targetEventId;
    const prev = reactionIndex.get(targetId);
    const stats: ReactionStats = prev
      ? {
          likes: prev.likes,
          emojis: prev.emojis.map((e) => ({ ...e })),
          reactors: new Set(prev.reactors)
        }
      : emptyStats();

    applyReaction(stats, reaction);
    if (!isLikeReaction(reaction.content)) {
      stats.emojis.sort((a, b) => b.count - a.count);
    }

    const next = new Map(reactionIndex);
    next.set(targetId, stats);
    reactionIndex = next;

    log.debug('Reaction received', {
      id: shortHex(reaction.id),
      target: shortHex(reaction.targetEventId)
    });
  }

  function buildCommentFromEvent(event: {
    id: string;
    pubkey: string;
    content: string;
    created_at: number;
    tags: string[][];
  }): Comment {
    const posTag = event.tags.find((t: string[]) => t[0] === 'position');
    const emojiTags = event.tags.filter((t: string[]) => isEmojiTag(t));
    const eTag = event.tags.find((t: string[]) => t[0] === 'e');
    const cwTag = event.tags.find((t: string[]) => t[0] === 'content-warning');
    return {
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      createdAt: event.created_at,
      positionMs: posTag?.[1] ? parsePosition(posTag[1]) : null,
      emojiTags,
      replyTo: eTag?.[1] ?? null,
      contentWarning: cwTag ? (cwTag[1] ?? '') : null
    };
  }

  function buildReactionFromEvent(event: {
    id: string;
    pubkey: string;
    content: string;
    tags: string[][];
  }): Reaction | null {
    const eTag = event.tags.find((t: string[]) => t[0] === 'e' && t[1]);
    if (!eTag) return null;
    const emojiTag = event.tags.find((t: string[]) => isEmojiTag(t));
    return {
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      targetEventId: eTag[1],
      emojiUrl: emojiTag ? emojiTag[2] : undefined
    };
  }

  function handleCommentPacket(event: {
    id: string;
    pubkey: string;
    content: string;
    created_at: number;
    tags: string[][];
  }) {
    if (commentIds.has(event.id)) return;
    commentIds.add(event.id);
    eventPubkeys.set(event.id, event.pubkey);
    commentsRaw = [...commentsRaw, buildCommentFromEvent(event)];
    log.debug('Comment received', { id: shortHex(event.id) });
  }

  function handleReactionPacket(event: {
    id: string;
    pubkey: string;
    content: string;
    tags: string[][];
  }) {
    const reaction = buildReactionFromEvent(event);
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
    if (toPurge.length > 0)
      eventsDBRef
        ?.deleteByIds(toPurge)
        .catch((err: unknown) => log.error('Failed to purge deletion targets', err));
    log.debug('Deletion event received', { deletedIds: verified.map(shortHex) });
  }

  /** Build the 3-filter array for unified subscription on a given tag value. */
  function buildContentFilters(idValue: string) {
    return [
      { kinds: [COMMENT_KIND], '#I': [idValue] },
      { kinds: [REACTION_KIND], '#I': [idValue] },
      { kinds: [DELETION_KIND], '#I': [idValue] }
    ];
  }

  /** Dispatch a received event to the appropriate handler by kind. */
  function dispatchPacket(event: {
    id: string;
    pubkey: string;
    content: string;
    created_at: number;
    tags: string[][];
    kind: number;
  }) {
    eventsDBRef?.put(event);
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

  async function subscribe() {
    log.info('Subscribing to comments', {
      contentId: `${contentId.platform}:${contentId.type}:${contentId.id}`
    });

    const [{ merge }, rxNostrMod, { getRxNostr }, { getEventsDB }] = await Promise.all([
      import('rxjs'),
      import('rx-nostr'),
      import('../nostr/client.js'),
      import('../nostr/event-db.js')
    ]);

    const { createRxBackwardReq, createRxForwardReq, uniq } = rxNostrMod;
    const rxNostr = await getRxNostr();
    const eventsDB = await getEventsDB();
    rxNostrRef = rxNostr;
    eventsDBRef = eventsDB;
    rxNostrModRef = rxNostrMod;
    rxjsRef = { merge };
    const [idValue] = provider.toNostrTag(contentId);
    const tagQuery = `I:${idValue}`;

    // --- Restore from DB (two-pass for NIP-09 pubkey verification) ---
    const cachedEvents = await eventsDB.getByTagValue(tagQuery);
    const cachedDeletions: typeof cachedEvents = [];
    const cachedComments: typeof cachedEvents = [];
    const cachedReactions: typeof cachedEvents = [];
    let maxCreatedAt: number | null = null;

    // Pass 1: categorize events and track maxCreatedAt
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
        newComments.push(buildCommentFromEvent(event));
      }
    }
    if (newComments.length > 0) {
      commentsRaw = [...commentsRaw, ...newComments];
    }

    // Restore reactions
    for (const event of cachedReactions) {
      const reaction = buildReactionFromEvent(event);
      if (reaction) addReaction(reaction);
    }

    // Build event ID → pubkey mapping for NIP-09 author verification
    for (const c of commentsRaw) eventPubkeys.set(c.id, c.pubkey);
    for (const r of reactionsRaw) eventPubkeys.set(r.id, r.pubkey);

    // Pass 2: process deletions with pubkey verification (NIP-09)
    for (const event of cachedDeletions) {
      for (const id of extractDeletionTargets(event)) {
        const originalPubkey = eventPubkeys.get(id);
        // Accept if author matches or if original event is unknown
        if (!originalPubkey || originalPubkey === event.pubkey) {
          deletedIds.add(id);
        }
      }
    }

    if (deletedIds.size > 0) {
      deletedIds = new Set(deletedIds);
    }

    prevDeletedSize = deletedIds.size;

    log.info('Restored from DB', {
      comments: commentIds.size,
      reactions: reactionIds.size,
      deletions: deletedIds.size,
      maxCreatedAt
    });

    // Show cached comments immediately instead of spinner
    if (newComments.length > 0) {
      loading = false;
    }

    // --- Purge deleted events from DB (from cached deletions) ---
    if (deletedIds.size > 0) {
      const idsToPurge = [...deletedIds].filter((id) => commentIds.has(id) || reactionIds.has(id));
      if (idsToPurge.length > 0) {
        eventsDB
          .deleteByIds(idsToPurge)
          .catch((err) => log.error('Failed to purge deleted events', err));
        log.info('Purged deleted events from DB', { count: idsToPurge.length });
      }
    }

    // --- Reconcile offline deletions via #e query (non-blocking) ---
    // Discovers kind:5 events published while SPA was offline.
    // Uses #e filter (not #I) because external clients' kind:5 may lack #I tags.
    const cachedIds = [...commentIds, ...reactionIds];
    if (cachedIds.length > 0) {
      const CHUNK_SIZE = 50;
      const reconcileBackward = createRxBackwardReq();
      const newDeletions = new Set<string>();

      reconcileSub = rxNostr
        .use(reconcileBackward)
        .pipe(uniq())
        .subscribe((packet) => {
          eventsDB.put(packet.event);
          for (const id of extractDeletionTargets(packet.event)) {
            const originalPubkey = eventPubkeys.get(id);
            if (!originalPubkey || originalPubkey === packet.event.pubkey) {
              newDeletions.add(id);
            }
          }
        });

      for (let i = 0; i < cachedIds.length; i += CHUNK_SIZE) {
        const chunk = cachedIds.slice(i, i + CHUNK_SIZE);
        reconcileBackward.emit({ kinds: [5], '#e': chunk });
      }
      reconcileBackward.over();

      reconcileTimeout = setTimeout(() => {
        reconcileSub?.unsubscribe();
        reconcileSub = undefined;
        reconcileTimeout = undefined;
        if (destroyed || newDeletions.size === 0) return;

        const next = new Set(deletedIds);
        for (const id of newDeletions) next.add(id);
        deletedIds = next;
        prevDeletedSize = deletedIds.size;
        rebuildReactionIndex();
        log.info('Offline deletions reconciled', { newDeletions: newDeletions.size });

        // Purge deleted events from DB
        const idsToPurge = [...newDeletions].filter(
          (id) => commentIds.has(id) || reactionIds.has(id)
        );
        if (idsToPurge.length > 0) {
          eventsDB
            .deleteByIds(idsToPurge)
            .catch((err) => log.error('Failed to purge reconciled events', err));
          log.info('Purged deleted events from DB', { count: idsToPurge.length });
        }
      }, 5000);
    }

    // --- Unified subscription (kind:1111 + kind:7 + kind:5) ---
    const backward = createRxBackwardReq();
    const forward = createRxForwardReq();

    const baseFilters = buildContentFilters(idValue);
    const backwardFilters = maxCreatedAt
      ? baseFilters.map((f) => ({ ...f, since: maxCreatedAt + 1 }))
      : baseFilters;

    // Fallback timeout: clear loading if EOSE never arrives
    loadingTimeout = setTimeout(() => {
      loading = false;
    }, 10_000);

    // Track backward completion to clear loading state
    const backwardSub = rxNostr
      .use(backward)
      .pipe(uniq())
      .subscribe({
        next: (packet) => dispatchPacket(packet.event),
        complete: () => {
          clearTimeout(loadingTimeout);
          loading = false;
        },
        error: () => {
          clearTimeout(loadingTimeout);
          loading = false;
        }
      });

    const forwardSub = rxNostr
      .use(forward)
      .pipe(uniq())
      .subscribe((packet) => {
        dispatchPacket(packet.event);
      });

    backward.emit(backwardFilters);
    backward.over();
    forward.emit(baseFilters);

    subscriptions = [backwardSub, forwardSub];
  }

  async function addSubscription(idValue: string): Promise<void> {
    if (!rxNostrRef || !eventsDBRef || !rxNostrModRef || !rxjsRef) return;

    const { merge } = rxjsRef;
    const { createRxBackwardReq, createRxForwardReq, uniq } = rxNostrModRef;

    // DB cache restore — two-pass approach
    const tagQuery = `I:${idValue}`;
    const cachedEvents = await eventsDBRef.getByTagValue(tagQuery);

    // Pass 1: process kind:5 deletions FIRST
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
    }

    // Pass 2: restore comments and reactions (skipping deleted)
    const newComments: Comment[] = [];
    for (const ev of cachedEvents) {
      if (ev.kind === COMMENT_KIND && !commentIds.has(ev.id) && !deletedIds.has(ev.id)) {
        commentIds.add(ev.id);
        eventPubkeys.set(ev.id, ev.pubkey);
        newComments.push(buildCommentFromEvent(ev));
      }
      if (ev.kind === REACTION_KIND && !reactionIds.has(ev.id) && !deletedIds.has(ev.id)) {
        const reaction = buildReactionFromEvent(ev);
        if (reaction) {
          addReaction(reaction);
          eventPubkeys.set(ev.id, ev.pubkey);
        }
      }
    }
    if (newComments.length > 0) {
      commentsRaw = [...commentsRaw, ...newComments];
    }

    // Unified subscription (kind:1111 + kind:7 + kind:5)
    const backward = createRxBackwardReq();
    const forward = createRxForwardReq();

    const filters = buildContentFilters(idValue);

    const sub = merge(
      rxNostrRef.use(backward).pipe(uniq()),
      rxNostrRef.use(forward).pipe(uniq())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).subscribe((rawPacket: any) => {
      dispatchPacket(rawPacket.event);
    });

    backward.emit(filters);
    backward.over();
    forward.emit(filters);

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
