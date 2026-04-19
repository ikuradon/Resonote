import { parseRelayTags } from '$features/relays/domain/relay-model.js';
import { RELAY_LIST_KIND } from '$shared/nostr/events.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

const log = createLogger('nostr:user-relays');

export { DEFAULT_RELAYS };

export async function applyUserRelays(pubkey: string): Promise<string[]> {
  log.info('Fetching user relay list (kind:10002)', { pubkey: shortHex(pubkey) });
  const { createRxBackwardReq, getRxNostr, setDefaultRelays } =
    await import('$shared/nostr/gateway.js');
  const rxNostr = await getRxNostr();

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

  return new Promise<string[]>((resolve) => {
    const req = createRxBackwardReq();
    let relayTags: string[][] = [];
    let latestCreatedAt = 0;

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        if (packet.event.created_at > latestCreatedAt) {
          latestCreatedAt = packet.event.created_at;
          relayTags = packet.event.tags;
        }
      },
      complete: () => {
        sub.unsubscribe();

        const entries = parseRelayTags(relayTags);
        if (entries.length > 0) {
          const urls = entries.map((entry) => entry.url);
          void (async () => {
            try {
              await setDefaultRelays(urls);
              log.info('Applied user relays', { count: urls.length, relays: urls });
              resolve(urls);
            } catch (err) {
              void applyFallbackDefaults(
                'Failed to apply fetched user relays, using defaults',
                err
              ).then(resolve);
            }
          })();
        } else {
          void applyFallbackDefaults('No user relays found, using defaults').then(resolve);
        }
      },
      error: (err) => {
        sub.unsubscribe();
        void applyFallbackDefaults('Failed to fetch user relays, using defaults', err).then(
          resolve
        );
      }
    });

    req.emit({ kinds: [RELAY_LIST_KIND], authors: [pubkey], limit: 1 });
    req.over();
  });
}

export async function resetToDefaultRelays(): Promise<void> {
  log.info('Resetting to default relays');
  const { setDefaultRelays } = await import('$shared/nostr/gateway.js');
  await setDefaultRelays(DEFAULT_RELAYS);
}
