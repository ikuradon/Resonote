const RESONOTE_ORIGIN = 'https://resonote.pages.dev';
const frame = document.getElementById('resonote-frame') as HTMLIFrameElement;
const loading = document.getElementById('loading') as HTMLDivElement;

let currentPath = '/';

const port = chrome.runtime.connect({ name: 'resonote-sidepanel' });

function navigateToContent(path: string): void {
  currentPath = path;
  frame.src = `${RESONOTE_ORIGIN}${path}`;
  frame.style.display = 'block';
  loading.style.display = 'none';
}

frame.addEventListener('load', () => {
  frame.contentWindow?.postMessage({ type: 'resonote:extension-mode' }, RESONOTE_ORIGIN);
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
      frame.contentWindow?.postMessage(
        {
          type: 'resonote:update-playback',
          position: message.position,
          duration: message.duration,
          isPaused: message.isPaused
        },
        RESONOTE_ORIGIN
      );
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

window.addEventListener('message', (event) => {
  if (event.origin !== RESONOTE_ORIGIN) return;

  if (event.data?.type === 'resonote:seek-request') {
    chrome.runtime.sendMessage({
      type: 'resonote:seek',
      position: event.data.position
    });
  }
});
