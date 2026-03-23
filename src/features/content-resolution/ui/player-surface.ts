import type { ContentId } from '$shared/content/types.js';
import { getEmbedComponentLoader } from './embed-component-loader.js';

export type PlayerSurfaceKind =
  | 'podcast-feed'
  | 'youtube-feed'
  | 'audio'
  | 'embed'
  | 'install-extension'
  | 'open-extension'
  | 'none';

export interface PlayerSurface {
  kind: PlayerSurfaceKind;
}

export interface ResolvePlayerSurfaceOptions {
  contentId: ContentId;
  requiresExtension: boolean;
  extensionMode: boolean;
  extensionAvailable: boolean;
}

export function resolvePlayerSurface(options: ResolvePlayerSurfaceOptions): PlayerSurface {
  const { contentId, requiresExtension, extensionMode, extensionAvailable } = options;

  if (contentId.platform === 'podcast' && contentId.type === 'feed') {
    return { kind: 'podcast-feed' };
  }

  if (
    contentId.platform === 'youtube' &&
    (contentId.type === 'playlist' || contentId.type === 'channel')
  ) {
    return { kind: 'youtube-feed' };
  }

  if (
    contentId.platform === 'audio' ||
    (contentId.platform === 'podcast' && contentId.type === 'episode')
  ) {
    return { kind: 'audio' };
  }

  if (extensionMode) {
    return { kind: 'none' };
  }

  if (requiresExtension) {
    return { kind: extensionAvailable ? 'open-extension' : 'install-extension' };
  }

  if (getEmbedComponentLoader(contentId.platform)) {
    return { kind: 'embed' };
  }

  return { kind: 'none' };
}
