import type { ContentId } from '../content/types.js';
import { isExtensionMode, sendSeekRequest } from './extension.svelte.js';

interface PlayerState {
  contentId: ContentId | null;
  /** Current playback position in milliseconds */
  position: number;
  /** Total duration in milliseconds */
  duration: number;
  isPaused: boolean;
}

let state = $state<PlayerState>({
  contentId: null,
  position: 0,
  duration: 0,
  isPaused: true
});

export function getPlayer() {
  return {
    get contentId() {
      return state.contentId;
    },
    get isPlaying() {
      return !state.isPaused;
    },
    get position() {
      return state.position;
    },
    get duration() {
      return state.duration;
    },
    get isPaused() {
      return state.isPaused;
    }
  };
}

export function setContent(contentId: ContentId): void {
  state.contentId = contentId;
}

export function updatePlayback(position: number, duration: number, isPaused: boolean): void {
  const safePosition = Math.max(0, position);
  const safeDuration = Math.max(0, duration);
  if (
    state.position === safePosition &&
    state.duration === safeDuration &&
    state.isPaused === isPaused
  ) {
    return;
  }
  state.position = safePosition;
  state.duration = safeDuration;
  state.isPaused = isPaused;
}

export function requestSeek(position: number): void {
  if (isExtensionMode()) {
    sendSeekRequest(position);
  }
  window.dispatchEvent(new CustomEvent('resonote:seek', { detail: { position } }));
}
