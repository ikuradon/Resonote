import { describe, it, expect } from 'vitest';
import {
  parseEmojiContent,
  isEmojiTag,
  isShortcode,
  extractShortcode,
  addEmojiTag
} from './emoji.js';

describe('parseEmojiContent', () => {
  it('should return text segment when no emoji tags', () => {
    const result = parseEmojiContent('hello world', []);
    expect(result).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('should replace :shortcode: with emoji segment', () => {
    const result = parseEmojiContent('hello :sushi: world', [
      ['emoji', 'sushi', 'https://example.com/sushi.png']
    ]);
    expect(result).toEqual([
      { type: 'text', value: 'hello ' },
      { type: 'emoji', shortcode: 'sushi', url: 'https://example.com/sushi.png' },
      { type: 'text', value: ' world' }
    ]);
  });

  it('should handle multiple emoji shortcodes', () => {
    const result = parseEmojiContent(':a: and :b:', [
      ['emoji', 'a', 'https://example.com/a.png'],
      ['emoji', 'b', 'https://example.com/b.png']
    ]);
    expect(result).toEqual([
      { type: 'emoji', shortcode: 'a', url: 'https://example.com/a.png' },
      { type: 'text', value: ' and ' },
      { type: 'emoji', shortcode: 'b', url: 'https://example.com/b.png' }
    ]);
  });

  it('should not replace shortcodes not in emoji tags', () => {
    const result = parseEmojiContent('hello :unknown: world', [
      ['emoji', 'sushi', 'https://example.com/sushi.png']
    ]);
    expect(result).toEqual([{ type: 'text', value: 'hello :unknown: world' }]);
  });

  it('should handle content that is only an emoji shortcode', () => {
    const result = parseEmojiContent(':fire:', [['emoji', 'fire', 'https://example.com/fire.png']]);
    expect(result).toEqual([
      { type: 'emoji', shortcode: 'fire', url: 'https://example.com/fire.png' }
    ]);
  });

  it('should ignore malformed emoji tags', () => {
    const result = parseEmojiContent(':sushi:', [['emoji', 'sushi']]);
    expect(result).toEqual([{ type: 'text', value: ':sushi:' }]);
  });
});

describe('isEmojiTag', () => {
  it('should return true for valid emoji tags', () => {
    expect(isEmojiTag(['emoji', 'sushi', 'https://example.com/sushi.png'])).toBe(true);
  });

  it('should return false for tags with fewer than 3 elements', () => {
    expect(isEmojiTag(['emoji', 'sushi'])).toBe(false);
    expect(isEmojiTag(['emoji'])).toBe(false);
  });

  it('should return false for non-emoji tags', () => {
    expect(isEmojiTag(['e', 'abc123'])).toBe(false);
    expect(isEmojiTag(['p', 'abc123'])).toBe(false);
  });
});

describe('isShortcode', () => {
  it('should return true for :shortcode: format', () => {
    expect(isShortcode(':sushi:')).toBe(true);
    expect(isShortcode(':fire_emoji:')).toBe(true);
  });

  it('should return false for non-shortcode strings', () => {
    expect(isShortcode('sushi')).toBe(false);
    expect(isShortcode('+')).toBe(false);
    expect(isShortcode('🔥')).toBe(false);
    expect(isShortcode(':has space:')).toBe(false);
  });
});

describe('extractShortcode', () => {
  it('should extract shortcode from :shortcode: format', () => {
    expect(extractShortcode(':sushi:')).toBe('sushi');
    expect(extractShortcode(':fire_emoji:')).toBe('fire_emoji');
  });

  it('should return input if not in shortcode format', () => {
    expect(extractShortcode('sushi')).toBe('sushi');
    expect(extractShortcode('+')).toBe('+');
  });
});

describe('addEmojiTag', () => {
  it('should not match non-emoji tags with same shortcode', () => {
    const tags = [['p', 'wave']];
    const result = addEmojiTag(tags, 'wave', 'https://example.com/wave.png');
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(['emoji', 'wave', 'https://example.com/wave.png']);
  });
});

describe('parseEmojiContent edge cases', () => {
  it('should handle emoji tag with empty URL', () => {
    const result = parseEmojiContent(':sushi:', [['emoji', 'sushi', '']]);
    expect(result).toEqual([{ type: 'text', value: ':sushi:' }]);
  });

  it('should handle duplicate shortcodes in content', () => {
    const result = parseEmojiContent(':a: and :a:', [['emoji', 'a', 'https://example.com/a.png']]);
    const emojiParts = result.filter((p) => p.type === 'emoji');
    expect(emojiParts).toHaveLength(2);
  });

  it('should handle content with only emoji shortcodes', () => {
    const result = parseEmojiContent(':fire:', [['emoji', 'fire', 'https://example.com/fire.png']]);
    expect(result).toEqual([
      { type: 'emoji', shortcode: 'fire', url: 'https://example.com/fire.png' }
    ]);
  });
});
