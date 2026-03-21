import { isEmojiTag } from '$shared/utils/emoji.js';
import { getContentPathFromTags } from '$shared/nostr/helpers.js';
import { getProfileDisplay, type ProfileDisplay } from '$shared/browser/profile.js';
import { t, type TranslationKey } from '$shared/i18n/t.js';
import type { Notification, NotificationType } from '../domain/notification-model.js';

export interface ReactionDisplay {
  type: 'heart' | 'emoji_image' | 'text';
  content: string;
  url?: string;
}

export type NotificationActorDisplay = Pick<ProfileDisplay, 'displayName' | 'picture' | 'profileHref'>;

export interface NotificationItemDisplay {
  actor: NotificationActorDisplay;
  icon: string;
  label: string;
  timeLabel: string;
  unread: boolean;
  contentPath: string | null;
  reaction?: ReactionDisplay;
  contentPreview?: string;
  targetPreview?: string;
}

export interface NotificationItemDisplayOptions {
  contentPreview: (content: string) => string;
  targetTexts: Map<string, string>;
  unread?: boolean;
}

export function parseReactionDisplay(content: string, tags: string[][]): ReactionDisplay {
  if (content === '+' || content === '') {
    return { type: 'heart', content: '❤️' };
  }
  if (content.startsWith(':') && content.endsWith(':') && content.length > 2) {
    const shortcode = content.slice(1, -1);
    const emojiTag = tags.find((tag) => isEmojiTag(tag) && tag[1] === shortcode);
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

export function getNotificationActorDisplay(pubkey: string): NotificationActorDisplay {
  const { displayName, picture, profileHref } = getProfileDisplay(pubkey);
  return { displayName, picture, profileHref };
}

export function describeNotificationItem(
  notification: Notification,
  options: NotificationItemDisplayOptions
): NotificationItemDisplay {
  return {
    actor: getNotificationActorDisplay(notification.pubkey),
    icon: typeIcon(notification.type),
    label: typeLabel(notification.type),
    timeLabel: relativeTime(notification.createdAt),
    unread: options.unread ?? false,
    contentPath: getContentPathFromTags(notification.tags),
    reaction:
      notification.type === 'reaction' && notification.content
        ? parseReactionDisplay(notification.content, notification.tags)
        : undefined,
    contentPreview:
      notification.content && notification.type !== 'reaction'
        ? options.contentPreview(notification.content)
        : undefined,
    targetPreview: notification.targetEventId
      ? options.targetTexts.get(notification.targetEventId)
      : undefined
  };
}
