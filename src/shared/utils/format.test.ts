import { describe, expect, it } from 'vitest';

import {
  formatCompactDuration,
  formatDateOnly,
  formatDuration,
  formatTimestamp,
  truncateString
} from '$shared/utils/format.js';

describe('formatDuration', () => {
  it('should format zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('should handle non-finite values', () => {
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(Infinity)).toBe('0:00');
  });
});

describe('formatTimestamp', () => {
  it('should convert unix timestamps to locale strings', () => {
    const result = formatTimestamp(1700000000);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('formatCompactDuration', () => {
  it('should hide zero or invalid values', () => {
    expect(formatCompactDuration(0)).toBe('');
    expect(formatCompactDuration(NaN)).toBe('');
  });

  it('should format minute-only durations', () => {
    expect(formatCompactDuration(125)).toBe('2m');
  });

  it('should format hour durations compactly', () => {
    expect(formatCompactDuration(3661)).toBe('1h 1m');
  });
});

describe('formatDateOnly', () => {
  it('should format unix timestamps by default', () => {
    expect(formatDateOnly(1700000000)).toBeTruthy();
  });

  it('should support millisecond timestamps', () => {
    expect(formatDateOnly(1700000000000, { unit: 'milliseconds' })).toBeTruthy();
  });

  it('should return empty string for invalid values', () => {
    expect(formatDateOnly(0)).toBe('');
  });
});

describe('truncateString', () => {
  it('should return short strings unchanged', () => {
    expect(truncateString('hello', 10)).toBe('hello');
  });

  it('should truncate strings longer than the limit', () => {
    expect(truncateString('hello world', 6)).toBe('hello…');
  });

  it('should handle exact-length strings', () => {
    expect(truncateString('hello', 5)).toBe('hello');
  });
});
