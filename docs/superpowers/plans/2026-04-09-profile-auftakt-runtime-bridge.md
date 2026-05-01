# Profile Auftakt Runtime Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move browser profile fetching to the Auftakt runtime bridge while preserving the current public API and existing cache/pending behavior.

**Architecture:** Add the smallest possible latest-profile read surface to the `@ikuradon/auftakt` store so the runtime can read cached kind:0 events by pubkey. Build a profile-specific bridge helper in `src/shared/nostr/auftakt-runtime.ts` that reads cached profiles from the runtime store, fetches missing ones through the runtime sync path, persists fetched events, and normalizes missing profiles to `{}`. Update `src/shared/browser/profile.svelte.ts` to call that bridge only, keeping its public API unchanged.

**Tech Stack:** TypeScript, Svelte 5 runes, Vitest, Dexie/fake-indexeddb, existing Nostr runtime packages.

---

### Task 1: Add latest-profile lookup to Auftakt store and fakes

**Files:**

- Modify: `packages/auftakt/src/store/dexie/persistent-store.ts`
- Modify: `packages/auftakt/src/store/dexie/persistent-store.test.ts`
- Modify: `packages/auftakt/src/testing/fakes.ts`
- Modify: `packages/auftakt/src/testing/fakes.test.ts`

- [ ] **Step 1: Write the failing test**

Add a store test that writes two kind:0 events for the same pubkey and asserts `getLatestEventByPubkeyAndKind(pubkey, 0)` returns the newer one. Add a fake-store test with the same expectation so the runtime bridge can be tested without IndexedDB.

- [ ] **Step 2: Run the targeted tests and confirm they fail**

Run: `pnpm vitest run packages/auftakt/src/store/dexie/persistent-store.test.ts packages/auftakt/src/testing/fakes.test.ts -t "latest"`

Expected: fail because `getLatestEventByPubkeyAndKind` is not implemented yet.

- [ ] **Step 3: Implement the minimal store/fake API**

```ts
export interface DexiePersistentStore {
  putEvent(event: DexieNostrEventLike): Promise<void>;
  getEvent(id: string): Promise<DexieNostrEventLike | null>;
  getLatestEventByPubkeyAndKind(pubkey: string, kind: number): Promise<DexieNostrEventLike | null>;
  dispose(): Promise<void>;
}

async getLatestEventByPubkeyAndKind(pubkey: string, kind: number) {
  const results = await db.events.where('[pubkey+kind]').equals([pubkey, kind]).sortBy('created_at');
  return results.at(-1) ?? null;
}
```

Mirror the same method on the fake persistent store with an in-memory scan that returns the latest matching event by `created_at`.

- [ ] **Step 4: Run the targeted tests and confirm they pass**

Run: `pnpm vitest run packages/auftakt/src/store/dexie/persistent-store.test.ts packages/auftakt/src/testing/fakes.test.ts -t "latest"`

Expected: pass.

- [ ] **Step 5: Commit**

Commit this store-layer change before moving on so the runtime bridge can depend on it cleanly.

### Task 2: Add a profile-oriented helper to the Auftakt runtime bridge

**Files:**

- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Modify: `src/shared/nostr/auftakt-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that injects a fake runtime with a store returning one cached kind:0 event for `alice`, no cached event for `bob`, and a sync engine that returns a newer event for `bob`. Assert the helper returns both profiles, persists the fetched event through `sync.fetch`, and leaves missing pubkeys out only as `{}`.

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `pnpm vitest run src/shared/nostr/auftakt-runtime.test.ts -t "profile"`

Expected: fail because `fetchLatestProfileEvents` does not exist yet.

- [ ] **Step 3: Implement the runtime helper**

```ts
export async function fetchLatestProfileEvents(pubkeys: string[]) {
  const runtime = await getAuftaktRuntime();
  const cached = await Promise.all(
    pubkeys.map(
      async (pubkey) =>
        [pubkey, await runtime.store.getLatestEventByPubkeyAndKind(pubkey, 0)] as const
    )
  );
  const missing = cached.filter(([, event]) => !event).map(([pubkey]) => pubkey);
  const fetched =
    missing.length > 0 ? await runtime.sync.fetch({ kinds: [0], authors: missing }) : [];
  return { cached, fetched };
}
```

Then normalize the result into a `Map<string, Profile | {}>`-style output, parse kind:0 JSON, warn on malformed JSON, and keep the helper responsible for persistence through `sync.fetch`.

- [ ] **Step 4: Run the targeted test and confirm it passes**

Run: `pnpm vitest run src/shared/nostr/auftakt-runtime.test.ts -t "profile"`

Expected: pass.

- [ ] **Step 5: Commit**

Lock in the bridge before changing the browser consumer.

### Task 3: Switch browser profile fetching to the bridge and update browser tests

**Files:**

- Modify: `src/shared/browser/profile.svelte.ts`
- Modify: `src/shared/browser/profile.svelte.test.ts`

- [ ] **Step 1: Write the failing browser test**

Update the profile browser test so it mocks `src/shared/nostr/auftakt-runtime.ts` instead of `rx-nostr` and `$shared/nostr/gateway.js`, then assert that `fetchProfiles` still preserves DB-first behavior, dedupe, malformed JSON warnings, `{}` fallback, and `MAX_PROFILES` trimming.

- [ ] **Step 2: Run the browser test and confirm it fails**

Run: `pnpm vitest run src/shared/browser/profile.svelte.test.ts`

Expected: fail until the browser module imports the bridge helper.

- [ ] **Step 3: Update the browser module to use the bridge**

```ts
const profilesByPubkey = await fetchLatestProfileEvents(toFetch);
for (const [pubkey, profile] of profilesByPubkey) {
  if (profile) profiles.set(pubkey, profile);
}
```

Keep the existing public exports and state management unchanged, but remove direct `rx-nostr`/gateway imports from the browser module.

- [ ] **Step 4: Run the browser test and related runtime/store tests**

Run: `pnpm vitest run src/shared/browser/profile.svelte.test.ts src/shared/nostr/auftakt-runtime.test.ts packages/auftakt/src/store/dexie/persistent-store.test.ts packages/auftakt/src/testing/fakes.test.ts`

Expected: pass.

- [ ] **Step 5: Commit**

Create one final commit for the end-to-end migration and include the plan document if it has not already been committed.
