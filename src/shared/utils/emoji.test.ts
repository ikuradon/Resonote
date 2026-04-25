import { describe, expect, it } from 'vitest';

import { addEmojiTag, extractShortcode, isEmojiTag, isShortcode } from '$shared/utils/emoji.js';

describe('isEmojiTag', () => {
  it('should recognize valid emoji tags', () => {
    expect(isEmojiTag(['emoji', 'sushi', 'https://example.com/sushi.png'])).toBe(true);
  });

  it('should reject invalid emoji tags', () => {
    expect(isEmojiTag(['emoji', 'sushi'])).toBe(false);
    expect(isEmojiTag(['e', 'abc123'])).toBe(false);
  });
});

describe('isShortcode', () => {
  it('should recognize shortcode syntax', () => {
    expect(isShortcode(':sushi:')).toBe(true);
    expect(isShortcode(':fire_emoji:')).toBe(true);
  });

  it('should reject non-shortcode strings', () => {
    expect(isShortcode('sushi')).toBe(false);
    expect(isShortcode('+')).toBe(false);
    expect(isShortcode('🔥')).toBe(false);
    expect(isShortcode(':has space:')).toBe(false);
  });
});

describe('extractShortcode', () => {
  it('should extract shortcode values', () => {
    expect(extractShortcode(':sushi:')).toBe('sushi');
    expect(extractShortcode(':fire_emoji:')).toBe('fire_emoji');
  });

  it('should return the input when it is not a shortcode', () => {
    expect(extractShortcode('sushi')).toBe('sushi');
    expect(extractShortcode('+')).toBe('+');
  });
});

describe('addEmojiTag', () => {
  it('should append a new emoji tag', () => {
    expect(addEmojiTag([['p', 'wave']], 'wave', 'https://example.com/wave.png')).toEqual([
      ['p', 'wave'],
      ['emoji', 'wave', 'https://example.com/wave.png']
    ]);
  });

  it('should not duplicate existing emoji tags with the same shortcode', () => {
    expect(
      addEmojiTag([['emoji', 'wave', 'https://example.com/wave.png']], 'wave', 'https://other')
    ).toEqual([['emoji', 'wave', 'https://example.com/wave.png']]);
  });
});
