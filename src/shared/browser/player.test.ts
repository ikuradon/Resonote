import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./extension.svelte.js', () => ({
  isExtensionMode: () => false,
  sendSeekRequest: vi.fn()
}));

import { SEEK_EVENT } from './seek-bridge.js';
import {
  getPlayer,
  setContent,
  updatePlayback,
  resetPlayer,
  requestSeek
} from './player.svelte.js';

describe('player store', () => {
  beforeEach(() => {
    resetPlayer();
  });

  it('should expose the initial state', () => {
    const player = getPlayer();
    expect(player.contentId).toBeNull();
    expect(player.position).toBe(0);
    expect(player.duration).toBe(0);
    expect(player.isPaused).toBe(true);
    expect(player.isPlaying).toBe(false);
  });

  it('should set the content id', () => {
    setContent({ platform: 'spotify', type: 'track', id: 'abc' });
    expect(getPlayer().contentId).toEqual({
      platform: 'spotify',
      type: 'track',
      id: 'abc'
    });
  });

  it('should update position, duration, and play state', () => {
    updatePlayback(5000, 180000, false);
    const player = getPlayer();
    expect(player.position).toBe(5000);
    expect(player.duration).toBe(180000);
    expect(player.isPaused).toBe(false);
    expect(player.isPlaying).toBe(true);
  });

  it('should clamp negative playback values', () => {
    updatePlayback(-100, -1, false);
    const player = getPlayer();
    expect(player.position).toBe(0);
    expect(player.duration).toBe(0);
  });

  it('should allow identical playback updates without changing behavior', () => {
    updatePlayback(5000, 180000, false);
    updatePlayback(5000, 180000, false);
    expect(getPlayer().position).toBe(5000);
  });

  it('should reset all state to defaults', () => {
    setContent({ platform: 'youtube', type: 'video', id: 'xyz' });
    updatePlayback(10000, 300000, false);
    resetPlayer();
    const player = getPlayer();
    expect(player.contentId).toBeNull();
    expect(player.position).toBe(0);
    expect(player.duration).toBe(0);
    expect(player.isPaused).toBe(true);
  });

  it('should dispatch the shared seek event', () => {
    const dispatched: Event[] = [];
    const originalWindow = globalThis.window;
    globalThis.window = { dispatchEvent: (event: Event) => dispatched.push(event) } as never;

    try {
      requestSeek(30000);
      expect(dispatched).toHaveLength(1);
      const event = dispatched[0] as CustomEvent<{ positionMs: number }>;
      expect(event.type).toBe(SEEK_EVENT);
      expect(event.detail).toEqual({ positionMs: 30000 });
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
