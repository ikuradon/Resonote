/**
 * セッション初期化のオーケストレーター。
 * ログイン/ログアウト時に起きる処理をここに集約し、順序を追いやすくする。
 *
 * ログイン手順:
 * 1. 現在ユーザーの profile を default relay ですぐ hydrate する
 * 2. ユーザー relay list (kind:10002) を適用する
 * 3. relay 接続状態を更新する
 * 4. follows, custom emojis, bookmarks, mute list, profile 再試行を並列で fire-and-forget する
 *
 * ログアウト手順:
 * 1. default relay に戻す
 * 2. store state をクリアする
 * 3. events DB をクリアする
 */

import { clearStoredEvents } from '$shared/auftakt/resonote.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('session');

function hydrateCurrentUserProfile(
  fetchProfile: (pubkey: string) => Promise<void>,
  pubkey: string
): void {
  void fetchProfile(pubkey).catch((err) =>
    log.error('Failed to hydrate current user profile', err)
  );
}

export async function initSession(pubkey: string): Promise<void> {
  log.info('Initializing session stores');

  const [
    { applyUserRelays },
    { loadFollows, loadBookmarks, loadMuteList, loadCustomEmojis, refreshRelayList },
    { fetchProfile }
  ] = await Promise.all([
    import('$shared/nostr/relays-config.js'),
    import('$shared/browser/stores.js'),
    import('$shared/browser/profile.js')
  ]);

  hydrateCurrentUserProfile(fetchProfile, pubkey);

  const relayUrls = await applyUserRelays(pubkey);
  void refreshRelayList(relayUrls);

  // Fire-and-forget: ユーザーデータを並列で読む
  void loadFollows(pubkey).catch((err) => log.error('Failed to load follows', err));
  void loadCustomEmojis(pubkey).catch((err) => log.error('Failed to load custom emojis', err));
  void loadBookmarks(pubkey).catch((err) => log.error('Failed to load bookmarks', err));
  void loadMuteList(pubkey).catch((err) => log.error('Failed to load mute list', err));
  // 先行 hydrate で未解決だった場合だけ、user relay 適用後の読み取りとして効く。
  hydrateCurrentUserProfile(fetchProfile, pubkey);
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
    }
  ] = await Promise.all([
    import('$shared/nostr/relays-config.js'),
    import('$shared/nostr/relays.js'),
    import('$shared/browser/stores.js')
  ]);

  await resetToDefaultRelays();
  clearFollows();
  clearCustomEmojis();
  clearProfiles();
  clearBookmarks();
  clearMuteList();
  void refreshRelayList(DEFAULT_RELAYS);

  await clearStoredEvents();
}
