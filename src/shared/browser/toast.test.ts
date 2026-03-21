import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toast store', () => {
  it('should add and retrieve toasts', async () => {
    const { toastSuccess, getToasts } = await import('./toast.js');
    toastSuccess('Test message');
    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0].message).toBe('Test message');
    expect(getToasts()[0].type).toBe('success');
  });

  it('should auto-dismiss after timeout', async () => {
    const { toastSuccess, getToasts } = await import('./toast.js');
    toastSuccess('Dismiss me');
    expect(getToasts()).toHaveLength(1);

    vi.advanceTimersByTime(4000);
    expect(getToasts()).toHaveLength(0);
  });

  it('should manually dismiss a toast', async () => {
    const { toastSuccess, dismiss, getToasts } = await import('./toast.js');
    toastSuccess('Manual dismiss');
    const id = getToasts()[0].id;
    dismiss(id);
    expect(getToasts()).toHaveLength(0);
  });

  it('should limit to MAX_TOASTS', async () => {
    const { toastSuccess, getToasts } = await import('./toast.js');
    toastSuccess('First');
    toastSuccess('Second');
    toastSuccess('Third');
    toastSuccess('Fourth');
    expect(getToasts()).toHaveLength(3);
    expect(getToasts()[0].message).toBe('Second');
  });

  it('should support different types', async () => {
    const { toastSuccess, toastError, toastInfo, getToasts } = await import('./toast.js');
    toastSuccess('OK');
    toastError('Fail');
    toastInfo('Note');
    expect(getToasts().map((toast) => toast.type)).toEqual(['success', 'error', 'info']);
  });

  it('should clear timers for evicted toasts', async () => {
    const { toastSuccess, getToasts } = await import('./toast.js');
    toastSuccess('First');
    toastSuccess('Second');
    toastSuccess('Third');
    toastSuccess('Fourth');
    expect(getToasts()).toHaveLength(3);
    expect(getToasts()[0].message).toBe('Second');

    vi.advanceTimersByTime(4000);
    expect(getToasts()).toHaveLength(0);
  });
});
