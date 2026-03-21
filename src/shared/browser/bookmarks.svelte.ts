import type { ContentId } from '$shared/content/types.js';
import { contentIdToString } from '$shared/content/types.js';
import type { BookmarkEntry } from '$features/bookmarks/domain/bookmark-model.js';
import { parseBookmarkTags } from '$features/bookmarks/domain/bookmark-model.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';
import { getAuth } from './auth.svelte.js';

const log = createLogger('bookmarks');

interface BookmarksState {
  entries: BookmarkEntry[];
  loading: boolean;
  loaded: boolean;
}

let state = $state<BookmarksState>({ entries: [], loading: false, loaded: false });
let generation = 0;

export function getBookmarks() {
  return {
    get entries() {
      return state.entries;
    },
    get loading() {
      return state.loading;
    },
    get loaded() {
      return state.loaded;
    }
  };
}

export function isBookmarked(contentId: ContentId): boolean {
  const value = contentIdToString(contentId);
  return state.entries.some((e) => e.type === 'content' && e.value === value);
}

export async function loadBookmarks(pubkey: string): Promise<void> {
  const gen = ++generation;
  state.loading = true;
  log.info('Loading bookmarks', { pubkey: shortHex(pubkey) });

  try {
    const { loadBookmarks: load } =
      await import('$features/bookmarks/application/bookmark-actions.js');
    const latest = await load(pubkey);
    if (gen !== generation) return;
    state.entries = latest ? parseBookmarkTags(latest.tags) : [];
    log.info('Bookmarks loaded', { count: state.entries.length });
  } finally {
    if (gen === generation) {
      state.loading = false;
      state.loaded = true;
    }
  }
}

export async function addBookmark(
  contentId: ContentId,
  provider: { openUrl(contentId: ContentId): string }
): Promise<void> {
  const myPubkey = getAuth().pubkey;
  if (!myPubkey) throw new Error('Not logged in');

  const { publishAddBookmark } =
    await import('$features/bookmarks/application/bookmark-actions.js');
  const tags = await publishAddBookmark(contentId, provider.openUrl(contentId), myPubkey);
  state.entries = parseBookmarkTags(tags);
}

export async function removeBookmark(contentId: ContentId): Promise<void> {
  const myPubkey = getAuth().pubkey;
  if (!myPubkey) throw new Error('Not logged in');

  const { publishRemoveBookmark } =
    await import('$features/bookmarks/application/bookmark-actions.js');
  const tags = await publishRemoveBookmark(contentId, myPubkey);
  state.entries = parseBookmarkTags(tags);
}

export function clearBookmarks(): void {
  log.info('Clearing bookmarks');
  ++generation;
  state.entries = [];
  state.loading = false;
  state.loaded = false;
}
