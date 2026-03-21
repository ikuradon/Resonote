import { detectExtension, isExtensionMode, requestOpenContent } from '$shared/browser/extension.js';
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { getEmbedComponentLoader } from './embed-component-loader.js';
import { resolvePlayerSurface } from './player-surface.js';

interface PlayerColumnViewModelOptions {
  getContentId: () => ContentId;
  getProvider: () => ContentProvider | undefined;
}

export function createPlayerColumnViewModel(options: PlayerColumnViewModelOptions) {
  let openUrl = $derived(options.getProvider()?.openUrl(options.getContentId()) ?? undefined);
  let surface = $derived.by(() =>
    options.getProvider()
      ? resolvePlayerSurface({
          contentId: options.getContentId(),
          requiresExtension: options.getProvider()!.requiresExtension,
          extensionMode: isExtensionMode(),
          extensionAvailable: detectExtension()
        })
      : { kind: 'none' as const }
  );

  let embedLoader = $derived.by(() => {
    if (surface.kind !== 'embed') return null;
    return getEmbedComponentLoader(options.getContentId().platform);
  });

  function requestOpen(): void {
    if (!openUrl) return;
    requestOpenContent(options.getContentId(), openUrl);
  }

  return {
    get surfaceKind() {
      return surface.kind;
    },
    get embedLoader() {
      return embedLoader;
    },
    get openUrl() {
      return openUrl;
    },
    requestOpen
  };
}
