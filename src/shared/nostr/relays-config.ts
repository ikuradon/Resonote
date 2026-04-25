import { parseRelayTags } from '$features/relays/domain/relay-model.js';
import { RELAY_LIST_KIND } from '$shared/nostr/events.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

const log = createLogger('nostr:user-relays');

export { DEFAULT_RELAYS };

export async function applyUserRelays(pubkey: string): Promise<string[]> {
  log.info('Fetching user relay list (kind:10002)', { pubkey: shortHex(pubkey) });
  const { fetchLatestEvent, setDefaultRelays } = await import('$shared/nostr/client.js');

  async function applyFallbackDefaults(reason: string, error?: unknown): Promise<string[]> {
    try {
      await setDefaultRelays(DEFAULT_RELAYS);
    } catch (fallbackError) {
      log.warn(`Failed to apply default relays after ${reason}`, fallbackError);
    }

    if (error) {
      log.warn(reason, error);
    } else {
      log.info(reason);
    }

    return DEFAULT_RELAYS;
  }

  let relayTags: string[][];
  try {
    const latest = await fetchLatestEvent(pubkey, RELAY_LIST_KIND);
    relayTags = latest?.tags ?? [];
  } catch (err) {
    return applyFallbackDefaults('Failed to fetch user relays, using defaults', err);
  }

  const entries = parseRelayTags(relayTags);
  if (entries.length === 0) {
    return applyFallbackDefaults('No user relays found, using defaults');
  }

  const urls = entries.map((entry) => entry.url);
  try {
    await setDefaultRelays(urls);
    log.info('Applied user relays', { count: urls.length, relays: urls });
    return urls;
  } catch (err) {
    return applyFallbackDefaults('Failed to apply fetched user relays, using defaults', err);
  }
}

export async function resetToDefaultRelays(): Promise<void> {
  log.info('Resetting to default relays');
  const { setDefaultRelays } = await import('$shared/nostr/client.js');
  await setDefaultRelays(DEFAULT_RELAYS);
}
