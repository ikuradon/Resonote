/**
 * Bookmark actions — load, add, remove.
 * Encapsulates all infra access (castSigned, fetchLatestEvent).
 */

import type { ContentId } from '$shared/content/types.js';
import { contentIdToString } from '$shared/content/types.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';
import {
  isAlreadyBookmarked,
  addBookmarkTag,
  removeBookmarkTag
} from '../domain/bookmark-model.js';

const log = createLogger('bookmark-actions');
const BOOKMARK_KIND = 10003;

export async function loadBookmarks(pubkey: string): Promise<{ tags: string[][] } | null> {
  log.info('Loading bookmarks', { pubkey: shortHex(pubkey) });
  const { fetchLatestEvent } = await import('$shared/nostr/gateway.js');
  return fetchLatestEvent(pubkey, BOOKMARK_KIND);
}

export async function publishAddBookmark(
  contentId: ContentId,
  openUrl: string,
  myPubkey: string
): Promise<string[][]> {
  const { castSigned, fetchLatestEvent } = await import('$shared/nostr/gateway.js');
  const value = contentIdToString(contentId);

  const latest = await fetchLatestEvent(myPubkey, BOOKMARK_KIND);
  let tags: string[][];

  if (latest) {
    if (isAlreadyBookmarked(latest.tags, value)) {
      log.info('Already bookmarked', { value });
      return latest.tags;
    }
    tags = addBookmarkTag(latest.tags, value, openUrl);
  } else {
    tags = [['i', value, openUrl]];
  }

  await castSigned({ kind: BOOKMARK_KIND, tags, content: '' });
  log.info('Bookmark added', { value });
  return tags;
}

export async function publishRemoveBookmark(
  contentId: ContentId,
  myPubkey: string
): Promise<string[][]> {
  const { castSigned, fetchLatestEvent } = await import('$shared/nostr/gateway.js');
  const value = contentIdToString(contentId);

  const latest = await fetchLatestEvent(myPubkey, BOOKMARK_KIND);
  const tags = latest ? removeBookmarkTag(latest.tags, value) : [];

  await castSigned({ kind: BOOKMARK_KIND, tags, content: '' });
  log.info('Bookmark removed', { value });
  return tags;
}
