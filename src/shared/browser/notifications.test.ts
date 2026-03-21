/**
 * notifications.ts is a public re-export barrel.
 * Tests here cover the pure display helpers it re-exports from notification-display.ts,
 * verifying that the public API surface is reachable from the barrel path.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseReactionDisplay,
  typeIcon,
  typeLabel,
  relativeTime
} from './notifications.js';

describe('notifications barrel: parseReactionDisplay', () => {
  it('returns heart for "+"', () => {
    expect(parseReactionDisplay('+', [])).toEqual({ type: 'heart', content: '❤️' });
  });

  it('returns heart for empty string', () => {
    expect(parseReactionDisplay('', [])).toEqual({ type: 'heart', content: '❤️' });
  });

  it('returns text for plain emoji string', () => {
    expect(parseReactionDisplay('🔥', [])).toEqual({ type: 'text', content: '🔥' });
  });

  it('returns emoji_image when matching emoji tag exists', () => {
    const tags = [['emoji', 'wave', 'https://example.com/wave.png']];
    expect(parseReactionDisplay(':wave:', tags)).toEqual({
      type: 'emoji_image',
      content: ':wave:',
      url: 'https://example.com/wave.png'
    });
  });

  it('returns text when no matching emoji tag found', () => {
    expect(parseReactionDisplay(':unknown:', [])).toEqual({ type: 'text', content: ':unknown:' });
  });
});

describe('notifications barrel: typeIcon', () => {
  it('returns speech balloon for reply', () => {
    expect(typeIcon('reply')).toBe('💬');
  });

  it('returns heart for reaction', () => {
    expect(typeIcon('reaction')).toBe('❤️');
  });

  it('returns @ for mention', () => {
    expect(typeIcon('mention')).toBe('@');
  });

  it('returns music note for follow_comment', () => {
    expect(typeIcon('follow_comment')).toBe('🎵');
  });
});

describe('notifications barrel: typeLabel', () => {
  it('returns a non-empty string for reply', () => {
    expect(typeLabel('reply')).toBeTruthy();
  });

  it('returns a non-empty string for reaction', () => {
    expect(typeLabel('reaction')).toBeTruthy();
  });

  it('returns a non-empty string for mention', () => {
    expect(typeLabel('mention')).toBeTruthy();
  });

  it('returns a non-empty string for follow_comment', () => {
    expect(typeLabel('follow_comment')).toBeTruthy();
  });
});

describe('notifications barrel: relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const nowSec = Math.floor(new Date('2026-01-15T12:00:00Z').getTime() / 1000);

  it('formats seconds', () => {
    expect(relativeTime(nowSec - 45)).toBe('45s');
  });

  it('formats minutes', () => {
    expect(relativeTime(nowSec - 120)).toBe('2m');
  });

  it('formats hours', () => {
    expect(relativeTime(nowSec - 3600)).toBe('1h');
  });

  it('formats days', () => {
    expect(relativeTime(nowSec - 86400)).toBe('1d');
  });
});
