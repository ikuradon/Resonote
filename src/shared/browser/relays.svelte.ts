import type {
  ConnectionState,
  RelayEntry,
  RelayState
} from '$features/relays/domain/relay-model.js';
import { parseRelayTags } from '$features/relays/domain/relay-model.js';
import { FOLLOW_KIND, RELAY_LIST_KIND } from '$shared/nostr/events.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('relays');

let relays = $state<RelayState[]>([]);
let subscription: { unsubscribe: () => void } | undefined;

export interface RelayListResult {
  entries: RelayEntry[];
  source: 'kind10002' | 'kind3' | 'none';
}

export function getRelays(): RelayState[] {
  return relays;
}

/**
 * Update the relay list display after login/logout or user relay changes.
 */
export async function refreshRelayList(urls: string[]): Promise<void> {
  log.info('Refreshing relay list', { count: urls.length, relays: urls });
  const { getRxNostr } = await import('$shared/nostr/gateway.js');
  const rxNostr = await getRxNostr();

  relays = urls.map((url) => {
    const status = rxNostr.getRelayStatus(url);
    return { url, state: (status?.connection ?? 'initialized') as ConnectionState };
  });
}

export async function initRelayStatus(): Promise<void> {
  if (subscription) return;

  const { getRxNostr } = await import('$shared/nostr/gateway.js');
  const rxNostr = await getRxNostr();

  relays = DEFAULT_RELAYS.map((url) => {
    const status = rxNostr.getRelayStatus(url);
    return { url, state: (status?.connection ?? 'initialized') as ConnectionState };
  });

  subscription = rxNostr.createConnectionStateObservable().subscribe((packet) => {
    log.debug('Relay connection state changed', { relay: packet.from, state: packet.state });
    const idx = relays.findIndex((r) => r.url === packet.from);
    if (idx >= 0) {
      relays[idx] = { url: packet.from, state: packet.state as ConnectionState };
    } else {
      relays = [...relays, { url: packet.from, state: packet.state as ConnectionState }];
    }
  });
}

export function destroyRelayStatus(): void {
  subscription?.unsubscribe();
  subscription = undefined;
  relays = [];
}

/**
 * Fetch relay list for a user.
 * Tries kind:10002 (NIP-65), then kind:3 content JSON.
 * Returns source='none' if no user relay list is found.
 */
export async function fetchRelayList(pubkey: string): Promise<RelayListResult> {
  log.info('Fetching relay list for user', { pubkey });
  const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
    import('rx-nostr'),
    import('$shared/nostr/gateway.js')
  ]);
  const rxNostr = await getRxNostr();

  const kind10002 = await new Promise<RelayEntry[] | null>((resolve) => {
    const req = createRxBackwardReq();
    let found: RelayEntry[] | null = null;
    let latestCreatedAt = 0;

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        const entries = parseRelayTags(packet.event.tags);
        if (entries.length > 0 && packet.event.created_at > latestCreatedAt) {
          latestCreatedAt = packet.event.created_at;
          found = entries;
        }
      },
      complete: () => {
        sub.unsubscribe();
        resolve(found);
      },
      error: (err) => {
        log.warn('Failed to fetch kind:10002', err);
        sub.unsubscribe();
        resolve(null);
      }
    });

    req.emit({ kinds: [RELAY_LIST_KIND], authors: [pubkey], limit: 1 });
    req.over();
  });

  if (kind10002 !== null) {
    log.info('Found kind:10002 relay list', { count: kind10002.length });
    return { entries: kind10002, source: 'kind10002' };
  }

  const kind3 = await new Promise<RelayEntry[] | null>((resolve) => {
    const req = createRxBackwardReq();
    let found: RelayEntry[] | null = null;
    let latestCreatedAt = 0;

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        try {
          if (packet.event.created_at <= latestCreatedAt) return;
          const content = JSON.parse(packet.event.content) as Record<
            string,
            { read?: boolean; write?: boolean }
          >;
          const entries: RelayEntry[] = Object.entries(content).map(([url, flags]) => ({
            url,
            read: flags.read ?? true,
            write: flags.write ?? true
          }));
          latestCreatedAt = packet.event.created_at;
          if (entries.length > 0) {
            found = entries;
          }
        } catch {
          // Ignore parse failures from malformed kind:3 content.
        }
      },
      complete: () => {
        sub.unsubscribe();
        resolve(found);
      },
      error: (err) => {
        log.warn('Failed to fetch kind:3', err);
        sub.unsubscribe();
        resolve(null);
      }
    });

    req.emit({ kinds: [FOLLOW_KIND], authors: [pubkey], limit: 1 });
    req.over();
  });

  if (kind3 !== null) {
    log.info('Found kind:3 relay list', { count: kind3.length });
    return { entries: kind3, source: 'kind3' };
  }

  log.info('No relay list found');
  return { entries: [], source: 'none' };
}

export async function publishRelayList(entries: RelayEntry[]): Promise<void> {
  const { publishRelayList: publish } =
    await import('$features/relays/application/relay-actions.js');
  const urls = await publish(entries);
  await refreshRelayList(urls);
}
