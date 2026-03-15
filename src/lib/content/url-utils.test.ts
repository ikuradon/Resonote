import { describe, it, expect } from 'vitest';
import { normalizeUrl, toBase64url, fromBase64url, stripScheme } from './url-utils.js';

describe('stripScheme', () => {
  it('should remove https:// scheme', () => {
    expect(stripScheme('https://example.com/path')).toBe('example.com/path');
  });

  it('should remove http:// scheme', () => {
    expect(stripScheme('http://example.com/path')).toBe('example.com/path');
  });

  it('should return the string unchanged if no scheme', () => {
    expect(stripScheme('example.com/path')).toBe('example.com/path');
  });
});

describe('normalizeUrl', () => {
  it('should remove https:// scheme', () => {
    expect(normalizeUrl('https://example.com/path')).toBe('example.com/path');
  });

  it('should remove http:// scheme', () => {
    expect(normalizeUrl('http://example.com/path')).toBe('example.com/path');
  });

  it('should lowercase the host', () => {
    expect(normalizeUrl('https://Example.COM/path')).toBe('example.com/path');
  });

  it('should preserve path case', () => {
    expect(normalizeUrl('https://example.com/Feed.xml')).toBe('example.com/Feed.xml');
  });

  it('should remove trailing slash', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('example.com/path');
  });

  it('should not remove slash when path is root', () => {
    expect(normalizeUrl('https://example.com/')).toBe('example.com');
  });

  it('should remove query parameters', () => {
    expect(normalizeUrl('https://example.com/path?token=abc')).toBe('example.com/path');
  });

  it('should remove fragment', () => {
    expect(normalizeUrl('https://example.com/path#section')).toBe('example.com/path');
  });

  it('should handle all transformations together', () => {
    expect(normalizeUrl('https://Example.COM/Feed.xml?token=abc')).toBe('example.com/Feed.xml');
  });

  it('should handle query and fragment together', () => {
    expect(normalizeUrl('https://Example.COM/Feed.xml?token=abc#top')).toBe('example.com/Feed.xml');
  });
});

describe('toBase64url', () => {
  it('should encode a simple string', () => {
    const encoded = toBase64url('hello');
    expect(encoded).toBe('aGVsbG8');
  });

  it('should not contain + character', () => {
    // Use a string that would produce + in standard base64
    const encoded = toBase64url('https://example.com/feed?token=abc+def');
    expect(encoded).not.toContain('+');
  });

  it('should not contain / character', () => {
    const encoded = toBase64url('https://example.com/feed/path');
    expect(encoded).not.toContain('/');
  });

  it('should not contain = padding', () => {
    const encoded = toBase64url('hello');
    expect(encoded).not.toContain('=');
  });

  it('should encode a URL', () => {
    const url = 'https://example.com/feed.xml';
    const encoded = toBase64url(url);
    expect(encoded).toBeTruthy();
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });
});

describe('fromBase64url', () => {
  it('should decode a simple encoded string', () => {
    expect(fromBase64url('aGVsbG8')).toBe('hello');
  });

  it('should round-trip encode/decode', () => {
    const original = 'https://example.com/feed.xml?token=abc';
    expect(fromBase64url(toBase64url(original))).toBe(original);
  });

  it('should round-trip a URL with special characters', () => {
    const original = 'https://Example.COM/Feed.xml';
    expect(fromBase64url(toBase64url(original))).toBe(original);
  });
});
