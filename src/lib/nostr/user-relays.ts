import { getRxNostr } from './client.js';
import { DEFAULT_RELAYS } from './relays.js';
import { createLogger, shortHex } from '../utils/logger.js';
import { RELAY_LIST_KIND } from './events.js';

const log = createLogger('nostr:user-relays');

/**
 * Fetch user's relay list from NIP-65 (kind:10002) and apply it.
 * Falls back to DEFAULT_RELAYS if no relay list is found.
 */
export async function applyUserRelays(pubkey: string): Promise<string[]> {
  log.info('Fetching user relay list (kind:10002)', { pubkey: shortHex(pubkey) });
  const [{ createRxBackwardReq }, { parseRelayTags, setCachedRelayEntries }] = await Promise.all([
    import('rx-nostr'),
    import('../stores/relays.svelte.js')
  ]);
  const rxNostr = await getRxNostr();

  return new Promise<string[]>((resolve) => {
    const req = createRxBackwardReq();
    let relayTags: string[][] = [];

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        relayTags = packet.event.tags;
      },
      complete: () => {
        sub.unsubscribe();

        const entries = parseRelayTags(relayTags);
        if (entries.length > 0) {
          const urls = entries.map((e) => e.url);
          log.info('Applied user relays', { count: urls.length, relays: urls });
          rxNostr.setDefaultRelays(urls);
          setCachedRelayEntries(entries);
          resolve(urls);
        } else {
          log.info('No user relays found, using defaults');
          resolve(DEFAULT_RELAYS);
        }
      },
      error: (err) => {
        log.warn('Failed to fetch user relays, using defaults', err);
        sub.unsubscribe();
        resolve(DEFAULT_RELAYS);
      }
    });

    req.emit({ kinds: [RELAY_LIST_KIND], authors: [pubkey], limit: 1 });
    req.over();
  });
}

/**
 * Reset to default relays (on logout).
 */
export async function resetToDefaultRelays(): Promise<void> {
  log.info('Resetting to default relays');
  const rxNostr = await getRxNostr();
  rxNostr.setDefaultRelays(DEFAULT_RELAYS);
}
