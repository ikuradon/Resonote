/** Bookmark list (NIP-51 kind:10003) store */

import { type ContentId, contentIdToString } from '../content/types.js';
import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('bookmarks');

export interface BookmarkEntry {
  type: 'content' | 'event';
  value: string;
  hint?: string;
}

interface BookmarksState {
  entries: BookmarkEntry[];
  loading: boolean;
}

let state = $state<BookmarksState>({
  entries: [],
  loading: false
});

/** Generation counter to cancel stale loads */
let generation = 0;

export function getBookmarks() {
  return {
    get entries() {
      return state.entries;
    },
    get loading() {
      return state.loading;
    }
  };
}

/** Check if a content ID is bookmarked */
export function isBookmarked(contentId: ContentId): boolean {
  const value = contentIdToString(contentId);
  return state.entries.some((e) => e.type === 'content' && e.value === value);
}

/** Parse kind:10003 event tags into BookmarkEntry[] */
function parseBookmarkTags(tags: string[][]): BookmarkEntry[] {
  const entries: BookmarkEntry[] = [];
  for (const tag of tags) {
    if (tag[0] === 'i' && tag[1]) {
      entries.push({ type: 'content', value: tag[1], hint: tag[2] });
    } else if (tag[0] === 'e' && tag[1]) {
      entries.push({ type: 'event', value: tag[1], hint: tag[2] });
    }
  }
  return entries;
}

/**
 * Load bookmarks for a pubkey (called on login).
 */
export async function loadBookmarks(pubkey: string): Promise<void> {
  const gen = ++generation;
  state.loading = true;

  log.info('Loading bookmarks', { pubkey: shortHex(pubkey) });

  try {
    const { fetchLatestEvent } = await import('../nostr/client.js');
    const latest = await fetchLatestEvent(pubkey, 10003);
    if (gen !== generation) return;

    if (latest) {
      state.entries = parseBookmarkTags(latest.tags);
      log.info('Bookmarks loaded', { count: state.entries.length });
    } else {
      state.entries = [];
      log.info('No bookmarks found');
    }
  } finally {
    if (gen === generation) {
      state.loading = false;
    }
  }
}

/**
 * Add a content bookmark by publishing a new kind:10003 event.
 */
export async function addBookmark(
  contentId: ContentId,
  provider: { openUrl(contentId: ContentId): string }
): Promise<void> {
  const { getAuth } = await import('./auth.svelte.js');
  const myPubkey = getAuth().pubkey;
  if (!myPubkey) throw new Error('Not logged in');

  const { castSigned, fetchLatestEvent } = await import('../nostr/client.js');

  const value = contentIdToString(contentId);
  const hint = provider.openUrl(contentId);

  const latest = await fetchLatestEvent(myPubkey, 10003);

  let tags: string[][];

  if (latest) {
    // Check if already bookmarked
    const alreadyBookmarked = latest.tags.some((tag) => tag[0] === 'i' && tag[1] === value);
    if (alreadyBookmarked) {
      log.info('Already bookmarked', { value });
      return;
    }
    tags = [...latest.tags, ['i', value, hint]];
  } else {
    tags = [['i', value, hint]];
  }

  await castSigned({ kind: 10003, tags, content: '' });
  state.entries = parseBookmarkTags(tags);
  log.info('Bookmark added', { value });
}

/**
 * Remove a content bookmark by publishing a new kind:10003 event.
 */
export async function removeBookmark(contentId: ContentId): Promise<void> {
  const { getAuth } = await import('./auth.svelte.js');
  const myPubkey = getAuth().pubkey;
  if (!myPubkey) throw new Error('Not logged in');

  const { castSigned, fetchLatestEvent } = await import('../nostr/client.js');

  const value = contentIdToString(contentId);

  const latest = await fetchLatestEvent(myPubkey, 10003);

  let tags: string[][];

  if (latest) {
    tags = latest.tags.filter((tag) => !(tag[0] === 'i' && tag[1] === value));
  } else {
    tags = [];
  }

  await castSigned({ kind: 10003, tags, content: '' });
  state.entries = parseBookmarkTags(tags);
  log.info('Bookmark removed', { value });
}

/** Clear bookmarks (called on logout). */
export function clearBookmarks(): void {
  log.info('Clearing bookmarks');
  ++generation;
  state.entries = [];
  state.loading = false;
}
