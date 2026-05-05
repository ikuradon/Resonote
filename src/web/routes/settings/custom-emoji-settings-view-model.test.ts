import { describe, expect, it } from 'vitest';

import {
  customEmojiPubkeyChangeAction,
  customEmojiResetCacheMessage,
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

  it('refreshes once when the observed pubkey changes to a logged-in account', () => {
    expect(customEmojiPubkeyChangeAction(undefined, null)).toEqual({
      changed: true,
      resetPubkey: null,
      refreshPubkey: null
    });
    expect(customEmojiPubkeyChangeAction(null, 'pubkey-a')).toEqual({
      changed: true,
      resetPubkey: 'pubkey-a',
      refreshPubkey: 'pubkey-a'
    });
    expect(customEmojiPubkeyChangeAction('pubkey-a', 'pubkey-a')).toEqual({
      changed: false,
      resetPubkey: null,
      refreshPubkey: null
    });
    expect(customEmojiPubkeyChangeAction('pubkey-a', 'pubkey-b')).toEqual({
      changed: true,
      resetPubkey: 'pubkey-b',
      refreshPubkey: 'pubkey-b'
    });
    expect(customEmojiPubkeyChangeAction('pubkey-b', null)).toEqual({
      changed: true,
      resetPubkey: null,
      refreshPubkey: null
    });
  });

  it('uses localized reset cache warning copy', () => {
    const message = customEmojiResetCacheMessage((key) => {
      expect(key).toBe('settings.custom_emoji.reset_message');
      return [
        'This deletes locally cached custom emoji lists and emoji sets for all accounts on this device.',
        'Your published Nostr events will not be deleted.',
        'You may need to refresh custom emoji again after this.'
      ].join('\n');
    });

    expect(message).toContain('all accounts');
    expect(message).toContain('locally cached');
    expect(message).toContain('published Nostr events will not be deleted');
  });
});
