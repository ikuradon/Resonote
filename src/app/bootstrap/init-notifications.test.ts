import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { subscribeNotificationsMock, destroyNotificationsMock } = vi.hoisted(() => ({
  subscribeNotificationsMock: vi.fn(),
  destroyNotificationsMock: vi.fn()
}));

vi.mock('$shared/browser/notifications.js', () => ({
  subscribeNotifications: subscribeNotificationsMock,
  destroyNotifications: destroyNotificationsMock
}));

// svelte の untrack をそのまま通過させる
vi.mock('svelte', () => ({
  untrack: (fn: () => void) => fn()
}));

import { manageNotifications } from './init-notifications.svelte.js';

const PUBKEY = 'aabbccdd'.repeat(8);

describe('manageNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('logged in, pubkey present', () => {
    it('calls subscribeNotifications immediately when follows is empty', () => {
      const result = manageNotifications(true, true, PUBKEY, new Set());
      expect(subscribeNotificationsMock).toHaveBeenCalledWith(PUBKEY, new Set());
      expect(result).toBeUndefined();
    });

    it('defers subscribeNotifications by 1000ms when follows is non-empty', () => {
      const follows = new Set(['pk1', 'pk2']);
      manageNotifications(true, true, PUBKEY, follows);
      expect(subscribeNotificationsMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(subscribeNotificationsMock).toHaveBeenCalledWith(PUBKEY, follows);
    });

    it('returns a cleanup function that clears the timer', () => {
      const follows = new Set(['pk1']);
      const cleanup = manageNotifications(true, true, PUBKEY, follows);
      expect(typeof cleanup).toBe('function');

      cleanup!();
      vi.advanceTimersByTime(1000);
      expect(subscribeNotificationsMock).not.toHaveBeenCalled();
    });
  });

  describe('logged out', () => {
    it('calls destroyNotifications when initialized and not logged in', () => {
      manageNotifications(false, true, null, new Set());
      expect(destroyNotificationsMock).toHaveBeenCalledOnce();
    });

    it('does not call destroyNotifications when not initialized', () => {
      manageNotifications(false, false, null, new Set());
      expect(destroyNotificationsMock).not.toHaveBeenCalled();
    });

    it('returns undefined when not logged in', () => {
      const result = manageNotifications(false, true, null, new Set());
      expect(result).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('returns undefined when loggedIn but pubkey is null', () => {
      const result = manageNotifications(true, true, null, new Set());
      expect(subscribeNotificationsMock).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('returns undefined when all conditions are false', () => {
      const result = manageNotifications(false, false, null, new Set());
      expect(result).toBeUndefined();
    });
  });
});
