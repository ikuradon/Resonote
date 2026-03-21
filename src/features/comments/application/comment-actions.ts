/**
 * Application-layer actions for comments.
 * Orchestrates domain logic + infra (Nostr sending).
 * UI components call these instead of directly importing castSigned/buildComment.
 */

import type { ContentId, ContentProvider } from '$shared/content/types.js';
import type { Comment } from '../domain/comment-model.js';
import { buildComment, buildReaction, buildDeletion, COMMENT_KIND } from '$shared/nostr/events.js';
import { castSigned } from '$shared/nostr/gateway.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

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
  await castSigned(eventParams);
  log.info('Comment sent successfully');
}

export interface SendReplyParams {
  content: string;
  contentId: ContentId;
  provider: ContentProvider;
  parentEvent: { id: string; pubkey: string };
  emojiTags?: string[][];
}

/** Send a reply to an existing comment. */
export async function sendReply(params: SendReplyParams): Promise<void> {
  const eventParams = buildComment(params.content, params.contentId, params.provider, {
    emojiTags: params.emojiTags,
    parentEvent: params.parentEvent
  });
  log.info('Sending reply', { parentId: shortHex(params.parentEvent.id) });
  await castSigned(eventParams);
  log.info('Reply sent successfully');
}

export interface SendReactionParams {
  comment: Comment;
  contentId: ContentId;
  provider: ContentProvider;
  reaction?: string;
  emojiUrl?: string;
}

/** Send a reaction (like or custom emoji) to a comment. */
export async function sendReaction(params: SendReactionParams): Promise<void> {
  const eventParams = buildReaction(
    params.comment.id,
    params.comment.pubkey,
    params.contentId,
    params.provider,
    params.reaction ?? '+',
    params.emojiUrl
  );
  await castSigned(eventParams);
  log.info('Reaction sent', { targetId: shortHex(params.comment.id) });
}

export interface DeleteCommentParams {
  commentIds: string[];
  contentId: ContentId;
  provider: ContentProvider;
}

/** Send a deletion event for one or more comments. */
export async function deleteComment(params: DeleteCommentParams): Promise<void> {
  const eventParams = buildDeletion(
    params.commentIds,
    params.contentId,
    params.provider,
    COMMENT_KIND
  );
  await castSigned(eventParams);
  log.info('Comment deleted', { commentIds: params.commentIds.map(shortHex) });
}
