import { describe, it, expect } from 'vitest';
import { sanitizeImageUrl } from '$shared/utils/url.js';

describe('sanitizeImageUrl', () => {
  it('should allow http and https URLs', () => {
    expect(sanitizeImageUrl('https://example.com/pic.jpg')).toBe('https://example.com/pic.jpg');
    expect(sanitizeImageUrl('http://example.com/pic.jpg')).toBe('http://example.com/pic.jpg');
  });

  it('should reject unsafe protocols', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeImageUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(sanitizeImageUrl('ftp://example.com/pic.jpg')).toBeUndefined();
  });

  it('should reject invalid or empty values', () => {
    expect(sanitizeImageUrl('')).toBeUndefined();
    expect(sanitizeImageUrl(undefined)).toBeUndefined();
    expect(sanitizeImageUrl('not-a-url')).toBeUndefined();
  });
});
