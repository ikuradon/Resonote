# Nostr Subscription & IndexedDB Optimization

**Date**: 2026-03-17
**Issue**: #6

## Summary

Optimize Nostr subscription patterns, IndexedDB writes, and initial bundle size.
Five items ordered by implementation dependency and impact.

## Item 4+5: Subscription Consolidation + addSubscription kind:5

### Problem

- `comments.svelte.ts` `subscribe()` creates 6 subscription slots (3 backward + 3 forward) for kind:1111, 7, 5
- `addSubscription()` only subscribes to kind:1111 and kind:7, missing kind:5 deletions
- Each rx-nostr `use()` call occupies a NIP-11 `max_subscriptions` slot per relay

### Design

rx-nostr's `emit()` accepts `LazyFilter[]`. A single REQ can carry multiple filters, and relays evaluate each filter independently (NIP-01). This preserves per-kind `since`/`limit` while using 1 subscription slot.

**Note on kind:5 and `since`**: Applying `since: maxCreatedAt + 1` to the kind:5 backward filter is safe because the existing reconciliation mechanism (L297–348 in comments.svelte.ts) independently discovers deletions via `#e` queries for all cached event IDs. The `since`-filtered backward is for efficiently catching Resonote-originated deletions; the reconciliation covers the rest.

**subscribe()** — merge 3 backward reqs into 1, 3 forward reqs into 1:

```typescript
const backward = createRxBackwardReq();
const forward = createRxForwardReq();

const filters = [
  { kinds: [1111], '#I': [idValue] },
  { kinds: [7], '#I': [idValue] },
  { kinds: [5], '#I': [idValue] }
];
const filtersWithSince = maxCreatedAt
  ? filters.map(f => ({ ...f, since: maxCreatedAt + 1 }))
  : filters;

const sub = merge(
  rxNostr.use(backward).pipe(uniq()),
  rxNostr.use(forward).pipe(uniq())
).subscribe((packet) => {
  eventsDB.put(packet.event);
  switch (packet.event.kind) {
    case 1111: handleComment(packet); break;
    case 7:    handleReaction(packet); break;
    case 5:    handleDeletion(packet); break;
  }
});

backward.emit(filtersWithSince);
backward.over();
forward.emit(filters);

subscriptions = [sub];
```

**addSubscription()** — same pattern, now including kind:5. DB cache restore must also handle kind:5:

```typescript
// DB cache restore — add kind:5 handling
const tagQuery = `I:${idValue}`;
const cachedEvents = await eventsDBRef.getByTagValue(tagQuery);
for (const ev of cachedEvents) {
  if (ev.kind === 1111 && !commentIds.has(ev.id) && !deletedIds.has(ev.id)) {
    // ... existing comment restore logic
  }
  if (ev.kind === 7 && !reactionIds.has(ev.id) && !deletedIds.has(ev.id)) {
    // ... existing reaction restore logic
  }
  // NEW: restore cached deletions for this tag
  if (ev.kind === 5) {
    for (const id of extractDeletionTargets(ev)) {
      const originalPubkey = eventPubkeys.get(id);
      if (!originalPubkey || originalPubkey === ev.pubkey) {
        deletedIds.add(id);
      }
    }
  }
}

// Subscription
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
).subscribe((packet) => {
  eventsDBRef?.put(packet.event);
  switch (packet.event.kind) {
    case 1111: handleComment(packet); break;
    case 7:    handleReaction(packet); break;
    case 5:    handleDeletion(packet); break;
  }
});

backward.emit(filters);
backward.over();
forward.emit(filters);

subscriptions.push(sub);
```

**Result**: 6 slots → 2 slots per content page. addSubscription goes from 4 slots (2 kinds × 2) to 2 slots (1 backward + 1 forward) and now includes kind:5.

### Files Changed

- `src/lib/stores/comments.svelte.ts`

### Refactoring Notes

Extract `handleComment`, `handleReaction`, `handleDeletion` helper functions from the existing inline subscribe callbacks. These are used by both `subscribe()` and `addSubscription()`.

---

## Item 2: putMany Batch Write

### Problem

`EventsDB.putMany()` calls `await this.put()` in a loop, creating one IndexedDB transaction per event.

### Design

Split events into replaceable (need `getFromIndex` check) and non-replaceable (direct `put`). Batch non-replaceable events in a single transaction. The put-after-delete race condition (a deleted event being re-put by a concurrent stream) exists in the current sequential code as well, so this optimization does not introduce new issues.

```typescript
async putMany(events: NostrEvent[]): Promise<void> {
  const replaceable: NostrEvent[] = [];
  const regular: NostrEvent[] = [];
  for (const e of events) {
    if (isReplaceable(e.kind) || isParameterizedReplaceable(e.kind)) {
      replaceable.push(e);
    } else {
      regular.push(e);
    }
  }
  if (regular.length > 0) {
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    for (const e of regular) tx.store.put(toStoredEvent(e));
    await tx.done;
  }
  for (const e of replaceable) await this.put(e);
}
```

### Files Changed

- `src/lib/nostr/event-db.ts`

---

## Item 3: Notification Debounce

### Problem

`+layout.svelte` re-subscribes notifications on every `follows` change. During WoT construction, follows updates fire multiple times in quick succession.

### Design

Add 1-second `setTimeout` debounce in the `$effect`. The cleanup function clears the timer, so rapid re-fires only execute the last one. Skip debounce on initial login (empty follows) to avoid delaying UI feedback.

```typescript
$effect(() => {
  if (auth.loggedIn && auth.pubkey) {
    const pubkey = auth.pubkey;
    const follows = getFollows().follows;
    // Skip debounce on initial login (empty follows) for immediate feedback
    if (follows.length === 0) {
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

### Files Changed

- `src/web/routes/+layout.svelte`

---

## Item 1: Embed Dynamic Import

### Problem

9 embed components are statically imported in `[platform]/[type]/[id]/+page.svelte` but only 1 is rendered per page. All are included in the initial chunk.

### Design

Replace static imports with `{#await import(...)}` in each `{:else if}` branch. Vite statically analyzes the import path strings and creates separate chunks.

```svelte
<!-- Before -->
<script>
  import SpotifyEmbed from '$lib/components/SpotifyEmbed.svelte';
  // ... 8 more
</script>
{:else if showPlayer && platform === 'spotify'}
  <SpotifyEmbed {contentId} openUrl={provider.openUrl(contentId)} />

<!-- After -->
{:else if showPlayer && platform === 'spotify'}
  {#await import('$lib/components/SpotifyEmbed.svelte')}
    <div class="flex h-40 items-center justify-center rounded-2xl bg-surface-1">
      <div class="h-5 w-32 animate-pulse rounded bg-surface-2"></div>
    </div>
  {:then { default: SpotifyEmbed }}
    <SpotifyEmbed {contentId} openUrl={provider.openUrl(contentId)} />
  {/await}
```

A shimmer placeholder is shown during chunk loading to avoid a blank flash on slow networks. Each embed component already has its own brand loading screen internally, so the placeholder only covers the chunk download phase.

AudioEmbed and PodcastEpisodeList remain static imports because they are used for multiple platforms (audio, podcast).

### Files Changed

- `src/web/routes/[platform]/[type]/[id]/+page.svelte`

---

## Implementation Order

1. **Item 4+5**: Subscription consolidation + kind:5 in addSubscription
2. **Item 2**: putMany batch write
3. **Item 3**: Notification debounce
4. **Item 1**: Embed dynamic import

Items 2–4 in this list are independent of each other and can be implemented in parallel after the subscription consolidation (item 1 above) is complete.

## Testing

- Existing unit tests for `comments.svelte.ts` (subscription behavior)
- Existing unit tests for `event-db.ts` (putMany)
- E2E tests verify comments/reactions still display correctly
- Manual verification: relay subscription count via browser DevTools WebSocket inspector
