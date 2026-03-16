import { describe, it, expect } from 'vitest';
import { sanitizeImageUrl } from './url.js';

describe('sanitizeImageUrl', () => {
  it('should allow https URLs', () => {
    expect(sanitizeImageUrl('https://example.com/pic.jpg')).toBe('https://example.com/pic.jpg');
  });

  it('should allow http URLs', () => {
    expect(sanitizeImageUrl('http://example.com/pic.jpg')).toBe('http://example.com/pic.jpg');
  });

  it('should reject javascript: URLs', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('should reject data: URLs', () => {
    expect(sanitizeImageUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
  });

  it('should reject empty strings', () => {
    expect(sanitizeImageUrl('')).toBeUndefined();
  });

  it('should handle undefined input', () => {
    expect(sanitizeImageUrl(undefined)).toBeUndefined();
  });

  it('should reject invalid URLs', () => {
    expect(sanitizeImageUrl('not-a-url')).toBeUndefined();
  });

  it('should reject ftp: URLs', () => {
    expect(sanitizeImageUrl('ftp://example.com/pic.jpg')).toBeUndefined();
  });
});
