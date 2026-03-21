import { describe, it, expect } from 'vitest';
import { parseContentId, contentIdToString } from '$shared/content/types.js';

describe('parseContentId', () => {
  it('should parse valid content ID string', () => {
    const result = parseContentId('spotify:track:abc123');
    expect(result).toEqual({
      platform: 'spotify',
      type: 'track',
      id: 'abc123'
    });
  });

  it('should handle IDs containing colons', () => {
    const result = parseContentId('podcast:episode:feed:guid');
    expect(result).toEqual({
      platform: 'podcast',
      type: 'episode',
      id: 'feed:guid'
    });
  });

  it('should return null for string with no colons', () => {
    expect(parseContentId('invalid')).toBeNull();
  });

  it('should return null for string with only one colon', () => {
    expect(parseContentId('one:colon')).toBeNull();
  });

  it('should be the inverse of contentIdToString', () => {
    const original = { platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' };
    const str = contentIdToString(original);
    const parsed = parseContentId(str);
    expect(parsed).toEqual(original);
  });
});

describe('contentIdToString', () => {
  it('should format content ID as colon-separated string', () => {
    expect(contentIdToString({ platform: 'spotify', type: 'track', id: 'abc' })).toBe(
      'spotify:track:abc'
    );
  });
});
