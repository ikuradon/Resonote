import { describe, it, expect } from 'vitest';
import {
  parseEmojiContent,
  isEmojiTag,
  isShortcode,
  extractShortcode,
  addEmojiTag
} from '$shared/utils/emoji.js';

describe('parseEmojiContent', () => {
  it('should return a text segment when there are no emoji tags', () => {
    expect(parseEmojiContent('hello world', [])).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('should replace matching shortcodes with emoji segments', () => {
    expect(
      parseEmojiContent('hello :sushi: world', [
        ['emoji', 'sushi', 'https://example.com/sushi.png']
      ])
    ).toEqual([
      { type: 'text', value: 'hello ' },
      { type: 'emoji', shortcode: 'sushi', url: 'https://example.com/sushi.png' },
      { type: 'text', value: ' world' }
    ]);
  });

  it('should handle multiple emoji shortcodes', () => {
    expect(
      parseEmojiContent(':a: and :b:', [
        ['emoji', 'a', 'https://example.com/a.png'],
        ['emoji', 'b', 'https://example.com/b.png']
      ])
    ).toEqual([
      { type: 'emoji', shortcode: 'a', url: 'https://example.com/a.png' },
      { type: 'text', value: ' and ' },
      { type: 'emoji', shortcode: 'b', url: 'https://example.com/b.png' }
    ]);
  });

  it('should keep content as text when shortcode tags are missing', () => {
    expect(
      parseEmojiContent('hello :unknown: world', [
        ['emoji', 'sushi', 'https://example.com/sushi.png']
      ])
    ).toEqual([{ type: 'text', value: 'hello :unknown: world' }]);
  });

  it('should ignore malformed or unsafe emoji tags', () => {
    expect(parseEmojiContent(':sushi:', [['emoji', 'sushi']])).toEqual([
      { type: 'text', value: ':sushi:' }
    ]);
    expect(parseEmojiContent(':evil:', [['emoji', 'evil', 'javascript:alert(1)']])).toEqual([
      { type: 'text', value: ':evil:' }
    ]);
  });
});

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
