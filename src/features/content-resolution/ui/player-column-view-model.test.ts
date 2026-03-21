import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isExtensionModeMock, detectExtensionMock, requestOpenContentMock } = vi.hoisted(() => ({
  isExtensionModeMock: vi.fn(() => false),
  detectExtensionMock: vi.fn(() => false),
  requestOpenContentMock: vi.fn()
}));

vi.mock('$shared/browser/extension.js', () => ({
  detectExtension: detectExtensionMock,
  isExtensionMode: isExtensionModeMock,
  requestOpenContent: requestOpenContentMock
}));

vi.mock('./embed-component-loader.js', () => ({
  getEmbedComponentLoader: vi.fn((platform: string) => {
    const loaders: Record<string, () => Promise<unknown>> = {
      spotify: async () => ({ default: {} }),
      youtube: async () => ({ default: {} })
    };
    return loaders[platform] ?? null;
  })
}));

vi.mock('./player-surface.js', () => ({
  resolvePlayerSurface: vi.fn(
    (opts: {
      contentId: { platform: string; type: string };
      requiresExtension: boolean;
      extensionMode: boolean;
      extensionAvailable: boolean;
    }) => {
      if (opts.contentId.platform === 'spotify' && !opts.requiresExtension) {
        return { kind: 'embed' };
      }
      if (opts.requiresExtension && !opts.extensionMode) {
        return { kind: opts.extensionAvailable ? 'open-extension' : 'install-extension' };
      }
      return { kind: 'none' };
    }
  )
}));

import { createPlayerColumnViewModel } from './player-column-view-model.svelte.js';

const spotifyContentId = { platform: 'spotify', type: 'track', id: 'track-1' };
const spotifyProvider = {
  platform: 'spotify',
  displayName: 'Spotify',
  requiresExtension: false,
  parseUrl: () => null,
  toNostrTag: (): [string, string] => ['spotify:track:track-1', ''],
  contentKind: () => 'spotify:track',
  embedUrl: () => null,
  openUrl: () => 'https://open.spotify.com/track/track-1'
};

const extensionProvider = {
  platform: 'netflix',
  displayName: 'Netflix',
  requiresExtension: true,
  parseUrl: () => null,
  toNostrTag: (): [string, string] => ['netflix:movie:movie-1', ''],
  contentKind: () => 'netflix:movie',
  embedUrl: () => null,
  openUrl: () => 'https://www.netflix.com/watch/movie-1'
};

describe('createPlayerColumnViewModel', () => {
  beforeEach(() => {
    requestOpenContentMock.mockReset();
    isExtensionModeMock.mockReturnValue(false);
    detectExtensionMock.mockReturnValue(false);
  });

  describe('surfaceKind', () => {
    it('returns embed for spotify', () => {
      const vm = createPlayerColumnViewModel({
        getContentId: () => spotifyContentId,
        getProvider: () => spotifyProvider
      });
      expect(vm.surfaceKind).toBe('embed');
    });

    it('returns none when no provider', () => {
      const vm = createPlayerColumnViewModel({
        getContentId: () => spotifyContentId,
        getProvider: () => undefined
      });
      expect(vm.surfaceKind).toBe('none');
    });

    it('returns install-extension when extension required but not available', () => {
      detectExtensionMock.mockReturnValue(false);
      isExtensionModeMock.mockReturnValue(false);
      const netflixContentId = { platform: 'netflix', type: 'movie', id: 'movie-1' };
      const vm = createPlayerColumnViewModel({
        getContentId: () => netflixContentId,
        getProvider: () => extensionProvider
      });
      expect(vm.surfaceKind).toBe('install-extension');
    });

    it('returns open-extension when extension required and available', () => {
      detectExtensionMock.mockReturnValue(true);
      isExtensionModeMock.mockReturnValue(false);
      const netflixContentId = { platform: 'netflix', type: 'movie', id: 'movie-1' };
      const vm = createPlayerColumnViewModel({
        getContentId: () => netflixContentId,
        getProvider: () => extensionProvider
      });
      expect(vm.surfaceKind).toBe('open-extension');
    });
  });

  describe('openUrl', () => {
    it('returns openUrl from provider', () => {
      const vm = createPlayerColumnViewModel({
        getContentId: () => spotifyContentId,
        getProvider: () => spotifyProvider
      });
      expect(vm.openUrl).toBe('https://open.spotify.com/track/track-1');
    });

    it('returns undefined when no provider', () => {
      const vm = createPlayerColumnViewModel({
        getContentId: () => spotifyContentId,
        getProvider: () => undefined
      });
      expect(vm.openUrl).toBeUndefined();
    });
  });

  describe('embedLoader', () => {
    it('returns loader for embed surface', () => {
      const vm = createPlayerColumnViewModel({
        getContentId: () => spotifyContentId,
        getProvider: () => spotifyProvider
      });
      expect(vm.embedLoader).not.toBeNull();
    });

    it('returns null for non-embed surface', () => {
      isExtensionModeMock.mockReturnValue(false);
      detectExtensionMock.mockReturnValue(false);
      const netflixContentId = { platform: 'netflix', type: 'movie', id: 'movie-1' };
      const vm = createPlayerColumnViewModel({
        getContentId: () => netflixContentId,
        getProvider: () => extensionProvider
      });
      expect(vm.embedLoader).toBeNull();
    });
  });

  describe('requestOpen', () => {
    it('calls requestOpenContent with contentId and openUrl', () => {
      const vm = createPlayerColumnViewModel({
        getContentId: () => spotifyContentId,
        getProvider: () => spotifyProvider
      });
      vm.requestOpen();
      expect(requestOpenContentMock).toHaveBeenCalledWith(
        spotifyContentId,
        'https://open.spotify.com/track/track-1'
      );
    });

    it('does nothing when openUrl is undefined', () => {
      const noUrlProvider = {
        ...spotifyProvider,
        openUrl: () => undefined as unknown as string
      };
      const vm = createPlayerColumnViewModel({
        getContentId: () => spotifyContentId,
        getProvider: () => noUrlProvider
      });
      vm.requestOpen();
      expect(requestOpenContentMock).not.toHaveBeenCalled();
    });
  });
});
