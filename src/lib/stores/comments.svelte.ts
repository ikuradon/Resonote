import type { ContentId, ContentProvider } from '../content/types.js';
import { parsePosition } from '../nostr/events.js';
import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('comments');

export interface Comment {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  /** Playback position in milliseconds when comment was posted, or null */
  positionMs: number | null;
}

export interface Reaction {
  id: string;
  pubkey: string;
  content: string;
  targetEventId: string;
}

export function createCommentsStore(contentId: ContentId, provider: ContentProvider) {
  let comments = $state<Comment[]>([]);
  let reactions = $state<Reaction[]>([]);
  let deletedIds = $state<Set<string>>(new Set());
  let subscriptions: { unsubscribe: () => void }[] = [];

  async function subscribe() {
    log.info('Subscribing to comments', {
      contentId: `${contentId.platform}:${contentId.type}:${contentId.id}`
    });

    const [{ merge }, rxNostrMod, { getRxNostr }] = await Promise.all([
      import('rxjs'),
      import('rx-nostr'),
      import('../nostr/client.js')
    ]);

    const { createRxBackwardReq, createRxForwardReq, uniq, timeline } = rxNostrMod;
    const rxNostr = await getRxNostr();
    const iTag = provider.toNostrTag(contentId);

    // --- Comments (kind:1111) ---
    const commentBackward = createRxBackwardReq();
    const commentForward = createRxForwardReq();
    const commentFilter = { kinds: [1111], '#I': [iTag[1]] };

    const commentSub = merge(
      rxNostr.use(commentBackward).pipe(uniq()),
      rxNostr.use(commentForward).pipe(uniq())
    )
      .pipe(timeline())
      .subscribe((packets) => {
        comments = packets.map((packet) => {
          const posTag = packet.event.tags.find((t: string[]) => t[0] === 'position');
          return {
            id: packet.event.id,
            pubkey: packet.event.pubkey,
            content: packet.event.content,
            createdAt: packet.event.created_at,
            positionMs: posTag ? parsePosition(posTag[1]) : null
          };
        });
        log.debug('Comments updated', { count: comments.length });
      });

    commentBackward.emit(commentFilter);
    commentBackward.over();
    commentForward.emit(commentFilter);

    // --- Reactions (kind:7) ---
    const reactionBackward = createRxBackwardReq();
    const reactionForward = createRxForwardReq();
    const reactionFilter = { kinds: [7], '#I': [iTag[1]] };

    const reactionSub = merge(
      rxNostr.use(reactionBackward).pipe(uniq()),
      rxNostr.use(reactionForward).pipe(uniq())
    ).subscribe((packet) => {
      const eTag = packet.event.tags.find((t: string[]) => t[0] === 'e');
      if (!eTag) return;
      const reaction: Reaction = {
        id: packet.event.id,
        pubkey: packet.event.pubkey,
        content: packet.event.content,
        targetEventId: eTag[1]
      };
      if (!reactions.some((r) => r.id === reaction.id)) {
        reactions = [...reactions, reaction];
        log.debug('Reaction received', {
          id: shortHex(reaction.id),
          target: shortHex(reaction.targetEventId)
        });
      }
    });

    reactionBackward.emit(reactionFilter);
    reactionBackward.over();
    reactionForward.emit(reactionFilter);

    // --- Deletions (kind:5) ---
    const deletionBackward = createRxBackwardReq();
    const deletionForward = createRxForwardReq();
    const deletionFilter = { kinds: [5], '#I': [iTag[1]] };

    const deletionSub = merge(
      rxNostr.use(deletionBackward).pipe(uniq()),
      rxNostr.use(deletionForward).pipe(uniq())
    ).subscribe((packet) => {
      const eTags = packet.event.tags
        .filter((t: string[]) => t[0] === 'e')
        .map((t: string[]) => t[1]);
      if (eTags.length > 0) {
        const next = new Set(deletedIds);
        for (const id of eTags) next.add(id);
        deletedIds = next;
        log.debug('Deletion event received', { deletedIds: eTags.map(shortHex) });
      }
    });

    deletionBackward.emit(deletionFilter);
    deletionBackward.over();
    deletionForward.emit(deletionFilter);

    subscriptions = [commentSub, reactionSub, deletionSub];
  }

  function destroy() {
    log.info('Destroying comment subscriptions');
    for (const sub of subscriptions) sub.unsubscribe();
    subscriptions = [];
    comments = [];
    reactions = [];
    deletedIds = new Set();
  }

  return {
    get comments() {
      return comments.filter((c) => !deletedIds.has(c.id));
    },
    get reactions() {
      return reactions.filter((r) => !deletedIds.has(r.id));
    },
    get deletedIds() {
      return deletedIds;
    },
    subscribe,
    destroy
  };
}
