import type {
  AggregateSessionState,
  RelayObservation,
  RelayObservationPacket,
  RelayObservationSnapshot
} from '@auftakt/core';

import type { RelayEntry, RelayState } from '$features/relays/domain/relay-model.js';
import { parseRelayTags } from '$features/relays/domain/relay-model.js';
import {
  fetchRelayListEvents,
  observeRelayStatuses,
  snapshotRelayStatuses
} from '$shared/auftakt/resonote.js';
import { FOLLOW_KIND, RELAY_LIST_KIND } from '$shared/nostr/events.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('relays');

let relays = $state<RelayState[]>([]);
let aggregateState = $state<AggregateSessionState>('booting');
let subscription: { unsubscribe(): void } | undefined;

export interface RelayListResult {
  entries: RelayEntry[];
  source: 'kind10002' | 'kind3' | 'none';
}

export function getRelays(): RelayState[] {
  return relays;
}

export function getAggregateRelaySessionState(): AggregateSessionState {
  return aggregateState;
}

function relayObservationConnectionToUiState(
  connection: RelayObservation['connection'] | undefined
): RelayState['state'] {
  switch (connection) {
    case undefined:
      return 'initialized';
    case 'connecting':
      return 'connecting';
    case 'idle':
      return 'initialized';
    case 'open':
      return 'connected';
    case 'backoff':
      return 'waiting-for-retrying';
    case 'replaying':
      return 'retrying';
    case 'degraded':
      return 'error';
    case 'closed':
      return 'terminated';
    default:
      return 'initialized';
  }
}

function relaySnapshotToUiState(
  snapshot: Pick<RelayObservationSnapshot, 'url' | 'relay'>
): RelayState {
  return {
    url: snapshot.url,
    state: relayObservationConnectionToUiState(snapshot.relay.connection)
  };
}

function relayPacketToUiState(packet: RelayObservationPacket): RelayState {
  return {
    url: packet.from,
    state: relayObservationConnectionToUiState(packet.relay.connection)
  };
}

/**
 * Update the relay list display after login/logout or user relay changes.
 */
export async function refreshRelayList(urls: string[]): Promise<void> {
  log.info('Refreshing relay list', { count: urls.length, relays: urls });
  const snapshot = await snapshotRelayStatuses(urls);
  aggregateState = snapshot[0]?.aggregate.state ?? 'booting';
  relays = snapshot.map(relaySnapshotToUiState);
}

export async function initRelayStatus(): Promise<void> {
  if (subscription) return;

  const snapshot = await snapshotRelayStatuses(DEFAULT_RELAYS);
  aggregateState = snapshot[0]?.aggregate.state ?? 'booting';

  relays = snapshot.map(relaySnapshotToUiState);

  subscription = await observeRelayStatuses((packet) => {
    log.debug('Relay connection state changed', {
      relay: packet.from,
      connection: packet.relay.connection,
      aggregate: packet.aggregate.state,
      reason: packet.relay.reason
    });
    aggregateState = packet.aggregate.state;
    const idx = relays.findIndex((r) => r.url === packet.from);
    const nextRelay = relayPacketToUiState(packet);
    if (idx >= 0) {
      relays[idx] = nextRelay;
    } else {
      relays = [...relays, nextRelay];
    }
  });
}

export function destroyRelayStatus(): void {
  subscription?.unsubscribe();
  subscription = undefined;
  aggregateState = 'booting';
  relays = [];
}

function latestTaggedRelayEntry(
  events: Array<{ created_at?: number; tags?: string[][] }>
): RelayEntry[] | null {
  let latestCreatedAt = 0;
  let found: RelayEntry[] | null = null;
  for (const event of events) {
    const createdAt = event.created_at ?? 0;
    if (createdAt <= latestCreatedAt) continue;
    latestCreatedAt = createdAt;
    const entries = parseRelayTags(event.tags ?? []);
    found = entries.length > 0 ? entries : null;
  }
  return found;
}

function latestKind3RelayEntry(
  events: Array<{ created_at?: number; content?: string }>
): RelayEntry[] | null {
  let latestCreatedAt = 0;
  let found: RelayEntry[] | null = null;
  for (const event of events) {
    try {
      const createdAt = event.created_at ?? 0;
      if (createdAt <= latestCreatedAt) continue;
      const content = JSON.parse(event.content ?? '') as Record<
        string,
        { read?: boolean; write?: boolean }
      >;
      const entries: RelayEntry[] = Object.entries(content).map(([url, flags]) => ({
        url,
        read: flags.read ?? true,
        write: flags.write ?? true
      }));
      latestCreatedAt = createdAt;
      found = entries.length > 0 ? entries : null;
    } catch {
      // ignore malformed kind:3 content
    }
  }
  return found;
}

/**
 * Fetch relay list for a user.
 * Tries kind:10002 (NIP-65), then kind:3 content JSON.
 * Returns source='none' if no user relay list is found.
 */
export async function fetchRelayList(pubkey: string): Promise<RelayListResult> {
  log.info('Fetching relay list for user', { pubkey });
  const { relayListEvents, followListEvents } = await fetchRelayListEvents(
    pubkey,
    RELAY_LIST_KIND,
    FOLLOW_KIND
  );
  const kind10002 = latestTaggedRelayEntry(relayListEvents);

  if (kind10002 !== null) {
    log.info('Found kind:10002 relay list', { count: kind10002.length });
    return { entries: kind10002, source: 'kind10002' };
  }

  const kind3 = latestKind3RelayEntry(followListEvents);

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
