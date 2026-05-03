/**
 * E2E player mocking helpers.
 *
 * Allows tests to simulate playback position for Flow tab testing.
 * Mock player state is injected via window.__mockPlayer and picked up
 * by the actual player bridge in src/shared/browser/player.svelte.ts
 */
import type { Page } from '@playwright/test';

export interface MockPlayerState {
  position: number;
  duration: number;
  isPlaying: boolean;
}

/**
 * Initialize mock player infrastructure on the page.
 * Call this once before using other player mock functions.
 */
export async function initMockPlayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Create global mock player object
    (window as any).__mockPlayer = {
      position: 0,
      duration: 0,
      isPlaying: false
    };

    // Create event target for position updates
    (window as any).__mockPlayerEvents = new EventTarget();
  });
}

/**
 * Simulate playback position for Flow tab testing.
 * @param positionMs Position in milliseconds
 * @param durationMs Optional duration (defaults to 5 minutes)
 */
export async function simulatePlaybackPosition(
  page: Page,
  positionMs: number,
  durationMs = 300000
): Promise<void> {
  await page.evaluate(
    ({ pos, dur }: { pos: number; dur: number }) => {
      const mockPlayer = (window as any).__mockPlayer;
      if (!mockPlayer) {
        throw new Error('Mock player not initialized. Call initMockPlayer first.');
      }

      mockPlayer.position = pos;
      mockPlayer.duration = dur;
      mockPlayer.isPlaying = true;

      // Dispatch event for reactive updates
      const event = new CustomEvent('e2e:player-position', {
        detail: { position: pos, duration: dur }
      });
      (window as any).__mockPlayerEvents?.dispatchEvent(event);

      // Also dispatch on document for broader compatibility
      document.dispatchEvent(
        new CustomEvent('e2e:player-position', {
          detail: { position: pos, duration: dur }
        })
      );
    },
    { pos: positionMs, dur: durationMs }
  );
}

/**
 * Reset mock player to initial state (no position).
 */
export async function resetMockPlayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const mockPlayer = (window as any).__mockPlayer;
    if (mockPlayer) {
      mockPlayer.position = 0;
      mockPlayer.duration = 0;
      mockPlayer.isPlaying = false;
    }

    document.dispatchEvent(
      new CustomEvent('e2e:player-position', {
        detail: { position: 0, duration: 0 }
      })
    );
  });
}

/**
 * Get current mock player state.
 */
export async function getMockPlayerState(page: Page): Promise<MockPlayerState> {
  return page.evaluate(() => {
    const mockPlayer = (window as any).__mockPlayer;
    return {
      position: mockPlayer?.position ?? 0,
      duration: mockPlayer?.duration ?? 0,
      isPlaying: mockPlayer?.isPlaying ?? false
    };
  });
}

/**
 * Simulate player seek to a specific position.
 * Alias for simulatePlaybackPosition for semantic clarity.
 */
export async function simulateSeek(page: Page, positionMs: number): Promise<void> {
  return simulatePlaybackPosition(page, positionMs);
}

/**
 * Simulate play/pause state.
 */
export async function setPlayerPlaying(page: Page, isPlaying: boolean): Promise<void> {
  await page.evaluate((playing: boolean) => {
    const mockPlayer = (window as any).__mockPlayer;
    if (mockPlayer) {
      mockPlayer.isPlaying = playing;
    }
  }, isPlaying);
}
