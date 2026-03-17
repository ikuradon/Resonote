import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseReactionDisplay, typeIcon, relativeTime } from './notification-helpers.js';

describe('parseReactionDisplay', () => {
  it('should return heart for "+" content', () => {
    const result = parseReactionDisplay('+', []);
    expect(result).toEqual({ type: 'heart', content: '❤️' });
  });

  it('should return heart for empty content', () => {
    const result = parseReactionDisplay('', []);
    expect(result).toEqual({ type: 'heart', content: '❤️' });
  });

  it('should return text for plain emoji', () => {
    const result = parseReactionDisplay('🔥', []);
    expect(result).toEqual({ type: 'text', content: '🔥' });
  });

  it('should return emoji_image for custom emoji with matching tag', () => {
    const tags = [['emoji', 'sushi', 'https://example.com/sushi.png']];
    const result = parseReactionDisplay(':sushi:', tags);
    expect(result).toEqual({
      type: 'emoji_image',
      content: ':sushi:',
      url: 'https://example.com/sushi.png'
    });
  });

  it('should return text for shortcode without matching emoji tag', () => {
    const result = parseReactionDisplay(':unknown:', []);
    expect(result).toEqual({ type: 'text', content: ':unknown:' });
  });

  it('should return text for single colon', () => {
    const result = parseReactionDisplay(':', []);
    expect(result).toEqual({ type: 'text', content: ':' });
  });
});

describe('typeIcon', () => {
  it('should return speech balloon for reply', () => {
    expect(typeIcon('reply')).toBe('\u{1F4AC}');
  });

  it('should return heart for reaction', () => {
    expect(typeIcon('reaction')).toBe('\u{2764}\u{FE0F}');
  });

  it('should return @ for mention', () => {
    expect(typeIcon('mention')).toBe('@');
  });

  it('should return music note for follow_comment', () => {
    expect(typeIcon('follow_comment')).toBe('\u{1F3B5}');
  });
});

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const NOW_SEC = Math.floor(new Date('2026-01-15T12:00:00Z').getTime() / 1000);

  it('should format seconds', () => {
    expect(relativeTime(NOW_SEC - 30)).toBe('30s');
  });

  it('should format minutes', () => {
    expect(relativeTime(NOW_SEC - 300)).toBe('5m');
  });

  it('should format hours', () => {
    expect(relativeTime(NOW_SEC - 7200)).toBe('2h');
  });

  it('should format days', () => {
    expect(relativeTime(NOW_SEC - 172800)).toBe('2d');
  });
});
