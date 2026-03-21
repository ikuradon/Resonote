/**
 * Notification domain types.
 */

export type NotificationType = 'reply' | 'reaction' | 'mention' | 'follow_comment';

export interface Notification {
  id: string;
  type: NotificationType;
  pubkey: string;
  content: string;
  createdAt: number;
  tags: string[][];
  /** Event ID of the comment this notification targets (for reply/reaction) */
  targetEventId?: string;
}
