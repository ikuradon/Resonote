import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchSeek, onSeek, SEEK_EVENT } from './seek-bridge.js';

const originalWindow = globalThis.window;

function setupFakeWindow() {
  const listeners = new Map<string, Set<EventListener>>();
  const dispatchedEvents: CustomEvent[] = [];

  const windowStub = {
    addEventListener: vi.fn((type: string, handler: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: EventListener) => {
      listeners.get(type)?.delete(handler);
    }),
    dispatchEvent: vi.fn((e: Event) => {
      dispatchedEvents.push(e as CustomEvent);
      const handlers = listeners.get(e.type);
      if (handlers) {
        for (const h of handlers) h(e);
      }
      return true;
    })
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: windowStub
  });

  return {
    dispatchedEvents,
    listeners
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: originalWindow
  });
});

describe('SEEK_EVENT', () => {
  it('has the value resonote:seek', () => {
    expect(SEEK_EVENT).toBe('resonote:seek');
  });
});

describe('dispatchSeek', () => {
  beforeEach(() => {
    setupFakeWindow();
  });

  it('dispatches a resonote:seek event', () => {
    dispatchSeek(3000);
    expect(window.dispatchEvent).toHaveBeenCalledOnce();
    const event = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as CustomEvent;
    expect(event.type).toBe('resonote:seek');
  });

  it('includes positionMs in the event detail', () => {
    dispatchSeek(12345);
    const event = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ positionMs: 12345 });
  });

  it('works with positionMs = 0', () => {
    dispatchSeek(0);
    const event = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ positionMs: 0 });
  });
});

describe('onSeek', () => {
  beforeEach(() => {
    setupFakeWindow();
  });

  it('calls callback when a valid seek event is dispatched', () => {
    const callback = vi.fn();
    const cleanup = onSeek(callback);

    window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { positionMs: 7000 } }));
    expect(callback).toHaveBeenCalledWith(7000);

    cleanup();
  });

  it('calls callback with positionMs = 0', () => {
    const callback = vi.fn();
    const cleanup = onSeek(callback);

    window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { positionMs: 0 } }));
    expect(callback).toHaveBeenCalledWith(0);

    cleanup();
  });

  it('does not call callback for negative positionMs', () => {
    const callback = vi.fn();
    const cleanup = onSeek(callback);

    window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { positionMs: -1 } }));
    expect(callback).not.toHaveBeenCalled();

    cleanup();
  });

  it('does not call callback when detail is null', () => {
    const callback = vi.fn();
    const cleanup = onSeek(callback);

    window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: null }));
    expect(callback).not.toHaveBeenCalled();

    cleanup();
  });

  it('does not call callback when positionMs is a string', () => {
    const callback = vi.fn();
    const cleanup = onSeek(callback);

    window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { positionMs: '5000' } }));
    expect(callback).not.toHaveBeenCalled();

    cleanup();
  });

  it('cleanup removes the event listener', () => {
    const callback = vi.fn();
    const cleanup = onSeek(callback);

    cleanup();

    window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { positionMs: 1000 } }));
    expect(callback).not.toHaveBeenCalled();
  });

  it('multiple callbacks can be registered independently', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cleanup1 = onSeek(cb1);
    const cleanup2 = onSeek(cb2);

    window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { positionMs: 500 } }));
    expect(cb1).toHaveBeenCalledWith(500);
    expect(cb2).toHaveBeenCalledWith(500);

    cleanup1();
    cleanup2();
  });

  it('cleanup of one callback does not affect others', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cleanup1 = onSeek(cb1);
    const cleanup2 = onSeek(cb2);

    cleanup1();

    window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { positionMs: 999 } }));
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith(999);

    cleanup2();
  });
});
