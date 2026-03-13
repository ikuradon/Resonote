/** Follow list (NIP-02 kind:3) and Web of Trust store */

import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('follows');

export type FollowFilter = 'all' | 'follows' | 'wot';

interface FollowsState {
  /** Direct follows (1 hop) */
  follows: Set<string>;
  /** WoT: follows + follows-of-follows (2 hops) */
  wot: Set<string>;
  loading: boolean;
  /** Timestamp (ms) when cache was last restored/updated */
  cachedAt: number | null;
  /** Real-time counter of discovered WoT pubkeys during loading */
  discoveredCount: number;
}

let state = $state<FollowsState>({
  follows: new Set(),
  wot: new Set(),
  loading: false,
  cachedAt: null,
  discoveredCount: 0
});

/** Generation counter to cancel stale loads */
let generation = 0;

export function getFollows() {
  return {
    get follows() {
      return state.follows;
    },
    get wot() {
      return state.wot;
    },
    get loading() {
      return state.loading;
    },
    get cachedAt() {
      return state.cachedAt;
    },
    get discoveredCount() {
      return state.discoveredCount;
    }
  };
}

/**
 * Check if a pubkey passes the given filter.
 * 'all' always passes. Own pubkey always passes.
 */
export function matchesFilter(
  pubkey: string,
  filter: FollowFilter,
  myPubkey: string | null
): boolean {
  if (filter === 'all') return true;
  if (myPubkey && pubkey === myPubkey) return true;
  if (filter === 'follows') return state.follows.has(pubkey);
  if (filter === 'wot') return state.wot.has(pubkey);
  return true;
}

/** Extract follows Set from a kind:3 event's p tags. */
function extractFollows(event: { tags: string[][] }): Set<string> {
  const pubkeys = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] === 'p' && tag[1]) pubkeys.add(tag[1]);
  }
  return pubkeys;
}

/**
 * Fetch WoT from relays (direct follows + 2-hop).
 */
async function fetchWot(pubkey: string, gen: number): Promise<void> {
  const [{ createRxBackwardReq }, { getRxNostr }, { getEventsDB }] = await Promise.all([
    import('rx-nostr'),
    import('../nostr/client.js'),
    import('../nostr/event-db.js')
  ]);
  const rxNostr = await getRxNostr();
  const eventsDB = await getEventsDB();

  // Step 1: Fetch direct follows (kind:3 for the user)
  const directFollows = await new Promise<Set<string>>((resolve) => {
    const req = createRxBackwardReq();
    let latestEvent: { tags: string[][]; created_at: number } | null = null;

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        eventsDB.put(packet.event);
        if (!latestEvent || packet.event.created_at > latestEvent.created_at) {
          latestEvent = packet.event;
        }
      },
      complete: () => {
        sub.unsubscribe();
        resolve(latestEvent ? extractFollows(latestEvent) : new Set());
      },
      error: () => {
        sub.unsubscribe();
        resolve(latestEvent ? extractFollows(latestEvent) : new Set());
      }
    });

    req.emit({ kinds: [3], authors: [pubkey], limit: 1 });
    req.over();
  });

  if (gen !== generation) return;

  log.info('Direct follows loaded', { count: directFollows.size });
  state.follows = directFollows;
  const allWot = new Set([...directFollows, pubkey]);
  state.wot = allWot;
  state.discoveredCount = allWot.size;

  if (directFollows.size === 0) return;

  // Step 2: Fetch all 2nd-hop contact lists in a single streaming request.
  const followArray = [...directFollows];
  const BATCH_SIZE = 100;

  await new Promise<void>((resolve) => {
    const req = createRxBackwardReq();

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        if (gen !== generation) return;
        eventsDB.put(packet.event);
        for (const tag of packet.event.tags) {
          if (tag[0] === 'p' && tag[1]) allWot.add(tag[1]);
        }
        state.discoveredCount = allWot.size;
      },
      complete: () => {
        sub.unsubscribe();
        resolve();
      },
      error: () => {
        sub.unsubscribe();
        resolve();
      }
    });

    for (let i = 0; i < followArray.length; i += BATCH_SIZE) {
      const batch = followArray.slice(i, i + BATCH_SIZE);
      req.emit({ kinds: [3], authors: batch });
    }
    req.over();
  });

  if (gen !== generation) return;
  state.wot = new Set(allWot);
  state.cachedAt = Date.now();
  log.info('WoT loaded', { wotSize: allWot.size, followsSize: directFollows.size });
}

/**
 * Load follows for a pubkey (called on login).
 * If DB has cached kind:3 events, restores from DB without fetching.
 * If no cache, auto-fetches from relays.
 */
export async function loadFollows(pubkey: string): Promise<void> {
  const gen = ++generation;

  const { getEventsDB } = await import('../nostr/event-db.js');
  const eventsDB = await getEventsDB();

  // Try to restore from DB
  const kind3 = await eventsDB.getByPubkeyAndKind(pubkey, 3);
  if (gen !== generation) return;

  if (kind3) {
    const follows = extractFollows(kind3);
    state.follows = follows;

    // Restore 2-hop WoT from DB
    const followArray = [...follows];
    const hopEvents = await eventsDB.getManyByPubkeysAndKind(followArray, 3);
    if (gen !== generation) return;

    const allWot = new Set([...follows, pubkey]);
    for (const event of hopEvents) {
      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1]) allWot.add(tag[1]);
      }
    }
    state.wot = allWot;
    state.cachedAt = Date.now();
    state.discoveredCount = allWot.size;
    log.info('Restored follows from DB', {
      followsSize: follows.size,
      wotSize: allWot.size
    });
    return;
  }

  // No cache — auto-fetch
  state.loading = true;
  state.discoveredCount = 0;
  log.info('Loading follows (first time)', { pubkey: shortHex(pubkey) });

  try {
    await fetchWot(pubkey, gen);
  } finally {
    if (gen === generation) {
      state.loading = false;
    }
  }
}

/**
 * Manually refresh WoT from relays (called by update button).
 */
export async function refreshFollows(pubkey: string): Promise<void> {
  const gen = ++generation;
  state.loading = true;
  state.discoveredCount = 0;
  log.info('Refreshing follows', { pubkey: shortHex(pubkey) });

  try {
    await fetchWot(pubkey, gen);
  } finally {
    if (gen === generation) {
      state.loading = false;
    }
  }
}

/** Clear follows (called on logout). In-memory only — DB cleared separately. */
export function clearFollows(): void {
  log.info('Clearing follows');
  ++generation;
  state.follows = new Set();
  state.wot = new Set();
  state.loading = false;
  state.cachedAt = null;
  state.discoveredCount = 0;
}
