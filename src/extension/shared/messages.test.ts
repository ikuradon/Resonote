import { describe, expect, it } from 'vitest';
import { isSafeUrl, isValidContentId, isKnownMessageType } from './messages.js';

describe('isSafeUrl', () => {
  it('accepts https URLs', () => {
    expect(isSafeUrl('https://open.spotify.com/track/abc')).toBe(true);
  });

  it('accepts http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isSafeUrl('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl(123)).toBe(false);
    expect(isSafeUrl({})).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });
});

describe('isValidContentId', () => {
  it('accepts valid ContentId', () => {
    expect(isValidContentId({ platform: 'spotify', type: 'track', id: 'abc123' })).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidContentId(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isValidContentId('string')).toBe(false);
    expect(isValidContentId(42)).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(isValidContentId({ platform: 'spotify' })).toBe(false);
    expect(isValidContentId({ platform: 'spotify', type: 'track' })).toBe(false);
  });

  it('rejects empty string fields', () => {
    expect(isValidContentId({ platform: '', type: 'track', id: 'abc' })).toBe(false);
    expect(isValidContentId({ platform: 'spotify', type: '', id: 'abc' })).toBe(false);
    expect(isValidContentId({ platform: 'spotify', type: 'track', id: '' })).toBe(false);
  });

  it('rejects non-string fields', () => {
    expect(isValidContentId({ platform: 123, type: 'track', id: 'abc' })).toBe(false);
  });
});

describe('isKnownMessageType', () => {
  it('accepts known message types', () => {
    expect(isKnownMessageType('resonote:site-detected')).toBe(true);
    expect(isKnownMessageType('resonote:playback-state')).toBe(true);
    expect(isKnownMessageType('resonote:site-lost')).toBe(true);
    expect(isKnownMessageType('resonote:seek')).toBe(true);
    expect(isKnownMessageType('resonote:open-content')).toBe(true);
  });

  it('rejects unknown message types', () => {
    expect(isKnownMessageType('resonote:unknown')).toBe(false);
    expect(isKnownMessageType('evil:inject')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isKnownMessageType(null)).toBe(false);
    expect(isKnownMessageType(123)).toBe(false);
    expect(isKnownMessageType(undefined)).toBe(false);
  });
});
