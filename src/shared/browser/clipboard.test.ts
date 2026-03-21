import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '$shared/browser/clipboard.js';

const originalNavigator = globalThis.navigator;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: originalNavigator
  });
});

describe('copyToClipboard', () => {
  it('should return true when clipboard write succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        clipboard: { writeText }
      }
    });

    await expect(copyToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('should return false when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        clipboard: { writeText }
      }
    });

    await expect(copyToClipboard('hello')).resolves.toBe(false);
  });
});
