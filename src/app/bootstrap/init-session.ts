/**
 * Session initialization orchestrator.
 * Centralizes what happens on login/logout so the sequence is traceable in one place.
 *
 * Login sequence:
 * 1. Apply user relays (kind:10002)
 * 2. Refresh relay connections
 * 3. Load follows, custom emojis, bookmarks, mute list (parallel, fire-and-forget)
 *
 * Logout sequence:
 * 1. Reset to default relays
 * 2. Clear all store state
 * 3. Clear events DB
 */

import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('session');

export async function initSession(pubkey: string): Promise<void> {
  log.info('Initializing session stores');

  const [
    { applyUserRelays },
    { loadFollows, loadBookmarks, loadMuteList, loadCustomEmojis, refreshRelayList }
  ] = await Promise.all([
    import('$shared/nostr/user-relays.js'),
    import('$shared/browser/stores.js')
  ]);

  const relayUrls = await applyUserRelays(pubkey);
  void refreshRelayList(relayUrls);

  // Fire-and-forget: load user data in parallel
  void loadFollows(pubkey).catch((err) => log.error('Failed to load follows', err));
  void loadCustomEmojis(pubkey).catch((err) => log.error('Failed to load custom emojis', err));
  void loadBookmarks(pubkey).catch((err) => log.error('Failed to load bookmarks', err));
  void loadMuteList(pubkey).catch((err) => log.error('Failed to load mute list', err));
}

export async function destroySession(): Promise<void> {
  log.info('Destroying session stores');

  const [
    { resetToDefaultRelays },
    { DEFAULT_RELAYS },
    {
      clearFollows,
      clearCustomEmojis,
      clearProfiles,
      clearBookmarks,
      clearMuteList,
      refreshRelayList
    },
    { getEventsDB }
  ] = await Promise.all([
    import('$shared/nostr/user-relays.js'),
    import('$shared/nostr/relays.js'),
    import('$shared/browser/stores.js'),
    import('$shared/nostr/gateway.js')
  ]);

  await resetToDefaultRelays();
  clearFollows();
  clearCustomEmojis();
  clearProfiles();
  clearBookmarks();
  clearMuteList();
  void refreshRelayList(DEFAULT_RELAYS);

  const db = await getEventsDB();
  await db.clearAll();
}
