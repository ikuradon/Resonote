# auftakt Remaining Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 6 groups of `[未実装]` markers in auftakt spec.md, bringing the runtime closer to spec compliance.

**Architecture:** Each group is an independent, focused change to existing files. Order: C → B → A → E → D → F. All changes follow the existing pattern of the auftakt codebase: TypeScript, vitest, fake-based testing.

**Tech Stack:** TypeScript, vitest, auftakt core modules

---

### Task 1: CircuitBreaker onHalfOpen callback wiring (Group C)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts:200-202`
- Test: `src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`

- [ ] **Step 1: Write failing test for onHalfOpen callback**

Add to `relay-manager.test.ts`:

```typescript
it('wires onHalfOpen callback to reconnect relay on half-open transition', async () => {
  const sockets = new Map<string, ReturnType<typeof createMockSocket>>();
  const manager = new RelayManager({
    connect(url) {
      const s = createMockSocket();
      sockets.set(url, s);
      return s;
    },
    circuitBreaker: {
      failureThreshold: 2,
      cooldownMs: 50,
      maxCooldownMs: 200
    }
  });

  // Trigger connection
  manager.subscribe({
    filter: { kinds: [1] },
    relays: ['wss://relay1.test'],
    onEvent() {}
  });

  const socket1 = sockets.get('wss://relay1.test')!;
  socket1.simulateOpen();

  // Push to OPEN state: 2 failures → open, relay disposed
  manager.recordRelayFailure('wss://relay1.test');
  manager.recordRelayFailure('wss://relay1.test');

  // Wait for cooldown → half-open → onHalfOpen should trigger reconnect
  await vi.waitFor(
    () => {
      // A new socket should have been created for the probe reconnect
      expect(sockets.size).toBeGreaterThan(1);
    },
    { timeout: 200 }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`
Expected: FAIL — no new socket created after cooldown.

- [ ] **Step 3: Implement onHalfOpen wiring**

In `relay-manager.ts`, replace lines 200-202:

```typescript
if (this.#cbConfig && !this.#circuitBreakers.has(url)) {
  this.#circuitBreakers.set(url, new CircuitBreaker(this.#cbConfig));
}
```

With:

```typescript
if (this.#cbConfig && !this.#circuitBreakers.has(url)) {
  this.#circuitBreakers.set(
    url,
    new CircuitBreaker({
      ...this.#cbConfig,
      onHalfOpen: () => {
        // Probe reconnect: re-create relay to test if it's alive
        this.#getOrCreateRelay(url).connection.ensureConnected();
      }
    })
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Run full auftakt test suite**

Run: `pnpm vitest run src/shared/nostr/auftakt/`
Expected: All existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/relay-manager.ts src/shared/nostr/auftakt/core/relay/relay-manager.test.ts
git commit -m "feat(auftakt): wire CircuitBreaker onHalfOpen callback for probe reconnect"
```

---

### Task 2: liveQuery pre-tombstone check (Group B)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts:209-217`
- Test: `src/shared/nostr/auftakt/core/sync-engine.test.ts`

The spec §11.2 requires that liveQuery's onEvent does pre-tombstone check + upgrade **before** `putEvent`. `subscription-manager.ts` (L64-81) already implements this correctly — the SyncEngine delegates to SubscriptionManager.addSubscription which has the tombstone flow. Verify the current code matches the spec flow and add a test that exercises the full path through SyncEngine.liveQuery.

- [ ] **Step 1: Write test verifying pre-tombstone upgrade via liveQuery**

Add to `sync-engine.test.ts`:

```typescript
import { createFakePersistentStore, createFakeRelayManager } from '../../testing/fakes.js';
import { SyncEngine } from '../sync-engine.js';

describe('liveQuery pre-tombstone upgrade', () => {
  it('upgrades pre-tombstone to verified when matching event arrives', async () => {
    const store = createFakePersistentStore();
    const relayManager = createFakeRelayManager();
    const engine = new SyncEngine({
      persistentStore: store as never,
      relayManager: relayManager as never
    });

    // Pre-create a pre-tombstone (verified: false)
    await store.putTombstone({
      targetEventId: 'evt-target',
      deletedByPubkey: 'pubkey-author',
      deleteEventId: 'evt-delete',
      createdAt: 1000,
      verified: false
    });

    const received: unknown[] = [];
    await engine.liveQuery({
      queryIdentityKey: 'test-query',
      filter: { kinds: [1] },
      relays: ['wss://relay1.test'],
      onEvent(event) {
        received.push(event);
      }
    });

    // Emit matching event (same author as tombstone)
    await relayManager.emit(
      {
        id: 'evt-target',
        pubkey: 'pubkey-author',
        kind: 1,
        created_at: 999,
        tags: [],
        content: 'hello',
        sig: 'sig'
      },
      'wss://relay1.test'
    );

    // Tombstone should be upgraded to verified
    const tombstone = store.tombstones.get('evt-target') as {
      verified: boolean;
    };
    expect(tombstone.verified).toBe(true);
    expect(received).toHaveLength(1);
  });

  it('does not upgrade tombstone when author does not match', async () => {
    const store = createFakePersistentStore();
    const relayManager = createFakeRelayManager();
    const engine = new SyncEngine({
      persistentStore: store as never,
      relayManager: relayManager as never
    });

    await store.putTombstone({
      targetEventId: 'evt-target',
      deletedByPubkey: 'pubkey-author',
      deleteEventId: 'evt-delete',
      createdAt: 1000,
      verified: false
    });

    await engine.liveQuery({
      queryIdentityKey: 'test-query',
      filter: { kinds: [1] },
      relays: ['wss://relay1.test'],
      onEvent() {}
    });

    // Emit event with different author
    await relayManager.emit(
      {
        id: 'evt-target',
        pubkey: 'pubkey-different',
        kind: 1,
        created_at: 999,
        tags: [],
        content: 'hello',
        sig: 'sig'
      },
      'wss://relay1.test'
    );

    const tombstone = store.tombstones.get('evt-target') as {
      verified: boolean;
    };
    expect(tombstone.verified).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to check current behavior**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/sync-engine.test.ts`

If tests PASS: the existing SubscriptionManager flow already satisfies the spec. Proceed to Step 4 (verify + commit).

If tests FAIL: the `createFakePersistentStore().getTombstone()` currently returns `undefined` for all lookups (L453-456 in fakes.ts returns tombstones as `undefined`). Fix `getTombstone` in fakes.ts:

- [ ] **Step 3: Fix fakes.ts getTombstone if needed**

In `testing/fakes.ts`, replace the `getTombstone` method:

```typescript
    getTombstone(query: { targetEventId?: string; targetAddress?: string }) {
      const key = query.targetEventId ?? query.targetAddress ?? '';
      return Promise.resolve(
        tombstones.get(key) as
          | {
              targetEventId?: string;
              targetAddress?: string;
              deletedByPubkey: string;
              deleteEventId: string;
              createdAt: number;
              verified: boolean;
            }
          | undefined,
      );
    },
```

The issue is the cast `as undefined` on L455 which forces the return to always be undefined.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/sync-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Run full auftakt test suite**

Run: `pnpm vitest run src/shared/nostr/auftakt/`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/nostr/auftakt/core/sync-engine.test.ts src/shared/nostr/auftakt/testing/fakes.ts
git commit -m "test(auftakt): verify liveQuery pre-tombstone upgrade flow, fix fakes.getTombstone"
```

---

### Task 3: NIP-11 wiring — store-types + nip11-registry unification (Group A-1)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/store-types.ts:36-42`
- Modify: `src/shared/nostr/auftakt/core/relay/nip11-registry.ts:13-20`
- Test: `src/shared/nostr/auftakt/core/relay/nip11-registry.test.ts`

- [ ] **Step 1: Add nip11 field to RelayCapabilityRecord in store-types.ts**

In `store-types.ts`, add import and field:

```typescript
import type { Nip11Info } from './relay/nip11-registry.js';
```

Update `RelayCapabilityRecord` (line 36-42):

```typescript
export interface RelayCapabilityRecord {
  relayUrl: string;
  negentropy: 'supported' | 'unsupported' | 'unknown';
  nip11?: Nip11Info;
  source: 'config' | 'probe' | 'observed';
  lastCheckedAt?: number;
  ttlUntil?: number;
}
```

- [ ] **Step 2: Remove local RelayCapabilityRecord from nip11-registry.ts**

In `nip11-registry.ts`, remove lines 13-20 (local interface) and import from store-types:

```typescript
import type { RelayCapabilityRecord } from '../store-types.js';
```

Update `Nip11PersistentStore` interface to use the imported type:

```typescript
export interface Nip11PersistentStore {
  putRelayCapability(record: RelayCapabilityRecord): Promise<void>;
  getRelayCapability(
    url: string,
    options?: { now?: number }
  ): Promise<RelayCapabilityRecord | undefined>;
}
```

- [ ] **Step 3: Run nip11-registry tests to verify no regression**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/relay/nip11-registry.test.ts`
Expected: PASS (type change only, no runtime behavior change).

- [ ] **Step 4: Run full auftakt test suite**

Run: `pnpm vitest run src/shared/nostr/auftakt/`
Expected: PASS. The `nip11` field is optional so existing code continues to work.

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/store-types.ts src/shared/nostr/auftakt/core/relay/nip11-registry.ts
git commit -m "refactor(auftakt): unify RelayCapabilityRecord with nip11 field"
```

---

### Task 4: NIP-11 wiring — Nip11Registry auto-creation + max_filters (Group A-2/A-3)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/runtime.ts`
- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts:236-244`
- Modify: `src/shared/nostr/auftakt/core/relay/forward-assembler.ts`
- Test: `src/shared/nostr/auftakt/core/runtime.test.ts`
- Test: `src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`
- Test: `src/shared/nostr/auftakt/core/relay/forward-assembler.test.ts`

- [ ] **Step 1: Add setMaxFilters to ForwardAssembler**

In `forward-assembler.ts`, add after the `replay()` method (line 106):

```typescript
  setMaxFilters(n: number): void {
    const clamped = Math.max(1, n);
    if (clamped !== this.#maxFilters) {
      this.#maxFilters = clamped;
      this.#rebuild();
    }
  }
```

- [ ] **Step 2: Write test for setMaxFilters**

Add to `forward-assembler.test.ts`:

```typescript
it('setMaxFilters updates limit and triggers rebuild', () => {
  const sent: unknown[][] = [];
  const assembler = new ForwardAssembler({
    connection: {
      send: (msg: unknown[]) => sent.push(msg),
      onMessage: () => () => {},
      ensureConnected: () => {}
    },
    maxFilters: Infinity
  });

  assembler.addSubscription('a', { kinds: [1] }, () => {});
  assembler.addSubscription('b', { kinds: [2] }, () => {});
  assembler.addSubscription('c', { kinds: [3] }, () => {});

  // Wait for microtask rebuild
  return new Promise<void>((resolve) => {
    queueMicrotask(() => {
      const beforeCount = sent.filter((m) => m[0] === 'REQ').length;

      // Set maxFilters to 1 → should split into 3 REQs
      assembler.setMaxFilters(1);

      const afterReqs = sent.filter((m) => m[0] === 'REQ');
      // After rebuild, there should be 3 separate REQ messages (1 filter each)
      expect(afterReqs.length).toBeGreaterThan(beforeCount);
      resolve();
    });
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/relay/forward-assembler.test.ts`
Expected: PASS

- [ ] **Step 4: Wire NIP-11 maxFilters in relay-manager.ts**

In `relay-manager.ts`, update the NIP-11 callback (lines 236-244):

```typescript
// Fire-and-forget NIP-11 fetch to apply limits
if (this.#nip11Registry) {
  void this.#nip11Registry
    .get(url)
    .then((info) => {
      if (info.maxSubscriptions !== undefined) {
        slots.setMax(info.maxSubscriptions);
      }
      if (info.maxFilters !== undefined) {
        forwardAssembler.setMaxFilters(info.maxFilters);
      }
    })
    .catch(() => undefined);
}
```

- [ ] **Step 5: Add Nip11Registry auto-creation in runtime.ts**

In `runtime.ts`, add import:

```typescript
import { Nip11Registry } from './relay/nip11-registry.js';
```

Before the `relayManager` creation, add:

```typescript
const nip11Registry = new Nip11Registry({ persistentStore: persistentStore as never });
```

Pass to DefaultRelayManager:

```typescript
new DefaultRelayManager({
  circuitBreaker: config.circuitBreaker,
  recovery: config.recovery,
  inactivityTimeout: config.inactivityTimeout,
  probeTimeout: config.probeTimeout,
  persistentStore,
  nip11Registry,
  browserWindow:
    config.browserSignals !== false &&
    typeof globalThis !== 'undefined' &&
    'addEventListener' in globalThis
      ? {
          addEventListener: globalThis.addEventListener.bind(globalThis),
          removeEventListener: globalThis.removeEventListener.bind(globalThis)
        }
      : undefined
}) satisfies RelayManager;
```

- [ ] **Step 6: Write test for runtime Nip11Registry creation**

Add to `runtime.test.ts`:

```typescript
it('creates Nip11Registry and passes to RelayManager', () => {
  const runtime = createRuntime({
    persistentStore: createFakePersistentStore() as never
  });

  // Verify relayManager has probeCapabilities (which relies on nip11Registry)
  expect(runtime.relayManager.probeCapabilities).toBeDefined();
  runtime.dispose();
});
```

- [ ] **Step 7: Run all tests**

Run: `pnpm vitest run src/shared/nostr/auftakt/`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/forward-assembler.ts src/shared/nostr/auftakt/core/relay/forward-assembler.test.ts src/shared/nostr/auftakt/core/relay/relay-manager.ts src/shared/nostr/auftakt/core/runtime.ts src/shared/nostr/auftakt/core/runtime.test.ts
git commit -m "feat(auftakt): auto-create Nip11Registry and wire max_filters to ForwardAssembler"
```

---

### Task 5: FetchResult.closedReasons (Group E)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts:21-23,59-88,90-170`
- Test: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts`

- [ ] **Step 1: Write failing test**

Add to `fetch-scheduler.test.ts`:

```typescript
describe('FetchResult enriched fields', () => {
  it('returns acceptedRelays and successRate on success', async () => {
    const scheduler = new FetchScheduler({ eoseTimeout: 1000 });
    const messages: unknown[][] = [];
    const connection = {
      send(msg: unknown[]) {
        messages.push(msg);
      },
      onMessage(handler: (msg: unknown[]) => void) {
        // Auto-respond with EOSE after REQ
        queueMicrotask(() => {
          const reqMsg = messages.find((m) => m[0] === 'REQ');
          if (reqMsg) handler(['EOSE', reqMsg[1]]);
        });
        return () => {};
      },
      ensureConnected() {}
    };

    const result = await scheduler.fetch({
      filter: { kinds: [1] },
      connection,
      slots: {
        tryAcquire: () => true,
        release() {},
        waitForSlot: () => Promise.resolve(),
        available: 10
      } as never,
      onEvent() {}
    });

    expect(result.acceptedRelays).toEqual([]);
    expect(result.failedRelays).toEqual([]);
    expect(result.successRate).toBe(0);
    expect(result.closedReasons).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts`
Expected: FAIL — `result.acceptedRelays` is undefined.

- [ ] **Step 3: Update FetchResult interface and implementation**

In `fetch-scheduler.ts`, update the interface:

```typescript
import type { ClosedReasonInfo } from './closed-reason.js';

interface ShardResult {
  events: unknown[];
  closed?: { relay?: string; reason: ClosedReasonInfo };
}

interface FetchResult {
  events: unknown[];
  acceptedRelays: string[];
  failedRelays: string[];
  successRate: number;
  closedReasons?: Record<string, ClosedReasonInfo>;
}
```

Update `#executeShard` to return `ShardResult` instead of `unknown[]`. Track closed reason in the CLOSED handler:

```typescript
  #executeShard(
    filter: Record<string, unknown>,
    input: FetchInput,
    retryCount = 0,
  ): Promise<ShardResult> {
    return new Promise<ShardResult>((resolve) => {
      // ... existing code ...

      const finalize = async () => {
        cleanup();
        await Promise.all(pendingValidations);
        resolve({ events });
      };

      // ... existing timer and event handling ...

      // In CLOSED handler, instead of resolve([]):
      // resolve({ events: [], closed: { reason: parseClosedReason(...) } });
    });
  }
```

Update `fetch()` to aggregate shard results:

```typescript
  async fetch(input: FetchInput): Promise<FetchResult> {
    const shards = shardFilter(input.filter, this.#chunkSize);
    const allEvents: unknown[] = [];
    const allClosedReasons: Record<string, ClosedReasonInfo> = {};
    let successCount = 0;
    let failCount = 0;
    const queue = [...shards];

    const dispatchNext = async (): Promise<void> => {
      const filter = queue.shift();
      if (!filter) return;

      if (!input.slots.tryAcquire()) {
        await input.slots.waitForSlot();
        if (!input.slots.tryAcquire()) return;
      }

      const shardResult = await this.#executeShard(filter, input);
      allEvents.push(...shardResult.events);
      input.slots.release();

      if (shardResult.closed) {
        failCount++;
        if (shardResult.closed.relay) {
          allClosedReasons[shardResult.closed.relay] = shardResult.closed.reason;
        }
      } else {
        successCount++;
      }

      for (const event of shardResult.events) {
        input.onEvent(event);
      }

      await dispatchNext();
    };

    const concurrentDispatches = Math.min(shards.length, input.slots.available || 1);
    await Promise.all(Array.from({ length: concurrentDispatches }, () => dispatchNext()));

    const total = successCount + failCount;
    return {
      events: allEvents,
      acceptedRelays: [],
      failedRelays: [],
      successRate: total > 0 ? successCount / total : 0,
      closedReasons: Object.keys(allClosedReasons).length > 0 ? allClosedReasons : undefined,
    };
  }
```

Note: `acceptedRelays`/`failedRelays` at the FetchScheduler level are shard-level, not relay-level. The relay-level aggregation happens in `relay-manager.ts` `fetch()` which already tracks per-relay success/failure. Keep these as empty arrays at shard level — the relay-manager is the correct aggregation point.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts`
Expected: PASS

- [ ] **Step 5: Run full auftakt test suite**

Run: `pnpm vitest run src/shared/nostr/auftakt/`
Expected: All tests pass (FetchResult consumers destructure `events` only).

- [ ] **Step 6: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts
git commit -m "feat(auftakt): enrich FetchResult with closedReasons and successRate"
```

---

### Task 6: Optimistic merge in buildItems (Group D)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts:46-117,346-364`
- Test: `src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts`

- [ ] **Step 1: Write failing test**

Add to `timeline-handle.test.ts`:

```typescript
describe('optimistic merge in buildItems', () => {
  it('includes pending optimistic events in timeline items', async () => {
    const store = createFakePersistentStore();

    // Add a confirmed event
    await store.putEvent({
      id: 'evt-confirmed',
      kind: 1,
      pubkey: 'pk1',
      created_at: 1000,
      tags: [],
      content: 'confirmed',
      sig: 'sig1'
    });

    // Add an optimistic event (not yet confirmed)
    await store.putEvent({
      id: 'evt-optimistic',
      kind: 1,
      pubkey: 'pk1',
      created_at: 1001,
      tags: [],
      content: 'optimistic',
      sig: 'sig2',
      optimistic: true,
      publishStatus: 'pending'
    });

    const timeline = Timeline.fromFilter({
      runtime: {
        persistentStore: store as never,
        syncEngine: createFakeSyncEngine() as never,
        bootstrapRelays: ['wss://relay1.test']
      },
      filter: { kinds: [1] }
    });

    await timeline.load();

    // Should include both events
    expect(timeline.items).toHaveLength(2);

    // Optimistic item should have state.optimistic = true
    const optimisticItem = timeline.items.find(
      (item: { event: { id: string } }) => item.event.id === 'evt-optimistic'
    ) as { state?: { optimistic?: boolean } } | undefined;
    expect(optimisticItem?.state?.optimistic).toBe(true);
  });

  it('excludes failed optimistic events', async () => {
    const store = createFakePersistentStore();

    await store.putEvent({
      id: 'evt-failed',
      kind: 1,
      pubkey: 'pk1',
      created_at: 1001,
      tags: [],
      content: 'failed',
      sig: 'sig2',
      optimistic: true,
      publishStatus: 'failed'
    });

    const timeline = Timeline.fromFilter({
      runtime: {
        persistentStore: store as never,
        syncEngine: createFakeSyncEngine() as never,
        bootstrapRelays: ['wss://relay1.test']
      },
      filter: { kinds: [1] }
    });

    await timeline.load();

    expect(timeline.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts`
Expected: FAIL — optimistic events not included in items.

- [ ] **Step 3: Extend TimelineOptions persistentStore type**

In `timeline-handle.ts`, add `listOptimisticEvents` and `getEvent` to the `persistentStore` type in `TimelineOptions` (around line 59):

```typescript
    persistentStore?: {
      queryEvents?(filter: {
        ids?: string[];
        authors?: string[];
        kinds?: number[];
        since?: number;
        until?: number;
        limit?: number;
      }): Promise<unknown[]>;
      getQueryCoverage(queryIdentityKey: string): Promise<
        | { status: 'none' | 'partial' | 'complete' }
        | undefined
      >;
      getTombstone(input: { targetEventId?: string; targetAddress?: string }): Promise<
        | { verified?: boolean }
        | undefined
      >;
      getEvent?(id: string): Promise<unknown | undefined>;
      listOptimisticEvents?(): Promise<
        Array<{
          id: string;
          optimistic: boolean;
          publishStatus?: string;
          created_at?: number;
        }>
      >;
    };
```

- [ ] **Step 4: Implement optimistic merge in buildItems**

Replace the `buildItems` function (lines 346-364):

```typescript
async function buildItems<TItem>(options: TimelineOptions): Promise<TItem[]> {
  const projectionFactory = options.projection
    ? (options.runtime?.registry?.projections?.get(options.projection) as
        | {
            build(ctx: { event: TimelineEvent; item: TimelineItemBuilder }): TItem;
          }
        | undefined)
    : undefined;

  const seedEvents = await filterSeedEvents(options);

  // Optimistic merge: add pending optimistic events not yet confirmed
  const optimisticEntries = await options.runtime?.persistentStore
    ?.listOptimisticEvents?.()
    .catch(() => [] as Array<{ id: string; optimistic: boolean; publishStatus?: string }>);
  const confirmedIds = new Set(seedEvents.map((e) => e.id));
  const pendingOptimisticIds = new Set<string>();

  if (optimisticEntries?.length) {
    for (const oe of optimisticEntries) {
      if (oe.optimistic && oe.publishStatus !== 'failed' && !confirmedIds.has(oe.id)) {
        const full = await options.runtime?.persistentStore?.getEvent?.(oe.id);
        if (full && typeof full === 'object' && 'id' in full && 'created_at' in full) {
          seedEvents.push(full as TimelineEvent);
          pendingOptimisticIds.add(oe.id);
        }
      }
    }

    // Re-sort by created_at descending
    if (pendingOptimisticIds.size > 0) {
      seedEvents.sort((a, b) => b.created_at - a.created_at);
    }
  }

  if (!seedEvents.length) {
    return [];
  }

  return seedEvents.map((event) => {
    const item = buildItem<TItem>(options, event, projectionFactory);
    if (pendingOptimisticIds.has(event.id)) {
      const timelineItem = item as { state?: Record<string, unknown> };
      timelineItem.state = { ...timelineItem.state, optimistic: true };
    }
    return item;
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts`
Expected: PASS

- [ ] **Step 6: Run full auftakt test suite**

Run: `pnpm vitest run src/shared/nostr/auftakt/`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/nostr/auftakt/core/handles/timeline-handle.ts src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts
git commit -m "feat(auftakt): merge optimistic events in buildItems"
```

---

### Task 7: createRuntime config pass-through (Group F)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/runtime.ts`
- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts:24-75,165-171`
- Test: `src/shared/nostr/auftakt/core/runtime.test.ts`

- [ ] **Step 1: Write failing test for config pass-through**

Add to `runtime.test.ts`:

```typescript
it('passes connect factory to RelayManager', () => {
  const connectCalls: string[] = [];
  const mockConnect = (url: string) => {
    connectCalls.push(url);
    return createMockSocket();
  };

  const runtime = createRuntime({
    persistentStore: createFakePersistentStore() as never,
    connect: mockConnect,
    bootstrapRelays: ['wss://relay1.test']
  });

  // Trigger a connection via subscribe
  runtime.relayManager.subscribe?.({
    filter: { kinds: [1] },
    relays: ['wss://relay1.test'],
    onEvent() {}
  });

  expect(connectCalls).toContain('wss://relay1.test');
  runtime.dispose();
});

it('passes temporaryRelayTtl to TemporaryRelayTracker', () => {
  const runtime = createRuntime({
    persistentStore: createFakePersistentStore() as never,
    temporaryRelayTtl: 1000
  });

  // Runtime should create without error
  expect(runtime).toBeDefined();
  runtime.dispose();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/runtime.test.ts`
Expected: FAIL — `connect` not accepted in config.

- [ ] **Step 3: Add config fields to runtime.ts**

In `runtime.ts`, add imports:

```typescript
import type { WebSocketLike } from './relay/relay-connection.js';
import { TemporaryRelayTracker } from './relay/temporary-relay-tracker.js';
```

Add 4 fields to config type (after line 32):

```typescript
    connect?: (url: string) => WebSocketLike;
    retry?: {
      strategy: 'exponential' | 'off';
      initialDelay?: number;
      maxDelay?: number;
      maxCount?: number;
    };
    idleTimeout?: number;
    temporaryRelayTtl?: number;
```

- [ ] **Step 4: Wire pass-through in runtime.ts**

Before `relayManager` creation, add TemporaryRelayTracker:

```typescript
const temporaryRelayTracker = new TemporaryRelayTracker({
  temporaryRelayTtl: config.temporaryRelayTtl ?? 300_000
});
```

Pass all config to DefaultRelayManager:

```typescript
    (new DefaultRelayManager({
      circuitBreaker: config.circuitBreaker,
      recovery: config.recovery,
      inactivityTimeout: config.inactivityTimeout,
      probeTimeout: config.probeTimeout,
      persistentStore,
      nip11Registry,
      temporaryRelayTracker,
      connect: config.connect,
      retry: config.retry,
      idleTimeout: config.idleTimeout,
      browserWindow: /* ... unchanged ... */
    }) satisfies RelayManager)
```

- [ ] **Step 5: Add idleTimeout to RelayManager config and pass to RelayConnection**

In `relay-manager.ts`, add `idleTimeout` to `RelayManagerConfig` (around line 24):

```typescript
  idleTimeout?: number;
```

Store in constructor:

```typescript
  readonly #idleTimeout: number | undefined;
  // In constructor:
  this.#idleTimeout = config.idleTimeout;
```

Pass to `RelayConnection` creation (line 165-171):

```typescript
const connection = new RelayConnection({
  url,
  connect: this.#connect,
  retry: this.#retry,
  mode,
  idleTimeout: this.#idleTimeout,
  heartbeat: heartbeatConfig
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/runtime.test.ts`
Expected: PASS

- [ ] **Step 7: Run full auftakt test suite**

Run: `pnpm vitest run src/shared/nostr/auftakt/`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/shared/nostr/auftakt/core/runtime.ts src/shared/nostr/auftakt/core/relay/relay-manager.ts src/shared/nostr/auftakt/core/runtime.test.ts
git commit -m "feat(auftakt): pass connect/retry/idleTimeout/temporaryRelayTtl through createRuntime"
```

---

### Task 8: Update spec.md markers

**Files:**

- Modify: `docs/auftakt/spec.md`

- [ ] **Step 1: Remove resolved `[未実装]` markers**

Remove or update the following markers in `spec.md`:

1. L58-59: Change `[未実装: Event.fromId, NostrLink.from]` to `Event.fromId, NostrLink.from は backward fetch 専用のため top-level live()/dispose() は設計上不要`
2. L145: Remove `[未実装: createRuntime での自動生成]`
3. L146: Remove `[未実装: createRuntime での自動生成]`
4. L190: Remove `[未実装: buildItems での MemoryStore merge]`
5. L300: Remove `[未実装: CircuitBreaker に callback あるが RelayManager が生成時に渡していない]`
6. L307: Remove `[未実装: NIP-11 結果を ForwardAssembler に反映するコードがない]`
7. L315: Remove `[未実装: store-types.ts にフィールド未追加]`
8. L340-350: Remove `[未実装: closedReasons フィールド]` and `[未実装]`
9. L723-726: Remove all 4 `[未実装]` comments

- [ ] **Step 2: Commit**

```bash
git add docs/auftakt/spec.md
git commit -m "docs(auftakt): remove resolved [未実装] markers from spec.md"
```

---

### Task 9: Final validation

- [ ] **Step 1: Run full pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

Expected: All 5 checks pass.

- [ ] **Step 2: Fix any issues found**

Address lint, type, or test failures. Re-run validation after fixes.
