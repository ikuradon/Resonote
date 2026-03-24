/**
 * Unified result type for content resolution.
 * No infra dependencies — pure data.
 */

// eslint-disable-next-line no-restricted-imports -- type-only import; EventParameters is a pure type with no runtime dependency
import type { EventParameters } from 'nostr-typedef';

export interface EpisodeMetadata {
  title?: string;
  feedTitle?: string;
  image?: string;
  description?: string;
  enclosureUrl?: string;
}

export interface ResolutionResult {
  /** Resolved episode metadata for display. */
  metadata: EpisodeMetadata;
  /** If resolution discovered a podcast guid, the resolved content path for URL rewrite. */
  resolvedPath?: string;
  /** Additional Nostr I-tag values to subscribe to for merged comments. */
  additionalSubscriptions: string[];
  /** Pre-signed Nostr events to publish (NIP-B0 bookmarks). */
  signedEvents: EventParameters[];
}

export function emptyResult(): ResolutionResult {
  return {
    metadata: {},
    additionalSubscriptions: [],
    signedEvents: []
  };
}
