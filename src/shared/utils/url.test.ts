import { describe, expect, it } from 'vitest';

import { sanitizeUrl } from '$shared/utils/url.js';

describe('sanitizeUrl', () => {
  it('should allow http and https URLs', () => {
    expect(sanitizeUrl('https://example.com/pic.jpg')).toBe('https://example.com/pic.jpg');
    expect(sanitizeUrl('http://example.com/pic.jpg')).toBe('http://example.com/pic.jpg');
  });

  it('should reject unsafe protocols', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(sanitizeUrl('ftp://example.com/pic.jpg')).toBeUndefined();
  });

  it('should reject invalid or empty values', () => {
    expect(sanitizeUrl('')).toBeUndefined();
    expect(sanitizeUrl(undefined)).toBeUndefined();
    expect(sanitizeUrl('not-a-url')).toBeUndefined();
  });
});
