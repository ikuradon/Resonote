# Auftakt Public Read Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route `fetchLatestEvent` and `fetchNostrEventById` through coordinator-mediated local-first reads.

**Architecture:** Keep `EventCoordinator` as the public-read mediation boundary. Add focused runtime helpers that call `EventCoordinator.read()` through the existing runtime coordinator and relay overlay machinery, preserving public API signatures while ensuring relay candidates are validated, quarantined, and materialized before results are returned.

**Tech Stack:** TypeScript, Vitest, `@auftakt/core`, `@auftakt/resonote`, existing relay selection and materialization runtime helpers.

---

## File Structure

- Create `packages/resonote/src/public-read-cutover.contract.test.ts`: focused contract tests for public read cutover behavior.
- Modify `packages/resonote/src/runtime.ts`: add coordinator-backed helpers and replace the remaining direct public read paths.
- Optionally modify `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`: only if implementation changes the first follow-up status wording.

## Task 1: Add Public Latest Read Cutover Tests

**Files:**

- Create: `packages/resonote/src/public-read-cutover.contract.test.ts`

- [ ] **Step 1: Write the failing latest read contract tests**

Create `packages/resonote/src/public-read-cutover.contract.test.ts`:

```ts
import { finalizeEvent } from '@auftakt/core';
import { createResonoteCoordinator } from '@auftakt/resonote';
import { describe, expect, it, vi } from 'vitest';

const RELAY_SECRET_KEY = new Uint8Array(32).fill(9);

interface RequestRecord {
  readonly options: unknown;
  readonly emitted: unknown[];
}

function createCoordinatorFixture({
  defaultRelays = ['wss://default.example'],
  getById = async () => null,
  getAllByKind = async () => [],
  getRelayHints = async () => [],
  relayEvents = [],
  putWithReconcile = async () => ({ stored: true, emissions: [] }),
  putQuarantine = async () => {},
  relayStatusFetchLatestEvent = async () => null
}: {
  defaultRelays?: readonly string[];
  getById?: (id: string) => Promise<unknown>;
  getAllByKind?: (kind: number) => Promise<unknown[]>;
  getRelayHints?: (eventId: string) => Promise<
    Array<{
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }>
  >;
  relayEvents?: readonly unknown[];
  putWithReconcile?: (event: unknown) => Promise<{ stored: boolean; emissions: unknown[] }>;
  putQuarantine?: (record: unknown) => Promise<void>;
  relayStatusFetchLatestEvent?: (
    pubkey: string,
    kind: number
  ) => Promise<{ tags: string[][]; content: string; created_at: number } | null>;
} = {}) {
  const createdRequests: RequestRecord[] = [];
  const relayStatusLatest = vi.fn(relayStatusFetchLatestEvent);

  const coordinator = createResonoteCoordinator({
    runtime: {
      fetchLatestEvent: async () => null,
      getDefaultRelays: async () => defaultRelays,
      getEventsDB: async () => ({
        getByPubkeyAndKind: async () => null,
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async () => null,
        getByTagValue: async () => [],
        getById: async (id: string) => getById(id),
        getAllByKind: async (kind: number) => getAllByKind(kind),
        listNegentropyEventRefs: async () => [],
        getRelayHints: async (eventId: string) => getRelayHints(eventId),
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async (event: unknown) => putWithReconcile(event),
        putQuarantine: async (record: unknown) => putQuarantine(record)
      }),
      getRelaySession: async () => ({
        use(_req: { emit(input: unknown): void }, options: unknown) {
          const entry = { options, emitted: [] as unknown[] };
          createdRequests.push(entry);
          return {
            subscribe(observer: {
              next?: (packet: { event: unknown; from?: string }) => void;
              complete?: () => void;
            }) {
              queueMicrotask(() => {
                for (const event of relayEvents) {
                  observer.next?.({ event, from: 'wss://relay.example' });
                }
                observer.complete?.();
              });
              return { unsubscribe() {} };
            }
          };
        }
      }),
      createBackwardReq: () => ({
        emit(input: unknown) {
          createdRequests.at(-1)?.emitted.push(input);
        },
        over() {}
      }),
      createForwardReq: () => ({ emit() {}, over() {} }),
      uniq: () => ({}) as unknown,
      merge: () => ({}) as unknown,
      getRelayConnectionState: async () => null,
      observeRelayConnectionStates: async () => ({ unsubscribe() {} })
    },
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: {
      useCachedLatest: () => null
    },
    publishTransportRuntime: {
      castSigned: async () => {}
    },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: relayStatusLatest,
      setDefaultRelays: async () => {}
    }
  });

  return { coordinator, createdRequests, relayStatusLatest };
}

describe('@auftakt/resonote public read cutover', () => {
  it('routes public latest reads through coordinator materialization', async () => {
    const relayEvent = finalizeEvent(
      {
        kind: 0,
        content: 'relay metadata',
        tags: [],
        created_at: 123
      },
      RELAY_SECRET_KEY
    );
    const materialized: unknown[] = [];
    const { coordinator, createdRequests, relayStatusLatest } = createCoordinatorFixture({
      relayEvents: [relayEvent],
      putWithReconcile: async (event) => {
        materialized.push(event);
        return { stored: true, emissions: [] };
      },
      relayStatusFetchLatestEvent: async () => {
        throw new Error('legacy latest path used');
      }
    });

    const result = await coordinator.fetchLatestEvent(relayEvent.pubkey, 0);

    expect(result).toMatchObject({
      content: 'relay metadata',
      created_at: 123,
      tags: []
    });
    expect(materialized).toEqual([relayEvent]);
    expect(relayStatusLatest).not.toHaveBeenCalled();
    expect(createdRequests[0]?.emitted).toEqual([
      { kinds: [0], authors: [relayEvent.pubkey], limit: 1 }
    ]);
  });

  it('quarantines malformed latest relay candidates and returns null', async () => {
    const quarantined: unknown[] = [];
    const materialized: unknown[] = [];
    const { coordinator, relayStatusLatest } = createCoordinatorFixture({
      relayEvents: [{ id: 'not-a-valid-event' }],
      putWithReconcile: async (event) => {
        materialized.push(event);
        return { stored: true, emissions: [] };
      },
      putQuarantine: async (record) => {
        quarantined.push(record);
      },
      relayStatusFetchLatestEvent: async () => {
        throw new Error('legacy latest path used');
      }
    });

    await expect(coordinator.fetchLatestEvent('pubkey', 0)).resolves.toBeNull();
    expect(relayStatusLatest).not.toHaveBeenCalled();
    expect(materialized).toEqual([]);
    expect(quarantined).toEqual([
      expect.objectContaining({
        relayUrl: 'wss://relay.example',
        eventId: 'not-a-valid-event',
        rawEvent: { id: 'not-a-valid-event' }
      })
    ]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-read-cutover.contract.test.ts
```

Expected: FAIL. The latest tests should fail because `ResonoteCoordinator.fetchLatestEvent()` still delegates to `relayStatusRuntime.fetchLatestEvent`.

- [ ] **Step 3: Commit nothing**

Do not commit this task yet. Task 2 will add the implementation and commit the new tests together.

## Task 2: Route `fetchLatestEvent` Through EventCoordinator

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Test: `packages/resonote/src/public-read-cutover.contract.test.ts`

- [ ] **Step 1: Add latest helper code**

In `packages/resonote/src/runtime.ts`, add these helpers after `fetchBackwardEventsFromReadRuntime()` and before `resolveReadOptions()`:

```ts
function selectNewestVisibleEvent<TEvent extends StoredEvent>(
  events: readonly TEvent[]
): TEvent | null {
  return (
    [...events].sort((left, right) => {
      if (right.created_at !== left.created_at) return right.created_at - left.created_at;
      return right.id.localeCompare(left.id);
    })[0] ?? null
  );
}

async function fetchLatestEventFromReadRuntime(
  runtime: CoordinatorReadRuntime,
  pubkey: string,
  kind: number,
  relaySelectionPolicy: RelaySelectionPolicyOptions
): Promise<LatestEventSnapshot | null> {
  const filters: RuntimeFilter[] = [{ kinds: [kind], authors: [pubkey], limit: 1 }];

  try {
    const resolvedOptions = await resolveReadOptions(
      runtime,
      filters,
      { timeoutMs: 10_000 },
      'read',
      relaySelectionPolicy
    );
    const coordinator = createRuntimeEventCoordinator(runtime, resolvedOptions);
    const result = await coordinator.read(filters, { policy: 'localFirst' });
    return selectNewestVisibleEvent(result.events);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Route `queryRuntime.fetchLatestEvent` through the helper**

In `createResonoteCoordinator()`, replace this `queryRuntime` entry:

```ts
fetchLatestEvent: (pubkey, kind) => runtime.fetchLatestEvent(pubkey, kind),
```

with:

```ts
fetchLatestEvent: (pubkey, kind) =>
  fetchLatestEventFromReadRuntime(coordinatorReadRuntime, pubkey, kind, relaySelectionPolicy),
```

- [ ] **Step 3: Route public coordinator `fetchLatestEvent` through the helper**

In the returned coordinator object, replace:

```ts
fetchLatestEvent: (pubkey, kind) => relayStatusRuntime.fetchLatestEvent(pubkey, kind),
```

with:

```ts
fetchLatestEvent: (pubkey, kind) =>
  fetchLatestEventFromReadRuntime(coordinatorReadRuntime, pubkey, kind, relaySelectionPolicy),
```

- [ ] **Step 4: Run focused tests and verify GREEN for latest cutover**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-read-cutover.contract.test.ts packages/resonote/src/built-in-plugins.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/public-read-cutover.contract.test.ts
git commit -m "feat(auftakt): route latest reads through coordinator"
```

Expected: commit succeeds.

## Task 3: Route Cached By-Id Public Reads Through Local-First Verification

**Files:**

- Modify: `packages/resonote/src/public-read-cutover.contract.test.ts`
- Modify: `packages/resonote/src/runtime.ts`

- [ ] **Step 1: Add the failing cached by-id verification test**

Append this test inside `describe('@auftakt/resonote public read cutover', () => { ... })` in `packages/resonote/src/public-read-cutover.contract.test.ts`:

```ts
it('still verifies cached public by-id reads with temporary relay hints', async () => {
  const localEvent = finalizeEvent(
    {
      kind: 1,
      content: 'local event',
      tags: [],
      created_at: 44
    },
    RELAY_SECRET_KEY
  );
  const { coordinator, createdRequests } = createCoordinatorFixture({
    defaultRelays: ['wss://default.example'],
    getById: async (id) => (id === localEvent.id ? localEvent : null)
  });

  const result = await coordinator.fetchNostrEventById<typeof localEvent>(localEvent.id, [
    'wss://temporary.example'
  ]);

  expect(result).toEqual(localEvent);
  expect(createdRequests[0]?.options).toEqual({
    on: {
      relays: ['wss://temporary.example/', 'wss://default.example/'],
      defaultReadRelays: false
    }
  });
  expect(createdRequests[0]?.emitted).toEqual([{ ids: [localEvent.id] }]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-read-cutover.contract.test.ts
```

Expected: FAIL because `ResonoteCoordinator.fetchNostrEventById()` currently returns a direct DB hit before scheduling coordinator relay verification.

- [ ] **Step 3: Add a by-id coordinator helper**

In `packages/resonote/src/runtime.ts`, add this helper after `fetchLatestEventFromReadRuntime()`:

```ts
async function fetchNostrEventByIdFromReadRuntime<TEvent>(
  runtime: CoordinatorReadRuntime,
  eventId: string,
  relayHints: readonly string[],
  relaySelectionPolicy: RelaySelectionPolicyOptions
): Promise<TEvent | null> {
  try {
    const events = await fetchBackwardEventsFromReadRuntime<StoredEvent>(
      runtime,
      [{ ids: [eventId] }],
      { timeoutMs: 10_000 },
      relaySelectionPolicy,
      relayHints
    );
    return (events.find((event) => event.id === eventId) as TEvent | undefined) ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Replace the public coordinator by-id implementation**

In the returned coordinator object in `createResonoteCoordinator()`, replace:

```ts
fetchNostrEventById: async (eventId: string, relayHints: readonly string[]) => {
  const eventsDB = await runtime.getEventsDB();
  const cached = await eventsDB.getById(eventId);
  if (cached) return cached as never;

  const events = await fetchBackwardEventsFromReadRuntime<StoredEvent>(
    coordinatorReadRuntime,
    [{ ids: [eventId] }],
    { timeoutMs: 10_000 },
    relaySelectionPolicy,
    relayHints
  );
  return (events[0] as never) ?? null;
},
```

with:

```ts
fetchNostrEventById: (eventId: string, relayHints: readonly string[]) =>
  fetchNostrEventByIdFromReadRuntime<never>(
    coordinatorReadRuntime,
    eventId,
    relayHints,
    relaySelectionPolicy
  ),
```

- [ ] **Step 5: Run focused tests and relay selection tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-read-cutover.contract.test.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/built-in-plugins.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/public-read-cutover.contract.test.ts
git commit -m "feat(auftakt): verify public by-id reads through coordinator"
```

Expected: commit succeeds.

## Task 4: Keep Package Surface And Strict Gates Passing

**Files:**

- Test only unless a focused regression fails.

- [ ] **Step 1: Run package public API contract**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-api.contract.test.ts
```

Expected: PASS. The allowlisted package root value exports should not change.

- [ ] **Step 2: Run coordinator and gateway focused contracts**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/relay-gateway.contract.test.ts packages/resonote/src/public-read-cutover.contract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run strict goal audit gate**

Run:

```bash
pnpm run check:auftakt:strict-goal-audit
```

Expected: PASS with no checker errors.

- [ ] **Step 4: Confirm no Task 4 edit is needed**

Run:

```bash
git status --short packages/resonote/src/public-api.contract.test.ts packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/relay-gateway.contract.test.ts packages/resonote/src/public-read-cutover.contract.test.ts scripts/check-auftakt-strict-goal-audit.ts docs/auftakt/2026-04-26-strict-goal-gap-audit.md
```

Expected: no output for all listed files. If there is output, stop and inspect the
focused regression before continuing to final verification.

## Task 5: Final Verification

**Files:**

- No edits.

- [ ] **Step 1: Run focused regression suite**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-read-cutover.contract.test.ts packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/relay-gateway.contract.test.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/built-in-plugins.contract.test.ts packages/resonote/src/public-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Auftakt package tests**

Run:

```bash
pnpm run test:auftakt:resonote
```

Expected: PASS.

- [ ] **Step 3: Run strict gates**

Run:

```bash
pnpm run check:auftakt:strict-goal-audit
```

Expected: PASS.

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: PASS.

Run:

```bash
pnpm run check:auftakt-migration -- --proof
```

Expected: PASS.

- [ ] **Step 4: Run package suite**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 5: Inspect working tree**

Run:

```bash
git status --short
```

Expected: only pre-existing unrelated changes remain, such as `.gitignore` and old untracked docs, unless the user has made new changes during execution.
