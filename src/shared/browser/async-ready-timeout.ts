// @public — Stable API for route/component/feature consumers
/**
 * Guards async player/widget initialization against late success after timeout.
 */

export interface AsyncReadyTimeoutHandle {
  cancel(): void;
  hasTimedOut(): boolean;
  succeed(): boolean;
}

export interface AsyncReadyTimeoutOptions {
  timeoutMs: number;
  onTimeout: () => void;
}

export function createAsyncReadyTimeout(
  options: AsyncReadyTimeoutOptions
): AsyncReadyTimeoutHandle {
  let active = true;
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    if (!active) return;
    active = false;
    timedOut = true;
    options.onTimeout();
  }, options.timeoutMs);

  function clear(): boolean {
    if (!active) return false;
    active = false;
    clearTimeout(timeoutId);
    return true;
  }

  return {
    cancel(): void {
      clear();
    },
    hasTimedOut(): boolean {
      return timedOut;
    },
    succeed(): boolean {
      return clear();
    }
  };
}
