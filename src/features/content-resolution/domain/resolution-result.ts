/**
 * Unified result type for content resolution.
 * No infra dependencies — pure data.
 */

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
  signedEvents: import('nostr-typedef').EventParameters[];
}

export function emptyResult(): ResolutionResult {
  return {
    metadata: {},
    additionalSubscriptions: [],
    signedEvents: []
  };
}
