/**
 * Resolved content view model.
 * Manages content resolution, bookmark state, player seek, and comment subscription
 * so the route only calls this single facade.
 */

import { untrack } from 'svelte';

import { replaceState } from '$app/navigation';
// eslint-disable-next-line no-restricted-imports -- TODO: extract comment VM creation to a shared interface
import { createCommentViewModel } from '$features/comments/ui/comment-view-model.svelte.js';
import { addBookmark, isBookmarked, removeBookmark } from '$shared/browser/bookmarks.js';
import { requestSeek, resetPlayer } from '$shared/browser/player.js';
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { fromBase64url } from '$shared/content/url-utils.js';

import { resolveAudioUrl, resolvePodcastEpisode } from '../application/resolve-content.js';

type CommentVM = ReturnType<typeof createCommentViewModel>;

export interface ResolvedContentState {
  resolvedEnclosureUrl: string | undefined;
  episodeTitle: string | undefined;
  episodeFeedTitle: string | undefined;
  episodeImage: string | undefined;
  episodeDescription: string | undefined;
  store: CommentVM | undefined;
  bookmarked: boolean;
  bookmarkBusy: boolean;
}

export function createResolvedContentViewModel(
  getContentId: () => ContentId,
  getProvider: () => ContentProvider | undefined,
  getIsValid: () => boolean,
  getIsCollection: () => boolean,
  getContentType: () => string,
  getContentIdParam: () => string,
  getPlatform: () => string,
  getInitialTimeSec: () => number
) {
  // --- State ---
  let resolvedEnclosureUrl = $state<string | undefined>();
  let episodeTitle = $state<string | undefined>();
  let episodeFeedTitle = $state<string | undefined>();
  let episodeImage = $state<string | undefined>();
  let episodeDescription = $state<string | undefined>();
  let store = $state<CommentVM | undefined>();
  let bookmarkBusy = $state(false);
  let seekDispatched = false;

  // --- Player reset on navigation ---
  $effect(() => {
    void getContentId();
    return () => resetPlayer();
  });

  // --- Initial seek from ?t= ---
  $effect(() => {
    const t = getInitialTimeSec();
    if (t > 0 && !seekDispatched) {
      const timer = setTimeout(() => {
        requestSeek(t * 1000);
        seekDispatched = true;
      }, 1500);
      return () => clearTimeout(timer);
    }
  });

  // --- Comments store lifecycle ---
  $effect(() => {
    const provider = getProvider();
    if (!getIsValid() || !provider || getIsCollection() || getContentType() === 'feed') return;
    const s = createCommentViewModel(getContentId(), provider);
    void s.subscribe();
    store = s;
    return () => {
      s.destroy();
      store = undefined;
    };
  });

  // --- Resolution: podcast episode ---
  $effect(() => {
    resolvedEnclosureUrl = undefined;
    episodeTitle = undefined;
    episodeFeedTitle = undefined;
    episodeImage = undefined;
    episodeDescription = undefined;

    const platform = getPlatform();
    const contentIdParam = getContentIdParam();
    const contentType = getContentType();
    const signal = { cancelled: false };

    if (platform === 'audio') {
      resolvedEnclosureUrl = fromBase64url(contentIdParam) ?? undefined;
    } else if (platform === 'podcast' && contentType === 'episode') {
      resolvePodcastEpisode(contentIdParam)
        .then((result) => {
          if (signal.cancelled) return;
          resolvedEnclosureUrl = result.metadata.enclosureUrl;
          episodeTitle = result.metadata.title;
          episodeFeedTitle = result.metadata.feedTitle;
          episodeImage = result.metadata.image;
          episodeDescription = result.metadata.description;
          untrack(() => {
            for (const sub of result.additionalSubscriptions) {
              void store?.addSubscription(sub);
            }
          });
        })
        .catch((err: unknown) => {
          if (signal.cancelled) return;
          console.error('[resolved-content-vm] resolvePodcastEpisode failed:', err);
          resolvedEnclosureUrl = '';
        });
    }

    return () => {
      signal.cancelled = true;
    };
  });

  // --- Resolution: audio URL guid discovery ---
  $effect(() => {
    if (getPlatform() !== 'audio') return;
    const signal = { cancelled: false };

    resolveAudioUrl(getContentIdParam(), signal)
      .then((result) => {
        if (signal.cancelled) return;
        if (result.metadata.title && !episodeTitle) episodeTitle = result.metadata.title;
        if (result.metadata.feedTitle && !episodeFeedTitle)
          episodeFeedTitle = result.metadata.feedTitle;
        if (result.metadata.image && !episodeImage) episodeImage = result.metadata.image;
        if (result.metadata.description && !episodeDescription)
          episodeDescription = result.metadata.description;

        untrack(() => {
          for (const sub of result.additionalSubscriptions) {
            void store?.addSubscription(sub);
          }
          if (result.resolvedPath) {
            replaceState(result.resolvedPath, {});
          }
        });
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        console.error('[resolved-content-vm] resolveAudioUrl failed:', err);
      });

    return () => {
      signal.cancelled = true;
    };
  });

  // --- Bookmark ---
  async function toggleBookmark() {
    const provider = getProvider();
    if (!provider || bookmarkBusy) return;
    bookmarkBusy = true;
    try {
      if (isBookmarked(getContentId())) {
        await removeBookmark(getContentId());
      } else {
        await addBookmark(getContentId(), provider);
      }
    } finally {
      bookmarkBusy = false;
    }
  }

  return {
    get resolvedEnclosureUrl() {
      return resolvedEnclosureUrl;
    },
    get episodeTitle() {
      return episodeTitle;
    },
    get episodeFeedTitle() {
      return episodeFeedTitle;
    },
    get episodeImage() {
      return episodeImage;
    },
    get episodeDescription() {
      return episodeDescription;
    },
    get store() {
      return store;
    },
    get bookmarked() {
      return isBookmarked(getContentId());
    },
    get bookmarkBusy() {
      return bookmarkBusy;
    },
    toggleBookmark
  };
}
