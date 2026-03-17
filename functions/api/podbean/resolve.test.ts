import { describe, it, expect } from 'vitest';
import { assertSafeUrl } from '../../lib/url-validation.js';

describe('podbean/resolve URL validation', () => {
  it('should accept valid podbean URL', () => {
    expect(() => assertSafeUrl('https://www.podbean.com/media/share/pb-abc123-def')).not.toThrow();
  });

  it('should accept podbean channel URL', () => {
    expect(() => assertSafeUrl('https://mypodcast.podbean.com/e/episode-1')).not.toThrow();
  });

  it('should reject private network URLs', () => {
    expect(() => assertSafeUrl('http://192.168.1.1/feed')).toThrow();
  });

  it('should reject localhost', () => {
    expect(() => assertSafeUrl('http://localhost/feed')).toThrow();
  });

  it('should reject non-http schemes', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow();
  });
});
