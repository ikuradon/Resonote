import { describe, expect, it } from 'vitest';
import { resolveContentNavigation } from '$features/content-resolution/application/content-navigation.js';

describe('resolveContentNavigation', () => {
  it('should return null for empty input', () => {
    expect(resolveContentNavigation('   ')).toBeNull();
  });

  it('should build a direct content path when the input matches a provider URL', () => {
    expect(resolveContentNavigation('https://youtu.be/dQw4w9WgXcQ?t=42')).toEqual({
      path: '/youtube/video/dQw4w9WgXcQ?t=42'
    });
  });

  it('should fall back to the resolve route for valid unknown URLs', () => {
    const result = resolveContentNavigation('example.com/some-page');

    expect(result).toEqual({
      path: '/resolve/aHR0cHM6Ly9leGFtcGxlLmNvbS9zb21lLXBhZ2U'
    });
  });

  it('should return an unsupported error for invalid input', () => {
    expect(resolveContentNavigation('not a url at all')).toEqual({
      errorKey: 'track.unsupported'
    });
  });
});
