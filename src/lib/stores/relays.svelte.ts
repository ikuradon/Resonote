import { createLogger } from '../utils/logger.js';

const log = createLogger('relays');

export type ConnectionState =
  | 'initialized'
  | 'connecting'
  | 'connected'
  | 'waiting-for-retrying'
  | 'retrying'
  | 'dormant'
  | 'error'
  | 'rejected'
  | 'terminated';

export interface RelayState {
  url: string;
  state: ConnectionState;
}

let relays = $state<RelayState[]>([]);
let subscription: { unsubscribe: () => void } | undefined;

export function getRelays(): RelayState[] {
  return relays;
}

/**
 * Update the relay list display (e.g. after login/logout changes relays).
 */
export async function refreshRelayList(urls: string[]): Promise<void> {
  log.info('Refreshing relay list', { count: urls.length, relays: urls });
  const { getRxNostr } = await import('../nostr/client.js');
  const rxNostr = await getRxNostr();

  relays = urls.map((url) => {
    const status = rxNostr.getRelayStatus(url);
    return { url, state: (status?.connection ?? 'initialized') as ConnectionState };
  });
}

export async function initRelayStatus(): Promise<void> {
  if (subscription) return;

  const [{ getRxNostr }, { DEFAULT_RELAYS }] = await Promise.all([
    import('../nostr/client.js'),
    import('../nostr/relays.js')
  ]);

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
