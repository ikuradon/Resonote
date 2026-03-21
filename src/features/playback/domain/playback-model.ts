/**
 * Playback domain types.
 */

export interface PlaybackState {
  /** Current playback position in milliseconds */
  position: number;
  /** Total duration in milliseconds */
  duration: number;
  isPaused: boolean;
}

export const SEEK_EVENT_NAME = 'resonote:seek' as const;
