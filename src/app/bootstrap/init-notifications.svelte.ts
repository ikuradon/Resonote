/**
 * Notification subscription lifecycle manager.
 * Encapsulates the logic that was inline in +layout.svelte's $effect.
 *
 * Call manageNotifications() from a component $effect that tracks auth/follows.
 */

import { untrack } from 'svelte';

import { destroyNotifications, subscribeNotifications } from '$shared/browser/notifications.js';

/**
 * Manage notification subscription based on current auth/follows state.
 * Should be called from a reactive context ($effect) that tracks auth and follows.
 *
 * Returns a cleanup function (for the setTimeout case).
 */
export function manageNotifications(
  loggedIn: boolean,
  initialized: boolean,
  pubkey: string | null,
  follows: Set<string>
): (() => void) | undefined {
  if (loggedIn && pubkey) {
    if (follows.size === 0) {
      void untrack(() => subscribeNotifications(pubkey, follows));
      return;
    }
    const timer = setTimeout(() => {
      void untrack(() => subscribeNotifications(pubkey, follows));
    }, 1000);
    return () => clearTimeout(timer);
  } else if (initialized && !loggedIn) {
    untrack(() => destroyNotifications());
  }
  return undefined;
}
