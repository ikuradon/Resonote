import {
  getPlayer as originalGetPlayer,
  requestSeek as originalRequestSeek,
  resetPlayer as originalResetPlayer,
  setContent as originalSetContent,
  updatePlayback
} from '$shared/browser/player.svelte.js';
import type { ContentId } from '$shared/content/types.js';

interface E2EPlayerState {
  position: number;
  duration: number;
  isPaused: boolean;
}

interface E2EPlayerBridge {
  setPlayback(positionMs: number, durationMs?: number, isPaused?: boolean): void;
  resetPlayback(): void;
  snapshot(): E2EPlayerState;
}

declare global {
  interface Window {
    __resonoteE2EPlayerState?: E2EPlayerState;
    __resonoteE2EPlayer?: E2EPlayerBridge;
  }
}

export { getPlayer, requestSeek, resetPlayer, setContent, updatePlayback };

function getPlayer() {
  return originalGetPlayer();
}

function requestSeek(position: number): void {
  return originalRequestSeek(position);
}

function resetPlayer(): void {
  return originalResetPlayer();
}

function setContent(contentId: ContentId): void {
  return originalSetContent(contentId);
}

function defaultState(): E2EPlayerState {
  return {
    position: 0,
    duration: 0,
    isPaused: true
  };
}

function applyPlaybackState(state: E2EPlayerState): void {
  updatePlayback(state.position, state.duration, state.isPaused);
}

function ensureBridge(): E2EPlayerBridge {
  window.__resonoteE2EPlayerState ??= defaultState();
  if (window.__resonoteE2EPlayer) {
    return window.__resonoteE2EPlayer;
  }
  const bridge: E2EPlayerBridge = {
    setPlayback(positionMs, durationMs = 300_000, isPaused = false) {
      const next = {
        position: positionMs,
        duration: durationMs,
        isPaused
      };
      window.__resonoteE2EPlayerState = next;
      window.dispatchEvent(
        new CustomEvent<E2EPlayerState>('resonote:e2e-player:set', {
          detail: next
        })
      );
    },
    resetPlayback() {
      this.setPlayback(0, 0, true);
    },
    snapshot() {
      return window.__resonoteE2EPlayerState ?? defaultState();
    }
  };
  window.__resonoteE2EPlayer = bridge;
  return bridge;
}

if (typeof window !== 'undefined') {
  console.log('[E2E Shim] Loading player shim');
  const bridge = ensureBridge();
  console.log('[E2E Shim] Initial state:', bridge.snapshot());
  applyPlaybackState(bridge.snapshot());
  window.addEventListener('resonote:e2e-player:set', (event) => {
    const detail = (event as CustomEvent<E2EPlayerState>).detail;
    console.log('[E2E Shim] Received set event:', detail);
    if (!detail) return;
    applyPlaybackState(detail);
  });
}
