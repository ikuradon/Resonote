import { getRxNostr } from './client.js';
import { DEFAULT_RELAYS } from './relays.js';
import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('nostr:user-relays');

/**
 * Fetch user's relay list from NIP-65 (kind:10002) and apply it.
 * Falls back to DEFAULT_RELAYS if no relay list is found.
 */
export async function applyUserRelays(pubkey: string): Promise<string[]> {
  log.info('Fetching user relay list (kind:10002)', { pubkey: shortHex(pubkey) });
  const [{ createRxBackwardReq }] = await Promise.all([import('rx-nostr')]);
  const rxNostr = await getRxNostr();

  return new Promise<string[]>((resolve) => {
    const req = createRxBackwardReq();
    let relayUrls: string[] = [];

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        const tags = packet.event.tags;
        relayUrls = tags.filter((t) => t[0] === 'r' && t[1]).map((t) => t[1]);
      },
      complete: () => {
        sub.unsubscribe();

        if (relayUrls.length > 0) {
          log.info('Applied user relays', { count: relayUrls.length, relays: relayUrls });
          rxNostr.setDefaultRelays(relayUrls);
          resolve(relayUrls);
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

    req.emit({ kinds: [10002], authors: [pubkey], limit: 1 });
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
