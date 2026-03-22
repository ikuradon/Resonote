import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updatePlaybackMock, gotoMock, onExtensionFrameMessageMock, isExtensionRuntimeOriginMock } =
  vi.hoisted(() => ({
    updatePlaybackMock: vi.fn(),
    gotoMock: vi.fn(),
    onExtensionFrameMessageMock: vi.fn(),
    isExtensionRuntimeOriginMock: vi.fn()
  }));

vi.mock('./player.svelte.js', () => ({
  updatePlayback: updatePlaybackMock
}));

vi.mock('$app/navigation', () => ({
  goto: gotoMock
}));

vi.mock('./extension-message-bridge.js', () => ({
  onExtensionFrameMessage: onExtensionFrameMessageMock,
  isExtensionRuntimeOrigin: isExtensionRuntimeOriginMock,
  postSeekRequest: vi.fn()
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

describe('extension.svelte.ts', () => {
  let capturedCallback: ((message: unknown, origin: string) => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedCallback = null;

    onExtensionFrameMessageMock.mockImplementation(
      (cb: (message: unknown, origin: string) => void): (() => void) => {
        capturedCallback = cb;
        return vi.fn();
      }
    );
  });

  async function loadModule() {
    return await import('./extension.svelte.js');
  }

  it('isExtensionMode returns false initially', async () => {
    const { isExtensionMode } = await loadModule();
    expect(isExtensionMode()).toBe(false);
  });

  it('initExtensionListener registers callback via onExtensionFrameMessage', async () => {
    const { initExtensionListener } = await loadModule();
    initExtensionListener();
    expect(onExtensionFrameMessageMock).toHaveBeenCalledTimes(1);
    expect(capturedCallback).not.toBeNull();
  });

  it('handles resonote:update-playback messages', async () => {
    const { initExtensionListener } = await loadModule();
    initExtensionListener();
    expect(capturedCallback).not.toBeNull();

    capturedCallback!(
      { type: 'resonote:update-playback', position: 1000, duration: 5000, isPaused: false },
      'chrome-extension://abc'
    );
    expect(updatePlaybackMock).toHaveBeenCalledWith(1000, 5000, false);
  });

  it('handles resonote:navigate messages', async () => {
    const { initExtensionListener } = await loadModule();
    initExtensionListener();
    expect(capturedCallback).not.toBeNull();

    capturedCallback!(
      { type: 'resonote:navigate', path: '/content/test' },
      'chrome-extension://abc'
    );
    expect(gotoMock).toHaveBeenCalledWith('/content/test');
  });

  it('ignores messages from different origin after first message', async () => {
    const { initExtensionListener } = await loadModule();
    initExtensionListener();
    expect(capturedCallback).not.toBeNull();

    // First message establishes sidePanelOrigin
    capturedCallback!(
      { type: 'resonote:update-playback', position: 100, duration: 1000, isPaused: true },
      'chrome-extension://abc'
    );
    vi.clearAllMocks();

    // Different origin is ignored
    capturedCallback!(
      { type: 'resonote:update-playback', position: 200, duration: 2000, isPaused: false },
      'chrome-extension://different'
    );
    expect(updatePlaybackMock).not.toHaveBeenCalled();
  });
});
