import type {
  CustomEmojiDiagnostics,
  CustomEmojiEmptyReason
} from '$shared/browser/custom-emoji-diagnostics.js';

export type CustomEmojiSettingsMessageKey =
  | 'settings.custom_emoji.reset_message'
  | 'settings.custom_emoji.not_checked'
  | 'settings.custom_emoji.status_ready'
  | 'settings.custom_emoji.status_loading'
  | 'settings.custom_emoji.status_error'
  | 'settings.custom_emoji.status_error_stale_custom_emoji'
  | 'settings.custom_emoji.status_error_stale_diagnostics'
  | 'settings.custom_emoji.empty_no_list_event'
  | 'settings.custom_emoji.empty_no_emoji_sources'
  | 'settings.custom_emoji.empty_only_invalid_set_refs'
  | 'settings.custom_emoji.empty_all_set_refs_missing'
  | 'settings.custom_emoji.empty_resolved_sets_empty'
  | 'settings.custom_emoji.empty_no_valid_emoji'
  | 'settings.custom_emoji.empty_unknown';

export type CustomEmojiSettingsTranslator = (key: CustomEmojiSettingsMessageKey) => string;

export interface CustomEmojiPubkeyChangeAction {
  changed: boolean;
  resetPubkey: string | null;
  refreshPubkey: string | null;
}

export function customEmojiPubkeyChangeAction(
  previousPubkey: string | null | undefined,
  nextPubkey: string | null
): CustomEmojiPubkeyChangeAction {
  if (previousPubkey === nextPubkey) {
    return { changed: false, resetPubkey: null, refreshPubkey: null };
  }
  return {
    changed: true,
    resetPubkey: nextPubkey,
    refreshPubkey: nextPubkey
  };
}

export function formatNostrTimestampSec(createdAtSec: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(createdAtSec * 1000));
}

export function formatAppTimestampMs(
  timestampMs: number | null,
  translate: CustomEmojiSettingsTranslator
): string {
  if (timestampMs === null) return translate('settings.custom_emoji.not_checked');
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestampMs));
}

export function emptyReasonMessage(
  reason: CustomEmojiEmptyReason | null,
  translate: CustomEmojiSettingsTranslator
): string {
  switch (reason) {
    case 'no-list-event':
      return translate('settings.custom_emoji.empty_no_list_event');
    case 'no-emoji-sources':
      return translate('settings.custom_emoji.empty_no_emoji_sources');
    case 'only-invalid-set-refs':
      return translate('settings.custom_emoji.empty_only_invalid_set_refs');
    case 'all-set-refs-missing':
      return translate('settings.custom_emoji.empty_all_set_refs_missing');
    case 'resolved-sets-empty':
      return translate('settings.custom_emoji.empty_resolved_sets_empty');
    case 'no-valid-emoji':
      return translate('settings.custom_emoji.empty_no_valid_emoji');
    case null:
      return translate('settings.custom_emoji.empty_unknown');
  }
}

export function customEmojiStatusMessage(
  input: Pick<CustomEmojiDiagnostics, 'status' | 'stale' | 'summary' | 'emptyReason' | 'error'>,
  translate: CustomEmojiSettingsTranslator
): string {
  if (input.status === 'ready') return translate('settings.custom_emoji.status_ready');
  if (input.status === 'empty') return emptyReasonMessage(input.emptyReason, translate);
  if (input.status === 'loading') return translate('settings.custom_emoji.status_loading');
  if (input.status === 'error' && input.stale && input.summary.emojiCount > 0) {
    return translate('settings.custom_emoji.status_error_stale_custom_emoji');
  }
  if (input.status === 'error' && input.stale) {
    return translate('settings.custom_emoji.status_error_stale_diagnostics');
  }
  if (input.status === 'error') {
    const errorMessage = translate('settings.custom_emoji.status_error');
    return input.error ? `${errorMessage}: ${input.error}` : errorMessage;
  }
  return translate('settings.custom_emoji.not_checked');
}

export function customEmojiResetCacheMessage(translate: CustomEmojiSettingsTranslator): string {
  return translate('settings.custom_emoji.reset_message');
}
