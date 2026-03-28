// @public — Stable API for route/component/feature consumers
/**
 * Typed playback toggle bridge — centralizes the resonote:toggle-playback custom event.
 * Components import from here instead of using raw window.addEventListener/dispatchEvent.
 */

export const TOGGLE_PLAYBACK_EVENT = 'resonote:toggle-playback' as const;

/** Dispatch a toggle-playback event. */
export function dispatchTogglePlayback(): void {
  window.dispatchEvent(new CustomEvent(TOGGLE_PLAYBACK_EVENT));
}

/** Subscribe to toggle-playback events. Returns cleanup function. */
export function onTogglePlayback(callback: () => void): () => void {
  function handler() {
    callback();
  }
  window.addEventListener(TOGGLE_PLAYBACK_EVENT, handler);
  return () => window.removeEventListener(TOGGLE_PLAYBACK_EVENT, handler);
}
