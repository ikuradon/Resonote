import { parseRelayTags } from '$features/relays/domain/relay-model.js';
import { getRxNostr } from '$shared/nostr/client.js';
import { RELAY_LIST_KIND } from '$shared/nostr/events.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

const log = createLogger('nostr:user-relays');

export { DEFAULT_RELAYS };

export async function applyUserRelays(pubkey: string): Promise<string[]> {
  log.info('Fetching user relay list (kind:10002)', { pubkey: shortHex(pubkey) });

  try {
    const { fetchLatest } = await import('$shared/nostr/store.js');
    const event = await fetchLatest(pubkey, RELAY_LIST_KIND, {
      timeout: 10_000,
      directFallback: true
    });

    const rxNostr = await getRxNostr();

    if (event) {
      const entries = parseRelayTags(event.tags);
      if (entries.length > 0) {
        const urls = entries.map((entry) => entry.url);
        log.info('Applied user relays', { count: urls.length, relays: urls });
        rxNostr.setDefaultRelays(urls);
        return urls;
      }
    }

    log.info('No user relays found, using defaults');
    return DEFAULT_RELAYS;
  } catch (err) {
    log.warn('Failed to fetch user relays, using defaults', err);
    return DEFAULT_RELAYS;
  }
}

export async function resetToDefaultRelays(): Promise<void> {
  log.info('Resetting to default relays');
  const rxNostr = await getRxNostr();
  rxNostr.setDefaultRelays(DEFAULT_RELAYS);
}
