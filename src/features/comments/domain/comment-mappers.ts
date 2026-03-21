/**
 * Pure functions that convert Nostr events into domain models.
 * No side effects, no infra dependencies.
 */

import type { Comment, PlaceholderComment, Reaction, NostrEvent } from './comment-model.js';
import { parsePosition } from '$shared/nostr/events.js';
import { isEmojiTag } from '$shared/utils/emoji.js';

/** Convert a kind:1111 Nostr event into a Comment domain model. */
export function commentFromEvent(
  event: Pick<NostrEvent, 'id' | 'pubkey' | 'content' | 'created_at' | 'tags'>
): Comment {
  const posTag = event.tags.find((t) => t[0] === 'position');
  const emojiTags = event.tags.filter((t) => isEmojiTag(t));
  const eTag = event.tags.find((t) => t[0] === 'e');
  const cwTag = event.tags.find((t) => t[0] === 'content-warning');
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

/** Create a loading placeholder for an orphan reply whose parent has not yet been fetched. */
export function placeholderFromOrphan(
  parentId: string,
  positionMs: number | null
): PlaceholderComment {
  return { id: parentId, status: 'loading', positionMs };
}

/** Convert a kind:7 Nostr event into a Reaction domain model. Returns null if no e-tag. */
export function reactionFromEvent(
  event: Pick<NostrEvent, 'id' | 'pubkey' | 'content' | 'tags'>
): Reaction | null {
  const eTag = event.tags.find((t) => t[0] === 'e' && t[1]);
  if (!eTag) return null;
  const emojiTag = event.tags.find((t) => isEmojiTag(t));
  return {
    id: event.id,
    pubkey: event.pubkey,
    content: event.content,
    targetEventId: eTag[1],
    emojiUrl: emojiTag ? emojiTag[2] : undefined
  };
}
