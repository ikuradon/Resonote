import type { ContentId } from '$shared/content/types.js';
export type {
  ExtensionModeMessage,
  UpdatePlaybackMessage,
  NavigateContentMessage,
  SeekRequestMessage,
  ExtensionFrameMessage as PostMessage
} from '$features/extension-bridge/domain/bridge-events.js';

export type SiteDetectedMessage = {
  type: 'resonote:site-detected';
  contentId: ContentId;
  siteUrl: string;
};

export type PlaybackStateMessage = {
  type: 'resonote:playback-state';
  position: number;
  duration: number;
  isPaused: boolean;
};

export type SiteLostMessage = {
  type: 'resonote:site-lost';
};

export type SeekMessage = {
  type: 'resonote:seek';
  position: number;
};

export type OpenContentMessage = {
  type: 'resonote:open-content';
  contentId: ContentId;
  siteUrl: string;
};

export type ExtensionMessage =
  | SiteDetectedMessage
  | PlaybackStateMessage
  | SiteLostMessage
  | SeekMessage
  | OpenContentMessage;
