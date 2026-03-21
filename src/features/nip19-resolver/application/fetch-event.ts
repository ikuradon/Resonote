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
  const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
    import('rx-nostr'),
    import('$shared/nostr/gateway.js')
  ]);
  const rxNostr = await getRxNostr();

  // Use rx-nostr temporary relays for relay hints (auto-connect, auto-disconnect)
  const useOptions =
    relayHints.length > 0 ? { on: { relays: relayHints, defaultReadRelays: true } } : undefined;

  const fetchPromise = new Promise<FetchedEvent | null>((resolve) => {
    const req = createRxBackwardReq();
    let found: FetchedEvent | null = null;

    const sub = rxNostr.use(req, useOptions).subscribe({
      next: (packet) => {
        found = packet.event;
      },
      complete: () => {
        sub.unsubscribe();
        resolve(found);
      },
      error: () => {
        sub.unsubscribe();
        resolve(found);
      }
    });

    req.emit({ ids: [eventId] });
    req.over();
  });

  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 10_000);
  });

  return Promise.race([fetchPromise, timeoutPromise]);
}
