import { describe, expect, it } from 'vitest';

import {
  clearCustomEmojiCacheMessage,
  customEmojiStatusMessage,
  emptyReasonMessage,
  formatAppTimestampMs,
  formatNostrTimestampSec
} from './custom-emoji-settings-view-model.js';

const testT = (key: string) => `tx:${key}`;

describe('custom emoji settings view model', () => {
  it('formats Nostr seconds separately from app milliseconds', () => {
    expect(formatNostrTimestampSec(1777939200)).toContain('2026');
    expect(formatAppTimestampMs(1777939200000, testT)).toContain('2026');
  });

  it('uses localized copy for app timestamps that were not checked yet', () => {
    expect(formatAppTimestampMs(null, testT)).toBe('tx:settings.custom_emoji.not_checked');
  });

  it('uses localized status copy instead of hard-coded English', () => {
    expect(
      customEmojiStatusMessage(
        {
          status: 'ready',
          stale: false,
          summary: { categoryCount: 1, emojiCount: 2 },
          emptyReason: null,
          error: null
        },
        testT
      )
    ).toBe('tx:settings.custom_emoji.status_ready');

    expect(emptyReasonMessage('no-list-event', testT)).toBe(
      'tx:settings.custom_emoji.empty_no_list_event'
    );
  });

  it('uses stale copy for previous emoji categories', () => {
    expect(
      customEmojiStatusMessage(
        {
          status: 'error',
          stale: true,
          summary: { categoryCount: 1, emojiCount: 2 },
          emptyReason: null,
          error: 'fetch failed'
        },
        testT
      )
    ).toBe('tx:settings.custom_emoji.status_error_stale_custom_emoji');
  });

  it('uses stale copy for previous empty diagnostics', () => {
    expect(
      customEmojiStatusMessage(
        {
          status: 'error',
          stale: true,
          summary: { categoryCount: 0, emojiCount: 0 },
          emptyReason: 'no-list-event',
          error: 'fetch failed'
        },
        testT
      )
    ).toBe('tx:settings.custom_emoji.status_error_stale_diagnostics');
  });

  it('contains all required clear cache warnings', () => {
    expect(clearCustomEmojiCacheMessage()).toContain('all accounts');
    expect(clearCustomEmojiCacheMessage()).toContain('locally cached');
    expect(clearCustomEmojiCacheMessage()).toContain('published Nostr events will not be deleted');
  });
});
