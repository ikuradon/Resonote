import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger, shortHex } from '$shared/utils/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shortHex', () => {
  it('should shorten hex strings to the requested length', () => {
    expect(shortHex('abcdef123456', 6)).toBe('abcdef');
  });

  it('should default to eight characters', () => {
    expect(shortHex('abcdef123456')).toBe('abcdef12');
  });
});

describe('createLogger', () => {
  it('should prefix log messages with the module name', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createLogger('test-module');
    logger.warn('warning');
    expect(spy).toHaveBeenCalledWith('[test-module]', 'warning');
  });

  it('should include structured data when provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger('test-module');
    logger.error('boom', { reason: 'test' });
    expect(spy).toHaveBeenCalledWith('[test-module]', 'boom', { reason: 'test' });
  });
});
