import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const { logInfoMock, logErrorMock } = vi.hoisted(() => ({
  logInfoMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock
  }),
  shortHex: (s: string): string => s.slice(0, 8)
}));

vi.mock('$shared/utils/emoji.js', () => ({
  isEmojiTag: (tag: string[]): boolean => tag[0] === 'emoji' && tag.length >= 3
}));

import { clearCustomEmojis, getCustomEmojis } from './emoji-sets.svelte.js';

// ---- tests ----

describe('getCustomEmojis', () => {
  beforeEach(() => {
    clearCustomEmojis();
  });

  it('初期状態は空カテゴリで loading=false', () => {
    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });
});

describe('clearCustomEmojis', () => {
  beforeEach(() => {
    clearCustomEmojis();
  });

  it('stateを初期値にリセットする', () => {
    clearCustomEmojis();
    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });

  it('clearCustomEmojisを複数回呼び出しても安全', () => {
    clearCustomEmojis();
    clearCustomEmojis();
    const e = getCustomEmojis();
    expect(e.categories).toEqual([]);
    expect(e.loading).toBe(false);
  });
});
