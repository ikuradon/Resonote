/**
 * Typed event definitions for communication between
 * the web app, side panel, and browser extension.
 *
 * All message types and custom events are defined here
 * so there is a single source of truth.
 */

/** Custom DOM event dispatched to seek playback position. */
export interface SeekEventDetail {
  positionMs: number;
}

/** Create a typed resonote:seek CustomEvent. */
export function createSeekEvent(positionMs: number): CustomEvent<SeekEventDetail> {
  return new CustomEvent('resonote:seek', { detail: { positionMs } });
}

/** Extract positionMs from a resonote:seek CustomEvent safely. */
export function parseSeekEvent(e: Event): number | null {
  const detail = (e as CustomEvent<SeekEventDetail>).detail;
  return typeof detail?.positionMs === 'number' ? detail.positionMs : null;
}

/** PostMessage types exchanged between the side panel and iframe. */
export interface ExtensionModeMessage {
  type: 'resonote:extension-mode';
}

export interface UpdatePlaybackMessage {
  type: 'resonote:update-playback';
  position: number;
  duration: number;
  isPaused: boolean;
}

export interface NavigateContentMessage {
  type: 'resonote:navigate';
  path: string;
}

export interface SeekRequestMessage {
  type: 'resonote:seek-request';
  position: number;
}

export type ExtensionFrameMessage =
  | ExtensionModeMessage
  | UpdatePlaybackMessage
  | NavigateContentMessage
  | SeekRequestMessage;

export type PostMessageType = ExtensionFrameMessage['type'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function isExtensionRuntimeOrigin(origin: string): boolean {
  return origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://');
}

export function isExtensionFrameMessage(value: unknown): value is ExtensionFrameMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'resonote:extension-mode':
      return true;
    case 'resonote:update-playback':
      return (
        typeof value.position === 'number' &&
        typeof value.duration === 'number' &&
        typeof value.isPaused === 'boolean'
      );
    case 'resonote:navigate':
      return typeof value.path === 'string' && value.path.startsWith('/');
    case 'resonote:seek-request':
      return typeof value.position === 'number';
    default:
      return false;
  }
}

/** PostMessage types from content script → background. */
export type ExtensionMessageType =
  | 'resonote:site-detected'
  | 'resonote:playback-state'
  | 'resonote:site-lost'
  | 'resonote:seek'
  | 'resonote:open-content';
