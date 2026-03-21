// @public — Stable API for route/component/feature consumers
/**
 * Nostr infra gateway — the stable contract for features to access Nostr infrastructure.
 *
 * This gateway provides typed interfaces and re-exports, establishing a boundary
 * that decouples features from the underlying rx-nostr/IndexedDB implementation.
 * Features and app modules import ONLY from this gateway, never from $lib/nostr/* directly.
 */

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
export type { EventParameters };

// --- Publish ---
export { castSigned } from './client.js';
export { publishSignedEvent, publishSignedEvents, retryPendingPublishes } from './publish-signed.js';

// --- Query ---
export { fetchLatestEvent, getRxNostr } from './client.js';

// --- Storage ---
export { getEventsDB } from './event-db.js';
