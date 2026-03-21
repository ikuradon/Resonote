import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseReactionDisplay,
  typeIcon,
  relativeTime,
  typeLabel
} from './notification-display.js';

describe('parseReactionDisplay', () => {
  it('should return heart for plus content', () => {
    expect(parseReactionDisplay('+', [])).toEqual({ type: 'heart', content: '❤️' });
  });

  it('should return heart for empty content', () => {
    expect(parseReactionDisplay('', [])).toEqual({ type: 'heart', content: '❤️' });
  });

  it('should return text for plain emoji', () => {
    expect(parseReactionDisplay('🔥', [])).toEqual({ type: 'text', content: '🔥' });
  });

  it('should return emoji_image for custom emoji with a matching tag', () => {
    expect(parseReactionDisplay(':sushi:', [['emoji', 'sushi', 'https://example.com/sushi.png']]))
      .toEqual({
        type: 'emoji_image',
        content: ':sushi:',
        url: 'https://example.com/sushi.png'
      });
  });

  it('should return text when no matching emoji tag exists', () => {
    expect(parseReactionDisplay(':unknown:', [])).toEqual({ type: 'text', content: ':unknown:' });
  });
});

describe('typeIcon', () => {
  it('should return the speech balloon for replies', () => {
    expect(typeIcon('reply')).toBe('\u{1F4AC}');
  });

  it('should return the heart for reactions', () => {
    expect(typeIcon('reaction')).toBe('\u{2764}\u{FE0F}');
  });

  it('should return the at symbol for mentions', () => {
    expect(typeIcon('mention')).toBe('@');
  });

  it('should return the music note for follow comments', () => {
    expect(typeIcon('follow_comment')).toBe('\u{1F3B5}');
  });
});

describe('typeLabel', () => {
  it('should resolve translated notification labels', () => {
    expect(typeLabel('reply')).toBeTruthy();
    expect(typeLabel('reaction')).toBeTruthy();
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

  const nowSec = Math.floor(new Date('2026-01-15T12:00:00Z').getTime() / 1000);

  it('should format seconds', () => {
    expect(relativeTime(nowSec - 30)).toBe('30s');
  });

  it('should format minutes', () => {
    expect(relativeTime(nowSec - 300)).toBe('5m');
  });

  it('should format hours', () => {
    expect(relativeTime(nowSec - 7200)).toBe('2h');
  });

  it('should format days', () => {
    expect(relativeTime(nowSec - 172800)).toBe('2d');
  });
});
