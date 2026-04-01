import type { FollowFilter } from '$features/follows/domain/follow-model.js';
import {
  extractFollows,
  matchesFilter as matchesFilterPure
} from '$features/follows/domain/follow-model.js';
import { FOLLOW_KIND } from '$shared/nostr/events.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

import { getAuth } from './auth.svelte.js';

const log = createLogger('follows');

interface FollowsState {
  follows: Set<string>;
  wot: Set<string>;
  loading: boolean;
  cachedAt: number | null;
  discoveredCount: number;
}

let state = $state<FollowsState>({
  follows: new Set(),
  wot: new Set(),
  loading: false,
  cachedAt: null,
  discoveredCount: 0
});

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

export function matchesFilter(
  pubkey: string,
  filter: FollowFilter,
  myPubkey: string | null
): boolean {
  return matchesFilterPure(pubkey, filter, myPubkey, state.follows, state.wot);
}

async function fetchWotInner(pubkey: string, gen: number): Promise<void> {
  const { fetchWot } = await import('$features/follows/infra/wot-fetcher.js');

  const result = await fetchWot(pubkey, {
    onDirectFollows: (follows) => {
      if (gen !== generation) return;
      state.follows = follows;
      const allWot = new Set([...follows, pubkey]);
      state.wot = allWot;
      state.discoveredCount = allWot.size;
    },
    onWotProgress: (count) => {
      if (gen !== generation) return;
      state.discoveredCount = count;
    },
    isCancelled: () => gen !== generation
  });

  if (gen !== generation) return;
  state.wot = result.wot;
  state.cachedAt = Date.now();
  log.info('WoT loaded', { wotSize: result.wot.size, followsSize: result.directFollows.size });
}

export async function loadFollows(pubkey: string): Promise<void> {
  const gen = ++generation;

  const { getStoreAsync } = await import('$shared/nostr/store.js');
  const store = await getStoreAsync();

  const kind3Results = await store.getSync({ kinds: [FOLLOW_KIND], authors: [pubkey], limit: 1 });
  if (gen !== generation) return;

  const kind3 = kind3Results.length > 0 ? kind3Results[0].event : null;
  if (kind3) {
    const follows = extractFollows(kind3);
    state.follows = follows;

    const allWot = new Set([...follows, pubkey]);
    if (follows.size > 0) {
      const allKind3Results = await store.getSync({ kinds: [FOLLOW_KIND], authors: [...follows] });
      if (gen !== generation) return;

      for (const cached of allKind3Results) {
        for (const tag of cached.event.tags) {
          if (tag[0] === 'p' && tag[1]) allWot.add(tag[1]);
        }
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

  state.loading = true;
  state.discoveredCount = 0;
  log.info('Loading follows (first time)', { pubkey: shortHex(pubkey) });

  try {
    await fetchWotInner(pubkey, gen);
  } finally {
    if (gen === generation) {
      state.loading = false;
    }
  }
}

export async function refreshFollows(pubkey: string): Promise<void> {
  const gen = ++generation;
  state.loading = true;
  state.discoveredCount = 0;
  log.info('Refreshing follows', { pubkey: shortHex(pubkey) });

  try {
    await fetchWotInner(pubkey, gen);
  } finally {
    if (gen === generation) {
      state.loading = false;
    }
  }
}

export async function followUser(targetPubkey: string): Promise<void> {
  const myPubkey = getAuth().pubkey;
  if (!myPubkey) throw new Error('Not logged in');

  const { publishFollow } = await import('$features/follows/application/follow-actions.js');
  await publishFollow(targetPubkey, myPubkey);
  state.follows = new Set([...state.follows, targetPubkey]);
}

export async function unfollowUser(targetPubkey: string): Promise<void> {
  const myPubkey = getAuth().pubkey;
  if (!myPubkey) throw new Error('Not logged in');

  const { publishUnfollow } = await import('$features/follows/application/follow-actions.js');
  await publishUnfollow(targetPubkey, myPubkey);
  const nextFollows = new Set(state.follows);
  nextFollows.delete(targetPubkey);
  state.follows = nextFollows;
}

export function clearFollows(): void {
  log.info('Clearing follows');
  ++generation;
  state.follows = new Set();
  state.wot = new Set();
  state.loading = false;
  state.cachedAt = null;
  state.discoveredCount = 0;
}
