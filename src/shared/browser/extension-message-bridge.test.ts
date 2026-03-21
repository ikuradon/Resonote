import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isExtensionRuntimeOrigin,
  onExtensionFrameMessage,
  postExtensionMode,
  postPlaybackUpdate,
  postSeekRequest
} from '$shared/browser/extension-message-bridge.js';

const originalWindow = globalThis.window;

function setupFakeWindow() {
  const listeners = new Map<string, EventListener>();
  const windowStub = {
    addEventListener: vi.fn((type: string, handler: EventListener) => {
      listeners.set(type, handler);
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners.delete(type);
    })
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: windowStub
  });

  return {
    dispatchMessage(event: MessageEvent) {
      listeners.get('message')?.(event);
    }
  };
}

describe('extension-message-bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow
    });
  });

  it('should recognize extension runtime origins', () => {
    expect(isExtensionRuntimeOrigin('chrome-extension://abc')).toBe(true);
    expect(isExtensionRuntimeOrigin('moz-extension://abc')).toBe(true);
    expect(isExtensionRuntimeOrigin('https://example.com')).toBe(false);
  });

  it('should post typed frame messages', () => {
    const target = { postMessage: vi.fn() };

    postExtensionMode(target, 'https://app.example');
    postPlaybackUpdate(target, 'https://app.example', 10, 20, false);
    postSeekRequest(target, 'https://app.example', 30);

    expect(target.postMessage).toHaveBeenNthCalledWith(
      1,
      { type: 'resonote:extension-mode' },
      'https://app.example'
    );
    expect(target.postMessage).toHaveBeenNthCalledWith(
      2,
      { type: 'resonote:update-playback', position: 10, duration: 20, isPaused: false },
      'https://app.example'
    );
    expect(target.postMessage).toHaveBeenNthCalledWith(
      3,
      { type: 'resonote:seek-request', position: 30 },
      'https://app.example'
    );
  });

  it('should dispatch accepted typed messages to the callback', () => {
    const { dispatchMessage } = setupFakeWindow();
    const callback = vi.fn();
    const cleanup = onExtensionFrameMessage(callback, {
      acceptOrigin: (origin) => origin === 'chrome-extension://abc'
    });

    dispatchMessage({
      origin: 'chrome-extension://abc',
      data: { type: 'resonote:update-playback', position: 1, duration: 2, isPaused: true }
    } as MessageEvent);
    dispatchMessage({
      origin: 'chrome-extension://abc',
      data: { type: 'resonote:update-playback', position: 'x', duration: 2, isPaused: true }
    } as MessageEvent);
    dispatchMessage({
      origin: 'https://example.com',
      data: { type: 'resonote:seek-request', position: 5 }
    } as MessageEvent);

    cleanup();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      { type: 'resonote:update-playback', position: 1, duration: 2, isPaused: true },
      'chrome-extension://abc'
    );
  });
});
