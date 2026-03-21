import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  onNiconicoMessage,
  seekNiconicoPlayer,
  type NiconicoPlayerMessage
} from '$shared/browser/niconico-bridge.js';

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
    },
    windowStub
  };
}

describe('seekNiconicoPlayer', () => {
  it('should post a seek command to the Niconico iframe', () => {
    const postMessage = vi.fn();
    const iframeEl = {
      contentWindow: { postMessage }
    } as unknown as HTMLIFrameElement;

    seekNiconicoPlayer(iframeEl, 2500);

    expect(postMessage).toHaveBeenCalledWith(
      {
        data: { time: 2.5 },
        eventName: 'seek',
        playerId: '1',
        sourceConnectorType: 1
      },
      'https://embed.nicovideo.jp'
    );
  });
});

describe('onNiconicoMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow
    });
  });

  it('should emit a ready message for loadComplete', () => {
    const { dispatchMessage } = setupFakeWindow();
    const seen: NiconicoPlayerMessage[] = [];
    const cleanup = onNiconicoMessage((message) => seen.push(message));

    dispatchMessage({
      origin: 'https://embed.nicovideo.jp',
      data: { eventName: 'loadComplete' }
    } as MessageEvent);

    cleanup();
    expect(seen).toEqual([{ type: 'ready' }]);
  });

  it('should map playback metadata and status updates', () => {
    const { dispatchMessage } = setupFakeWindow();
    const seen: NiconicoPlayerMessage[] = [];
    const cleanup = onNiconicoMessage((message) => seen.push(message));

    dispatchMessage({
      origin: 'https://embed.nicovideo.jp',
      data: {
        eventName: 'playerMetadataChange',
        data: { currentTime: 12, duration: 30 }
      }
    } as MessageEvent);
    dispatchMessage({
      origin: 'https://embed.nicovideo.jp',
      data: {
        eventName: 'playerStatusChange',
        data: { currentTime: 15, duration: 30, playerStatus: 3 }
      }
    } as MessageEvent);

    cleanup();
    expect(seen).toEqual([
      { type: 'metadata', currentTimeMs: 12_000, durationMs: 30_000 },
      { type: 'status', currentTimeMs: 15_000, durationMs: 30_000, isPaused: true }
    ]);
  });

  it('should ignore messages from other origins', () => {
    const { dispatchMessage } = setupFakeWindow();
    const callback = vi.fn();
    const cleanup = onNiconicoMessage(callback);

    dispatchMessage({
      origin: 'https://example.com',
      data: { eventName: 'loadComplete' }
    } as MessageEvent);

    cleanup();
    expect(callback).not.toHaveBeenCalled();
  });
});
