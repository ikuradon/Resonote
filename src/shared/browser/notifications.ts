// @public — Stable API for route/component/feature consumers
/**
 * Notifications bridge — entry point for app/feature access.
 * Delegates to the feature view model.
 */

export {
  subscribeNotifications,
  destroyNotifications,
  getNotifications,
  getNotifFilter,
  setNotifFilter,
  markAllAsRead,
  getLastRead
} from '../../features/notifications/ui/notifications-view-model.svelte.js';
export { createNotificationFeedViewModel } from '../../features/notifications/ui/notification-feed-view-model.svelte.js';
export {
  parseReactionDisplay,
  getNotificationActorDisplay,
  describeNotificationItem,
  typeIcon,
  typeLabel,
  relativeTime
} from '../../features/notifications/ui/notification-display.js';
export type {
  Notification,
  NotificationType
} from '../../features/notifications/domain/notification-model.js';
export type {
  ReactionDisplay,
  NotificationActorDisplay,
  NotificationItemDisplay,
  NotificationItemDisplayOptions
} from '../../features/notifications/ui/notification-display.js';
export type {
  NotificationFeedFilter,
  NotificationFeedOptions,
  NotificationFeedSource
} from '../../features/notifications/ui/notification-feed-view-model.svelte.js';
