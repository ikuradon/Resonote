# @ikuradon/auftakt 入替 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resonote の Nostr キャッシュ・サブスクリプション層を `@ikuradon/auftakt` に Big Bang で一括置換する

**Architecture:** gateway.ts / event-db.ts / cached-query.svelte.ts を削除し、新規 store.ts に auftakt の EventStore シングルトンを置く。全 feature のサブスクリプション・キャッシュ・フェッチを auftakt API に移行。publish 系（castSigned / pending-publishes）はスコープ外で既存維持。

**Tech Stack:** @ikuradon/auftakt, rx-nostr, rxjs, SvelteKit (Svelte 5 runes), vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-30-auftakt-migration-design.md`

---

## File Map

### 新規作成

| File                        | Responsibility                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `src/shared/nostr/store.ts` | auftakt EventStore シングルトン + `fetchLatest()` ヘルパー + `initStore()` / `disposeStore()` |

### 削除

| File                                      | 代替                             |
| ----------------------------------------- | -------------------------------- |
| `src/shared/nostr/event-db.ts`            | auftakt IDB バックエンド         |
| `src/shared/nostr/cached-query.svelte.ts` | auftakt `store.fetchById()`      |
| `src/shared/nostr/cached-query.ts`        | 上記の re-export ファイル        |
| `src/shared/nostr/gateway.ts`             | store.ts + client.ts 直接 import |

### 変更（import パス更新のみ）

| File                                                             | 変更内容                    |
| ---------------------------------------------------------------- | --------------------------- |
| `src/features/comments/application/comment-actions.ts`           | gateway → client.js         |
| `src/features/sharing/application/share-actions.ts`              | gateway → client.js         |
| `src/features/content-resolution/application/resolve-content.ts` | gateway → publish-signed.js |
| `src/features/content-resolution/application/resolve-feed.ts`    | gateway → publish-signed.js |

### 変更（ロジック書き換え）

| File                                                                   | 変更内容                                    |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| `src/app/bootstrap/init-session.ts`                                    | `initStore()` / `disposeStore()`            |
| `src/shared/nostr/client.ts`                                           | `fetchLatestEvent` の eventsDB.put を削除   |
| `src/features/comments/application/comment-subscription.ts`            | 大幅縮小。`buildContentFilters` のみ残す    |
| `src/features/comments/ui/comment-view-model.svelte.ts`                | SyncedQuery ベースに書き換え                |
| `src/features/notifications/ui/notifications-view-model.svelte.ts`     | SyncedQuery ベースに書き換え                |
| `src/features/follows/infra/wot-fetcher.ts`                            | eventsDB.put 削除                           |
| `src/features/bookmarks/application/bookmark-actions.ts`               | fetchLatest ヘルパーに                      |
| `src/features/profiles/application/profile-queries.ts`                 | store.getSync に                            |
| `src/shared/browser/profile.svelte.ts`                                 | store.getSync + connectStore 自動キャッシュ |
| `src/shared/browser/emoji-sets.svelte.ts`                              | store.getSync に                            |
| `src/shared/browser/follows.svelte.ts`                                 | store.getSync に                            |
| `src/shared/browser/relays.svelte.ts`                                  | client.ts 直接 import                       |
| `src/shared/nostr/relays-config.ts`                                    | client.ts 直接 import                       |
| `src/shared/content/podcast-resolver.ts`                               | store.getSync + fetchById                   |
| `src/shared/content/episode-resolver.ts`                               | store.getSync + fetchById                   |
| `src/shared/browser/dev-tools.svelte.ts`                               | store API に                                |
| `src/features/comments/ui/quote-view-model.svelte.ts`                  | store.fetchById に                          |
| `src/features/notifications/ui/notification-feed-view-model.svelte.ts` | store.fetchById に                          |
| `src/features/relays/ui/relay-settings-view-model.svelte.ts`           | fetchLatest に                              |

---

## Task 1: Add auftakt dependency + create store.ts

**Files:**

- Create: `src/shared/nostr/store.ts`
- Modify: `package.json`

- [ ] **Step 1: Install @ikuradon/auftakt**

```bash
pnpm add @ikuradon/auftakt
```

- [ ] **Step 2: Create `src/shared/nostr/store.ts`**

```typescript
/**
 * Auftakt EventStore singleton.
 * Replaces event-db.ts + cached-query.svelte.ts + gateway.ts
 */

import type { EventStore } from '@ikuradon/auftakt';
import type { NostrEvent } from 'nostr-typedef';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('nostr:store');

let store: EventStore | undefined;

export function getStore(): EventStore {
  if (!store) throw new Error('Store not initialized. Call initStore() first.');
  return store;
}

export async function initStore(): Promise<void> {
  const [{ createEventStore }, { indexedDBBackend }, { connectStore }, { getRxNostr }] =
    await Promise.all([
      import('@ikuradon/auftakt'),
      import('@ikuradon/auftakt/backends/indexeddb'),
      import('@ikuradon/auftakt/sync'),
      import('./client.js')
    ]);

  store = createEventStore({ backend: indexedDBBackend('resonote-events') });
  const rxNostr = await getRxNostr();
  connectStore(rxNostr, store, { reconcileDeletions: true });
  log.info('Auftakt store initialized');
}

export function disposeStore(): void {
  store?.dispose();
  store = undefined;
  log.info('Auftakt store disposed');
}

/**
 * Fetch the latest replaceable event for a given pubkey+kind.
 * Tries local cache first, then relay backward fetch.
 */
export async function fetchLatest(
  pubkey: string,
  kind: number,
  options?: { timeout?: number }
): Promise<NostrEvent | null> {
  const s = getStore();

  // 1. Local cache
  const cached = await s.getSync({ kinds: [kind], authors: [pubkey], limit: 1 });
  if (cached.length > 0) return cached[0].event;

  // 2. Relay fetch via SyncedQuery backward
  const [{ createSyncedQuery }, { getRxNostr }] = await Promise.all([
    import('@ikuradon/auftakt/sync'),
    import('./client.js')
  ]);
  const { firstValueFrom, filter, timeout: rxTimeout, catchError, of } = await import('rxjs');
  const rxNostr = await getRxNostr();

  const synced = createSyncedQuery(rxNostr, s, {
    filter: { kinds: [kind], authors: [pubkey], limit: 1 },
    strategy: 'backward'
  });
  try {
    const result = await firstValueFrom(
      synced.events$.pipe(
        filter((events: unknown[]) => events.length > 0),
        rxTimeout(options?.timeout ?? 5000),
        catchError(() => of(null))
      )
    );
    if (result && Array.isArray(result) && result.length > 0) {
      return result[0].event;
    }
    return null;
  } finally {
    synced.dispose();
  }
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm check
```

Expected: Pass (new file, no consumers yet)

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/shared/nostr/store.ts
git commit -m "feat: add @ikuradon/auftakt + store.ts singleton"
```

---

## Task 2: Update bootstrap (init-session / destroy-session)

**Files:**

- Modify: `src/app/bootstrap/init-session.ts`

- [ ] **Step 1: Update `initSession` to call `initStore()`**

Replace line 20-39 of `init-session.ts`:

```typescript
export async function initSession(pubkey: string): Promise<void> {
  log.info('Initializing session stores');

  const [
    { initStore },
    { applyUserRelays },
    { loadFollows, loadBookmarks, loadMuteList, loadCustomEmojis, refreshRelayList }
  ] = await Promise.all([
    import('$shared/nostr/store.js'),
    import('$shared/nostr/user-relays.js'),
    import('$shared/browser/stores.js')
  ]);

  await initStore();

  const relayUrls = await applyUserRelays(pubkey);
  void refreshRelayList(relayUrls);

  // Fire-and-forget: load user data in parallel
  void loadFollows(pubkey).catch((err) => log.error('Failed to load follows', err));
  void loadCustomEmojis(pubkey).catch((err) => log.error('Failed to load custom emojis', err));
  void loadBookmarks(pubkey).catch((err) => log.error('Failed to load bookmarks', err));
  void loadMuteList(pubkey).catch((err) => log.error('Failed to load mute list', err));
}
```

- [ ] **Step 2: Update `destroySession` to use `disposeStore()`**

Replace line 41-73:

```typescript
export async function destroySession(): Promise<void> {
  log.info('Destroying session stores');

  const [
    { resetToDefaultRelays },
    { DEFAULT_RELAYS },
    {
      clearFollows,
      clearCustomEmojis,
      clearProfiles,
      clearBookmarks,
      clearMuteList,
      refreshRelayList
    },
    { disposeStore }
  ] = await Promise.all([
    import('$shared/nostr/user-relays.js'),
    import('$shared/nostr/relays.js'),
    import('$shared/browser/stores.js'),
    import('$shared/nostr/store.js')
  ]);

  await resetToDefaultRelays();
  clearFollows();
  clearCustomEmojis();
  clearProfiles();
  clearBookmarks();
  clearMuteList();
  void refreshRelayList(DEFAULT_RELAYS);

  disposeStore();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/bootstrap/init-session.ts
git commit -m "feat: bootstrap uses auftakt initStore/disposeStore"
```

---

## Task 3: Update client.ts — remove eventsDB dependency

**Files:**

- Modify: `src/shared/nostr/client.ts`

- [ ] **Step 1: Remove eventsDB caching from `fetchLatestEvent`**

In `client.ts`, lines 96-102 contain the IDB cache write inside `fetchLatestEvent`. Remove the dynamic import and put call:

Replace lines 95-102:

```typescript
        next: (packet) => {
          if (!latest || packet.event.created_at > latest.created_at) {
            latest = packet.event;
          }
          import('$shared/nostr/event-db.js')
            .then(({ getEventsDB }) => getEventsDB())
            .then((db) => db.put(packet.event))
            .catch((e) => log.error('Failed to cache event to IndexedDB', e));
        },
```

With (remove the eventsDB caching — connectStore handles this now):

```typescript
        next: (packet) => {
          if (!latest || packet.event.created_at > latest.created_at) {
            latest = packet.event;
          }
        },
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/nostr/client.ts
git commit -m "refactor: remove eventsDB caching from fetchLatestEvent (auftakt handles it)"
```

---

## Task 4: Update simple import-only files

**Files:**

- Modify: 4 files that import from gateway.ts for publish/castSigned only

- [ ] **Step 1: Update import paths**

`src/features/comments/application/comment-actions.ts`:

```typescript
// Before:
import { castSigned } from '$shared/nostr/gateway.js';
// After:
import { castSigned } from '$shared/nostr/client.js';
```

`src/features/sharing/application/share-actions.ts`:

```typescript
// Before:
import { castSigned } from '$shared/nostr/gateway.js';
// After:
import { castSigned } from '$shared/nostr/client.js';
```

`src/features/content-resolution/application/resolve-content.ts`:

```typescript
// Before:
import { publishSignedEvents } from '$shared/nostr/gateway.js';
// After:
import { publishSignedEvents } from '$shared/nostr/publish-signed.js';
```

`src/features/content-resolution/application/resolve-feed.ts`:

```typescript
// Before:
import { publishSignedEvents } from '$shared/nostr/gateway.js';
// After:
import { publishSignedEvents } from '$shared/nostr/publish-signed.js';
```

- [ ] **Step 2: Commit**

```bash
git add src/features/comments/application/comment-actions.ts \
  src/features/sharing/application/share-actions.ts \
  src/features/content-resolution/application/resolve-content.ts \
  src/features/content-resolution/application/resolve-feed.ts
git commit -m "refactor: update import paths from gateway to direct modules"
```

---

## Task 5: Migrate follows / wot-fetcher

**Files:**

- Modify: `src/features/follows/infra/wot-fetcher.ts`

- [ ] **Step 1: Remove eventsDB.put calls, keep REQ management**

Replace the gateway import with client import. Remove `getEventsDB` and all `eventsDB.put()` calls (connectStore handles caching automatically).

Change the dynamic import (around line 25):

```typescript
// Before:
const [{ createRxBackwardReq }, { getRxNostr, getEventsDB }] = await Promise.all([
  import('rx-nostr'),
  import('$shared/nostr/gateway.js')
]);
const rxNostr = await getRxNostr();
const eventsDB = await getEventsDB();

// After:
const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
  import('rx-nostr'),
  import('$shared/nostr/client.js')
]);
const rxNostr = await getRxNostr();
```

Remove `void eventsDB.put(packet.event);` at lines 40 and 79 (both occurrences).

- [ ] **Step 2: Commit**

```bash
git add src/features/follows/infra/wot-fetcher.ts
git commit -m "refactor: remove eventsDB from wot-fetcher (connectStore auto-caches)"
```

---

## Task 6: Migrate profile, follows-load, bookmarks, relays

**Files:**

- Modify: `src/shared/browser/profile.svelte.ts`
- Modify: `src/shared/browser/follows.svelte.ts`
- Modify: `src/features/bookmarks/application/bookmark-actions.ts`
- Modify: `src/shared/browser/relays.svelte.ts`
- Modify: `src/shared/nostr/relays-config.ts`
- Modify: `src/features/relays/ui/relay-settings-view-model.svelte.ts`
- Modify: `src/features/profiles/application/profile-queries.ts`
- Modify: `src/shared/browser/dev-tools.svelte.ts`

- [ ] **Step 1: profile.svelte.ts — replace eventsDB with store.getSync**

Replace gateway import with store import. Replace `eventsDB.getManyByPubkeysAndKind(toFetch, 0)` with:

```typescript
const { getStore } = await import('$shared/nostr/store.js');
const store = getStore();
const cached = await store.getSync({ kinds: [0], authors: toFetch });
```

Remove `eventsDB.put(packet.event)` calls (connectStore handles caching).

- [ ] **Step 2: follows.svelte.ts — replace eventsDB with store.getSync**

Replace `getEventsDB()` with `getStore()`:

```typescript
const { getStore } = await import('$shared/nostr/store.js');
const store = getStore();
const kind3Results = await store.getSync({ kinds: [FOLLOW_KIND], authors: [pubkey], limit: 1 });
const kind3 = kind3Results.length > 0 ? kind3Results[0].event : null;
```

For `eventsDB.getAllByKind(FOLLOW_KIND)`:

```typescript
const allKind3 = await store.getSync({ kinds: [FOLLOW_KIND] });
```

- [ ] **Step 3: bookmark-actions.ts — replace fetchLatestEvent with fetchLatest**

```typescript
// Before:
const { fetchLatestEvent, castSigned } = await import('$shared/nostr/gateway.js');
const latest = await fetchLatestEvent(myPubkey, BOOKMARK_KIND);

// After:
const { fetchLatest } = await import('$shared/nostr/store.js');
const { castSigned } = await import('$shared/nostr/client.js');
const latest = await fetchLatest(myPubkey, BOOKMARK_KIND);
```

- [ ] **Step 4: relays.svelte.ts — replace gateway import**

```typescript
// Before:
const { getRxNostr } = await import('$shared/nostr/gateway.js');
// After:
const { getRxNostr } = await import('$shared/nostr/client.js');
```

- [ ] **Step 5: relays-config.ts — replace gateway import**

```typescript
// Before:
import { getRxNostr } from '$shared/nostr/gateway.js';
// After:
import { getRxNostr } from '$shared/nostr/client.js';
```

- [ ] **Step 6: relay-settings-view-model.svelte.ts — replace useCachedLatest with fetchLatest**

Replace `useCachedLatest` import with `fetchLatest`:

```typescript
// Before:
import { useCachedLatest, type UseCachedLatestResult } from '$shared/nostr/cached-query.js';
// After:
import { fetchLatest } from '$shared/nostr/store.js';
```

Update usage to call `fetchLatest(pubkey, RELAY_LIST_KIND)`.

- [ ] **Step 7: profile-queries.ts — replace gateway import**

```typescript
// Before:
const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
  import('rx-nostr'),
  import('$shared/nostr/gateway.js')
]);
// After:
const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
  import('rx-nostr'),
  import('$shared/nostr/client.js')
]);
```

- [ ] **Step 8: dev-tools.svelte.ts — replace getEventsDB**

Replace `getEventsDB()` usage with `getStore()`:

```typescript
const { getStore } = await import('$shared/nostr/store.js');
const store = getStore();
// replace db.count() etc. with store.getSync() as needed
```

- [ ] **Step 9: Commit**

```bash
git add src/shared/browser/profile.svelte.ts \
  src/shared/browser/follows.svelte.ts \
  src/features/bookmarks/application/bookmark-actions.ts \
  src/shared/browser/relays.svelte.ts \
  src/shared/nostr/relays-config.ts \
  src/features/relays/ui/relay-settings-view-model.svelte.ts \
  src/features/profiles/application/profile-queries.ts \
  src/shared/browser/dev-tools.svelte.ts
git commit -m "refactor: migrate profile/follows/bookmarks/relays to auftakt store"
```

---

## Task 7: Migrate content resolvers (podcast / episode)

**Files:**

- Modify: `src/shared/content/podcast-resolver.ts`
- Modify: `src/shared/content/episode-resolver.ts`

- [ ] **Step 1: podcast-resolver.ts — replace getEventsDB + getRxNostr**

Replace static import:

```typescript
// Before:
import { getEventsDB, getRxNostr } from '$shared/nostr/gateway.js';
// After:
import { getRxNostr } from '$shared/nostr/client.js';
import { getStore } from '$shared/nostr/store.js';
```

Replace `db.getByReplaceKey(pubkey, 39701, normalized)` with:

```typescript
const store = getStore();
const results = await store.getSync({
  kinds: [39701],
  authors: [pubkey],
  '#d': [normalized],
  limit: 1
});
const cached = results.length > 0 ? results[0] : null;
```

Remove all `db.put(packet.event)` calls (connectStore auto-caches).

- [ ] **Step 2: episode-resolver.ts — same pattern**

Replace static import:

```typescript
// Before:
import { getEventsDB, getRxNostr } from '$shared/nostr/gateway.js';
// After:
import { getRxNostr } from '$shared/nostr/client.js';
import { getStore } from '$shared/nostr/store.js';
```

Replace `db.getByTagValue('d', normalized)` with:

```typescript
const store = getStore();
const results = await store.getSync({ kinds: [39701], '#d': [normalized], limit: 1 });
```

Remove all `db.put()` calls.

- [ ] **Step 3: Commit**

```bash
git add src/shared/content/podcast-resolver.ts src/shared/content/episode-resolver.ts
git commit -m "refactor: migrate podcast/episode resolvers to auftakt store"
```

---

## Task 8: Migrate emoji-sets

**Files:**

- Modify: `src/shared/browser/emoji-sets.svelte.ts`

- [ ] **Step 1: Replace eventsDB with store.getSync**

Replace `getEventsDB()` import with `getStore()`:

```typescript
const { getStore } = await import('$shared/nostr/store.js');
const store = getStore();
```

Replace `eventsDB.getByPubkeyAndKind(pubkey, 10030)` with:

```typescript
const cachedListResults = await store.getSync({ kinds: [10030], authors: [pubkey], limit: 1 });
const cachedList = cachedListResults.length > 0 ? cachedListResults[0].event : null;
```

Replace `eventsDB.getByReplaceKey(parts[1], 30030, parts[2])` with:

```typescript
const results = await store.getSync({
  kinds: [30030],
  authors: [parts[1]],
  '#d': [parts[2]],
  limit: 1
});
const cached = results.length > 0 ? results[0].event : null;
```

Remove all `eventsDB.put()` calls.

- [ ] **Step 2: Commit**

```bash
git add src/shared/browser/emoji-sets.svelte.ts
git commit -m "refactor: migrate emoji-sets to auftakt store"
```

---

## Task 9: Migrate cachedFetchById call sites

**Files:**

- Modify: `src/features/comments/ui/quote-view-model.svelte.ts`
- Modify: `src/features/notifications/ui/notification-feed-view-model.svelte.ts`

- [ ] **Step 1: quote-view-model.svelte.ts — replace cachedFetchById with store.fetchById**

```typescript
// Before:
import { cachedFetchById } from '$shared/nostr/cached-query.js';
const event = await cachedFetchById(eventId);

// After:
import { getStore } from '$shared/nostr/store.js';
const result = await getStore().fetchById(eventId, { negativeTTL: 30_000 });
const event = result?.event ?? null;
```

- [ ] **Step 2: notification-feed-view-model.svelte.ts — same pattern**

```typescript
// Before:
import { cachedFetchById } from '$shared/nostr/cached-query.js';

// After:
import { getStore } from '$shared/nostr/store.js';
```

Replace `cachedFetchById(id)` calls with `getStore().fetchById(id, { negativeTTL: 30_000 })`, adjusting to extract `.event` from the CachedEvent result.

- [ ] **Step 3: Commit**

```bash
git add src/features/comments/ui/quote-view-model.svelte.ts \
  src/features/notifications/ui/notification-feed-view-model.svelte.ts
git commit -m "refactor: migrate cachedFetchById to store.fetchById"
```

---

## Task 10: Migrate comment-view-model (core migration)

**Files:**

- Modify: `src/features/comments/ui/comment-view-model.svelte.ts`
- Modify: `src/features/comments/application/comment-subscription.ts`

This is the most complex task. The comment-view-model needs to:

1. Replace `loadSubscriptionDeps` + `startSubscription` with `createSyncedQuery`
2. Remove `dispatchPacket` — use `events$` → Comment[] transformation
3. Remove `pendingDeletions` (auftakt handles NIP-09 internally)
4. Remove `restoreFromCache` (reactive query returns cache on first emit)
5. Keep `buildContentFilters` (used for SyncedQuery filter construction)
6. Keep orphan parent fetch (use `store.fetchById`)
7. Keep reaction index logic
8. Update `addSubscription` to create additional SyncedQuery + combineLatest

- [ ] **Step 1: Simplify comment-subscription.ts**

Keep only `buildContentFilters`. Remove `loadSubscriptionDeps`, `startSubscription`, `startMergedSubscription`, `startDeletionReconcile`, and all related types/interfaces. The file becomes:

```typescript
/**
 * Comment filter builder.
 * Defines the unified filter array for content comments/reactions/deletions.
 */

import {
  COMMENT_KIND,
  CONTENT_REACTION_KIND,
  DELETION_KIND,
  REACTION_KIND
} from '$shared/nostr/events.js';

/** Build the 4-filter array for unified subscription on a given tag value. */
export function buildContentFilters(idValue: string) {
  return [
    { kinds: [COMMENT_KIND], '#I': [idValue] },
    { kinds: [REACTION_KIND], '#I': [idValue] },
    { kinds: [DELETION_KIND], '#I': [idValue] },
    { kinds: [CONTENT_REACTION_KIND], '#i': [idValue] }
  ];
}
```

- [ ] **Step 2: Update comment-view-model.svelte.ts imports**

Replace old imports:

```typescript
// Remove:
import { cachedFetchById, invalidateFetchByIdCache } from '$shared/nostr/cached-query.js';
import {
  buildContentFilters,
  getCommentRepository,
  loadSubscriptionDeps,
  restoreFromCache,
  startDeletionReconcile,
  startMergedSubscription,
  startSubscription
} from '../application/comment-subscription.js';

// Add:
import { buildContentFilters } from '../application/comment-subscription.js';
import { getStore } from '$shared/nostr/store.js';
```

- [ ] **Step 3: Replace subscription setup with SyncedQuery**

The view-model's init function currently calls `loadSubscriptionDeps()` → `startSubscription()`. Replace with:

```typescript
// In the initialization section:
const [{ createSyncedQuery, connectStore }, { getRxNostr }] = await Promise.all([
  import('@ikuradon/auftakt/sync'),
  import('$shared/nostr/client.js')
]);
const store = getStore();
const rxNostr = await getRxNostr();

// Note: buildContentFilters returns 4 separate filters because #I and #i are different tags.
// SyncedQuery accepts a single filter, so we create two SyncedQueries and merge:
// - One for #I tags (comments, reactions, deletions)
// - One for #i tags (content reactions)
const syncedI = createSyncedQuery(rxNostr, store, {
  filter: { kinds: [COMMENT_KIND, REACTION_KIND, DELETION_KIND], '#I': [idValue] },
  strategy: 'dual'
});
const syncedi = createSyncedQuery(rxNostr, store, {
  filter: { kinds: [CONTENT_REACTION_KIND], '#i': [idValue] },
  strategy: 'dual'
});
```

Subscribe to `events$` and transform to Comment/Reaction domain models:

```typescript
const eventsSub = synced.events$.subscribe((cachedEvents) => {
  if (destroyed) return;
  const events = cachedEvents.map((ce) => ce.event);
  // Transform events to comments, reactions, etc.
  // (reuse existing domain logic from deletion-rules.ts, reaction-rules.ts)
});
```

- [ ] **Step 4: Replace addSubscription with combineLatest**

```typescript
async function addSubscription(idValue: string): Promise<void> {
  if (destroyed) return;

  // Same two-query pattern as initial subscription
  const addedI = createSyncedQuery(rxNostr, store, {
    filter: { kinds: [COMMENT_KIND, REACTION_KIND, DELETION_KIND], '#I': [idValue] },
    strategy: 'dual'
  });
  const addedi = createSyncedQuery(rxNostr, store, {
    filter: { kinds: [CONTENT_REACTION_KIND], '#i': [idValue] },
    strategy: 'dual'
  });
  additionalSynceds.push(addedI, addedi);

  // Merge all events$ with combineLatest
  rebuildMergedSubscription();
}
```

- [ ] **Step 5: Replace orphan parent fetch**

```typescript
// Before:
const fetched = await cachedFetchById(parentId);

// After:
const store = getStore();
const fetched = await store.fetchById(parentId, { negativeTTL: 30_000 });
const parentEvent = fetched?.event ?? null;
```

- [ ] **Step 6: Remove pendingDeletions, restoreFromCache, dispatchPacket, eventsDB references**

Delete all code related to:

- `pendingDeletions` Map and its management
- `restoreFromCache()` calls
- `dispatchPacket()` function
- `eventsDB` variable and all `eventsDB.put()` / `purgeDeletedFromCache()` calls
- `invalidateFetchByIdCache()` calls

- [ ] **Step 7: Commit**

```bash
git add src/features/comments/application/comment-subscription.ts \
  src/features/comments/ui/comment-view-model.svelte.ts
git commit -m "feat: migrate comments to auftakt SyncedQuery"
```

---

## Task 11: Migrate notifications

**Files:**

- Modify: `src/features/notifications/ui/notifications-view-model.svelte.ts`

- [ ] **Step 1: Replace gateway import and subscription setup**

```typescript
// Before:
import { getRxNostr } from '$shared/nostr/gateway.js';

// After:
import { getRxNostr } from '$shared/nostr/client.js';
import { getStore } from '$shared/nostr/store.js';
```

Replace manual backward/forward subscription setup with `createSyncedQuery`:

```typescript
const [{ createSyncedQuery }] = await Promise.all([import('@ikuradon/auftakt/sync')]);
const store = getStore();
const rxNostr = await getRxNostr();

// Replies/reactions subscription
const replySynced = createSyncedQuery(rxNostr, store, {
  filter: { kinds: [COMMENT_KIND, REACTION_KIND], '#p': [myPubkey], since: loginTimestamp },
  strategy: 'dual'
});

// Follow comments subscription (batched via chunk())
const followSynced = createSyncedQuery(rxNostr, store, {
  filter: { kinds: [COMMENT_KIND], authors: followArray, since: loginTimestamp },
  strategy: 'dual'
});
```

- [ ] **Step 2: Subscribe to events$ and apply mute filter**

```typescript
replySynced.events$.subscribe((events) => {
  if (destroyed) return;
  const filtered = events
    .map((ce) => ce.event)
    .filter((e) => !isMuted(e.pubkey) && !isWordMuted(e.content));
  // Update notification state...
});
```

- [ ] **Step 3: Commit**

```bash
git add src/features/notifications/ui/notifications-view-model.svelte.ts
git commit -m "feat: migrate notifications to auftakt SyncedQuery"
```

---

## Task 12: Delete old files

**Files:**

- Delete: `src/shared/nostr/event-db.ts`
- Delete: `src/shared/nostr/cached-query.svelte.ts`
- Delete: `src/shared/nostr/cached-query.ts`
- Delete: `src/shared/nostr/gateway.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -rn "from.*gateway\|from.*event-db\|from.*cached-query" src/ --include="*.ts" --include="*.svelte.ts" | grep -v node_modules | grep -v ".test."
```

Expected: No results (all imports migrated)

- [ ] **Step 2: Delete files**

```bash
git rm src/shared/nostr/event-db.ts \
  src/shared/nostr/cached-query.svelte.ts \
  src/shared/nostr/cached-query.ts \
  src/shared/nostr/gateway.ts
```

- [ ] **Step 3: Build check**

```bash
pnpm check
```

Expected: Pass

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove event-db, cached-query, gateway (replaced by auftakt)"
```

---

## Task 13: Update tests

**Files:**

- Delete: `src/shared/nostr/cached-query.test.ts` (if exists)
- Modify: tests that import deleted modules
- Modify: `src/architecture/structure-guard.test.ts`

- [ ] **Step 1: Update structure-guard.test.ts**

Update any assertions that reference `event-db.ts`, `cached-query.svelte.ts`, or `gateway.ts`. Add assertion for `store.ts`.

- [ ] **Step 2: Remove or update test files for deleted modules**

```bash
# Find test files that import deleted modules
grep -rn "event-db\|cached-query\|gateway" tests/ src/**/*.test.ts --include="*.ts" | grep -v node_modules
```

Update or delete found files.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 4: Run E2E**

```bash
pnpm test:e2e
```

Expected: All E2E tests pass (UI behavior unchanged)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: update tests for auftakt migration"
```

---

## Task 14: Pre-commit validation + CLAUDE.md update

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Run full pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

Expected: All 5 checks pass

- [ ] **Step 2: Check bundle size**

```bash
pnpm perf:bundle:summary
```

Compare with previous bundle size. auftakt addition should be roughly offset by event-db + cached-query deletion.

- [ ] **Step 3: Update CLAUDE.md**

Key changes:

- Remove `event-db.ts`, `cached-query.svelte.ts`, `gateway.ts` from Architecture section
- Add `store.ts` to Architecture section with description
- Add `@ikuradon/auftakt` to Tech Stack
- Update Subscription Pattern section to reference `createSyncedQuery`
- Update State Management to reference auftakt Store singleton
- Remove `cachedFetchById` / `fetchLatestEvent` references, add `fetchLatest` / `store.fetchById`

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for auftakt migration"
```

---

## Execution Order Summary

| Task | Description                              | Dependencies | Risk     |
| ---- | ---------------------------------------- | ------------ | -------- |
| 1    | Add dep + create store.ts                | None         | Low      |
| 2    | Update bootstrap                         | Task 1       | Low      |
| 3    | Update client.ts                         | Task 1       | Low      |
| 4    | Simple import updates                    | None         | Low      |
| 5    | Migrate wot-fetcher                      | Task 1       | Low      |
| 6    | Migrate profile/follows/bookmarks/relays | Task 1       | Medium   |
| 7    | Migrate podcast/episode                  | Task 1       | Medium   |
| 8    | Migrate emoji-sets                       | Task 1       | Medium   |
| 9    | Migrate cachedFetchById sites            | Task 1       | Low      |
| 10   | **Migrate comments**                     | Task 1, 2    | **High** |
| 11   | Migrate notifications                    | Task 1, 2    | Medium   |
| 12   | Delete old files                         | Tasks 2-11   | Low      |
| 13   | Update tests                             | Task 12      | Medium   |
| 14   | Validation + CLAUDE.md                   | Task 13      | Low      |
