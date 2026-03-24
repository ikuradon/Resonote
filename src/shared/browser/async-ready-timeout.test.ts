import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAsyncReadyTimeout } from '$shared/browser/async-ready-timeout.js';

describe('createAsyncReadyTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should call onTimeout once after the timeout elapses', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const handle = createAsyncReadyTimeout({ timeoutMs: 1000, onTimeout });

    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(handle.hasTimedOut()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(handle.hasTimedOut()).toBe(true);
    expect(handle.succeed()).toBe(false);
  });

  it('should prevent timeout after succeed is called', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const handle = createAsyncReadyTimeout({ timeoutMs: 1000, onTimeout });

    expect(handle.succeed()).toBe(true);
    vi.advanceTimersByTime(1000);

    expect(onTimeout).not.toHaveBeenCalled();
    expect(handle.hasTimedOut()).toBe(false);
  });

  it('should prevent timeout after cancel is called', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const handle = createAsyncReadyTimeout({ timeoutMs: 1000, onTimeout });

    handle.cancel();
    vi.advanceTimersByTime(1000);

    expect(onTimeout).not.toHaveBeenCalled();
    expect(handle.hasTimedOut()).toBe(false);
    expect(handle.succeed()).toBe(false);
  });
});
