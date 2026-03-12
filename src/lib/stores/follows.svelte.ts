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
}

let state = $state<FollowsState>({
  follows: new Set(),
  wot: new Set(),
  loading: false
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

/** Fetch kind:3 for a single pubkey, return set of followed pubkeys */
async function fetchContactList(pubkey: string): Promise<Set<string>> {
  const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
    import('rx-nostr'),
    import('../nostr/client.js')
  ]);
  const rxNostr = await getRxNostr();

  return new Promise<Set<string>>((resolve) => {
    const req = createRxBackwardReq();
    const pubkeys = new Set<string>();

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        for (const tag of packet.event.tags) {
          if (tag[0] === 'p' && tag[1]) {
            pubkeys.add(tag[1]);
          }
        }
      },
      complete: () => {
        sub.unsubscribe();
        resolve(pubkeys);
      },
      error: () => {
        sub.unsubscribe();
        resolve(pubkeys);
      }
    });

    req.emit({ kinds: [3], authors: [pubkey], limit: 1 });
    req.over();
  });
}

/**
 * Load follows for a pubkey (called on login).
 * Fetches direct follows first, then WoT in background.
 */
export async function loadFollows(pubkey: string): Promise<void> {
  const gen = ++generation;
  state.loading = true;
  log.info('Loading follows', { pubkey: shortHex(pubkey) });

  try {
    const directFollows = await fetchContactList(pubkey);
    if (gen !== generation) return;

    log.info('Direct follows loaded', { count: directFollows.size });
    state.follows = directFollows;
    state.wot = new Set([...directFollows, pubkey]);

    // 2nd hop: collect all pubkeys then assign once
    const followArray = [...directFollows];
    const BATCH_SIZE = 10;
    const allWot = new Set(state.wot);

    for (let i = 0; i < followArray.length; i += BATCH_SIZE) {
      if (gen !== generation) return;
      const batch = followArray.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map((pk) => fetchContactList(pk)));
      for (const result of results) {
        for (const pk of result) allWot.add(pk);
      }
    }

    if (gen !== generation) return;
    state.wot = allWot;
    log.info('WoT loaded', { wotSize: allWot.size, followsSize: directFollows.size });
  } finally {
    if (gen === generation) {
      state.loading = false;
    }
  }
}

/** Clear follows (called on logout). */
export function clearFollows(): void {
  log.info('Clearing follows');
  ++generation;
  state.follows = new Set();
  state.wot = new Set();
  state.loading = false;
}
