import { paginateTimelineWindow } from '@auftakt/timeline';

import { fetchProfileCommentEvents } from '$shared/auftakt/resonote.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('ProfileQueries');

export interface ProfileComment {
  id: string;
  content: string;
  createdAt: number;
  iTag: string | null;
}

export interface ProfileCommentsResult {
  comments: ProfileComment[];
  hasMore: boolean;
  oldestTimestamp: number | null;
}

const COMMENTS_LIMIT = 20;

/**
 * Fetch kind:1111 comments authored by a given pubkey.
 * Uses the shared backward-query bridge with optional cursor-based pagination.
 */
export async function fetchProfileComments(
  pubkey: string,
  until?: number
): Promise<ProfileCommentsResult> {
  try {
    const events = await fetchProfileCommentEvents(pubkey, until, COMMENTS_LIMIT);
    const timelineWindow = paginateTimelineWindow(events, COMMENTS_LIMIT);
    const comments = timelineWindow.items.map((event) => ({
      id: event.id,
      content: event.content,
      createdAt: event.created_at,
      iTag: event.tags.find((tag) => tag[0] === 'I')?.[1] ?? null
    }));

    const oldestTimestamp = comments.length > 0 ? comments[comments.length - 1].createdAt : null;
    return {
      comments,
      hasMore: timelineWindow.nextCursor !== null,
      oldestTimestamp
    };
  } catch (error) {
    log.error('Failed to load profile comments', error);
    throw error;
  }
}
