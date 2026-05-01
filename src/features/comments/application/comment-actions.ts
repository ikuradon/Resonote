/**
 * Application-layer actions for comments.
 * Orchestrates domain logic + infra (Nostr sending).
 * UI components call these instead of directly importing castSigned/buildComment.
 */

import {
  fetchNostrEventById,
  getDefaultRelayUrls,
  publishSignedEvent
} from '$shared/auftakt/resonote.js';
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import {
  buildComment,
  buildContentReaction,
  buildDeletion,
  buildReaction,
  buildRepost,
  COMMENT_KIND,
  CONTENT_REACTION_KIND,
  type RepostTargetEvent
} from '$shared/nostr/events.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

import type { Comment } from '../domain/comment-model.js';

const log = createLogger('comment-actions');

export interface SendCommentParams {
  content: string;
  contentId: ContentId;
  provider: ContentProvider;
  positionMs?: number;
  emojiTags?: string[][];
  contentWarning?: string;
}

/** Send a new top-level comment. */
export async function sendComment(params: SendCommentParams): Promise<void> {
  const eventParams = buildComment(params.content, params.contentId, params.provider, {
    positionMs: params.positionMs,
    emojiTags: params.emojiTags,
    contentWarning: params.contentWarning
  });
  log.info('Sending comment', {
    positionMs: params.positionMs,
    contentLength: params.content.length
  });
  await publishSignedEvent(eventParams);
  log.info('Comment sent successfully');
}

export interface SendReplyParams {
  content: string;
  contentId: ContentId;
  provider: ContentProvider;
  parentEvent: { id: string; pubkey: string; relayHint?: string };
  positionMs?: number;
  emojiTags?: string[][];
}

/** Send a reply to an existing comment. */
export async function sendReply(params: SendReplyParams): Promise<void> {
  const eventParams = buildComment(params.content, params.contentId, params.provider, {
    positionMs: params.positionMs,
    emojiTags: params.emojiTags,
    parentEvent: params.parentEvent
  });
  log.info('Sending reply', { parentId: shortHex(params.parentEvent.id) });
  await publishSignedEvent(eventParams);
  log.info('Reply sent successfully');
}

export interface SendReactionParams {
  comment: Comment;
  contentId: ContentId;
  provider: ContentProvider;
  reaction?: string;
  emojiUrl?: string;
  relayHint?: string;
}

/** Send a reaction (like or custom emoji) to a comment. */
export async function sendReaction(params: SendReactionParams): Promise<void> {
  const eventParams = buildReaction(
    params.comment.id,
    params.comment.pubkey,
    params.contentId,
    params.provider,
    params.reaction ?? '+',
    params.emojiUrl,
    params.relayHint
  );
  await publishSignedEvent(eventParams);
  log.info('Reaction sent', { targetId: shortHex(params.comment.id) });
}

export interface SendRepostParams {
  comment: Comment;
  relayHint?: string;
}

/** Send a NIP-18 repost for a comment using the coordinator-local event body. */
export async function sendRepost(params: SendRepostParams): Promise<void> {
  const relayHint = params.relayHint ?? params.comment.relayHint;
  const targetEvent = await fetchNostrEventById<RepostTargetEvent>(
    params.comment.id,
    relayHint ? [relayHint] : []
  );
  if (!targetEvent) {
    throw new Error('Cannot repost an event that is not available locally or from relay repair');
  }

  const repostRelayHint = relayHint ?? (await getDefaultRelayUrls())[0];
  if (!repostRelayHint) {
    throw new Error('Cannot repost without a relay hint for the target event');
  }

  const eventParams = buildRepost(targetEvent, repostRelayHint);
  await publishSignedEvent(eventParams);
  log.info('Repost sent', {
    targetId: shortHex(params.comment.id),
    targetKind: targetEvent.kind
  });
}

export interface DeleteCommentParams {
  commentIds: string[];
  contentId: ContentId;
  provider: ContentProvider;
}

export interface SendContentReactionParams {
  contentId: ContentId;
  provider: ContentProvider;
}

/** Send a reaction (like) to content itself. */
export async function sendContentReaction(params: SendContentReactionParams): Promise<void> {
  const eventParams = buildContentReaction(params.contentId, params.provider);
  await publishSignedEvent(eventParams);
  log.info('Content reaction sent');
}

export interface DeleteContentReactionParams {
  reactionId: string;
  contentId: ContentId;
  provider: ContentProvider;
}

/** Send a deletion event for a content reaction. */
export async function deleteContentReaction(params: DeleteContentReactionParams): Promise<void> {
  const eventParams = buildDeletion(
    [params.reactionId],
    params.contentId,
    params.provider,
    CONTENT_REACTION_KIND
  );
  await publishSignedEvent(eventParams);
  log.info('Content reaction deleted', { reactionId: shortHex(params.reactionId) });
}

/** Send a deletion event for one or more comments. */
export async function deleteComment(params: DeleteCommentParams): Promise<void> {
  const eventParams = buildDeletion(
    params.commentIds,
    params.contentId,
    params.provider,
    COMMENT_KIND
  );
  await publishSignedEvent(eventParams);
  log.info('Comment deleted', { commentIds: params.commentIds.map(shortHex) });
}
