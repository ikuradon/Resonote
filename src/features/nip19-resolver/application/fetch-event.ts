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

  // Try each relay hint in order until found
  let cached = await store.fetchById(eventId, {
    relayHint: relayHints.length > 0 ? relayHints[0] : undefined,
    timeout: 10_000
  });

  if (!cached && relayHints.length > 1) {
    for (const hint of relayHints.slice(1)) {
      cached = await store.fetchById(eventId, { relayHint: hint, timeout: 5_000 });
      if (cached) break;
    }
  }

  if (!cached) return null;

  return {
    kind: cached.event.kind,
    tags: cached.event.tags,
    content: cached.event.content
  };
}
