import type { NotificationType } from '../stores/notifications.svelte.js';
import { t, type TranslationKey } from '../i18n/t.js';
import { isEmojiTag } from './emoji.js';

export interface ReactionDisplay {
  type: 'heart' | 'emoji_image' | 'text';
  content: string;
  url?: string;
}

/**
 * Parse a reaction notification into a display format.
 * "+" or "" → heart, :shortcode: with emoji tag → image, else → text
 */
export function parseReactionDisplay(content: string, tags: string[][]): ReactionDisplay {
  if (content === '+' || content === '') {
    return { type: 'heart', content: '❤️' };
  }
  // Check for custom emoji: content is :shortcode: and tags has matching emoji tag
  if (content.startsWith(':') && content.endsWith(':') && content.length > 2) {
    const shortcode = content.slice(1, -1);
    const emojiTag = tags.find((t) => isEmojiTag(t) && t[1] === shortcode);
    if (emojiTag) {
      return { type: 'emoji_image', content, url: emojiTag[2] };
    }
  }
  return { type: 'text', content };
}

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
