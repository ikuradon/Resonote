// @public — Stable API for route/component/feature consumers
/**
 * Typed seek bridge — centralizes the resonote:seek custom event.
 * Components import from here instead of using raw window.addEventListener/dispatchEvent.
 */

export const SEEK_EVENT = 'resonote:seek' as const;

export interface SeekDetail {
  positionMs: number;
}

/** Dispatch a typed seek event. */
export function dispatchSeek(positionMs: number): void {
  window.dispatchEvent(new CustomEvent<SeekDetail>(SEEK_EVENT, { detail: { positionMs } }));
}

/** Subscribe to seek events. Returns cleanup function. */
export function onSeek(callback: (positionMs: number) => void): () => void {
  function handler(e: Event) {
    const detail = (e as CustomEvent<SeekDetail>).detail;
    if (typeof detail?.positionMs === 'number' && detail.positionMs >= 0) {
      callback(detail.positionMs);
    }
  }
  window.addEventListener(SEEK_EVENT, handler);
  return () => window.removeEventListener(SEEK_EVENT, handler);
}
