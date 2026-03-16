# Nostr Subscription & IndexedDB Optimization Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Nostr relay subscription slots from 6 to 2 per content page, fix missing kind:5 in addSubscription, batch IndexedDB writes, debounce notification re-subscriptions, and lazy-load embed components.

**Architecture:** Consolidate 3 backward + 3 forward rx-nostr subscriptions into 1+1 using multi-filter `emit()`. Add kind:5 to `addSubscription()` with two-pass cache restore. Optimize `putMany` for non-replaceable events. Debounce notification subscriptions. Dynamic-import 7 of 9 embed components.

**Tech Stack:** rx-nostr, IndexedDB (idb), SvelteKit (Svelte 5 runes), Vite

**Spec:** `docs/superpowers/specs/2026-03-17-nostr-subscription-optimization-design.md`

---

## Chunk 1: Subscription Consolidation + kind:5

### Task 1: Extract event handler helpers in comments.svelte.ts

**Files:**
- Modify: `src/lib/stores/comments.svelte.ts:351-438` (subscribe handlers)

- [ ] **Step 1: Extract `handleCommentPacket` helper**

Add inside `createCommentsStore()`, before `subscribe()`:

```typescript
function handleCommentPacket(event: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] }) {
  if (commentIds.has(event.id)) return;
  commentIds.add(event.id);
  eventPubkeys.set(event.id, event.pubkey);
  commentsRaw = [...commentsRaw, buildCommentFromEvent(event)];
  log.debug('Comment received', { id: shortHex(event.id) });
}
```

- [ ] **Step 2: Extract `handleReactionPacket` helper**

```typescript
function handleReactionPacket(event: { id: string; pubkey: string; content: string; tags: string[][] }) {
  const reaction = buildReactionFromEvent(event);
  if (reaction) {
    addReaction(reaction);
    eventPubkeys.set(event.id, event.pubkey);
  }
}
```

- [ ] **Step 3: Extract `handleDeletionPacket` helper**

```typescript
function handleDeletionPacket(event: { id: string; pubkey: string; tags: string[][] }) {
  const eTags = extractDeletionTargets(event);
  if (eTags.length === 0) return;
  const verified = eTags.filter((id) => {
    const originalPubkey = eventPubkeys.get(id);
    return !originalPubkey || originalPubkey === event.pubkey;
  });
  if (verified.length === 0) return;
  const next = new Set(deletedIds);
  for (const id of verified) next.add(id);
  deletedIds = next;
  if (deletedIds.size !== prevDeletedSize) {
    prevDeletedSize = deletedIds.size;
    rebuildReactionIndex();
  }
  const toPurge = verified.filter((id) => commentIds.has(id) || reactionIds.has(id));
  if (toPurge.length > 0)
    eventsDBRef
      ?.deleteByIds(toPurge)
      .catch((err: unknown) => log.error('Failed to purge deletion targets', err));
  log.debug('Deletion event received', { deletedIds: verified.map(shortHex) });
}
```

Note: `handleDeletionPacket` uses `eventsDBRef` (not `eventsDB` local) so it works in both `subscribe()` and `addSubscription()`. Set `eventsDBRef = eventsDB` before the handler is first called (already the case at L208).

- [ ] **Step 4: Run lint and type check**

Run: `pnpm lint && pnpm check`
Expected: PASS (helpers are defined but not yet used)

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/comments.svelte.ts
git commit -m "Extract comment/reaction/deletion handler helpers in comments store"
```

---

### Task 2: Consolidate subscribe() subscriptions

**Files:**
- Modify: `src/lib/stores/comments.svelte.ts:351-438`

- [ ] **Step 1: Replace 3 backward + 3 forward with 1 + 1**

Replace lines 351-438 (from `// --- Comments (kind:1111) ---` through `subscriptions = [commentSub, reactionSub, deletionSub];`) with:

```typescript
    // --- Unified subscription (kind:1111 + kind:7 + kind:5) ---
    const backward = createRxBackwardReq();
    const forward = createRxForwardReq();

    const baseFilters = [
      { kinds: [1111], '#I': [idValue] },
      { kinds: [7], '#I': [idValue] },
      { kinds: [5], '#I': [idValue] }
    ];
    const backwardFilters = maxCreatedAt
      ? baseFilters.map((f) => ({ ...f, since: maxCreatedAt + 1 }))
      : baseFilters;

    const sub = merge(
      rxNostr.use(backward).pipe(uniq()),
      rxNostr.use(forward).pipe(uniq())
    ).subscribe((packet) => {
      eventsDBRef?.put(packet.event);
      switch (packet.event.kind) {
        case 1111:
          handleCommentPacket(packet.event);
          break;
        case 7:
          handleReactionPacket(packet.event);
          break;
        case 5:
          handleDeletionPacket(packet.event);
          break;
      }
    });

    backward.emit(backwardFilters);
    backward.over();
    forward.emit(baseFilters);

    subscriptions = [sub];
```

- [ ] **Step 2: Run lint + check + test + e2e**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/comments.svelte.ts
git commit -m "Consolidate comment subscriptions: 6 slots → 2 slots per content page"
```

---

### Task 3: Rewrite addSubscription with kind:5 + consolidation

**Files:**
- Modify: `src/lib/stores/comments.svelte.ts:441-524`

- [ ] **Step 1: Replace addSubscription body**

Replace lines 441-524 (entire `addSubscription` function body) with:

```typescript
  async function addSubscription(idValue: string): Promise<void> {
    if (!rxNostrRef || !eventsDBRef || !rxNostrModRef || !rxjsRef) return;

    const { merge } = rxjsRef;
    const { createRxBackwardReq, createRxForwardReq, uniq } = rxNostrModRef;

    // DB cache restore — two-pass approach
    const tagQuery = `I:${idValue}`;
    const cachedEvents = await eventsDBRef.getByTagValue(tagQuery);

    // Pass 1: process kind:5 deletions FIRST
    let addedDeletions = false;
    for (const ev of cachedEvents) {
      if (ev.kind === 5) {
        for (const id of extractDeletionTargets(ev)) {
          const originalPubkey = eventPubkeys.get(id);
          if (!originalPubkey || originalPubkey === ev.pubkey) {
            deletedIds.add(id);
            addedDeletions = true;
          }
        }
      }
    }
    if (addedDeletions) {
      deletedIds = new Set(deletedIds);
      prevDeletedSize = deletedIds.size;
    }

    // Pass 2: restore comments and reactions (skipping deleted)
    const newComments: Comment[] = [];
    for (const ev of cachedEvents) {
      if (ev.kind === 1111 && !commentIds.has(ev.id) && !deletedIds.has(ev.id)) {
        commentIds.add(ev.id);
        eventPubkeys.set(ev.id, ev.pubkey);
        newComments.push(buildCommentFromEvent(ev));
      }
      if (ev.kind === 7 && !reactionIds.has(ev.id) && !deletedIds.has(ev.id)) {
        const reaction = buildReactionFromEvent(ev);
        if (reaction) {
          addReaction(reaction);
          eventPubkeys.set(ev.id, ev.pubkey);
        }
      }
    }
    if (newComments.length > 0) {
      commentsRaw = [...commentsRaw, ...newComments];
    }

    // Unified subscription (kind:1111 + kind:7 + kind:5)
    const backward = createRxBackwardReq();
    const forward = createRxForwardReq();

    const filters = [
      { kinds: [1111], '#I': [idValue] },
      { kinds: [7], '#I': [idValue] },
      { kinds: [5], '#I': [idValue] }
    ];

    const sub = merge(
      rxNostrRef.use(backward).pipe(uniq()),
      rxNostrRef.use(forward).pipe(uniq())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).subscribe((rawPacket: any) => {
      const packet = rawPacket as {
        event: {
          id: string;
          pubkey: string;
          content: string;
          created_at: number;
          tags: string[][];
          kind: number;
        };
      };
      eventsDBRef?.put(packet.event);
      switch (packet.event.kind) {
        case 1111:
          handleCommentPacket(packet.event);
          break;
        case 7:
          handleReactionPacket(packet.event);
          break;
        case 5:
          handleDeletionPacket(packet.event);
          break;
      }
    });

    backward.emit(filters);
    backward.over();
    forward.emit(filters);

    subscriptions.push(sub);
  }
```

- [ ] **Step 2: Run full pre-commit validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/comments.svelte.ts
git commit -m "Add kind:5 to addSubscription and consolidate to 2 slots"
```

---

## Chunk 2: putMany, Debounce, Dynamic Import

### Task 4: Batch putMany for non-replaceable events

**Files:**
- Modify: `src/lib/nostr/event-db.ts:141-146`
- Test: `src/lib/nostr/event-db.test.ts`

- [ ] **Step 1: Add test for batch putMany with mixed kinds**

Add to `event-db.test.ts` inside the existing `describe('putMany', ...)` block:

```typescript
    it('should batch non-replaceable and handle replaceable individually', async () => {
      const events = [
        makeEvent({ id: 'r1', kind: 1111, created_at: 100 }),
        makeEvent({ id: 'r2', kind: 1111, created_at: 200 }),
        makeEvent({ id: 'rep1', kind: 3, created_at: 100 }),
        makeEvent({ id: 'rep2', kind: 3, created_at: 200 }),
        makeEvent({ id: 'r3', kind: 7, created_at: 300 })
      ];

      await eventsDB.putMany(events);

      // Non-replaceable: all stored
      const kind1111 = await eventsDB.getAllByKind(1111);
      expect(kind1111).toHaveLength(2);
      const kind7 = await eventsDB.getAllByKind(7);
      expect(kind7).toHaveLength(1);

      // Replaceable: only latest kept
      const kind3 = await eventsDB.getByPubkeyAndKind('pk-1', 3);
      expect(kind3?.id).toBe('rep2');
    });
```

- [ ] **Step 2: Run test to verify it passes with current implementation**

Run: `pnpm test -- src/lib/nostr/event-db.test.ts`
Expected: PASS (existing putMany already handles this correctly, just slowly)

- [ ] **Step 3: Implement batched putMany**

Replace `event-db.ts` lines 141-146 with:

```typescript
  /** Store multiple events, applying replaceable event rules for each. */
  async putMany(events: NostrEvent[]): Promise<void> {
    const replaceable: NostrEvent[] = [];
    const regular: StoredEvent[] = [];
    for (const e of events) {
      if (isReplaceable(e.kind) || isParameterizedReplaceable(e.kind)) {
        replaceable.push(e);
      } else {
        regular.push(toStoredEvent(e));
      }
    }
    if (regular.length > 0) {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      for (const stored of regular) tx.store.put(stored);
      await tx.done;
    }
    for (const e of replaceable) await this.put(e);
  }
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- src/lib/nostr/event-db.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/nostr/event-db.ts src/lib/nostr/event-db.test.ts
git commit -m "Batch non-replaceable events in putMany for single-transaction write"
```

---

### Task 5: Notification debounce

**Files:**
- Modify: `src/web/routes/+layout.svelte:40-48`

- [ ] **Step 1: Add debounce to notification $effect**

Replace lines 40-48 in `+layout.svelte` with:

```typescript
  $effect(() => {
    if (auth.loggedIn && auth.pubkey) {
      const pubkey = auth.pubkey;
      const follows = getFollows().follows;
      if (follows.size === 0) {
        untrack(() => subscribeNotifications(pubkey, follows));
        return;
      }
      const timer = setTimeout(() => {
        untrack(() => subscribeNotifications(pubkey, follows));
      }, 1000);
      return () => clearTimeout(timer);
    } else if (auth.initialized && !auth.loggedIn) {
      untrack(() => destroyNotifications());
    }
  });
```

- [ ] **Step 2: Run full pre-commit validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/+layout.svelte
git commit -m "Debounce notification re-subscription during WoT construction"
```

---

### Task 6: Dynamic import for embed components

**Files:**
- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte:4-12,301-317`

- [ ] **Step 1: Remove 7 static imports, keep 2 embeds + PodcastEpisodeList**

Remove these imports (keep SpotifyEmbed, AudioEmbed, PodcastEpisodeList):
```
- import YouTubeEmbed from '$lib/components/YouTubeEmbed.svelte';
- import SoundCloudEmbed from '$lib/components/SoundCloudEmbed.svelte';
- import VimeoEmbed from '$lib/components/VimeoEmbed.svelte';
- import MixcloudEmbed from '$lib/components/MixcloudEmbed.svelte';
- import SpreakerEmbed from '$lib/components/SpreakerEmbed.svelte';
- import NiconicoEmbed from '$lib/components/NiconicoEmbed.svelte';
- import PodbeanEmbed from '$lib/components/PodbeanEmbed.svelte';
```

- [ ] **Step 2: Replace 7 embed branches with `{#await import(...)}`**

For each of the 7 removed embeds, replace the template branch. Example for YouTube (line ~303-304):

Before:
```svelte
{:else if showPlayer && platform === 'youtube'}
  <YouTubeEmbed {contentId} openUrl={provider.openUrl(contentId)} />
```

After:
```svelte
{:else if showPlayer && platform === 'youtube'}
  {#await import('$lib/components/YouTubeEmbed.svelte')}
    <div class="flex h-40 items-center justify-center rounded-2xl bg-surface-1">
      <div class="h-5 w-32 animate-pulse rounded bg-surface-2"></div>
    </div>
  {:then { default: YouTubeEmbed }}
    <YouTubeEmbed {contentId} openUrl={provider.openUrl(contentId)} />
  {/await}
```

Apply the same pattern for: SoundCloud, Vimeo, Mixcloud, Spreaker, Niconico, Podbean.

- [ ] **Step 3: Run full pre-commit validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS (E2E tests cover Spotify, YouTube, Vimeo, SoundCloud, Mixcloud, Spreaker, Niconico, Podbean pages)

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/\\[platform\\]/\\[type\\]/\\[id\\]/+page.svelte
git commit -m "Lazy-load 7 embed components via dynamic import for bundle splitting"
```
