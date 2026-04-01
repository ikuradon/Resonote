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
  const attempts =
    relayHints.length > 0
      ? [
          ...relayHints.map((relayHint, index) => ({
            relayHint,
            timeout: index === 0 ? 10_000 : 5_000
          })),
          { relayHint: undefined, timeout: 10_000 }
        ]
      : [{ relayHint: undefined, timeout: 10_000 }];

  const cached = await new Promise<Awaited<ReturnType<typeof store.fetchById>>>((resolve) => {
    let pending = attempts.length;
    let settled = false;

    for (const attempt of attempts) {
      void store
        .fetchById(eventId, attempt)
        .then((result) => {
          if (settled) return;
          if (result) {
            settled = true;
            resolve(result);
            return;
          }

          pending -= 1;
          if (pending === 0) resolve(null);
        })
        .catch(() => {
          if (settled) return;
          pending -= 1;
          if (pending === 0) resolve(null);
        });
    }
  });

  if (!cached) return null;

  return {
    kind: cached.event.kind,
    tags: cached.event.tags,
    content: cached.event.content
  };
}
