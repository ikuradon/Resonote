import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock extension module before importing player
vi.mock('./extension.svelte.js', () => ({
  isExtensionMode: () => false,
  sendSeekRequest: vi.fn()
}));

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

  describe('getPlayer', () => {
    it('should return initial state', () => {
      const player = getPlayer();
      expect(player.contentId).toBeNull();
      expect(player.position).toBe(0);
      expect(player.duration).toBe(0);
      expect(player.isPaused).toBe(true);
      expect(player.isPlaying).toBe(false);
    });
  });

  describe('setContent', () => {
    it('should set content ID', () => {
      setContent({ platform: 'spotify', type: 'track', id: 'abc' });
      expect(getPlayer().contentId).toEqual({
        platform: 'spotify',
        type: 'track',
        id: 'abc'
      });
    });
  });

  describe('updatePlayback', () => {
    it('should update position, duration, and isPaused', () => {
      updatePlayback(5000, 180000, false);
      const player = getPlayer();
      expect(player.position).toBe(5000);
      expect(player.duration).toBe(180000);
      expect(player.isPaused).toBe(false);
      expect(player.isPlaying).toBe(true);
    });

    it('should clamp negative position to 0', () => {
      updatePlayback(-100, 180000, false);
      expect(getPlayer().position).toBe(0);
    });

    it('should clamp negative duration to 0', () => {
      updatePlayback(5000, -1, false);
      expect(getPlayer().duration).toBe(0);
    });

    it('should skip update when values are identical', () => {
      updatePlayback(5000, 180000, false);
      // Call again with same values — should be a no-op
      updatePlayback(5000, 180000, false);
      // No way to directly test no-op, but ensures no error
      expect(getPlayer().position).toBe(5000);
    });
  });

  describe('resetPlayer', () => {
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
  });

  describe('requestSeek', () => {
    it('should dispatch resonote:seek CustomEvent', () => {
      // Provide a minimal window.dispatchEvent for Node environment
      const dispatched: Event[] = [];
      const origWindow = globalThis.window;
      globalThis.window = { dispatchEvent: (e: Event) => dispatched.push(e) } as never;
      try {
        requestSeek(30000);
        expect(dispatched).toHaveLength(1);
        const event = dispatched[0] as CustomEvent;
        expect(event.type).toBe('resonote:seek');
        expect(event.detail).toEqual({ positionMs: 30000 });
      } finally {
        globalThis.window = origWindow;
      }
    });
  });
});
