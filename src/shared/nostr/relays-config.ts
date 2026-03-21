import { parseRelayTags } from '$features/relays/domain/relay-model.js';
import { RELAY_LIST_KIND } from '$shared/nostr/events.js';
import { getRxNostr } from '$shared/nostr/gateway.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

const log = createLogger('nostr:user-relays');

export { DEFAULT_RELAYS };

export async function applyUserRelays(pubkey: string): Promise<string[]> {
  log.info('Fetching user relay list (kind:10002)', { pubkey: shortHex(pubkey) });
  const [{ createRxBackwardReq }] = await Promise.all([import('rx-nostr')]);
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
          const urls = entries.map((entry) => entry.url);
          log.info('Applied user relays', { count: urls.length, relays: urls });
          rxNostr.setDefaultRelays(urls);
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

export async function resetToDefaultRelays(): Promise<void> {
  log.info('Resetting to default relays');
  const rxNostr = await getRxNostr();
  rxNostr.setDefaultRelays(DEFAULT_RELAYS);
}
