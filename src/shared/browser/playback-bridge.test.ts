import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// window を EventTarget ベースの stub に差し替える
let fakeWindow: EventTarget & {
  addEventListener: EventTarget['addEventListener'];
  removeEventListener: EventTarget['removeEventListener'];
  dispatchEvent: EventTarget['dispatchEvent'];
};

beforeEach(() => {
  vi.resetModules();
  fakeWindow = new EventTarget();
  vi.stubGlobal('window', fakeWindow);
});

describe('playback-bridge', () => {
  describe('TOGGLE_PLAYBACK_EVENT', () => {
    it('should be "resonote:toggle-playback"', async () => {
      const { TOGGLE_PLAYBACK_EVENT } = await import('./playback-bridge.js');
      expect(TOGGLE_PLAYBACK_EVENT).toBe('resonote:toggle-playback');
    });
  });

  describe('dispatchTogglePlayback', () => {
    it('should dispatch a CustomEvent on window', async () => {
      const { dispatchTogglePlayback, TOGGLE_PLAYBACK_EVENT } =
        await import('./playback-bridge.js');
      const spy = vi.fn();
      fakeWindow.addEventListener(TOGGLE_PLAYBACK_EVENT, spy);

      dispatchTogglePlayback();

      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    });
  });

  describe('onTogglePlayback', () => {
    let cleanup: (() => void) | undefined;

    afterEach(() => {
      cleanup?.();
      cleanup = undefined;
    });

    it('should invoke callback when toggle-playback event is dispatched', async () => {
      const { dispatchTogglePlayback, onTogglePlayback } = await import('./playback-bridge.js');
      const callback = vi.fn();
      cleanup = onTogglePlayback(callback);

      dispatchTogglePlayback();

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should invoke callback multiple times for multiple dispatches', async () => {
      const { dispatchTogglePlayback, onTogglePlayback } = await import('./playback-bridge.js');
      const callback = vi.fn();
      cleanup = onTogglePlayback(callback);

      dispatchTogglePlayback();
      dispatchTogglePlayback();
      dispatchTogglePlayback();

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should return a cleanup function that removes the listener', async () => {
      const { dispatchTogglePlayback, onTogglePlayback } = await import('./playback-bridge.js');
      const callback = vi.fn();
      cleanup = onTogglePlayback(callback);

      cleanup();
      cleanup = undefined;

      dispatchTogglePlayback();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not interfere with other listeners', async () => {
      const { dispatchTogglePlayback, onTogglePlayback } = await import('./playback-bridge.js');
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const cleanup1 = onTogglePlayback(callback1);
      cleanup = onTogglePlayback(callback2);

      cleanup1();

      dispatchTogglePlayback();

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledOnce();
    });
  });
});
