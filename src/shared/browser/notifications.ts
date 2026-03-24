// @public — Stable API for route/component/feature consumers
/**
 * Notifications bridge — entry point for app/feature access.
 * Delegates to the feature view model.
 */

export type {
  Notification,
  NotificationType
} from '$features/notifications/domain/notification-model.js';
export type {
  NotificationActorDisplay,
  NotificationItemDisplay,
  NotificationItemDisplayOptions,
  ReactionDisplay
} from '$features/notifications/ui/notification-display.js';
export {
  describeNotificationItem,
  getNotificationActorDisplay,
  parseReactionDisplay,
  relativeTime,
  typeIcon,
  typeLabel
} from '$features/notifications/ui/notification-display.js';
export type {
  NotificationFeedFilter,
  NotificationFeedOptions,
  NotificationFeedSource
} from '$features/notifications/ui/notification-feed-view-model.svelte.js';
export { createNotificationFeedViewModel } from '$features/notifications/ui/notification-feed-view-model.svelte.js';
export {
  destroyNotifications,
  getLastRead,
  getNotifFilter,
  getNotifications,
  markAllAsRead,
  setNotifFilter,
  subscribeNotifications
} from '$features/notifications/ui/notifications-view-model.svelte.js';
