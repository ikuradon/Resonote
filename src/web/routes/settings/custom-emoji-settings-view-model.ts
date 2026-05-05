import type {
  CustomEmojiDiagnostics,
  CustomEmojiEmptyReason
} from '$shared/browser/custom-emoji-diagnostics.js';

export function formatNostrTimestampSec(createdAtSec: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(createdAtSec * 1000));
}

export function formatAppTimestampMs(timestampMs: number | null): string {
  if (timestampMs === null) return 'Not checked yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestampMs));
}

function emptyReasonMessage(reason: CustomEmojiEmptyReason | null): string {
  switch (reason) {
    case 'no-list-event':
      return 'No custom emoji list found.';
    case 'no-emoji-sources':
      return 'Custom emoji list found, but it does not contain emoji sources.';
    case 'only-invalid-set-refs':
      return 'Custom emoji list found, but its emoji set references are invalid.';
    case 'all-set-refs-missing':
      return 'Custom emoji list found, but referenced emoji sets could not be resolved.';
    case 'resolved-sets-empty':
      return 'Emoji sets were resolved, but they contain no valid emoji.';
    case 'no-valid-emoji':
      return 'No valid custom emoji found.';
    case null:
      return 'No custom emoji diagnostics yet.';
  }
}

export function customEmojiStatusMessage(
  input: Pick<CustomEmojiDiagnostics, 'status' | 'stale' | 'summary' | 'emptyReason' | 'error'>
): string {
  if (input.status === 'ready') return 'Custom emoji list found.';
  if (input.status === 'empty') return emptyReasonMessage(input.emptyReason);
  if (input.status === 'loading') return 'Loading custom emoji diagnostics...';
  if (input.status === 'error' && input.stale && input.summary.emojiCount > 0) {
    return 'Refresh failed. Using previously loaded custom emoji.';
  }
  if (input.status === 'error' && input.stale) {
    return 'Refresh failed. Showing the previous diagnostics result.';
  }
  if (input.status === 'error') return input.error ?? 'Failed to refresh custom emoji.';
  return 'Not checked yet.';
}

export function clearCustomEmojiCacheMessage(): string {
  return [
    'This deletes locally cached custom emoji lists and emoji sets for all accounts on this device.',
    'Your published Nostr events will not be deleted.',
    'You may need to refresh custom emoji again after this.'
  ].join('\n');
}
