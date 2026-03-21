import { SIDEPANEL_PORT_NAME, RESONOTE_ORIGIN } from '../shared/constants.js';
import {
  onExtensionFrameMessage,
  postExtensionMode,
  postPlaybackUpdate
} from '$shared/browser/extension-message-bridge.js';

const frame = document.getElementById('resonote-frame') as HTMLIFrameElement;
const loading = document.getElementById('loading') as HTMLDivElement;

let currentPath = '/';

const port = chrome.runtime.connect({ name: SIDEPANEL_PORT_NAME });

function navigateToContent(path: string): void {
  currentPath = path;
  frame.src = `${RESONOTE_ORIGIN}${path}`;
  frame.style.display = 'block';
  loading.style.display = 'none';
}

frame.addEventListener('load', () => {
  if (frame.contentWindow) {
    postExtensionMode(frame.contentWindow, RESONOTE_ORIGIN);
  }
});

port.onMessage.addListener((message) => {
  switch (message.type) {
    case 'resonote:site-detected': {
      const { contentId } = message;
      const path = `/${contentId.platform}/${contentId.type}/${contentId.id}`;
      if (path !== currentPath) {
        navigateToContent(path);
      }
      break;
    }

    case 'resonote:playback-state': {
      if (frame.contentWindow) {
        postPlaybackUpdate(
          frame.contentWindow,
          RESONOTE_ORIGIN,
          message.position,
          message.duration,
          message.isPaused
        );
      }
      break;
    }

    case 'resonote:site-lost': {
      frame.style.display = 'none';
      loading.textContent = 'Navigate to a supported site to start';
      loading.style.display = 'flex';
      currentPath = '/';
      break;
    }
  }
});

onExtensionFrameMessage(
  (message) => {
    if (message.type === 'resonote:seek-request') {
      chrome.runtime
        .sendMessage({
          type: 'resonote:seek',
          position: message.position
        })
        .catch(() => {});
    }
  },
  { acceptOrigin: (origin) => origin === RESONOTE_ORIGIN }
);
