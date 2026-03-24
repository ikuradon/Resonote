/**
 * Pure functions that convert Nostr events into domain models.
 * No side effects, no infra dependencies.
 */

// eslint-disable-next-line no-restricted-imports -- parsePosition is a pure string parser with no infra side effects
import { parsePosition } from '$shared/nostr/events.js';
// eslint-disable-next-line no-restricted-imports -- findTagValue is a pure array utility with no infra side effects
import { findTagValue } from '$shared/nostr/helpers.js';
import { isEmojiTag } from '$shared/utils/emoji.js';

import type { Comment, NostrEvent, PlaceholderComment, Reaction } from './comment-model.js';

/** Convert a kind:1111 Nostr event into a Comment domain model. */
export function commentFromEvent(
  event: Pick<NostrEvent, 'id' | 'pubkey' | 'content' | 'created_at' | 'tags'>
): Comment {
  const pos = findTagValue(event.tags, 'position');
  const emojiTags = event.tags.filter((t) => isEmojiTag(t));
  const cwTag = event.tags.find((t) => t[0] === 'content-warning');
  return {
    id: event.id,
    pubkey: event.pubkey,
    content: event.content,
    createdAt: event.created_at,
    positionMs: pos ? parsePosition(pos) : null,
    emojiTags,
    replyTo: findTagValue(event.tags, 'e') ?? null,
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
  const targetId = findTagValue(event.tags, 'e');
  if (!targetId) return null;
  const emojiTag = event.tags.find((t) => isEmojiTag(t));
  return {
    id: event.id,
    pubkey: event.pubkey,
    content: event.content,
    targetEventId: targetId,
    emojiUrl: emojiTag ? emojiTag[2] : undefined
  };
}
