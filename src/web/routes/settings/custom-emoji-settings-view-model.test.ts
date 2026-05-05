import { describe, expect, it } from 'vitest';

import {
  clearCustomEmojiCacheMessage,
  customEmojiStatusMessage,
  formatAppTimestampMs,
  formatNostrTimestampSec
} from './custom-emoji-settings-view-model.js';

describe('custom emoji settings view model', () => {
  it('formats Nostr seconds separately from app milliseconds', () => {
    expect(formatNostrTimestampSec(1777939200)).toContain('2026');
    expect(formatAppTimestampMs(1777939200000)).toContain('2026');
  });

  it('uses stale copy for previous emoji categories', () => {
    expect(
      customEmojiStatusMessage({
        status: 'error',
        stale: true,
        summary: { categoryCount: 1, emojiCount: 2 },
        emptyReason: null,
        error: 'fetch failed'
      })
    ).toBe('Refresh failed. Using previously loaded custom emoji.');
  });

  it('uses stale copy for previous empty diagnostics', () => {
    expect(
      customEmojiStatusMessage({
        status: 'error',
        stale: true,
        summary: { categoryCount: 0, emojiCount: 0 },
        emptyReason: 'no-list-event',
        error: 'fetch failed'
      })
    ).toBe('Refresh failed. Showing the previous diagnostics result.');
  });

  it('contains all required clear cache warnings', () => {
    expect(clearCustomEmojiCacheMessage()).toContain('all accounts');
    expect(clearCustomEmojiCacheMessage()).toContain('locally cached');
    expect(clearCustomEmojiCacheMessage()).toContain('published Nostr events will not be deleted');
  });
});
