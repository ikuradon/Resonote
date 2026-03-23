import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  updatePlaybackMock,
  gotoMock,
  onExtensionFrameMessageMock,
  isExtensionRuntimeOriginMock,
  postSeekRequestMock
} = vi.hoisted(() => ({
  updatePlaybackMock: vi.fn(),
  gotoMock: vi.fn(),
  onExtensionFrameMessageMock: vi.fn(),
  isExtensionRuntimeOriginMock: vi.fn(),
  postSeekRequestMock: vi.fn()
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
  postSeekRequest: postSeekRequestMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

describe('extension.svelte.ts', () => {
  let capturedCallback: ((message: unknown, origin: string) => void) | null = null;
  const fakeDocumentElement = {
    hasAttribute: vi.fn(),
    setAttribute: vi.fn()
  };

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

    // Stub document for detectExtension / requestOpenContent
    vi.stubGlobal('document', { documentElement: fakeDocumentElement });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadModule() {
    return await import('./extension.svelte.js');
  }

  describe('isExtensionMode', () => {
    it('returns false initially', async () => {
      const { isExtensionMode } = await loadModule();
      expect(isExtensionMode()).toBe(false);
    });
  });

  describe('detectExtension', () => {
    it('returns true when data-resonote-ext attribute is present', async () => {
      fakeDocumentElement.hasAttribute.mockReturnValue(true);
      const { detectExtension } = await loadModule();
      expect(detectExtension()).toBe(true);
      expect(fakeDocumentElement.hasAttribute).toHaveBeenCalledWith('data-resonote-ext');
    });

    it('returns false when data-resonote-ext attribute is absent', async () => {
      fakeDocumentElement.hasAttribute.mockReturnValue(false);
      const { detectExtension } = await loadModule();
      expect(detectExtension()).toBe(false);
    });
  });

  describe('initExtensionListener', () => {
    it('registers callback via onExtensionFrameMessage', async () => {
      const { initExtensionListener } = await loadModule();
      initExtensionListener();
      expect(onExtensionFrameMessageMock).toHaveBeenCalledTimes(1);
      expect(capturedCallback).not.toBeNull();
    });

    it('passes acceptOrigin option with isExtensionRuntimeOrigin', async () => {
      const { initExtensionListener } = await loadModule();
      initExtensionListener();
      const callOptions = onExtensionFrameMessageMock.mock.calls[0][1];
      expect(callOptions).toEqual({ acceptOrigin: isExtensionRuntimeOriginMock });
    });

    it('is idempotent on double call', async () => {
      const { initExtensionListener } = await loadModule();
      initExtensionListener();
      initExtensionListener();
      expect(onExtensionFrameMessageMock).toHaveBeenCalledTimes(1);
    });

    it('handles resonote:extension-mode and sets extensionMode to true', async () => {
      const { initExtensionListener, isExtensionMode } = await loadModule();
      initExtensionListener();

      capturedCallback!({ type: 'resonote:extension-mode' }, 'chrome-extension://abc');
      expect(isExtensionMode()).toBe(true);
    });

    it('handles resonote:update-playback messages', async () => {
      const { initExtensionListener } = await loadModule();
      initExtensionListener();

      capturedCallback!(
        { type: 'resonote:update-playback', position: 1000, duration: 5000, isPaused: false },
        'chrome-extension://abc'
      );
      expect(updatePlaybackMock).toHaveBeenCalledWith(1000, 5000, false);
    });

    it('handles resonote:navigate messages', async () => {
      const { initExtensionListener } = await loadModule();
      initExtensionListener();

      capturedCallback!(
        { type: 'resonote:navigate', path: '/content/test' },
        'chrome-extension://abc'
      );
      expect(gotoMock).toHaveBeenCalledWith('/content/test');
    });

    it('sets sidePanelOrigin from first message', async () => {
      const { initExtensionListener } = await loadModule();
      initExtensionListener();

      capturedCallback!({ type: 'resonote:extension-mode' }, 'chrome-extension://abc');

      capturedCallback!({ type: 'resonote:navigate', path: '/test' }, 'chrome-extension://abc');
      expect(gotoMock).toHaveBeenCalledWith('/test');
    });

    it('ignores messages from different origin after first message', async () => {
      const { initExtensionListener } = await loadModule();
      initExtensionListener();

      capturedCallback!(
        { type: 'resonote:update-playback', position: 100, duration: 1000, isPaused: true },
        'chrome-extension://abc'
      );
      vi.clearAllMocks();

      capturedCallback!(
        { type: 'resonote:update-playback', position: 200, duration: 2000, isPaused: false },
        'chrome-extension://different'
      );
      expect(updatePlaybackMock).not.toHaveBeenCalled();
    });
  });

  describe('sendSeekRequest', () => {
    it('calls postSeekRequest when extensionMode=true and sidePanelOrigin is set', async () => {
      const fakeParent = { postMessage: vi.fn() };
      vi.stubGlobal('window', { parent: fakeParent });

      const { initExtensionListener, sendSeekRequest } = await loadModule();
      initExtensionListener();

      capturedCallback!({ type: 'resonote:extension-mode' }, 'chrome-extension://abc');

      sendSeekRequest(5000);
      expect(postSeekRequestMock).toHaveBeenCalledWith(fakeParent, 'chrome-extension://abc', 5000);
    });

    it('does nothing when extensionMode is false', async () => {
      const { sendSeekRequest } = await loadModule();
      sendSeekRequest(5000);
      expect(postSeekRequestMock).not.toHaveBeenCalled();
    });

    it('does nothing when no messages received (no sidePanelOrigin)', async () => {
      const { initExtensionListener, sendSeekRequest } = await loadModule();
      initExtensionListener();
      sendSeekRequest(5000);
      expect(postSeekRequestMock).not.toHaveBeenCalled();
    });
  });

  describe('requestOpenContent', () => {
    it('sets data-resonote-action attribute with JSON payload', async () => {
      const { requestOpenContent } = await loadModule();
      const contentId = { platform: 'spotify' as const, type: 'track', id: 'abc123' };
      const siteUrl = 'https://open.spotify.com/track/abc123';

      requestOpenContent(contentId, siteUrl);

      expect(fakeDocumentElement.setAttribute).toHaveBeenCalledWith(
        'data-resonote-action',
        JSON.stringify({
          type: 'resonote:open-content',
          contentId,
          siteUrl
        })
      );
    });

    it('overwrites previous action on subsequent calls', async () => {
      const { requestOpenContent } = await loadModule();
      const contentId1 = { platform: 'spotify' as const, type: 'track', id: 'first' };
      const contentId2 = { platform: 'youtube' as const, type: 'video', id: 'second' };

      requestOpenContent(contentId1, 'https://example.com/first');
      requestOpenContent(contentId2, 'https://example.com/second');

      expect(fakeDocumentElement.setAttribute).toHaveBeenCalledTimes(2);
      const lastCall = fakeDocumentElement.setAttribute.mock.calls[1];
      const parsed = JSON.parse(lastCall[1]);
      expect(parsed.contentId.id).toBe('second');
    });
  });
});
