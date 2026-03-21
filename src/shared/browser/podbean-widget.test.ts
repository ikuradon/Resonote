import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mountPodbeanWidget,
  type PodbeanWidgetApi,
  type PodbeanProgressEvent
} from '$shared/browser/podbean-widget.js';

const { loadExternalScriptMock } = vi.hoisted(() => ({
  loadExternalScriptMock: vi.fn()
}));

vi.mock('$shared/browser/script-loader.js', () => ({
  loadExternalScript: loadExternalScriptMock
}));

describe('mountPodbeanWidget', () => {
  beforeEach(() => {
    loadExternalScriptMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should bind lifecycle handlers and convert seek milliseconds to seconds', async () => {
    const listeners = new Map<string, (event?: unknown) => void>();
    const widget = {
      bind: vi.fn((eventName: string, callback: (event?: unknown) => void) => {
        listeners.set(eventName, callback);
      }),
      unbind: vi.fn(),
      seekTo: vi.fn(),
      getDuration: vi.fn()
    } satisfies PodbeanWidgetApi;

    loadExternalScriptMock.mockResolvedValue(undefined);
    function PodbeanWidget() {
      return widget;
    }

    vi.stubGlobal('window', {
      PB: vi.fn(PodbeanWidget)
    } as unknown as Window & typeof globalThis & { PB?: unknown });

    const iframeEl = {
      contentDocument: { readyState: 'complete' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as HTMLIFrameElement;

    const onReady = vi.fn();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onProgress = vi.fn();
    const onError = vi.fn();

    const handle = mountPodbeanWidget(iframeEl, {
      onReady,
      onPlay,
      onPause,
      onProgress,
      onError
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    listeners.get('PB.Widget.Events.READY')?.();
    listeners.get('PB.Widget.Events.PLAY')?.();
    listeners.get('PB.Widget.Events.PAUSE')?.();
    listeners.get('PB.Widget.Events.PLAY_PROGRESS')?.({
      data: { currentPosition: 12, relativePosition: 0.5 }
    } satisfies PodbeanProgressEvent);

    handle.seekTo(3456);
    handle.destroy();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(widget);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      data: { currentPosition: 12, relativePosition: 0.5 }
    });
    expect(widget.seekTo).toHaveBeenCalledWith(3.456);
    expect(widget.unbind).toHaveBeenCalledTimes(4);
    expect(onError).not.toHaveBeenCalled();
  });
});
