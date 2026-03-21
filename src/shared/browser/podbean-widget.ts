// @public — Stable API for route/component consumers
/**
 * Podbean widget bootstrap helper.
 * Owns API script loading, iframe readiness, widget event bind/unbind, and seek bridging.
 */

import { loadExternalScript } from '$shared/browser/script-loader.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('podbean-widget');

const PODBEAN_READY_EVENT = 'PB.Widget.Events.READY';
const PODBEAN_PLAY_EVENT = 'PB.Widget.Events.PLAY';
const PODBEAN_PAUSE_EVENT = 'PB.Widget.Events.PAUSE';
const PODBEAN_PROGRESS_EVENT = 'PB.Widget.Events.PLAY_PROGRESS';

type PodbeanEventName =
  | typeof PODBEAN_READY_EVENT
  | typeof PODBEAN_PLAY_EVENT
  | typeof PODBEAN_PAUSE_EVENT
  | typeof PODBEAN_PROGRESS_EVENT;

export interface PodbeanProgressEvent {
  data?: {
    currentPosition?: number;
    relativePosition?: number;
  };
}

export interface PodbeanWidgetApi {
  bind(eventName: PodbeanEventName, callback: (event?: unknown) => void): void;
  unbind(eventName: PodbeanEventName): void;
  seekTo(seconds: number): void;
  getDuration(callback: (duration: number) => void): void;
}

interface PodbeanWidgetConstructor {
  new (iframeEl: HTMLIFrameElement): PodbeanWidgetApi;
}

interface PodbeanWindow extends Window {
  PB?: PodbeanWidgetConstructor;
}

export interface PodbeanWidgetLifecycle {
  onReady(): void;
  onPlay(widget: PodbeanWidgetApi): void;
  onPause(): void;
  onProgress(event: PodbeanProgressEvent): void;
  onError(error: unknown): void;
}

export interface PodbeanWidgetHandle {
  seekTo(positionMs: number): void;
  destroy(): void;
}

async function loadPodbeanWidgetApi(): Promise<PodbeanWidgetConstructor> {
  log.info('Loading Podbean Widget API...');
  await loadExternalScript({
    src: 'https://pbcdn1.podbean.com/fs1/player/api.js',
    isReady: () => typeof window !== 'undefined' && !!(window as PodbeanWindow).PB
  });

  const ctor = (window as PodbeanWindow).PB;
  if (!ctor) {
    throw new Error('Podbean widget API is unavailable');
  }
  return ctor;
}

function bindPodbeanWidget(widget: PodbeanWidgetApi, lifecycle: PodbeanWidgetLifecycle): void {
  widget.bind(PODBEAN_READY_EVENT, () => {
    lifecycle.onReady();
  });

  widget.bind(PODBEAN_PLAY_EVENT, () => {
    lifecycle.onPlay(widget);
  });

  widget.bind(PODBEAN_PAUSE_EVENT, () => {
    lifecycle.onPause();
  });

  widget.bind(PODBEAN_PROGRESS_EVENT, (event?: unknown) => {
    lifecycle.onProgress((event ?? {}) as PodbeanProgressEvent);
  });
}

function unbindPodbeanWidget(widget: PodbeanWidgetApi | undefined): void {
  if (!widget) return;
  widget.unbind(PODBEAN_READY_EVENT);
  widget.unbind(PODBEAN_PLAY_EVENT);
  widget.unbind(PODBEAN_PAUSE_EVENT);
  widget.unbind(PODBEAN_PROGRESS_EVENT);
}

function waitForIframeReady(
  iframeEl: HTMLIFrameElement,
  setCleanup: (cleanup: () => void) => void
): Promise<void> {
  if (iframeEl.contentDocument?.readyState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onLoad = () => {
      setCleanup(() => {});
      resolve();
    };
    iframeEl.addEventListener('load', onLoad, { once: true });
    setCleanup(() => iframeEl.removeEventListener('load', onLoad));
  });
}

export function mountPodbeanWidget(
  iframeEl: HTMLIFrameElement,
  lifecycle: PodbeanWidgetLifecycle
): PodbeanWidgetHandle {
  let destroyed = false;
  let widget: PodbeanWidgetApi | undefined;
  let cleanupLoadListener = () => {};

  const init = async () => {
    try {
      await waitForIframeReady(iframeEl, (cleanup) => {
        cleanupLoadListener = cleanup;
      });
      if (destroyed) return;

      const PodbeanWidget = await loadPodbeanWidgetApi();
      if (destroyed) return;

      widget = new PodbeanWidget(iframeEl);
      bindPodbeanWidget(widget, lifecycle);
    } catch (error) {
      if (destroyed) return;
      lifecycle.onError(error);
    }
  };

  void init();

  return {
    seekTo(positionMs: number): void {
      if (!widget || positionMs < 0) return;
      widget.seekTo(positionMs / 1000);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      cleanupLoadListener();
      unbindPodbeanWidget(widget);
      widget = undefined;
    }
  };
}
