import { parseContentUrl } from '../../lib/content/registry.js';
import { findAdapter } from './adapters/registry.js';
import type { SiteAdapter } from './adapters/types.js';
import type {
  SiteDetectedMessage,
  PlaybackStateMessage,
  SiteLostMessage
} from '../shared/messages.js';

let currentAdapter: SiteAdapter | null = null;
let currentElement: HTMLVideoElement | HTMLAudioElement | null = null;
let detected = false;

function handleTimeUpdate(): void {
  if (!currentElement) return;
  const msg: PlaybackStateMessage = {
    type: 'resonote:playback-state',
    position: currentElement.currentTime * 1000,
    duration: (currentElement.duration || 0) * 1000,
    isPaused: currentElement.paused
  };
  chrome.runtime.sendMessage(msg);
}

function attachToElement(adapter: SiteAdapter, element: HTMLVideoElement | HTMLAudioElement): void {
  currentElement = element;
  element.addEventListener('timeupdate', handleTimeUpdate);
  element.addEventListener('pause', handleTimeUpdate);
  element.addEventListener('play', handleTimeUpdate);
  adapter.onAttach?.(element);
}

function detach(): void {
  if (currentElement) {
    currentElement.removeEventListener('timeupdate', handleTimeUpdate);
    currentElement.removeEventListener('pause', handleTimeUpdate);
    currentElement.removeEventListener('play', handleTimeUpdate);
    currentAdapter?.onDetach?.(currentElement);
    currentElement = null;
  }
}

function detect(): void {
  const adapter = findAdapter(location.hostname);
  if (!adapter) return;
  currentAdapter = adapter;
  const contentId = parseContentUrl(location.href);
  if (!contentId) return;

  if (!detected) {
    const msg: SiteDetectedMessage = {
      type: 'resonote:site-detected',
      contentId,
      siteUrl: location.href
    };
    chrome.runtime.sendMessage(msg);
    detected = true;
  }

  const element = adapter.findMediaElement();
  if (element && element !== currentElement) {
    detach();
    attachToElement(adapter, element);
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
  if (!currentElement || !document.contains(currentElement)) {
    detach();
    if (detected) {
      const msg: SiteLostMessage = { type: 'resonote:site-lost' };
      chrome.runtime.sendMessage(msg);
      detected = false;
    }
  }
  detect();
});

detect();

observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true
});
