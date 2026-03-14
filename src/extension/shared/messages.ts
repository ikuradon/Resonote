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

export type SiteUnsupportedMessage = {
  type: 'resonote:site-unsupported';
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
  | SiteUnsupportedMessage
  | SiteLostMessage
  | SeekMessage
  | OpenContentMessage;
