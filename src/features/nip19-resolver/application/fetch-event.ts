/**
 * Fetch a single Nostr event by ID with optional relay hints.
 * Used by the [nip19] route to resolve note/nevent links.
 */

import { fetchNostrEventById } from '$shared/auftakt/resonote.js';

export interface FetchedEvent {
  kind: number;
  tags: string[][];
  content: string;
}

export async function fetchNostrEvent(
  eventId: string,
  relayHints: string[]
): Promise<FetchedEvent | null> {
  return fetchNostrEventById<FetchedEvent>(eventId, relayHints);
}
