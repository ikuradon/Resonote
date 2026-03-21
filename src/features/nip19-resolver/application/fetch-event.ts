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

  // Temporarily add relay hints
  if (relayHints.length > 0) {
    const current = Object.keys(rxNostr.getDefaultRelays());
    const newRelays = relayHints.filter((r: string) => !current.includes(r));
    if (newRelays.length > 0) {
      rxNostr.addDefaultRelays(newRelays);
    }
  }

  const fetchPromise = new Promise<FetchedEvent | null>((resolve) => {
    const req = createRxBackwardReq();
    let found: FetchedEvent | null = null;

    const sub = rxNostr.use(req).subscribe({
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
