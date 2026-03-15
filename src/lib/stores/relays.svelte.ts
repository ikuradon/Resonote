import { createLogger } from '../utils/logger.js';
import { RELAY_LIST_KIND, FOLLOW_KIND } from '../nostr/events.js';

const log = createLogger('relays');

export interface RelayEntry {
  url: string;
  read: boolean;
  write: boolean;
}

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

/** Cached relay entries from login-time kind:10002 fetch. Used by settings page. */
let cachedRelayEntries: RelayEntry[] | null = null;

/** Store relay entries fetched during login for settings page reuse. */
export function setCachedRelayEntries(entries: RelayEntry[]): void {
  cachedRelayEntries = entries;
}

/** Get cached relay entries (null if not yet loaded). */
export function getCachedRelayEntries(): RelayEntry[] | null {
  return cachedRelayEntries;
}

/** Clear cached relay entries (on logout). */
export function clearCachedRelayEntries(): void {
  cachedRelayEntries = null;
}

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

export function shortUrl(url: string): string {
  return url.replace(/^wss?:\/\//, '');
}

export function stateColor(state: ConnectionState | null): string {
  switch (state) {
    case 'connected':
      return 'bg-emerald-400';
    case 'connecting':
    case 'retrying':
      return 'bg-amber-400 animate-pulse';
    case 'error':
    case 'rejected':
    case 'terminated':
      return 'bg-error';
    case 'waiting-for-retrying':
    case 'dormant':
    case 'initialized':
    default:
      return 'bg-text-muted';
  }
}

export function destroyRelayStatus(): void {
  subscription?.unsubscribe();
  subscription = undefined;
  relays = [];
}

/**
 * Parse NIP-65 "r" tags into RelayEntry objects.
 * Exported for testing.
 */
export function parseRelayTags(tags: string[][]): RelayEntry[] {
  return tags
    .filter((t) => t[0] === 'r' && t[1])
    .map((t) => {
      const url = t[1];
      const marker = t[2];
      if (marker === 'read') return { url, read: true, write: false };
      if (marker === 'write') return { url, read: false, write: true };
      return { url, read: true, write: true };
    });
}

export interface RelayListResult {
  entries: RelayEntry[];
  source: 'cache' | 'kind10002' | 'kind3' | 'none';
}

/**
 * Fetch relay list for a user.
 * Tries cache first, then kind:10002 (NIP-65), then kind:3 content JSON.
 * Returns source='none' if no user relay list found (caller decides fallback).
 */
export async function fetchRelayList(pubkey: string): Promise<RelayListResult> {
  // Use cached entries from login if available
  if (cachedRelayEntries) {
    log.info('Using cached relay list', { count: cachedRelayEntries.length });
    return { entries: cachedRelayEntries, source: 'cache' };
  }
  log.info('Fetching relay list for user', { pubkey });
  const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
    import('rx-nostr'),
    import('../nostr/client.js')
  ]);
  const rxNostr = await getRxNostr();

  // Try kind:10002 first
  const kind10002 = await new Promise<RelayEntry[] | null>((resolve) => {
    const req = createRxBackwardReq();
    let found: RelayEntry[] | null = null;

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        const entries = parseRelayTags(packet.event.tags);
        if (entries.length > 0) found = entries;
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

  // Fallback: kind:3 content JSON
  const kind3 = await new Promise<RelayEntry[] | null>((resolve) => {
    const req = createRxBackwardReq();
    let found: RelayEntry[] | null = null;

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        try {
          const content = JSON.parse(packet.event.content) as Record<
            string,
            { read?: boolean; write?: boolean }
          >;
          const entries: RelayEntry[] = Object.entries(content).map(([url, flags]) => ({
            url,
            read: flags.read ?? true,
            write: flags.write ?? true
          }));
          if (entries.length > 0) found = entries;
        } catch {
          // ignore parse failures
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

/**
 * Publish user's relay list as kind:10002 (NIP-65).
 * Updates runtime relays after success.
 */
export async function publishRelayList(entries: RelayEntry[]): Promise<void> {
  log.info('Publishing relay list', { count: entries.length });
  const { castSigned, getRxNostr } = await import('../nostr/client.js');

  const tags: string[][] = entries.map((e) => {
    if (e.read && e.write) return ['r', e.url];
    if (e.read) return ['r', e.url, 'read'];
    return ['r', e.url, 'write'];
  });

  await castSigned({ kind: RELAY_LIST_KIND, content: '', tags });

  // Update runtime relays
  const rxNostr = await getRxNostr();
  const urls = entries.map((e) => e.url);
  rxNostr.setDefaultRelays(urls);

  // Update cache so settings page stays in sync
  cachedRelayEntries = entries;

  await refreshRelayList(urls);
}
