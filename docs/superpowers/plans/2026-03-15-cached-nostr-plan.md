# Cached Nostr Layer — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a unified caching layer between rx-nostr and IndexedDB with Stale-While-Revalidate (SWR) pattern using Svelte 5 runes reactivity.

**Architecture:** `src/lib/nostr/cached-nostr.svelte.ts` provides reactive query primitives. DB cache is returned immediately, relay data updates the reactive state automatically. All received events are auto-persisted to IndexedDB. Replaceable events use `created_at` comparison.

**Tech Stack:** SvelteKit, Svelte 5 runes (`$state`), rx-nostr, IndexedDB (via `event-db.ts`)

**Pre-commit validation:**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Phase 1: Core SWR primitives

### Task 1: Create cached-nostr module

**Files:**

- Create: `src/lib/nostr/cached-nostr.svelte.ts`

- [ ] **Step 1: Implement core module**

```typescript
/**
 * Cached Nostr query layer with Stale-While-Revalidate pattern.
 *
 * - DB cache returned immediately via $state
 * - Relay data auto-updates the reactive state
 * - Events auto-persisted to IndexedDB
 * - Replaceable events compared by created_at
 */

import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('cached-nostr');

export type QuerySource = 'loading' | 'cache' | 'relay';

export interface CachedResult<T> {
  readonly data: T | null;
  readonly source: QuerySource;
  readonly settled: boolean;
}

// ============================================================
// cachedFetchById: Fetch single event by ID (DB → relay → DB save)
// ============================================================

const byIdCache = new Map<string, { content: string; kind: number } | null>();

export async function cachedFetchById(
  eventId: string
): Promise<{ content: string; kind: number } | null> {
  if (byIdCache.has(eventId)) return byIdCache.get(eventId)!;

  // Try IndexedDB
  try {
    const { getEventsDB } = await import('./event-db.js');
    const db = await getEventsDB();
    const event = await db.getById(eventId);
    if (event) {
      const result = { content: event.content, kind: event.kind };
      byIdCache.set(eventId, result);
      return result;
    }
  } catch {
    /* DB not available */
  }

  // Fetch from relay
  try {
    const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
      import('rx-nostr'),
      import('./client.js')
    ]);
    const rxNostr = await getRxNostr();

    const result = await new Promise<{ content: string; kind: number } | null>((resolve) => {
      const req = createRxBackwardReq();
      let found: { content: string; kind: number } | null = null;
      const timeout = setTimeout(() => {
        sub.unsubscribe();
        resolve(found);
      }, 5000);

      const sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          found = { content: packet.event.content, kind: packet.event.kind };
          // Auto-persist to IndexedDB
          import('./event-db.js').then(({ getEventsDB }) =>
            getEventsDB().then((db) => db.put(packet.event).catch(() => {}))
          );
        },
        complete: () => {
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(found);
        },
        error: () => {
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(found);
        }
      });

      req.emit({ ids: [eventId] });
      req.over();
    });

    byIdCache.set(eventId, result);
    return result;
  } catch {
    byIdCache.set(eventId, null);
    return null;
  }
}

// ============================================================
// useCachedLatest: SWR for latest replaceable event
// ============================================================

export interface UseCachedLatestResult {
  readonly event: import('nostr-typedef').Event | null;
  readonly source: QuerySource;
  readonly settled: boolean;
  destroy(): void;
}
```

The `useCachedLatest` function is the key SWR primitive:

```typescript
export function useCachedLatest(pubkey: string, kind: number): UseCachedLatestResult {
  let event = $state<import('nostr-typedef').Event | null>(null);
  let source = $state<QuerySource>('loading');
  let settled = $state(false);
  let destroyed = false;
  let sub: { unsubscribe: () => void } | undefined;

  // Run DB and relay in PARALLEL (not sequential)
  // Whichever responds first populates event. created_at comparison ensures correctness.

  // DB path: fast, returns cached data
  const startDB = async () => {
    try {
      const { getEventsDB } = await import('./event-db.js');
      if (destroyed) return;
      const db = await getEventsDB();
      const cached = await db.getByPubkeyAndKind(pubkey, kind);
      if (destroyed) return;
      if (cached && (!event || cached.created_at > event.created_at)) {
        event = cached;
        if (source === 'loading') source = 'cache';
        log.debug('Cache hit', { pubkey: shortHex(pubkey), kind });
      }
    } catch {
      /* DB not available */
    }
  };

  // Relay path: slower, returns authoritative data
  const startRelay = async () => {
    try {
      const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
        import('rx-nostr'),
        import('./client.js')
      ]);
      if (destroyed) return;
      const rxNostr = await getRxNostr();
      const req = createRxBackwardReq();

      // 10-second timeout for relay response
      const timeout = setTimeout(() => {
        sub?.unsubscribe();
        settled = true;
      }, 10_000);

      sub = rxNostr.use(req).subscribe({
        next: (packet) => {
          if (destroyed) return;
          if (!event || packet.event.created_at > event.created_at) {
            event = packet.event;
            source = 'relay';
            log.debug('Relay update', { pubkey: shortHex(pubkey), kind });
          }
          // Auto-persist to IndexedDB
          import('./event-db.js').then(({ getEventsDB }) =>
            getEventsDB().then((db) => db.put(packet.event).catch(() => {}))
          );
        },
        complete: () => {
          clearTimeout(timeout);
          sub?.unsubscribe();
          settled = true;
        },
        error: () => {
          clearTimeout(timeout);
          sub?.unsubscribe();
          settled = true;
        }
      });

      req.emit({ kinds: [kind], authors: [pubkey], limit: 1 });
      req.over();
    } catch {
      settled = true;
    }
  };

  startDB();
  startRelay();

  return {
    get event() {
      return event;
    },
    get source() {
      return source;
    },
    get settled() {
      return settled;
    },
    destroy() {
      destroyed = true;
      sub?.unsubscribe();
    }
  };
}
```

Key design decisions:

- Returns reactive object (Svelte 5 `$state` internally)
- `event` starts null, updates first from DB (source='cache'), then from relay (source='relay')
- Replaceable event check: `created_at` comparison ensures only newer events update
- Auto-persists relay events to IndexedDB via `db.put()`
- `settled` flag indicates relay backward request completed
- `destroy()` for cleanup (unsubscribe relay, set destroyed flag)
- Uses `.svelte.ts` suffix because it contains `$state` runes

- [ ] **Step 2: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/nostr/cached-nostr.svelte.ts
git commit -m "Add cached-nostr SWR layer with useCachedLatest and cachedFetchById"
```

---

## Phase 2: Apply to existing stores

### Task 2: Replace fetchEventContent with cachedFetchById

**Files:**

- Delete: `src/lib/nostr/fetch-event.ts`
- Modify: `src/lib/components/NotificationBell.svelte`
- Modify: `src/web/routes/notifications/+page.svelte`

- [ ] **Step 1: Update imports**

Replace all `import { fetchEventContent } from '../nostr/fetch-event.js'` with `import { cachedFetchById } from '../nostr/cached-nostr.svelte.js'`.

The API is the same (returns `Promise<{ content, kind } | null>`), so no logic changes needed.

- [ ] **Step 2: Delete `src/lib/nostr/fetch-event.ts`**

- [ ] **Step 3: Run pre-commit validation**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Replace fetchEventContent with cachedFetchById from cached-nostr"
```

---

### Task 3: Apply useCachedLatest to settings page relay list

**Files:**

- Modify: `src/web/routes/settings/+page.svelte`

- [ ] **Step 1: Replace fetchRelayList with useCachedLatest**

Currently the settings page calls `fetchRelayList(pubkey)` which uses a memory cache or re-fetches from relay.

Replace with `useCachedLatest(pubkey, RELAY_LIST_KIND)`:

```typescript
import { useCachedLatest } from '$lib/nostr/cached-nostr.svelte.js';
import { parseRelayTags, RELAY_LIST_KIND } from '$lib/stores/relays.svelte.js';

// Instead of fetchRelayList:
let relayQuery: ReturnType<typeof useCachedLatest> | undefined;

$effect(() => {
  if (!auth.pubkey) return;
  relayQuery?.destroy();
  relayQuery = useCachedLatest(auth.pubkey, RELAY_LIST_KIND);
});

// Derive entries from the reactive query result
let entries = $derived.by(() => {
  if (!relayQuery?.event) return [];
  return parseRelayTags(relayQuery.event.tags);
});

let relayLoading = $derived(relayQuery ? !relayQuery.settled : true);
let noRelayList = $derived(relayQuery?.settled && !relayQuery.event);
```

This gives:

- Instant display from DB cache
- Auto-update when relay returns newer kind:10002
- `settled` flag for loading state
- No manual cache management

Note: The settings page also needs to EDIT the relay list. The `publishRelayList` function stays as-is — it writes kind:10002 to relays. After publishing, `useCachedLatest` will pick up the new event from the relay and update automatically. However, for immediate local feedback, we should also update the local state directly after publish.

- [ ] **Step 2: Keep local editing state separate from SWR state**

The settings page has editable relay entries (user adds/removes relays before saving). This local editing state should be separate from the SWR query:

```typescript
// SWR source of truth (auto-updates from cache/relay)
let serverEntries = $derived.by(() => { ... });

// Local editing state (initialized from serverEntries, modified by user)
let editEntries = $state<RelayEntry[]>([]);
let editing = $state(false);

// When serverEntries change and we're not editing, sync
$effect(() => {
  if (!editing && serverEntries.length > 0) {
    editEntries = [...serverEntries];
  }
});
```

This is a larger refactor of the settings page. Evaluate whether the SWR benefit justifies the complexity.

- [ ] **Step 3: Run pre-commit validation + E2E**

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/settings/+page.svelte
git commit -m "Use useCachedLatest for settings relay list (SWR pattern)"
```

---

### Task 4: Apply useCachedLatest to bookmarks

**Files:**

- Modify: `src/lib/stores/bookmarks.svelte.ts`

- [ ] **Step 1: Use useCachedLatest in loadBookmarks**

Replace the manual backward request in `loadBookmarks` with `useCachedLatest(pubkey, BOOKMARK_KIND)`.

The `useCachedLatest` result provides `event` reactively. `loadBookmarks` can use the event's tags to derive bookmark entries:

```typescript
let query: ReturnType<typeof useCachedLatest> | undefined;

export function loadBookmarks(pubkey: string): void {
  query?.destroy();
  query = useCachedLatest(pubkey, BOOKMARK_KIND);
  // The store's entries are derived from query.event.tags
}
```

But bookmarks also need `addBookmark`/`removeBookmark` which modify and republish. After publishing, the SWR query will pick up the new event.

- [ ] **Step 2: Run pre-commit validation**

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/bookmarks.svelte.ts
git commit -m "Use useCachedLatest for bookmarks (SWR with auto-DB cache)"
```

---

### Task 5: Apply useCachedLatest to mute list

**Files:**

- Modify: `src/lib/stores/mute.svelte.ts`

- [ ] **Step 1: Use useCachedLatest in loadMuteList**

Same pattern as bookmarks. The mute list is kind:10000 (replaceable).

Note: Mute list content is NIP-44 encrypted. After `useCachedLatest` returns the event, the content needs to be decrypted. This can be done in a `$derived` or `$effect` that watches the query result.

- [ ] **Step 2: Run pre-commit validation**

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/mute.svelte.ts
git commit -m "Use useCachedLatest for mute list (SWR with auto-DB cache)"
```

---

## Phase 3: Cleanup

### Task 6: Remove redundant cache mechanisms

**Files:**

- Modify: `src/lib/stores/relays.svelte.ts` (remove `cachedRelayEntries`)
- Modify: `src/lib/nostr/user-relays.ts` (remove `setCachedRelayEntries`, add `eventsDB.put()` to persist kind:10002)
- Modify: `src/lib/stores/auth.svelte.ts` (remove `clearCachedRelayEntries`)

- [ ] **Step 1: Remove relay memory cache**

The `cachedRelayEntries` / `setCachedRelayEntries` / `getCachedRelayEntries` / `clearCachedRelayEntries` mechanism in relays.svelte.ts was a manual cache that `useCachedLatest` now replaces.

- [ ] **Step 2: Simplify fetchRelayList**

`fetchRelayList` can be simplified or removed if settings page uses `useCachedLatest` directly.

- [ ] **Step 3: Run pre-commit validation + E2E**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Remove redundant relay cache, replaced by cached-nostr SWR layer"
```

---

## Final Validation

- [ ] **All checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e && pnpm build
```
