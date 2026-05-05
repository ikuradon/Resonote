import type { Page } from '@playwright/test';

export interface MockPlayerState {
  position: number;
  duration: number;
  isPaused: boolean;
}

async function ensureE2EPlayerBridge(page: Page): Promise<void> {
  await page.evaluate(() => {
    type E2EPlayerState = {
      position: number;
      duration: number;
      isPaused: boolean;
    };
    type E2EPlayerBridge = {
      setPlayback(positionMs: number, durationMs?: number, isPaused?: boolean): void;
      resetPlayback(): void;
      snapshot(): E2EPlayerState;
    };
    const win = window as Window & {
      __resonoteE2EPlayerState?: E2EPlayerState;
      __resonoteE2EPlayer?: E2EPlayerBridge;
    };
    win.__resonoteE2EPlayerState ??= {
      position: 0,
      duration: 0,
      isPaused: true
    };
    win.__resonoteE2EPlayer ??= {
      setPlayback(positionMs, durationMs = 300_000, isPaused = false) {
        const next = {
          position: positionMs,
          duration: durationMs,
          isPaused
        };
        win.__resonoteE2EPlayerState = next;
        window.dispatchEvent(
          new CustomEvent('resonote:e2e-player:set', {
            detail: next
          })
        );
      },
      resetPlayback() {
        this.setPlayback(0, 0, true);
      },
      snapshot() {
        return (
          win.__resonoteE2EPlayerState ?? {
            position: 0,
            duration: 0,
            isPaused: true
          }
        );
      }
    };
  });
}

export async function initMockPlayer(page: Page): Promise<void> {
  await ensureE2EPlayerBridge(page);
}

export async function simulatePlaybackPosition(
  page: Page,
  positionMs: number,
  durationMs = 300_000
): Promise<void> {
  await ensureE2EPlayerBridge(page);
  await page.evaluate(
    ({ positionMs, durationMs }) => {
      (
        window as Window & {
          __resonoteE2EPlayer?: {
            setPlayback(positionMs: number, durationMs?: number, isPaused?: boolean): void;
          };
        }
      ).__resonoteE2EPlayer?.setPlayback(positionMs, durationMs, false);
    },
    { positionMs, durationMs }
  );
}

export async function resetMockPlayer(page: Page): Promise<void> {
  await ensureE2EPlayerBridge(page);
  await page.evaluate(() => {
    (
      window as Window & {
        __resonoteE2EPlayer?: {
          resetPlayback(): void;
        };
      }
    ).__resonoteE2EPlayer?.resetPlayback();
  });
}

export async function getMockPlayerState(page: Page): Promise<MockPlayerState> {
  await ensureE2EPlayerBridge(page);
  return page.evaluate(() => {
    return (
      (
        window as Window & {
          __resonoteE2EPlayer?: {
            snapshot(): MockPlayerState;
          };
        }
      ).__resonoteE2EPlayer?.snapshot() ?? {
        position: 0,
        duration: 0,
        isPaused: true
      }
    );
  });
}

export async function simulateSeek(page: Page, positionMs: number): Promise<void> {
  return simulatePlaybackPosition(page, positionMs);
}

export async function setPlayerPlaying(page: Page, isPlaying: boolean): Promise<void> {
  await ensureE2EPlayerBridge(page);
  await page.evaluate((playing: boolean) => {
    const e2ePlayer = (
      window as Window & {
        __resonoteE2EPlayer?: {
          snapshot(): MockPlayerState;
          setPlayback(positionMs: number, durationMs?: number, isPaused?: boolean): void;
        };
      }
    ).__resonoteE2EPlayer;
    const current = e2ePlayer?.snapshot() ?? {
      position: 0,
      duration: 300_000,
      isPaused: true
    };
    e2ePlayer?.setPlayback(current.position, current.duration, !playing);
  }, isPlaying);
}
