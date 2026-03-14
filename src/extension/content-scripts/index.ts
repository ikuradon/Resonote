import { parseContentUrl } from '../../lib/content/registry.js';
import { findAdapter } from './adapters/registry.js';
import type { SiteAdapter } from './adapters/types.js';
import type {
  SiteDetectedMessage,
  PlaybackStateMessage,
  SiteLostMessage
} from '../shared/messages.js';

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
  const duration = (currentElement.duration || 0) * 1000;
  const isPaused = currentElement.paused;

  if (position === lastPosition && duration === lastDuration && isPaused === lastPaused) {
    return;
  }
  lastPosition = position;
  lastDuration = duration;
  lastPaused = isPaused;

  const msg: PlaybackStateMessage = {
    type: 'resonote:playback-state',
    position,
    duration,
    isPaused
  };
  chrome.runtime.sendMessage(msg);
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
  if (!currentAdapter) {
    currentAdapter = findAdapter(location.hostname);
  }
  if (!currentAdapter) return;

  if (!detected) {
    const contentId = parseContentUrl(location.href);
    if (!contentId) return;

    chrome.runtime.sendMessage({
      type: 'resonote:site-detected',
      contentId,
      siteUrl: location.href
    } satisfies SiteDetectedMessage);
    detected = true;
  }

  const element = currentAdapter.findMediaElement();
  if (element && element !== currentElement) {
    detach();
    attachToElement(currentAdapter, element);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'resonote:seek' && currentElement && currentAdapter) {
    const seekFn = currentAdapter.seek?.bind(currentAdapter);
    if (seekFn) {
      seekFn(currentElement, message.position);
    } else {
      currentElement.currentTime = message.position / 1000;
    }
  }
});

const observer = new MutationObserver(() => {
  // Check element removal immediately
  if (currentElement && !document.contains(currentElement)) {
    detach();
    if (detected) {
      chrome.runtime.sendMessage({ type: 'resonote:site-lost' } satisfies SiteLostMessage);
      detected = false;
    }
  }
  // Debounce media element search
  if (detectTimer) clearTimeout(detectTimer);
  detectTimer = setTimeout(detect, 200);
});

detect();

observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true
});
