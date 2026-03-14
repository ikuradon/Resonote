import type { ContentId } from '../../lib/content/types.js';

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

// Side Panel ↔ iframe (Resonote Web) via postMessage
export type ExtensionModeMessage = {
  type: 'resonote:extension-mode';
};

export type UpdatePlaybackMessage = {
  type: 'resonote:update-playback';
  position: number;
  duration: number;
  isPaused: boolean;
};

export type NavigateContentMessage = {
  type: 'resonote:navigate';
  path: string;
};

export type SeekRequestMessage = {
  type: 'resonote:seek-request';
  position: number;
};

export type PostMessage =
  | ExtensionModeMessage
  | UpdatePlaybackMessage
  | NavigateContentMessage
  | SeekRequestMessage;
