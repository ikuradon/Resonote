import type { ContentId } from '$shared/content/types.js';
export type {
  ExtensionModeMessage,
  NavigateContentMessage,
  ExtensionFrameMessage as PostMessage,
  SeekRequestMessage,
  UpdatePlaybackMessage
} from '$features/extension-bridge/domain/bridge-events.js';

export interface SiteDetectedMessage {
  type: 'resonote:site-detected';
  contentId: ContentId;
  siteUrl: string;
}

export interface PlaybackStateMessage {
  type: 'resonote:playback-state';
  position: number;
  duration: number;
  isPaused: boolean;
}

export interface SiteLostMessage {
  type: 'resonote:site-lost';
}

export interface SeekMessage {
  type: 'resonote:seek';
  position: number;
}

export interface OpenContentMessage {
  type: 'resonote:open-content';
  contentId: ContentId;
  siteUrl: string;
}

export type ExtensionMessage =
  | SiteDetectedMessage
  | PlaybackStateMessage
  | SiteLostMessage
  | SeekMessage
  | OpenContentMessage;

const VALID_MESSAGE_TYPES = new Set<ExtensionMessage['type']>([
  'resonote:site-detected',
  'resonote:playback-state',
  'resonote:site-lost',
  'resonote:seek',
  'resonote:open-content'
]);

/** Check if a URL uses a safe scheme (https: or http: only). */
export function isSafeUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Check if a value is a valid ContentId (non-empty platform, type, id strings). */
export function isValidContentId(id: unknown): id is ContentId {
  return (
    typeof id === 'object' &&
    id !== null &&
    typeof (id as ContentId).platform === 'string' &&
    (id as ContentId).platform !== '' &&
    typeof (id as ContentId).type === 'string' &&
    (id as ContentId).type !== '' &&
    typeof (id as ContentId).id === 'string' &&
    (id as ContentId).id !== ''
  );
}

/** Check if a message type is a known ExtensionMessage type. */
export function isKnownMessageType(type: unknown): type is ExtensionMessage['type'] {
  return typeof type === 'string' && VALID_MESSAGE_TYPES.has(type as ExtensionMessage['type']);
}
