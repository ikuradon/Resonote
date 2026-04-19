/**
 * Nostr infra compatibility gateway.
 *
 * @deprecated This module is a frozen, subtract-only compatibility surface used during the
 * Auftakt migration. Normal app/runtime code should prefer
 * `$shared/auftakt/resonote.js` and feature/application facades.
 *
 * RETIREMENT POLICY:
 * This file will be removed once all external consumers are migrated.
 * Direct imports are restricted to a small file-level allowlist enforced by the
 * structure guard and `pnpm run check:auftakt-migration`.
 *
 * Do not add new exports here. Migrate callers away, then remove exports.
 */

import type {
  AggregateSessionState,
  ConsumerVisibleState,
  QueryDescriptor,
  ReadSettlement,
  ReconcileReasonCode,
  RelayConnectionState,
  RelayOverlay,
  RelayOverlayPolicy
} from '@auftakt/core';
import type { EventParameters } from 'nostr-typedef';

// --- Contract types ---

/** Minimal stored event shape. */
export interface StoredEvent {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}

/** Result of fetching the latest event by pubkey+kind. */
export type LatestEventResult = {
  tags: string[][];
  content: string;
  created_at: number;
} | null;

// Re-export EventParameters for convenience
export type {
  AggregateSessionState,
  ConsumerVisibleState,
  EventParameters,
  QueryDescriptor,
  ReadSettlement,
  ReconcileReasonCode,
  RelayConnectionState,
  RelayOverlay,
  RelayOverlayPolicy
};

// --- Publish ---
export { castSigned } from './client.js';
export {
  publishSignedEvent,
  publishSignedEvents,
  retryPendingPublishes
} from './publish-signed.js';

// --- Query ---
export {
  fetchLatestEvent,
  getRelayConnectionState,
  getRxNostr,
  observeRelayConnectionStates,
  setDefaultRelays
} from './client.js';
export { fetchBackwardEvents, fetchBackwardFirst } from './query.js';

// --- Compatibility-only raw session helpers ---
// Subtract-only: migrate callers away instead of extending this surface.
export { createRxBackwardReq, createRxForwardReq, uniq, verifier } from '@auftakt/adapter-relay';

// --- Storage ---
export { getEventsDB } from './event-db.js';
