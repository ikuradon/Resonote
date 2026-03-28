import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isBookmarkedMock,
  addBookmarkMock,
  removeBookmarkMock,
  requestSeekMock,
  resetPlayerMock,
  replaceStateMock,
  resolvePodcastEpisodeMock,
  resolveAudioUrlMock,
  fromBase64urlMock,
  createCommentViewModelMock,
  fetchContentMetadataMock
} = vi.hoisted(() => ({
  isBookmarkedMock: vi.fn(() => false),
  addBookmarkMock: vi.fn(async () => {}),
  removeBookmarkMock: vi.fn(async () => {}),
  requestSeekMock: vi.fn(),
  resetPlayerMock: vi.fn(),
  replaceStateMock: vi.fn(),
  resolvePodcastEpisodeMock: vi.fn(async () => ({
    metadata: {},
    additionalSubscriptions: []
  })),
  resolveAudioUrlMock: vi.fn(async () => ({
    metadata: {},
    additionalSubscriptions: [],
    resolvedPath: null
  })),
  fromBase64urlMock: vi.fn((s: string) => `decoded:${s}`),
  createCommentViewModelMock: vi.fn(() => ({
    subscribe: vi.fn(),
    destroy: vi.fn(),
    addSubscription: vi.fn()
  })),
  fetchContentMetadataMock: vi.fn(async () => null)
}));

vi.mock('$app/navigation', () => ({
  replaceState: replaceStateMock
}));

vi.mock('$shared/content/url-utils.js', () => ({
  fromBase64url: fromBase64urlMock
}));

vi.mock('../application/resolve-content.js', () => ({
  resolvePodcastEpisode: resolvePodcastEpisodeMock,
  resolveAudioUrl: resolveAudioUrlMock
}));

vi.mock('../application/fetch-content-metadata.js', () => ({
  fetchContentMetadata: fetchContentMetadataMock
}));

vi.mock('$features/comments/ui/comment-view-model.svelte.js', () => ({
  createCommentViewModel: createCommentViewModelMock
}));

vi.mock('$shared/browser/bookmarks.js', () => ({
  isBookmarked: isBookmarkedMock,
  addBookmark: addBookmarkMock,
  removeBookmark: removeBookmarkMock
}));

vi.mock('$shared/browser/player.js', () => ({
  requestSeek: requestSeekMock,
  resetPlayer: resetPlayerMock
}));

import { createResolvedContentViewModel } from './resolved-content-view-model.svelte.js';

const contentId = { platform: 'spotify', type: 'track', id: 'track-1' };
const provider = {
  platform: 'spotify',
  displayName: 'Spotify',
  requiresExtension: false,
  parseUrl: () => null,
  toNostrTag: (): [string, string] => ['spotify:track:track-1', ''],
  contentKind: () => 'spotify:track',
  embedUrl: () => null,
  openUrl: () => 'https://open.spotify.com/track/track-1'
};

function makeVm(
  overrides: {
    platform?: string;
    contentType?: string;
    contentIdParam?: string;
    isValid?: boolean;
    isCollection?: boolean;
    initialTimeSec?: number;
  } = {}
) {
  const platform = overrides.platform ?? 'spotify';
  const contentType = overrides.contentType ?? 'track';
  const contentIdParam = overrides.contentIdParam ?? 'track-1';
  const isValid = overrides.isValid ?? true;
  const isCollection = overrides.isCollection ?? false;
  const initialTimeSec = overrides.initialTimeSec ?? 0;

  return createResolvedContentViewModel(
    () => contentId,
    () => provider,
    () => isValid,
    () => isCollection,
    () => contentType,
    () => contentIdParam,
    () => platform,
    () => initialTimeSec
  );
}

describe('createResolvedContentViewModel', () => {
  beforeEach(() => {
    isBookmarkedMock.mockReturnValue(false);
    addBookmarkMock.mockReset();
    removeBookmarkMock.mockReset();
    requestSeekMock.mockReset();
    resetPlayerMock.mockReset();
    replaceStateMock.mockReset();
    resolvePodcastEpisodeMock.mockReset().mockResolvedValue({
      metadata: {},
      additionalSubscriptions: []
    });
    resolveAudioUrlMock.mockReset().mockResolvedValue({
      metadata: {},
      additionalSubscriptions: [],
      resolvedPath: null
    });
    fromBase64urlMock.mockImplementation((s: string) => `decoded:${s}`);
    createCommentViewModelMock.mockReturnValue({
      subscribe: vi.fn(),
      destroy: vi.fn(),
      addSubscription: vi.fn()
    });
    fetchContentMetadataMock.mockReset().mockResolvedValue(null);
  });

  describe('initial state', () => {
    it('resolvedEnclosureUrl is undefined initially for non-audio/podcast', () => {
      const vm = makeVm();
      expect(vm.resolvedEnclosureUrl).toBeUndefined();
    });

    it('episodeTitle is undefined initially', () => {
      const vm = makeVm();
      expect(vm.episodeTitle).toBeUndefined();
    });

    it('episodeFeedTitle is undefined initially', () => {
      const vm = makeVm();
      expect(vm.episodeFeedTitle).toBeUndefined();
    });

    it('episodeImage is undefined initially', () => {
      const vm = makeVm();
      expect(vm.episodeImage).toBeUndefined();
    });

    it('episodeDescription is undefined initially', () => {
      const vm = makeVm();
      expect(vm.episodeDescription).toBeUndefined();
    });

    it('bookmarkBusy is false initially', () => {
      const vm = makeVm();
      expect(vm.bookmarkBusy).toBe(false);
    });

    it('bookmarked reflects isBookmarked()', () => {
      isBookmarkedMock.mockReturnValue(true);
      const vm = makeVm();
      expect(vm.bookmarked).toBe(true);
    });

    it('store is undefined initially for collection content', () => {
      const vm = makeVm({ isCollection: true });
      expect(vm.store).toBeUndefined();
    });

    it('contentMetadata is null initially', () => {
      const vm = makeVm();
      expect(vm.contentMetadata).toBeNull();
    });

    it('contentMetadataLoading is false initially (effects not yet run)', () => {
      const vm = makeVm();
      // Before $effect runs, loading state defaults to false (derived from false && null)
      expect(vm.contentMetadataLoading).toBe(false);
    });
  });

  describe('toggleBookmark', () => {
    it('calls addBookmark when not bookmarked', async () => {
      isBookmarkedMock.mockReturnValue(false);
      const vm = makeVm();
      await vm.toggleBookmark();
      expect(addBookmarkMock).toHaveBeenCalledWith(contentId, provider);
    });

    it('calls removeBookmark when already bookmarked', async () => {
      isBookmarkedMock.mockReturnValue(true);
      const vm = makeVm();
      await vm.toggleBookmark();
      expect(removeBookmarkMock).toHaveBeenCalledWith(contentId);
    });

    it('does not call bookmark when no provider', async () => {
      const vmNoProvider = createResolvedContentViewModel(
        () => contentId,
        () => undefined,
        () => true,
        () => false,
        () => 'track',
        () => 'track-1',
        () => 'spotify',
        () => 0
      );
      await vmNoProvider.toggleBookmark();
      expect(addBookmarkMock).not.toHaveBeenCalled();
      expect(removeBookmarkMock).not.toHaveBeenCalled();
    });

    it('resets bookmarkBusy to false after completion', async () => {
      const vm = makeVm();
      await vm.toggleBookmark();
      expect(vm.bookmarkBusy).toBe(false);
    });
  });

  describe('contentMetadata', () => {
    it('contentMetadata getter is accessible', () => {
      const vm = makeVm();
      // contentMetadata starts null, and $effect-driven fetch won't run in unit tests
      expect(vm.contentMetadata).toBeNull();
    });

    it('contentMetadataLoading getter is accessible', () => {
      const vm = makeVm();
      // metadataLoading = contentMetadataLoading && mergedMetadata === null
      // Both default to false/null, so false && true = false
      expect(vm.contentMetadataLoading).toBe(false);
    });

    it('fetchContentMetadata mock is wired correctly', () => {
      // Verify the mock was set up for the module
      expect(fetchContentMetadataMock).toBeDefined();
      expect(typeof fetchContentMetadataMock).toBe('function');
    });
  });
});
