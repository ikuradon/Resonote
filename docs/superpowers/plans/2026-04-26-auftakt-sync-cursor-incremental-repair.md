# Auftakt Sync Cursor Incremental Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist restart-safe ordered repair cursors in Dexie and make `repairEventsFromRelay()` resume fallback and negentropy repair from those cursors.

**Architecture:** The Dexie adapter owns cursor persistence with `OrderedEventCursor` vocabulary from `@auftakt/core`. The Resonote runtime loads a cursor per relay/request key, applies `since` as a coarse relay lower bound, locally ignores events at or below the saved ordered cursor, and advances the cursor only after successful reconcile materialization.

**Tech Stack:** TypeScript, Vitest, fake-indexeddb, Dexie, `@auftakt/core`, `@auftakt/resonote`, `@auftakt/adapter-dexie`.

---

## File Structure

- Modify: `packages/adapter-dexie/src/schema.ts:66-126`
  - Add ordered cursor fields to `DexieSyncCursorRecord`.
  - Add Dexie schema version 3 for cursor indexes.
- Modify: `packages/adapter-dexie/src/index.ts:1-80` and `packages/adapter-dexie/src/index.ts:234-245`
  - Add sync cursor input type and adapter methods.
- Create: `packages/adapter-dexie/src/sync-cursors.contract.test.ts`
  - Prove cursor put/get, restart persistence, raw Dexie row fields, and old row tolerance.
- Modify: `packages/adapter-dexie/src/schema.contract.test.ts:7-25`
  - Lock the new `sync_cursors` indexes.
- Modify: `packages/resonote/src/runtime.ts:1-57`, `packages/resonote/src/runtime.ts:1473-1515`, and `packages/resonote/src/runtime.ts:2933-3194`
  - Add optional cursor store methods to runtime DB shape.
  - Add repair cursor helpers.
  - Apply cursor state to fallback and negentropy repair.
- Modify: `packages/resonote/src/relay-repair.contract.test.ts:1-560`
  - Extend the fixture with cursor methods and restart-friendly DB names.
  - Add fallback restart, malformed candidate, negentropy lower-bound, and kind:5 restart contracts.
- Modify: `scripts/check-auftakt-strict-goal-audit.ts:37-76` and `scripts/check-auftakt-strict-goal-audit.ts:206-260`
  - Require sync cursor implementation evidence.
- Modify: `scripts/check-auftakt-strict-goal-audit.test.ts:18-240`
  - Lock the new audit evidence.
- Modify: `docs/auftakt/2026-04-26-strict-goal-gap-audit.md:43-89`
  - Record sync cursor incremental repair as implemented while preserving scoped-vs-strict wording.

## Task 1: Dexie Sync Cursor Storage

**Files:**

- Create: `packages/adapter-dexie/src/sync-cursors.contract.test.ts`
- Modify: `packages/adapter-dexie/src/schema.ts:66-126`
- Modify: `packages/adapter-dexie/src/index.ts:1-80`
- Modify: `packages/adapter-dexie/src/index.ts:234-245`
- Modify: `packages/adapter-dexie/src/schema.contract.test.ts:7-25`

- [ ] **Step 1: Write the failing Dexie cursor contract**

Create `packages/adapter-dexie/src/sync-cursors.contract.test.ts`:

```ts
import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { createDexieEventStore } from './index.js';

const relayUrl = 'wss://relay.cursor.test';
const requestKey = 'rq:v1:cursor-contract';
const cursorKey = `relay:${relayUrl}\nrequest:${requestKey}`;
const cursorId = 'b'.repeat(64);

describe('Dexie sync cursor contract', () => {
  it('persists and restores ordered cursors by stable key', async () => {
    const dbName = `auftakt-sync-cursor-${Date.now()}-${Math.random()}`;
    const store = await createDexieEventStore({ dbName });

    await store.putSyncCursor({
      key: cursorKey,
      relay: relayUrl,
      requestKey,
      cursor: {
        created_at: 123,
        id: cursorId
      },
      updatedAt: 456
    });

    await expect(store.getSyncCursor(cursorKey)).resolves.toEqual({
      created_at: 123,
      id: cursorId
    });
    await expect(store.db.sync_cursors.get(cursorKey)).resolves.toMatchObject({
      key: cursorKey,
      relay: relayUrl,
      request_key: requestKey,
      cursor_created_at: 123,
      cursor_id: cursorId,
      updated_at: 456
    });

    store.db.close();

    const reopened = await createDexieEventStore({ dbName });
    await expect(reopened.getSyncCursor(cursorKey)).resolves.toEqual({
      created_at: 123,
      id: cursorId
    });
    reopened.db.close();
  });

  it('treats pre-version-3 timestamp-only rows as empty cursors', async () => {
    const store = await createDexieEventStore({
      dbName: `auftakt-sync-cursor-old-row-${Date.now()}-${Math.random()}`
    });

    await store.db.sync_cursors.put({
      key: cursorKey,
      relay: relayUrl,
      request_key: requestKey,
      updated_at: 111
    });

    await expect(store.getSyncCursor(cursorKey)).resolves.toBeNull();
    store.db.close();
  });
});
```

- [ ] **Step 2: Lock the Dexie cursor indexes in the schema test**

Add this assertion to `packages/adapter-dexie/src/schema.contract.test.ts` inside `opens all strict coordinator tables` after the table-name assertion:

```ts
expect(store.db.sync_cursors.schema.indexes.map((index) => index.name).sort()).toEqual(
  [
    '[cursor_created_at+cursor_id]',
    '[relay+request_key]',
    'relay',
    'request_key',
    'updated_at'
  ].sort()
);
```

- [ ] **Step 3: Run the adapter cursor tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/sync-cursors.contract.test.ts packages/adapter-dexie/src/schema.contract.test.ts
```

Expected: FAIL because `DexieEventStore` does not expose `putSyncCursor()` or `getSyncCursor()`, and the schema does not expose `[cursor_created_at+cursor_id]`.

- [ ] **Step 4: Add Dexie schema version 3 and cursor record fields**

In `packages/adapter-dexie/src/schema.ts`, replace `DexieSyncCursorRecord` with:

```ts
export interface DexieSyncCursorRecord {
  readonly key: string;
  readonly relay: string;
  readonly request_key: string;
  readonly cursor_created_at?: number;
  readonly cursor_id?: string;
  readonly updated_at: number;
}
```

In `packages/adapter-dexie/src/schema.ts`, replace the version setup in the constructor with:

```ts
const versionOneStores = {
  events: 'id,[pubkey+kind],[pubkey+kind+d_tag],[kind+created_at],[created_at+id],*tag_values',
  event_tags: 'key,event_id,[tag+value]',
  deletion_index: 'key,deletion_id,created_at,target_id,pubkey',
  replaceable_heads: 'key,event_id,created_at',
  event_relay_hints: 'key,event_id,relay_url,[event_id+source],last_seen_at',
  sync_cursors: 'key,relay,request_key,updated_at',
  pending_publishes: 'id,created_at,status',
  projections: 'key,[projection+sort_key]',
  migration_state: 'key,version,source_db_name,dexie_only_writes',
  quarantine: 'key,event_id,relay_url,reason,created_at'
};
const versionTwoStores = {
  ...versionOneStores,
  relay_capabilities: 'relay_url,nip11_status,nip11_expires_at,learned_at,updated_at'
};
this.version(1).stores(versionOneStores);
this.version(2).stores(versionTwoStores);
this.version(3).stores({
  ...versionTwoStores,
  sync_cursors: 'key,relay,request_key,[relay+request_key],updated_at,[cursor_created_at+cursor_id]'
});
```

- [ ] **Step 5: Add Dexie cursor store methods**

In `packages/adapter-dexie/src/index.ts`, add this interface after `RelayCapabilityRecordInput`:

```ts
export interface SyncCursorRecordInput {
  readonly key: string;
  readonly relay: string;
  readonly requestKey: string;
  readonly cursor: OrderedEventCursor;
  readonly updatedAt: number;
}
```

In `packages/adapter-dexie/src/index.ts`, add these methods after `listNegentropyEventRefs()`:

```ts
  async getSyncCursor(key: string): Promise<OrderedEventCursor | null> {
    const record = await this.db.sync_cursors.get(key);
    if (
      !record ||
      typeof record.cursor_created_at !== 'number' ||
      typeof record.cursor_id !== 'string' ||
      record.cursor_id.length === 0
    ) {
      return null;
    }

    return {
      created_at: record.cursor_created_at,
      id: record.cursor_id
    };
  }

  async putSyncCursor(record: SyncCursorRecordInput): Promise<void> {
    await this.db.sync_cursors.put({
      key: record.key,
      relay: record.relay,
      request_key: record.requestKey,
      cursor_created_at: record.cursor.created_at,
      cursor_id: record.cursor.id,
      updated_at: record.updatedAt
    });
  }
```

- [ ] **Step 6: Run the adapter cursor tests and verify pass**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/sync-cursors.contract.test.ts packages/adapter-dexie/src/schema.contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Dexie cursor storage**

```bash
git add packages/adapter-dexie/src/schema.ts packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/schema.contract.test.ts packages/adapter-dexie/src/sync-cursors.contract.test.ts
git commit -m "feat(auftakt): persist dexie sync cursors"
```

## Task 2: Fallback Repair Cursor Resume

**Files:**

- Modify: `packages/resonote/src/runtime.ts:1-57`
- Modify: `packages/resonote/src/runtime.ts:1473-1515`
- Modify: `packages/resonote/src/runtime.ts:2933-3110`
- Modify: `packages/resonote/src/relay-repair.contract.test.ts:1-560`

- [ ] **Step 1: Extend the relay repair fixture for cursor-aware runtime tests**

In `packages/resonote/src/relay-repair.contract.test.ts`, update the core import to include `createNegentropyRepairRequestKey`:

```ts
import {
  createNegentropyRepairRequestKey,
  createRuntimeRequestKey,
  finalizeEvent
} from '@auftakt/core';
```

Add these constants and helpers after `fixtureSecret`:

```ts
const repairRelayUrl = 'wss://relay.contract.test';

function repairCursorKey(relayUrl: string, requestKey: RequestKey): string {
  return `relay:${relayUrl}\nrequest:${requestKey}`;
}
```

Extend `createRuntimeFixture()` options with `dbName?: string`:

```ts
async function createRuntimeFixture(options: {
  dbName?: string;
  initialEvents?: FixtureEvent[];
  negentropyResult?: {
    capability: 'supported' | 'unsupported' | 'failed';
    reason?: string;
    messageHex?: string;
  };
  fallbackEvents?: FixtureEvent[];
  rawFallbackEvents?: unknown[];
  relayEventsById?: Record<string, unknown>;
}) {
```

Add `const negentropyRequests: Array<{ relayUrl: string; filter: Record<string, unknown>; timeoutMs?: number }> = [];` after `const materialized: StoredEvent[] = [];`.

Change the Dexie store creation to:

```ts
const eventsDB = await createDexieEventStore({
  dbName: options.dbName ?? `relay-repair-contract-${Date.now()}-${Math.random()}`
});
```

Change `requestNegentropySync` to record options:

```ts
      ? async (request: { relayUrl: string; filter: Record<string, unknown>; timeoutMs?: number }) => {
          negentropyCallCount += 1;
          negentropyRequests.push(request);
          return options.negentropyResult;
        }
```

Add cursor methods to the `getEventsDB()` return object:

```ts
        getSyncCursor: eventsDB.getSyncCursor.bind(eventsDB),
        putSyncCursor: eventsDB.putSyncCursor.bind(eventsDB),
```

Add `negentropyRequests` to the returned fixture object:

```ts
    negentropyRequests,
```

- [ ] **Step 2: Add failing fallback cursor tests**

Append these tests to `packages/resonote/src/relay-repair.contract.test.ts` before the closing `});`:

```ts
it('resumes fallback repair from a persisted cursor after runtime recreation', async () => {
  const filter = { authors: ['pubkey-a'], kinds: [1] };
  const firstEvent = makeEvent(hexId('3'), { created_at: 300 });
  const secondEvent = makeEvent(hexId('4'), { created_at: 400 });
  const dbName = `relay-repair-cursor-restart-${Date.now()}-${Math.random()}`;
  const initial = await createRuntimeFixture({
    dbName,
    negentropyResult: {
      capability: 'unsupported',
      reason: 'unsupported: relay disabled negentropy'
    },
    fallbackEvents: [firstEvent]
  });

  await repairEventsFromRelay(initial.runtime, {
    filters: [filter],
    relayUrl: repairRelayUrl,
    timeoutMs: 10
  });
  initial.eventsDB.db.close();

  const restarted = await createRuntimeFixture({
    dbName,
    negentropyResult: {
      capability: 'unsupported',
      reason: 'unsupported: relay disabled negentropy'
    },
    fallbackEvents: [firstEvent, secondEvent]
  });

  const result = await repairEventsFromRelay(restarted.runtime, {
    filters: [filter],
    relayUrl: repairRelayUrl,
    timeoutMs: 10
  });

  expect(restarted.createdRequests[0]?.emitted).toEqual([
    expect.objectContaining({
      authors: ['pubkey-a'],
      kinds: [1],
      since: firstEvent.created_at
    })
  ]);
  expect(result.repairedIds).toEqual([secondEvent.id]);
  expect(restarted.materialized).toEqual([secondEvent]);
});

it('does not advance fallback repair cursor for malformed candidates', async () => {
  const fixture = await createRuntimeFixture({
    negentropyResult: {
      capability: 'unsupported',
      reason: 'unsupported: relay disabled negentropy'
    },
    rawFallbackEvents: [{ malformed: true }]
  });
  const putSyncCursor = vi.spyOn(fixture.eventsDB, 'putSyncCursor');

  const result = await repairEventsFromRelay(fixture.runtime, {
    filters: [{ authors: ['pubkey-a'], kinds: [1] }],
    relayUrl: repairRelayUrl,
    timeoutMs: 10
  });

  expect(result.repairedIds).toEqual([]);
  expect(putSyncCursor).not.toHaveBeenCalled();
  await expect(fixture.eventsDB.db.sync_cursors.toArray()).resolves.toEqual([]);
});

it('repairs late kind:5 after cursor restart and tombstones the target', async () => {
  const targetEvent = makeEvent(hexId('5'), { created_at: 500, kind: 1111, tags: [] });
  const deletionEvent = makeEvent(hexId('6'), {
    created_at: 510,
    kind: 5,
    tags: [['e', targetEvent.id]]
  });
  const filter = { authors: ['pubkey-a'], kinds: [1111, 5] };
  const dbName = `relay-repair-kind5-cursor-${Date.now()}-${Math.random()}`;
  const setup = await createRuntimeFixture({
    dbName,
    initialEvents: [targetEvent]
  });
  const requestKey = createNegentropyRepairRequestKey({
    filters: [filter],
    relayUrl: repairRelayUrl,
    scope: 'timeline:repair:fallback'
  });

  await setup.eventsDB.putSyncCursor({
    key: repairCursorKey(repairRelayUrl, requestKey),
    relay: repairRelayUrl,
    requestKey,
    cursor: {
      created_at: targetEvent.created_at,
      id: targetEvent.id
    },
    updatedAt: 1
  });
  setup.eventsDB.db.close();

  const restarted = await createRuntimeFixture({
    dbName,
    negentropyResult: {
      capability: 'unsupported',
      reason: 'unsupported: relay disabled negentropy'
    },
    fallbackEvents: [targetEvent, deletionEvent]
  });

  const result = await repairEventsFromRelay(restarted.runtime, {
    filters: [filter],
    relayUrl: repairRelayUrl,
    timeoutMs: 10
  });

  expect(restarted.createdRequests[0]?.emitted).toEqual([
    expect.objectContaining({
      kinds: [1111, 5],
      since: targetEvent.created_at
    })
  ]);
  expect(result.repairedIds).toEqual([deletionEvent.id]);
  await expect(restarted.eventsDB.getById(targetEvent.id)).resolves.toBeNull();
  await expect(restarted.eventsDB.getById(deletionEvent.id)).resolves.toMatchObject({
    id: deletionEvent.id,
    kind: 5
  });
});
```

- [ ] **Step 3: Run the fallback repair tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-repair.contract.test.ts
```

Expected: FAIL because fallback repair does not load cursor state, does not emit cursor-bounded filters, and never persists repair cursors.

- [ ] **Step 4: Add cursor methods to the runtime DB shape**

In `packages/resonote/src/runtime.ts`, add `OrderedEventCursor` to the first type import from `@auftakt/core`:

```ts
  OrderedEventCursor,
```

In `packages/resonote/src/runtime.ts`, add these optional methods to `ResonoteRuntime.getEventsDB()` after `listNegentropyEventRefs()`:

```ts
    getSyncCursor?(key: string): Promise<OrderedEventCursor | null>;
    putSyncCursor?(record: {
      readonly key: string;
      readonly relay: string;
      readonly requestKey: string;
      readonly cursor: OrderedEventCursor;
      readonly updatedAt: number;
    }): Promise<void>;
```

- [ ] **Step 5: Add repair cursor helpers**

In `packages/resonote/src/runtime.ts`, add `toOrderedEventCursor` to the value import from `@auftakt/core`:

```ts
  toOrderedEventCursor,
```

Add these helpers before `fetchRelayCandidateEventsFromRelay()`:

```ts
type ResonoteEventStore = Awaited<ReturnType<ResonoteRuntime['getEventsDB']>>;

interface RepairSyncCursorState {
  readonly key: string;
  readonly relay: string;
  readonly requestKey: string;
}

function createRepairSyncCursorState(input: {
  readonly relayUrl: string;
  readonly filters: readonly RuntimeFilter[];
  readonly scope: string;
}): RepairSyncCursorState {
  const requestKey = createNegentropyRepairRequestKey({
    filters: input.filters,
    relayUrl: input.relayUrl,
    scope: input.scope
  });

  return {
    key: `relay:${input.relayUrl}\nrequest:${requestKey}`,
    relay: input.relayUrl,
    requestKey
  };
}

async function loadRepairSyncCursor(
  eventsDB: ResonoteEventStore,
  state: RepairSyncCursorState
): Promise<OrderedEventCursor | null> {
  if (typeof eventsDB.getSyncCursor !== 'function') return null;
  try {
    return await eventsDB.getSyncCursor(state.key);
  } catch {
    return null;
  }
}

function withRepairSyncCursorFilters(
  filters: readonly RuntimeFilter[],
  cursor: OrderedEventCursor | null
): RuntimeFilter[] {
  if (!cursor) return [...filters];

  return filters.map((filter) => {
    const since =
      typeof filter.since === 'number'
        ? Math.max(filter.since, cursor.created_at)
        : cursor.created_at;
    return { ...filter, since };
  });
}

function compareOrderedEventToCursor(
  event: Pick<StoredEvent, 'created_at' | 'id'>,
  cursor: OrderedEventCursor
): number {
  if (event.created_at !== cursor.created_at) return event.created_at - cursor.created_at;
  return event.id.localeCompare(cursor.id);
}

function isAfterRepairSyncCursor(
  event: Pick<StoredEvent, 'created_at' | 'id'>,
  cursor: OrderedEventCursor | null
): boolean {
  return !cursor || compareOrderedEventToCursor(event, cursor) > 0;
}

function newestRepairSyncCursor(
  events: readonly Pick<StoredEvent, 'created_at' | 'id'>[]
): OrderedEventCursor | null {
  const newest = [...events].sort((left, right) => {
    if (right.created_at !== left.created_at) return right.created_at - left.created_at;
    return right.id.localeCompare(left.id);
  })[0];
  return newest ? toOrderedEventCursor(newest) : null;
}

async function advanceRepairSyncCursor(
  eventsDB: ResonoteEventStore,
  state: RepairSyncCursorState,
  events: readonly Pick<StoredEvent, 'created_at' | 'id'>[]
): Promise<void> {
  if (typeof eventsDB.putSyncCursor !== 'function') return;
  const cursor = newestRepairSyncCursor(events);
  if (!cursor) return;

  try {
    await eventsDB.putSyncCursor({
      key: state.key,
      relay: state.relay,
      requestKey: state.requestKey,
      cursor,
      updatedAt: Math.floor(Date.now() / 1000)
    });
  } catch {
    return;
  }
}
```

- [ ] **Step 6: Make fallback materialization cursor-aware**

In `packages/resonote/src/runtime.ts`, change `materializeRepairCandidates()` to accept a cursor and return repaired events:

```ts
async function materializeRepairCandidates(
  runtime: ResonoteRuntime,
  relayUrl: string,
  candidates: readonly unknown[],
  cursor: OrderedEventCursor | null
): Promise<{
  repairedIds: string[];
  repairedEvents: StoredEvent[];
  materializationEmissions: ReconcileEmission[];
}> {
  const repairedIds: string[] = [];
  const repairedEvents: StoredEvent[] = [];
  const materializationEmissions: ReconcileEmission[] = [];

  for (const candidate of candidates) {
    const result = await ingestRelayEvent({
      relayUrl,
      event: candidate,
      materialize: async (event) => {
        if (!isAfterRepairSyncCursor(event, cursor)) return false;
        const eventsDB = await runtime.getEventsDB();
        const materialized = await eventsDB.putWithReconcile(event);
        materializationEmissions.push(...materialized.emissions);
        return materialized.stored;
      },
      quarantine: (record) => quarantineRelayEvent(runtime, record)
    });

    if (result.ok && result.stored) {
      repairedIds.push(result.event.id);
      repairedEvents.push(result.event);
    }
  }

  return {
    repairedIds,
    repairedEvents,
    materializationEmissions
  };
}
```

Change `fallbackRepairEventsFromRelay()` to load, apply, and persist cursor state:

```ts
async function fallbackRepairEventsFromRelay(
  runtime: ResonoteRuntime,
  options: RelayRepairOptions,
  capability: NegentropyTransportResult['capability']
): Promise<RelayRepairResult> {
  const eventsDB = await runtime.getEventsDB();
  const cursorState = createRepairSyncCursorState({
    relayUrl: options.relayUrl,
    filters: options.filters,
    scope: 'timeline:repair:fallback'
  });
  const cursor = await loadRepairSyncCursor(eventsDB, cursorState);
  const filters = withRepairSyncCursorFilters(options.filters, cursor);
  const fallbackCandidates = await fetchRelayCandidateEventsFromRelay(
    runtime,
    filters,
    options.relayUrl,
    options.timeoutMs,
    'timeline:repair:fallback'
  );
  const materialized = await materializeRepairCandidates(
    runtime,
    options.relayUrl,
    fallbackCandidates,
    cursor
  );
  await advanceRepairSyncCursor(eventsDB, cursorState, materialized.repairedEvents);

  return {
    strategy: 'fallback',
    capability,
    repairedIds: materialized.repairedIds,
    materializationEmissions: materialized.materializationEmissions,
    repairEmissions: reconcileReplayRepairSubjects(materialized.repairedIds, 'repaired-replay')
  };
}
```

- [ ] **Step 7: Run the fallback repair tests and verify pass**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-repair.contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit fallback cursor repair**

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/relay-repair.contract.test.ts
git commit -m "feat(auftakt): resume fallback repair from sync cursors"
```

## Task 3: Negentropy Repair Cursor Window

**Files:**

- Modify: `packages/resonote/src/runtime.ts:3113-3194`
- Modify: `packages/resonote/src/relay-repair.contract.test.ts:1-560`

- [ ] **Step 1: Add failing negentropy cursor test**

Append this test to `packages/resonote/src/relay-repair.contract.test.ts` before the closing `});`:

```ts
it('uses the saved cursor as the negentropy lower bound after runtime recreation', async () => {
  const filter = { authors: ['pubkey-a'], kinds: [1] };
  const cursorEvent = makeEvent(hexId('7'), { created_at: 700 });
  const missingEvent = makeEvent(hexId('8'), { created_at: 800 });
  const dbName = `relay-repair-negentropy-cursor-${Date.now()}-${Math.random()}`;
  const setup = await createRuntimeFixture({
    dbName,
    initialEvents: [cursorEvent]
  });
  const requestKey = createNegentropyRepairRequestKey({
    filters: [filter],
    relayUrl: repairRelayUrl,
    scope: 'timeline:repair:negentropy'
  });

  await setup.eventsDB.putSyncCursor({
    key: repairCursorKey(repairRelayUrl, requestKey),
    relay: repairRelayUrl,
    requestKey,
    cursor: {
      created_at: cursorEvent.created_at,
      id: cursorEvent.id
    },
    updatedAt: 1
  });
  setup.eventsDB.db.close();

  const restarted = await createRuntimeFixture({
    dbName,
    negentropyResult: {
      capability: 'supported',
      messageHex: encodeNegentropyIdList([cursorEvent.id, missingEvent.id])
    },
    relayEventsById: {
      [missingEvent.id]: missingEvent
    }
  });

  const result = await repairEventsFromRelay(restarted.runtime, {
    filters: [filter],
    relayUrl: repairRelayUrl,
    timeoutMs: 10
  });

  expect(restarted.negentropyRequests).toHaveLength(1);
  expect(restarted.negentropyRequests[0]?.filter).toMatchObject({
    authors: ['pubkey-a'],
    kinds: [1],
    since: cursorEvent.created_at
  });
  expect(result.repairedIds).toEqual([missingEvent.id]);
  expect(restarted.materialized).toEqual([missingEvent]);
});
```

- [ ] **Step 2: Run the relay repair tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-repair.contract.test.ts
```

Expected: FAIL because the negentropy path sends the original filters without the saved cursor lower bound.

- [ ] **Step 3: Apply cursor state to negentropy repair**

In `packages/resonote/src/runtime.ts`, replace the body of `repairEventsFromRelay()` with:

```ts
export async function repairEventsFromRelay(
  runtime: ResonoteRuntime,
  options: RelayRepairOptions
): Promise<RelayRepairResult> {
  const eventsDB = await runtime.getEventsDB();

  if (isNegentropyRelayUnsupported(runtime, options.relayUrl)) {
    return fallbackRepairEventsFromRelay(runtime, options, 'unsupported');
  }

  const session = (await runtime.getRelaySession()) as Partial<NegentropySessionRuntime>;

  if (typeof session.requestNegentropySync !== 'function') {
    cacheUnsupportedNegentropyRelay(runtime, options.relayUrl);
    return fallbackRepairEventsFromRelay(runtime, options, 'unsupported');
  }

  const cursorState = createRepairSyncCursorState({
    relayUrl: options.relayUrl,
    filters: options.filters,
    scope: 'timeline:repair:negentropy'
  });
  const cursor = await loadRepairSyncCursor(eventsDB, cursorState);
  const filters = withRepairSyncCursorFilters(options.filters, cursor);
  const localRefs = await eventsDB.listNegentropyEventRefs();
  const missingIds = new Set<string>();

  for (const filter of filters) {
    const selectedLocal = filterNegentropyEventRefs(localRefs, [filter]);

    let transportResult: NegentropyTransportResult;
    try {
      transportResult = await session.requestNegentropySync({
        relayUrl: options.relayUrl,
        filter,
        initialMessageHex: encodeNegentropyIdListMessage(selectedLocal),
        timeoutMs: options.timeoutMs
      });
    } catch {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    if (transportResult.capability !== 'supported') {
      if (transportResult.capability === 'unsupported') {
        cacheUnsupportedNegentropyRelay(runtime, options.relayUrl);
      }
      return fallbackRepairEventsFromRelay(runtime, options, transportResult.capability);
    }

    if (!transportResult.messageHex) {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    let remoteIds: string[];
    try {
      remoteIds = decodeNegentropyIdListMessage(transportResult.messageHex);
    } catch {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    const localIds = new Set(selectedLocal.map((event) => event.id));
    for (const remoteId of remoteIds) {
      if (!localIds.has(remoteId)) {
        missingIds.add(remoteId);
      }
    }
  }

  const repairCandidates = await fetchRelayCandidateEventsFromRelay(
    runtime,
    chunkIds([...missingIds]),
    options.relayUrl,
    options.timeoutMs,
    'timeline:repair:negentropy:fetch'
  );
  const materialized = await materializeRepairCandidates(
    runtime,
    options.relayUrl,
    repairCandidates,
    cursor
  );
  await advanceRepairSyncCursor(eventsDB, cursorState, materialized.repairedEvents);

  return {
    strategy: 'negentropy',
    capability: 'supported',
    repairedIds: materialized.repairedIds,
    materializationEmissions: materialized.materializationEmissions,
    repairEmissions: reconcileNegentropyRepairSubjects(materialized.repairedIds)
  };
}
```

- [ ] **Step 4: Run the relay repair tests and verify pass**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-repair.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit negentropy cursor repair**

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/relay-repair.contract.test.ts
git commit -m "feat(auftakt): bound negentropy repair by sync cursor"
```

## Task 4: Strict Audit Evidence

**Files:**

- Modify: `scripts/check-auftakt-strict-goal-audit.ts:37-76`
- Modify: `scripts/check-auftakt-strict-goal-audit.ts:206-260`
- Modify: `scripts/check-auftakt-strict-goal-audit.test.ts:18-240`
- Modify: `docs/auftakt/2026-04-26-strict-goal-gap-audit.md:43-89`

- [ ] **Step 1: Add failing strict audit checker tests**

In `scripts/check-auftakt-strict-goal-audit.test.ts`, add this sentence to `validAuditText` after the publish settlement evidence sentence:

```ts
Sync cursor incremental repair now persists Dexie ordered cursors and bounds fallback and negentropy repair through coordinator-owned runtime repair.
```

Rename `validPublishSettlementFiles` to `validRequiredProofFiles`, replace each
existing `...validPublishSettlementFiles` spread with `...validRequiredProofFiles`,
then add the sync cursor proof files to that array:

```ts
(file(
  'packages/adapter-dexie/src/index.ts',
  'async putSyncCursor(record) { await this.db.sync_cursors.put(record); }'
),
  file(
    'packages/resonote/src/runtime.ts',
    'const cursor = await loadRepairSyncCursor(eventsDB, cursorState);'
  ),
  file(
    'packages/resonote/src/relay-repair.contract.test.ts',
    'resumes fallback repair from a persisted cursor after runtime recreation'
  ));
```

Add this test after `requires coordinator-owned publish settlement implementation proof`:

```ts
it('requires sync cursor incremental repair implementation proof', () => {
  const result = checkStrictGoalAudit([
    file(
      STRICT_GOAL_AUDIT_PATH,
      validAuditText.replace(
        'Sync cursor incremental repair now persists Dexie ordered cursors and bounds fallback and negentropy repair through coordinator-owned runtime repair.',
        'Sync cursor evidence removed.'
      )
    ),
    ...validRequiredProofFiles
  ]);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    `${STRICT_GOAL_AUDIT_PATH} is missing sync cursor incremental repair implementation evidence`
  );
});
```

- [ ] **Step 2: Run the strict audit checker tests and verify failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: FAIL because `checkStrictGoalAudit()` does not require the sync cursor evidence sentence or files.

- [ ] **Step 3: Update the strict audit checker**

In `scripts/check-auftakt-strict-goal-audit.ts`, add these constants after `REQUIRED_PUBLISH_SETTLEMENT_FILES`:

```ts
const REQUIRED_SYNC_CURSOR_REPAIR_AUDIT_EVIDENCE =
  'Sync cursor incremental repair now persists Dexie ordered cursors and bounds fallback and negentropy repair through coordinator-owned runtime repair.';

const REQUIRED_SYNC_CURSOR_REPAIR_FILES = [
  {
    path: 'packages/adapter-dexie/src/index.ts',
    text: 'putSyncCursor',
    description: 'Dexie sync cursor writer'
  },
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'loadRepairSyncCursor',
    description: 'runtime sync cursor load'
  },
  {
    path: 'packages/resonote/src/relay-repair.contract.test.ts',
    text: 'resumes fallback repair from a persisted cursor after runtime recreation',
    description: 'restart-safe repair cursor contract'
  }
];
```

Add this evidence check after the publish settlement evidence check:

```ts
if (!strictAudit.text.includes(REQUIRED_SYNC_CURSOR_REPAIR_AUDIT_EVIDENCE)) {
  errors.push(
    `${strictAudit.path} is missing sync cursor incremental repair implementation evidence`
  );
}
```

Add this file check after the publish settlement file loop:

```ts
for (const required of REQUIRED_SYNC_CURSOR_REPAIR_FILES) {
  const text = findFileText(files, required.path);
  if (text === null) {
    errors.push(`${required.path} is missing for strict sync cursor repair audit`);
    continue;
  }
  if (!text.includes(required.text)) {
    errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
  }
}
```

Update `collectFiles()` paths to include:

```ts
('packages/adapter-dexie/src/index.ts',
  'packages/resonote/src/runtime.ts',
  'packages/resonote/src/relay-repair.contract.test.ts');
```

- [ ] **Step 4: Update the strict goal audit document**

In `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`, update the `Offline incremental and kind:5` evidence sentence to include:

```md
Sync cursor incremental repair now persists Dexie ordered cursors and bounds fallback and negentropy repair through coordinator-owned runtime repair.
```

In the same row, update the strict gap text so it no longer says sync cursor proof is absent. Use:

```md
Ordinary read flows are not uniformly defined as mandatory repair flows. Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof. Sync cursor incremental repair now has restart-safe fallback and negentropy proof.
```

In `Follow-Up Candidates`, change item 3 to:

```md
3. Sync cursor incremental repair. `Implemented in this slice; keep restart repair regression gates active.`
```

- [ ] **Step 5: Run strict audit checker tests and gate**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
pnpm run check:auftakt:strict-goal-audit
```

Expected: PASS for both commands.

- [ ] **Step 6: Commit strict audit evidence**

```bash
git add scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts docs/auftakt/2026-04-26-strict-goal-gap-audit.md
git commit -m "test(auftakt): gate sync cursor repair proof"
```

## Task 5: Package Verification

**Files:**

- No source edits in this task.

- [ ] **Step 1: Run focused package tests**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/sync-cursors.contract.test.ts packages/adapter-dexie/src/schema.contract.test.ts packages/resonote/src/relay-repair.contract.test.ts scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Auftakt package gates**

Run:

```bash
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-goal-audit
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
pnpm run test:packages
```

Expected: PASS for every command.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only the known pre-existing unrelated dirty paths remain outside committed task changes.
