import type { ContentId, ContentProvider } from '../content/types.js';
import { parsePosition } from '../nostr/events.js';
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
function applyReaction(stats: ReactionStats, r: Reaction): void {
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

function buildReactionIndex(
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
  let subscriptions: { unsubscribe: () => void }[] = [];

  let prevDeletedSize = 0;

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
    return {
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      createdAt: event.created_at,
      positionMs: posTag ? parsePosition(posTag[1]) : null,
      emojiTags,
      replyTo: eTag ? eTag[1] : null
    };
  }

  function buildReactionFromEvent(event: {
    id: string;
    pubkey: string;
    content: string;
    tags: string[][];
  }): Reaction | null {
    const eTag = event.tags.find((t: string[]) => t[0] === 'e');
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
    const iTag = provider.toNostrTag(contentId);
    const tagQuery = `I:${iTag[1]}`;

    // --- Restore from DB (single pass) ---
    const cachedEvents = await eventsDB.getByTagValue(tagQuery);
    const cachedComments: typeof cachedEvents = [];
    const cachedReactions: typeof cachedEvents = [];
    let maxCreatedAt: number | null = null;

    for (const event of cachedEvents) {
      if (maxCreatedAt === null || event.created_at > maxCreatedAt) {
        maxCreatedAt = event.created_at;
      }
      switch (event.kind) {
        case 5: {
          const eTags = event.tags.filter((t) => t[0] === 'e').map((t) => t[1]);
          for (const id of eTags) deletedIds.add(id);
          break;
        }
        case 1111:
          cachedComments.push(event);
          break;
        case 7:
          cachedReactions.push(event);
          break;
      }
    }

    if (deletedIds.size > 0) {
      deletedIds = new Set(deletedIds);
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

    prevDeletedSize = deletedIds.size;

    log.info('Restored from DB', {
      comments: commentIds.size,
      reactions: reactionIds.size,
      deletions: deletedIds.size,
      maxCreatedAt
    });

    // --- Comments (kind:1111) ---
    const commentBackward = createRxBackwardReq();
    const commentForward = createRxForwardReq();
    const commentFilter = maxCreatedAt
      ? { kinds: [1111], '#I': [iTag[1]], since: maxCreatedAt }
      : { kinds: [1111], '#I': [iTag[1]] };

    const commentSub = merge(
      rxNostr.use(commentBackward).pipe(uniq()),
      rxNostr.use(commentForward).pipe(uniq())
    ).subscribe((packet) => {
      if (commentIds.has(packet.event.id)) return;
      eventsDB.put(packet.event);
      commentIds.add(packet.event.id);
      commentsRaw = [...commentsRaw, buildCommentFromEvent(packet.event)];
      log.debug('Comment received', { id: shortHex(packet.event.id) });
    });

    commentBackward.emit(commentFilter);
    commentBackward.over();
    commentForward.emit({ kinds: [1111], '#I': [iTag[1]] });

    // --- Reactions (kind:7) ---
    const reactionBackward = createRxBackwardReq();
    const reactionForward = createRxForwardReq();
    const reactionFilter = maxCreatedAt
      ? { kinds: [7], '#I': [iTag[1]], since: maxCreatedAt }
      : { kinds: [7], '#I': [iTag[1]] };

    const reactionSub = merge(
      rxNostr.use(reactionBackward).pipe(uniq()),
      rxNostr.use(reactionForward).pipe(uniq())
    ).subscribe((packet) => {
      eventsDB.put(packet.event);
      const reaction = buildReactionFromEvent(packet.event);
      if (reaction) addReaction(reaction);
    });

    reactionBackward.emit(reactionFilter);
    reactionBackward.over();
    reactionForward.emit({ kinds: [7], '#I': [iTag[1]] });

    // --- Deletions (kind:5) ---
    const deletionBackward = createRxBackwardReq();
    const deletionForward = createRxForwardReq();
    const deletionFilter = maxCreatedAt
      ? { kinds: [5], '#I': [iTag[1]], since: maxCreatedAt }
      : { kinds: [5], '#I': [iTag[1]] };

    const deletionSub = merge(
      rxNostr.use(deletionBackward).pipe(uniq()),
      rxNostr.use(deletionForward).pipe(uniq())
    ).subscribe((packet) => {
      eventsDB.put(packet.event);
      const eTags = packet.event.tags
        .filter((t: string[]) => t[0] === 'e')
        .map((t: string[]) => t[1]);
      if (eTags.length > 0) {
        const next = new Set(deletedIds);
        for (const id of eTags) next.add(id);
        deletedIds = next;
        if (deletedIds.size !== prevDeletedSize) {
          prevDeletedSize = deletedIds.size;
          rebuildReactionIndex();
        }
        log.debug('Deletion event received', { deletedIds: eTags.map(shortHex) });
      }
    });

    deletionBackward.emit(deletionFilter);
    deletionBackward.over();
    deletionForward.emit({ kinds: [5], '#I': [iTag[1]] });

    subscriptions = [commentSub, reactionSub, deletionSub];
  }

  function destroy() {
    log.info('Destroying comment subscriptions');
    for (const sub of subscriptions) sub.unsubscribe();
    subscriptions = [];
    commentsRaw = [];
    commentIds = new Set();
    reactionsRaw = [];
    reactionIds = new Set();
    reactionIndex = new Map();
    deletedIds = new Set();
    prevDeletedSize = 0;
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
    subscribe,
    destroy
  };
}
