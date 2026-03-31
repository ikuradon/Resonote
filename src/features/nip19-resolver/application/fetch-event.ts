/**
 * Fetch a single Nostr event by ID with optional relay hints.
 * Used by the [nip19] route to resolve note/nevent links.
 */

export interface FetchedEvent {
  kind: number;
  tags: string[][];
  content: string;
}

export async function fetchNostrEvent(
  eventId: string,
  relayHints: string[]
): Promise<FetchedEvent | null> {
  const { getStoreAsync } = await import('$shared/nostr/store.js');
  const store = await getStoreAsync();

  const cached = await store.fetchById(eventId, {
    relayHint: relayHints.length > 0 ? relayHints[0] : undefined,
    timeout: 10_000
  });

  if (!cached) return null;

  return {
    kind: cached.event.kind,
    tags: cached.event.tags,
    content: cached.event.content
  };
}
