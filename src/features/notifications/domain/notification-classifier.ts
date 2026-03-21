/**
 * Notification classification — pure function extracted from notifications.svelte.ts.
 */

import type { NotificationType } from './notification-model.js';

const COMMENT_KIND = 1111;
const REACTION_KIND = 7;

/**
 * Classify a Nostr event as a notification type.
 * Returns null if the event is not a relevant notification.
 */
export function classifyNotificationEvent(
  event: {
    pubkey: string;
    kind: number;
    tags: string[][];
  },
  myPubkey: string,
  follows: Set<string>
): NotificationType | null {
  if (event.pubkey === myPubkey) return null;

  const hasPTag = event.tags.some((t) => t[0] === 'p' && t[1] === myPubkey);
  const hasETag = event.tags.some((t) => t[0] === 'e' && t[1]);

  if (event.kind === REACTION_KIND && hasPTag) return 'reaction';
  if (event.kind === COMMENT_KIND) {
    if (hasPTag && hasETag) return 'reply';
    if (hasPTag && !hasETag) return 'mention';
    if (follows.has(event.pubkey)) return 'follow_comment';
  }

  return null;
}
