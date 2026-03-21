/**
 * Relay domain types and pure functions.
 */

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

export type RelayStateLabelKey =
  | 'relay.state.connected'
  | 'relay.state.connecting'
  | 'relay.state.retrying'
  | 'relay.state.waiting'
  | 'relay.state.dormant'
  | 'relay.state.ready'
  | 'relay.state.error'
  | 'relay.state.rejected'
  | 'relay.state.closed';

export interface RelayState {
  url: string;
  state: ConnectionState;
}

/** Parse NIP-65 "r" tags into RelayEntry objects. */
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

/** Shorten a relay URL for display. */
export function shortUrl(url: string): string {
  return url.replace(/^wss?:\/\//, '');
}

/** Get a CSS color class for a connection state. */
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

/** Translation key for a relay connection state. */
export function relayStateLabelKey(state: ConnectionState): RelayStateLabelKey {
  switch (state) {
    case 'connected':
      return 'relay.state.connected';
    case 'connecting':
      return 'relay.state.connecting';
    case 'retrying':
      return 'relay.state.retrying';
    case 'waiting-for-retrying':
      return 'relay.state.waiting';
    case 'dormant':
      return 'relay.state.dormant';
    case 'initialized':
      return 'relay.state.ready';
    case 'error':
      return 'relay.state.error';
    case 'rejected':
      return 'relay.state.rejected';
    case 'terminated':
      return 'relay.state.closed';
  }
}

/** States where a relay is still attempting to connect. */
const TRANSITIONAL_STATES: Set<ConnectionState> = new Set([
  'initialized',
  'connecting',
  'retrying',
  'waiting-for-retrying'
]);

/** Check if a connection state is transitional (connecting/retrying). */
export function isTransitionalState(state: ConnectionState): boolean {
  return TRANSITIONAL_STATES.has(state);
}
