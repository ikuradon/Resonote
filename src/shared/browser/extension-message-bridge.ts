import {
  isExtensionFrameMessage,
  isExtensionRuntimeOrigin,
  type ExtensionFrameMessage
} from '$features/extension-bridge/domain/bridge-events.js';

interface PostMessageTarget {
  postMessage(message: ExtensionFrameMessage, targetOrigin: string): void;
}

export interface ExtensionFrameListenerOptions {
  acceptOrigin?: (origin: string) => boolean;
}

export function onExtensionFrameMessage(
  callback: (message: ExtensionFrameMessage, origin: string) => void,
  options: ExtensionFrameListenerOptions = {}
): () => void {
  function handler(event: MessageEvent): void {
    if (options.acceptOrigin && !options.acceptOrigin(event.origin)) return;
    if (!isExtensionFrameMessage(event.data)) return;
    callback(event.data, event.origin);
  }

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export function postExtensionFrameMessage(
  target: PostMessageTarget,
  targetOrigin: string,
  message: ExtensionFrameMessage
): void {
  target.postMessage(message, targetOrigin);
}

export function postExtensionMode(target: PostMessageTarget, targetOrigin: string): void {
  postExtensionFrameMessage(target, targetOrigin, { type: 'resonote:extension-mode' });
}

export function postPlaybackUpdate(
  target: PostMessageTarget,
  targetOrigin: string,
  position: number,
  duration: number,
  isPaused: boolean
): void {
  postExtensionFrameMessage(target, targetOrigin, {
    type: 'resonote:update-playback',
    position,
    duration,
    isPaused
  });
}

export function postSeekRequest(
  target: PostMessageTarget,
  targetOrigin: string,
  position: number
): void {
  postExtensionFrameMessage(target, targetOrigin, {
    type: 'resonote:seek-request',
    position
  });
}

export { isExtensionRuntimeOrigin };
