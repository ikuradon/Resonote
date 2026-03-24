import { goto } from '$app/navigation';
import type { ContentId } from '$shared/content/types.js';

import {
  isExtensionRuntimeOrigin,
  onExtensionFrameMessage,
  postSeekRequest
} from './extension-message-bridge.js';
import { updatePlayback } from './player.svelte.js';

const EXT_ATTR = 'data-resonote-ext';
const ACTION_ATTR = 'data-resonote-action';

let extensionMode = $state(false);
let sidePanelOrigin: string | null = null;
let extensionListenerCleanup: (() => void) | null = null;

export function isExtensionMode(): boolean {
  return extensionMode;
}

export function detectExtension(): boolean {
  return document.documentElement.hasAttribute(EXT_ATTR);
}

export function initExtensionListener(): void {
  if (extensionListenerCleanup) return;

  extensionListenerCleanup = onExtensionFrameMessage(
    (message, origin) => {
      if (!sidePanelOrigin) {
        sidePanelOrigin = origin;
      }
      if (origin !== sidePanelOrigin) return;

      switch (message.type) {
        case 'resonote:extension-mode':
          extensionMode = true;
          break;
        case 'resonote:update-playback': {
          const { position, duration, isPaused } = message;
          updatePlayback(position, duration, isPaused);
          break;
        }
        case 'resonote:navigate': {
          void goto(message.path);
          break;
        }
        case 'resonote:seek-request':
          // Handled by the side panel, not the web app frame
          break;
      }
    },
    { acceptOrigin: isExtensionRuntimeOrigin }
  );
}

export function sendSeekRequest(position: number): void {
  if (!extensionMode || !sidePanelOrigin) return;
  postSeekRequest(window.parent, sidePanelOrigin, position);
}

export function requestOpenContent(contentId: ContentId, siteUrl: string): void {
  document.documentElement.setAttribute(
    ACTION_ATTR,
    JSON.stringify({
      type: 'resonote:open-content',
      contentId,
      siteUrl
    })
  );
}
