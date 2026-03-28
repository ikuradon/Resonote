import { parseContentUrl } from '$shared/content/registry.js';

import type {
  PlaybackStateMessage,
  SiteDetectedMessage,
  SiteLostMessage
} from '../shared/messages.js';
import { findAdapter } from './adapters/registry.js';
import type { SiteAdapter } from './adapters/types.js';

const MEDIA_EVENTS = ['timeupdate', 'pause', 'play'] as const;

let currentAdapter: SiteAdapter | null = null;
let currentElement: HTMLVideoElement | HTMLAudioElement | null = null;
let detected = false;
let detectTimer: ReturnType<typeof setTimeout> | null = null;
let lastPosition = -1;
let lastDuration = -1;
let lastPaused = true;

function handleTimeUpdate(): void {
  if (!currentElement) return;
  const position = currentElement.currentTime * 1000;
  const rawDuration = currentElement.duration;
  const duration = (Number.isFinite(rawDuration) ? rawDuration : 0) * 1000;
  const isPaused = currentElement.paused;

  const roundedPosition = Math.round(position);
  const roundedDuration = Math.round(duration);

  if (
    roundedPosition === lastPosition &&
    roundedDuration === lastDuration &&
    isPaused === lastPaused
  ) {
    return;
  }
  lastPosition = roundedPosition;
  lastDuration = roundedDuration;
  lastPaused = isPaused;

  const msg: PlaybackStateMessage = {
    type: 'resonote:playback-state',
    position,
    duration,
    isPaused
  };
  chrome.runtime
    .sendMessage(msg)
    .catch((e) => console.warn('[resonote:ext] Message send failed:', e));
}

function attachToElement(adapter: SiteAdapter, element: HTMLVideoElement | HTMLAudioElement): void {
  currentElement = element;
  for (const event of MEDIA_EVENTS) {
    element.addEventListener(event, handleTimeUpdate);
  }
  adapter.onAttach?.(element);
}

function detach(): void {
  if (currentElement) {
    for (const event of MEDIA_EVENTS) {
      currentElement.removeEventListener(event, handleTimeUpdate);
    }
    currentAdapter?.onDetach?.(currentElement);
    currentElement = null;
  }
}

function detect(): void {
  currentAdapter ??= findAdapter(location.hostname);
  if (!currentAdapter) return;

  if (!detected) {
    const contentId = parseContentUrl(location.href);
    if (!contentId) return;

    chrome.runtime
      .sendMessage({
        type: 'resonote:site-detected',
        contentId,
        siteUrl: location.href
      } satisfies SiteDetectedMessage)
      .catch((e) => console.warn('[resonote:ext] Message send failed:', e));
    detected = true;
  }

  const element = currentAdapter.findMediaElement();
  if (element && element !== currentElement) {
    detach();
    attachToElement(currentAdapter, element);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (
    message.type === 'resonote:seek' &&
    typeof message.position === 'number' &&
    Number.isFinite(message.position) &&
    message.position >= 0 &&
    currentElement &&
    currentAdapter
  ) {
    currentAdapter.seek?.(currentElement, message.position);
  }
});

const observer = new MutationObserver(() => {
  // Check element removal immediately
  if (currentElement && !document.contains(currentElement)) {
    detach();
    if (detected) {
      chrome.runtime
        .sendMessage({ type: 'resonote:site-lost' } satisfies SiteLostMessage)
        .catch((e) => console.warn('[resonote:ext] Message send failed:', e));
      detected = false;
      currentAdapter = null;
    }
  }
  // Debounce media element search
  if (detectTimer) clearTimeout(detectTimer);
  detectTimer = setTimeout(detect, 200);
});

detect();

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- document.body can be null in early content script injection
observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true
});
