import type { NotificationType } from '../stores/notifications.svelte.js';
import { t, type TranslationKey } from '../i18n/t.js';

export function typeIcon(type: NotificationType): string {
  switch (type) {
    case 'reply':
      return '\u{1F4AC}';
    case 'reaction':
      return '\u{2764}\u{FE0F}';
    case 'mention':
      return '@';
    case 'follow_comment':
      return '\u{1F3B5}';
  }
}

export function typeLabel(type: NotificationType): string {
  return t(`notification.${type}` as TranslationKey);
}

export function relativeTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
