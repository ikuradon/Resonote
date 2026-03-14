import { updatePlayback } from './player.svelte.js';
import { goto } from '$app/navigation';
import type { ContentId } from '$lib/content/types.js';

const EXT_ATTR = 'data-resonote-ext';
const ACTION_ATTR = 'data-resonote-action';

let extensionMode = $state(false);

let sidePanelOrigin: string | null = null;

function isExtensionOrigin(origin: string): boolean {
  return origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://');
}

export function isExtensionMode(): boolean {
  return extensionMode;
}

export function detectExtension(): boolean {
  return document.documentElement.hasAttribute(EXT_ATTR);
}

export function initExtensionListener(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (!isExtensionOrigin(event.origin)) return;

    if (!sidePanelOrigin) {
      sidePanelOrigin = event.origin;
    }
    if (event.origin !== sidePanelOrigin) return;

    switch (event.data?.type) {
      case 'resonote:extension-mode':
        extensionMode = true;
        break;
      case 'resonote:update-playback': {
        const { position, duration, isPaused } = event.data;
        if (
          typeof position === 'number' &&
          typeof duration === 'number' &&
          typeof isPaused === 'boolean'
        ) {
          updatePlayback(position, duration, isPaused);
        }
        break;
      }
      case 'resonote:navigate': {
        const path = event.data.path;
        if (typeof path === 'string' && path.startsWith('/')) {
          goto(path);
        }
        break;
      }
    }
  });
}

export function sendSeekRequest(position: number): void {
  if (!extensionMode || !sidePanelOrigin) return;
  window.parent.postMessage({ type: 'resonote:seek-request', position }, sidePanelOrigin);
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
