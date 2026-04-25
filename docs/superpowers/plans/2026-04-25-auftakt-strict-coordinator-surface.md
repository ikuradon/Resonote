# Auftakt Strict Coordinator Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Auftakt read, subscription, publish, and repair-facing paths behind a coordinator-owned local-first surface so app-facing APIs never receive raw relay events.

**Architecture:** `packages/resonote/src/event-coordinator.ts` becomes the internal event IO boundary. Raw relay/session objects remain transport dependencies, but accepted events reach consumers only after coordinator ingress, Dexie materialization, hot-index visibility, and settlement handling. `src/shared/auftakt/resonote.ts` remains the single app-facing facade.

**Tech Stack:** TypeScript, SvelteKit/Svelte 5 bridges, Vitest, fake-indexeddb, Dexie via `@auftakt/adapter-dexie`, `@auftakt/core` relay/session primitives.

---

## File Structure

- Modify `packages/resonote/src/event-coordinator.ts`: add filter-aware local reads, explicit `materialize()`, `subscribe()`, and `publish()` coordinator methods.
- Modify `packages/resonote/src/event-coordinator.contract.test.ts`: pin coordinator read/subscribe/publish/visibility behavior.
- Modify `packages/resonote/src/runtime.ts`: route backward fetch, cached-by-id, latest, and plugin flows through a reusable coordinator-backed query driver.
- Modify `packages/resonote/src/subscription-registry.contract.test.ts`: prove subscription callbacks receive visible events after coordinator materialization.
- Modify `src/shared/nostr/query.ts`: keep the public bridge thin and coordinator-backed; do not construct package runtime helpers directly here.
- Modify `src/shared/nostr/query.test.ts`: update assertions from raw request construction to coordinator mediation.
- Modify `src/shared/nostr/cached-query.svelte.ts`: route through the facade/coordinator-backed driver instead of constructing raw read runtime locally.
- Modify `src/shared/nostr/cached-query.test.ts`: keep source-compatible behavior and prove relay results are materialized before emission.
- Modify `scripts/check-auftakt-strict-closure.ts`: extend guard coverage for production `src/shared/nostr` raw event emission.
- Modify `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md`: update verdict notes after the implementation closes the runtime-type gap.

## Task 1: Make Coordinator Reads Filter-Aware And Materialization-Centric

**Files:**

- Modify: `packages/resonote/src/event-coordinator.ts`
- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Write failing read tests**

Add these tests at the end of `packages/resonote/src/event-coordinator.contract.test.ts`:

```ts
it('reads multiple filters from durable local visibility before relay verification', async () => {
  const store = {
    getById: vi.fn(async (id: string) =>
      id === 'by-id'
        ? {
            id: 'by-id',
            pubkey: 'alice',
            created_at: 2,
            kind: 1,
            tags: [['e', 'root']],
            content: 'id hit'
          }
        : null
    ),
    getAllByKind: vi.fn(async (kind: number) =>
      kind === 1111
        ? [
            {
              id: 'comment',
              pubkey: 'bob',
              created_at: 3,
              kind: 1111,
              tags: [['e', 'root']],
              content: 'tag hit'
            }
          ]
        : []
    ),
    putWithReconcile: vi.fn(async () => ({ stored: true }))
  };
  const verify = vi.fn(async () => []);
  const coordinator = createEventCoordinator({
    store,
    relay: { verify }
  });

  const result = await coordinator.read([{ ids: ['by-id'] }, { kinds: [1111], '#e': ['root'] }], {
    policy: 'localFirst'
  });

  expect(result.events.map((event) => event.id).sort()).toEqual(['by-id', 'comment']);
  expect(store.getById).toHaveBeenCalledWith('by-id');
  expect(store.getAllByKind).toHaveBeenCalledWith(1111);
  expect(verify).toHaveBeenCalledWith([{ ids: ['by-id'] }, { kinds: [1111], '#e': ['root'] }], {
    reason: 'localFirst'
  });
});

it('materializes relay candidates through the coordinator before read visibility', async () => {
  const remote = {
    id: 'remote',
    pubkey: 'alice',
    created_at: 4,
    kind: 1,
    tags: [],
    content: 'accepted'
  };
  const putWithReconcile = vi.fn(async () => ({ stored: true }));
  const recordRelayHint = vi.fn(async () => {});
  const coordinator = createEventCoordinator({
    relayGateway: {
      verify: vi.fn(async () => ({
        strategy: 'fallback-req' as const,
        candidates: [{ event: { raw: 'relay' }, relayUrl: 'wss://relay.example' }]
      }))
    },
    ingestRelayCandidate: vi.fn(async () => ({ ok: true as const, event: remote })),
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile,
      recordRelayHint
    },
    relay: { verify: vi.fn(async () => []) }
  });

  const result = await coordinator.read({ ids: ['remote'] }, { policy: 'relayConfirmed' });

  expect(result.events).toEqual([remote]);
  expect(putWithReconcile).toHaveBeenCalledWith(remote);
  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'remote',
    relayUrl: 'wss://relay.example',
    source: 'seen',
    lastSeenAt: expect.any(Number)
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: FAIL because `read()` accepts only one filter and accepted gateway candidates are not forced through `materializeFromRelay()`.

- [ ] **Step 3: Implement filter-aware read and explicit materialize**

In `packages/resonote/src/event-coordinator.ts`, replace the current `EventCoordinatorStore` interface with:

```ts
export interface EventCoordinatorStore {
  getById(id: string): Promise<StoredEvent | null>;
  getAllByKind?(kind: number): Promise<StoredEvent[]>;
  getByTagValue?(tagQuery: string, kind?: number): Promise<StoredEvent[]>;
  putWithReconcile(event: StoredEvent): Promise<unknown>;
  recordRelayHint?(hint: {
    readonly eventId: string;
    readonly relayUrl: string;
    readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
    readonly lastSeenAt: number;
  }): Promise<void>;
}
```

In the returned object from `createEventCoordinator()`, rename `materializeFromRelay` to `materialize`, keep a compatibility alias, and update `read()` to accept one filter or an array:

```ts
async function materialize(
  event: StoredEvent,
  relayUrl: string
): Promise<EventCoordinatorMaterializeResult> {
  let materializeResult: EventCoordinatorMaterializeResult = {
    stored: false,
    durability: 'durable'
  };

  materializerQueue.enqueue({
    priority: event.kind === 5 ? 'critical' : 'normal',
    async run() {
      let result: unknown;
      try {
        result = await deps.store.putWithReconcile(event);
      } catch {
        hotIndex.applyVisible(event);
        hotIndex.applyRelayHint(buildSeenHint(event.id, relayUrl));
        materializeResult = { stored: false, durability: 'degraded' };
        return;
      }

      const stored = (result as { stored?: boolean } | undefined)?.stored !== false;
      if (!stored) {
        materializeResult = { stored: false, durability: 'durable' };
        return;
      }

      hotIndex.applyVisible(event);
      const hint = buildSeenHint(event.id, relayUrl);
      hotIndex.applyRelayHint(hint);
      await deps.store.recordRelayHint?.(hint);
      materializeResult = { stored: true, durability: 'durable' };
    }
  });

  await materializerQueue.drain();
  return materializeResult;
}

async function read(
  filterOrFilters: Record<string, unknown> | readonly Record<string, unknown>[],
  options: EventCoordinatorReadOptions
): Promise<EventCoordinatorReadResult> {
  const filters = Array.isArray(filterOrFilters) ? [...filterOrFilters] : [filterOrFilters];
  const local = await readLocalVisibleEvents(filters, hotIndex, deps.store);
  let relayEvents: StoredEvent[] = [];
  let relaySettled = options.policy === 'cacheOnly';

  if (options.policy !== 'cacheOnly') {
    if (deps.relayGateway) {
      const result = await deps.relayGateway.verify(filters, { reason: options.policy });
      for (const candidate of result.candidates) {
        const accepted = deps.ingestRelayCandidate
          ? await deps.ingestRelayCandidate(candidate)
          : { ok: false as const };
        if (!accepted.ok) continue;
        const materialized = await materialize(accepted.event, candidate.relayUrl);
        if (materialized.stored || materialized.durability === 'degraded') {
          relayEvents.push(accepted.event);
        }
      }
      relaySettled = true;
    } else {
      void deps.relay.verify(filters, { reason: options.policy });
    }
  }

  return {
    events: mergeEventsById(local, relayEvents),
    settlement: reduceReadSettlement({
      localSettled: true,
      relaySettled,
      relayRequired: options.policy !== 'cacheOnly',
      localHitProvenance: local.length > 0 ? 'store' : null,
      relayHit: relayEvents.length > 0
    })
  };
}
```

Add these helper functions below `mergeEventsById()`:

```ts
async function readLocalVisibleEvents(
  filters: readonly Record<string, unknown>[],
  hotIndex: HotEventIndex,
  store: EventCoordinatorStore
): Promise<StoredEvent[]> {
  const events = new Map<string, StoredEvent>();

  for (const filter of filters) {
    for (const event of await readLocalVisibleFilter(filter, hotIndex, store)) {
      if (eventMatchesFilter(event, filter)) events.set(event.id, event);
    }
  }

  return [...events.values()];
}

async function readLocalVisibleFilter(
  filter: Record<string, unknown>,
  hotIndex: HotEventIndex,
  store: EventCoordinatorStore
): Promise<StoredEvent[]> {
  const ids = readStringArray(filter.ids);
  if (ids.length > 0) {
    const hotHits = ids
      .map((id) => hotIndex.getById(id))
      .filter((event): event is StoredEvent => Boolean(event));
    const hotHitIds = new Set(hotHits.map((event) => event.id));
    const durableHits = (
      await Promise.all(ids.filter((id) => !hotHitIds.has(id)).map((id) => store.getById(id)))
    ).filter((event): event is StoredEvent => Boolean(event));
    return [...hotHits, ...durableHits];
  }

  const tagFilters = Object.entries(filter).filter(
    ([key, value]) => key.startsWith('#') && readStringArray(value).length > 0
  );
  if (tagFilters.length > 0 && store.getByTagValue) {
    const kinds = readNumberArray(filter.kinds);
    const [tagKey, tagValues] = tagFilters[0];
    const tagName = tagKey.slice(1);
    const events = await Promise.all(
      readStringArray(tagValues).flatMap((tagValue) => {
        if (kinds.length === 0) return [store.getByTagValue?.(`${tagName}:${tagValue}`)];
        return kinds.map((kind) => store.getByTagValue?.(`${tagName}:${tagValue}`, kind));
      })
    );
    return events.flatMap((entry) => entry ?? []);
  }

  const kinds = readNumberArray(filter.kinds);
  if (kinds.length > 0 && store.getAllByKind) {
    const events = await Promise.all(kinds.map((kind) => store.getAllByKind?.(kind)));
    return events.flatMap((entry) => entry ?? []);
  }

  return [];
}

function eventMatchesFilter(event: StoredEvent, filter: Record<string, unknown>): boolean {
  const ids = readStringArray(filter.ids);
  if (ids.length > 0 && !ids.includes(event.id)) return false;

  const authors = readStringArray(filter.authors);
  if (authors.length > 0 && !authors.includes(event.pubkey)) return false;

  const kinds = readNumberArray(filter.kinds);
  if (kinds.length > 0 && !kinds.includes(event.kind)) return false;

  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith('#')) continue;
    const expected = readStringArray(value);
    if (expected.length === 0) continue;
    const tagName = key.slice(1);
    const actual = event.tags
      .filter((tag) => tag[0] === tagName && typeof tag[1] === 'string')
      .map((tag) => tag[1]);
    if (!expected.some((entry) => actual.includes(entry))) return false;
  }

  return true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === 'number')
    : [];
}
```

Return the methods like this:

```ts
return {
  applyLocalEvent(event: StoredEvent): void {
    hotIndex.applyVisible(event);
  },
  materialize,
  materializeFromRelay: materialize,
  read
};
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "feat(auftakt): centralize coordinator read materialization"
```

## Task 2: Add Coordinator Subscription Visibility

**Files:**

- Modify: `packages/resonote/src/event-coordinator.ts`
- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Write failing subscription tests**

Add these tests to `packages/resonote/src/event-coordinator.contract.test.ts`:

```ts
it('subscribes through relay candidates but emits only accepted visible events', async () => {
  const accepted = {
    id: 'visible',
    pubkey: 'alice',
    created_at: 10,
    kind: 1,
    tags: [],
    content: 'visible'
  };
  const onEvent = vi.fn();
  const onComplete = vi.fn();
  let candidateHandler:
    | ((candidate: { event: unknown; relayUrl: string }) => Promise<void> | void)
    | undefined;
  const coordinator = createEventCoordinator({
    transport: {
      subscribe: vi.fn((_filters, _options, handlers) => {
        candidateHandler = handlers.onCandidate;
        return { unsubscribe: vi.fn() };
      })
    },
    ingestRelayCandidate: vi.fn(async () => ({ ok: true as const, event: accepted })),
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => ({ stored: true }))
    },
    relay: { verify: vi.fn(async () => []) }
  });

  coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent, onComplete });
  await candidateHandler?.({ event: { raw: true }, relayUrl: 'wss://relay.example' });

  expect(onEvent).toHaveBeenCalledWith({
    event: accepted,
    relayHint: 'wss://relay.example'
  });
});

it('drops rejected subscription candidates before consumer callbacks', async () => {
  const onEvent = vi.fn();
  let candidateHandler:
    | ((candidate: { event: unknown; relayUrl: string }) => Promise<void> | void)
    | undefined;
  const coordinator = createEventCoordinator({
    transport: {
      subscribe: vi.fn((_filters, _options, handlers) => {
        candidateHandler = handlers.onCandidate;
        return { unsubscribe: vi.fn() };
      })
    },
    ingestRelayCandidate: vi.fn(async () => ({ ok: false as const })),
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => ({ stored: true }))
    },
    relay: { verify: vi.fn(async () => []) }
  });

  coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent });
  await candidateHandler?.({ event: { malformed: true }, relayUrl: 'wss://relay.example' });

  expect(onEvent).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: FAIL because `createEventCoordinator()` has no `transport` dependency and no `subscribe()` method.

- [ ] **Step 3: Implement coordinator subscription types and method**

In `packages/resonote/src/event-coordinator.ts`, add these interfaces above `createEventCoordinator()`:

```ts
export interface EventCoordinatorSubscriptionHandle {
  unsubscribe(): void;
}

export interface EventCoordinatorVisiblePacket<TEvent extends StoredEvent = StoredEvent> {
  readonly event: TEvent;
  readonly relayHint?: string;
}

export interface EventCoordinatorSubscriptionHandlers<TEvent extends StoredEvent = StoredEvent> {
  readonly onEvent: (packet: EventCoordinatorVisiblePacket<TEvent>) => void | Promise<void>;
  readonly onComplete?: () => void;
  readonly onError?: (error: unknown) => void;
}

export interface EventCoordinatorTransport {
  subscribe(
    filters: readonly Record<string, unknown>[],
    options: { readonly policy: ReadPolicy },
    handlers: {
      readonly onCandidate: (candidate: EventCoordinatorRelayCandidate) => void | Promise<void>;
      readonly onComplete?: () => void;
      readonly onError?: (error: unknown) => void;
    }
  ): EventCoordinatorSubscriptionHandle;
}
```

Add `readonly transport?: EventCoordinatorTransport;` to the `createEventCoordinator()` dependency object.

Inside `createEventCoordinator()`, define this method next to `read()`:

```ts
function subscribe<TEvent extends StoredEvent = StoredEvent>(
  filters: readonly Record<string, unknown>[],
  options: EventCoordinatorReadOptions,
  handlers: EventCoordinatorSubscriptionHandlers<TEvent>
): EventCoordinatorSubscriptionHandle {
  if (!deps.transport) {
    queueMicrotask(() => {
      handlers.onComplete?.();
    });
    return { unsubscribe() {} };
  }

  return deps.transport.subscribe(filters, options, {
    onCandidate: async (candidate) => {
      const accepted = deps.ingestRelayCandidate
        ? await deps.ingestRelayCandidate(candidate)
        : { ok: false as const };
      if (!accepted.ok) return;

      const materialized = await materialize(accepted.event, candidate.relayUrl);
      if (!materialized.stored && materialized.durability !== 'degraded') return;

      await handlers.onEvent({
        event: accepted.event as TEvent,
        relayHint: candidate.relayUrl || undefined
      });
    },
    onComplete: handlers.onComplete,
    onError: handlers.onError
  });
}
```

Return `subscribe` from the coordinator object:

```ts
return {
  applyLocalEvent(event: StoredEvent): void {
    hotIndex.applyVisible(event);
  },
  materialize,
  materializeFromRelay: materialize,
  read,
  subscribe
};
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "feat(auftakt): add coordinator visible subscriptions"
```

## Task 3: Add Coordinator Publish Mediation

**Files:**

- Modify: `packages/resonote/src/event-coordinator.ts`
- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Write failing publish tests**

Add these tests to `packages/resonote/src/event-coordinator.contract.test.ts`:

```ts
it('publishes through coordinator transport and records successful relay hints', async () => {
  const event = {
    id: 'published',
    pubkey: 'alice',
    created_at: 20,
    kind: 1,
    tags: [],
    content: 'publish',
    sig: 'sig'
  };
  const recordRelayHint = vi.fn(async () => {});
  const publish = vi.fn(async (_event, handlers) => {
    await handlers.onAck({ eventId: 'published', relayUrl: 'wss://relay.example', ok: true });
  });
  const coordinator = createEventCoordinator({
    publishTransport: { publish },
    pendingPublishes: { add: vi.fn(async () => {}) },
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => ({ stored: true })),
      recordRelayHint
    },
    relay: { verify: vi.fn(async () => []) }
  });

  await expect(coordinator.publish(event)).resolves.toEqual({ queued: false, ok: true });

  expect(publish).toHaveBeenCalledWith(event, expect.any(Object));
  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'published',
    relayUrl: 'wss://relay.example',
    source: 'published',
    lastSeenAt: expect.any(Number)
  });
});

it('queues retryable publish failures through coordinator pending storage', async () => {
  const event = {
    id: 'offline',
    pubkey: 'alice',
    created_at: 20,
    kind: 1,
    tags: [],
    content: 'publish',
    sig: 'sig'
  };
  const add = vi.fn(async () => {});
  const coordinator = createEventCoordinator({
    publishTransport: {
      publish: vi.fn(async () => {
        throw new Error('offline');
      })
    },
    pendingPublishes: { add },
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => ({ stored: true }))
    },
    relay: { verify: vi.fn(async () => []) }
  });

  await expect(coordinator.publish(event)).rejects.toThrow('offline');
  expect(add).toHaveBeenCalledWith(event);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: FAIL because coordinator publish dependencies and `publish()` do not exist.

- [ ] **Step 3: Implement coordinator publish types and method**

In `packages/resonote/src/event-coordinator.ts`, add these interfaces:

```ts
export interface EventCoordinatorPublishAck {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly ok: boolean;
}

export interface EventCoordinatorPublishTransport {
  publish(
    event: StoredEvent,
    handlers: { readonly onAck: (packet: EventCoordinatorPublishAck) => Promise<void> | void }
  ): Promise<void>;
}

export interface EventCoordinatorPendingPublishes {
  add(event: StoredEvent): Promise<void>;
}

export interface EventCoordinatorPublishResult {
  readonly queued: boolean;
  readonly ok: boolean;
}
```

Add these optional dependencies to `createEventCoordinator()`:

```ts
readonly publishTransport?: EventCoordinatorPublishTransport;
readonly pendingPublishes?: EventCoordinatorPendingPublishes;
```

Inside `createEventCoordinator()`, add:

```ts
async function publish(event: StoredEvent): Promise<EventCoordinatorPublishResult> {
  if (!deps.publishTransport) {
    await deps.pendingPublishes?.add(event);
    return { queued: true, ok: false };
  }

  try {
    await deps.publishTransport.publish(event, {
      onAck: async (packet) => {
        if (!packet.ok || packet.eventId !== event.id) return;
        await deps.store.recordRelayHint?.({
          eventId: event.id,
          relayUrl: packet.relayUrl,
          source: 'published',
          lastSeenAt: Math.floor(Date.now() / 1000)
        });
      }
    });
    return { queued: false, ok: true };
  } catch (error) {
    await deps.pendingPublishes?.add(event);
    throw error;
  }
}
```

Return `publish` from the coordinator object.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "feat(auftakt): route publish through coordinator"
```

## Task 4: Wire Runtime Backward Reads Through The Coordinator Driver

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/relay-repair.contract.test.ts`
- Modify: `packages/resonote/src/built-in-plugins.contract.test.ts`

- [ ] **Step 1: Add a failing package-level read mediation test**

In `packages/resonote/src/built-in-plugins.contract.test.ts`, add this test:

```ts
it('fetchNostrEventById returns only coordinator-materialized relay results', async () => {
  const fetchedEvent = {
    id: 'target-event',
    pubkey: 'alice',
    created_at: 1,
    kind: 1,
    tags: [],
    content: 'coordinator-owned fetch',
    sig: 'sig'
  };
  const putWithReconcile = vi.fn(async () => ({ stored: true, emissions: [] }));
  const coordinator = createTestCoordinator({
    fetchBackwardFirst: async () => fetchedEvent,
    getEventsDB: async () => ({
      getByPubkeyAndKind: async () => null,
      getManyByPubkeysAndKind: async () => [],
      getByReplaceKey: async () => null,
      getByTagValue: async () => [],
      getById: async () => null,
      getAllByKind: async () => [],
      listNegentropyEventRefs: async () => [],
      deleteByIds: async () => {},
      clearAll: async () => {},
      put: async () => true,
      putWithReconcile
    })
  });

  const result = await coordinator.fetchNostrEventById<typeof fetchedEvent>('target-event', []);

  expect(result).toEqual(fetchedEvent);
  expect(putWithReconcile).toHaveBeenCalledWith(fetchedEvent);
});
```

- [ ] **Step 2: Run package runtime tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/built-in-plugins.contract.test.ts packages/resonote/src/relay-repair.contract.test.ts
```

Expected: FAIL if fetched relay results can return without coordinator materialization.

- [ ] **Step 3: Add coordinator-backed runtime helpers**

In `packages/resonote/src/runtime.ts`, remove `fetchBackwardEvents` and
`fetchBackwardFirst` from the `ResonoteRuntime` interface. The coordinator
creates its own `QueryRuntime` wrapper instead of requiring callers to provide
raw backward-read helpers.

Add this helper near `ingestRelayCandidateForRuntime()`:

```ts
function createCoordinatorStore(runtime: EventMaterializationRuntime & ResonoteRuntime) {
  return {
    getById: async (id: string) => {
      const db = await runtime.getEventsDB();
      return db.getById(id);
    },
    getAllByKind: async (kind: number) => {
      const db = await runtime.getEventsDB();
      return db.getAllByKind(kind);
    },
    getByTagValue: async (tagQuery: string, kind?: number) => {
      const db = await runtime.getEventsDB();
      return db.getByTagValue(tagQuery, kind);
    },
    putWithReconcile: async (event: StoredEvent) => {
      const db = await runtime.getEventsDB();
      return db.putWithReconcile(event);
    },
    recordRelayHint: async (hint: {
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }) => {
      const db = await runtime.getEventsDB();
      await db.recordRelayHint?.(hint);
    }
  };
}

function createRuntimeEventCoordinator(runtime: ResonoteRuntime) {
  return createEventCoordinator({
    relayGateway: {
      verify: async (filters) => {
        const candidates = await fetchRelayCandidateEventsFromRuntime(runtime, filters, {
          timeoutMs: 10_000,
          scope: 'coordinator:runtime-read'
        });
        return { candidates };
      }
    },
    ingestRelayCandidate: (candidate) => ingestRelayCandidateForRuntime(runtime, candidate),
    store: createCoordinatorStore(runtime),
    relay: {
      verify: async () => []
    }
  });
}
```

Add this helper below `fetchRelayCandidateEventsFromRelay()`:

```ts
async function fetchRelayCandidateEventsFromRuntime(
  runtime: ResonoteRuntime,
  filters: readonly RuntimeFilter[],
  options: { readonly timeoutMs?: number; readonly scope: string }
): Promise<Array<{ event: unknown; relayUrl: string }>> {
  const rxNostr = (await runtime.getRxNostr()) as NegentropySessionRuntime;
  const req = runtime.createRxBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      filters,
      scope: options.scope
    })
  }) as {
    emit(input: unknown): void;
    over(): void;
  };
  const candidates: Array<{ event: unknown; relayUrl: string }> = [];

  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => finish(), options.timeoutMs ?? 10_000);
    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        candidates.push({
          event: packet.event,
          relayUrl: typeof packet.from === 'string' ? packet.from : ''
        });
      },
      complete: () => finish(),
      error: () => finish()
    });

    for (const filter of filters) req.emit(filter);
    req.over();

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.unsubscribe();
      resolve(candidates);
    }
  });
}
```

- [ ] **Step 4: Route `fetchBackwardEventsFromReadRuntime()` through the coordinator**

Replace the body of `fetchBackwardEventsFromReadRuntime()` in `packages/resonote/src/runtime.ts` with:

```ts
async function fetchBackwardEventsFromReadRuntime<TEvent>(
  runtime: BackwardFetchRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent[]> {
  const coordinator = createRuntimeEventCoordinator(runtime as ResonoteRuntime);
  const result = await coordinator.read([...filters], { policy: 'localFirst' });

  if (options?.rejectOnError && result.settlement.phase !== 'settled') {
    throw new Error('Relay read did not settle');
  }

  return result.events as TEvent[];
}
```

- [ ] **Step 5: Add coordinator-owned backward read methods to `ResonoteCoordinator`**

In the `ResonoteCoordinator` interface in `packages/resonote/src/runtime.ts`, add:

```ts
fetchBackwardEvents<TEvent>(
  filters: readonly Record<string, unknown>[],
  options?: FetchBackwardOptions
): Promise<TEvent[]>;
fetchBackwardFirst<TEvent>(
  filters: readonly Record<string, unknown>[],
  options?: FetchBackwardOptions
): Promise<TEvent | null>;
```

In `createResonoteCoordinator()`, replace:

```ts
const queryRuntime = runtime as QueryRuntime<StoredEvent>;
const sessionRuntime = runtime as unknown as SessionRuntime<StoredEvent>;
```

with:

```ts
const coordinatorReadRuntime = runtime as unknown as CoordinatorReadRuntime;
const queryRuntime: QueryRuntime<StoredEvent> = {
  fetchBackwardEvents: (filters, options) =>
    fetchBackwardEventsFromReadRuntime<StoredEvent>(
      coordinatorReadRuntime,
      filters,
      cloneFetchBackwardOptions(options)
    ),
  fetchBackwardFirst: async (filters, options) => {
    const events = await fetchBackwardEventsFromReadRuntime<StoredEvent>(
      coordinatorReadRuntime,
      filters,
      cloneFetchBackwardOptions(options)
    );
    return events.at(-1) ?? null;
  },
  fetchLatestEvent: (pubkey, kind) => runtime.fetchLatestEvent(pubkey, kind),
  getEventsDB: () => runtime.getEventsDB()
};
const sessionRuntime = runtime as unknown as SessionRuntime<StoredEvent>;
```

Remove the later duplicate declaration:

```ts
const coordinatorReadRuntime = runtime as unknown as CoordinatorReadRuntime;
```

In the object returned by `createResonoteCoordinator()`, add these methods before
`cachedFetchById`:

```ts
fetchBackwardEvents: (filters, options) =>
  fetchBackwardEventsFromReadRuntime<never>(
    coordinatorReadRuntime,
    filters,
    cloneFetchBackwardOptions(options)
  ),
fetchBackwardFirst: async (filters, options) => {
  const events = await fetchBackwardEventsFromReadRuntime<never>(
    coordinatorReadRuntime,
    filters,
    cloneFetchBackwardOptions(options)
  );
  return events.at(-1) ?? null;
},
```

- [ ] **Step 6: Ensure by-id facade fetch materializes direct fetch results**

In `createResonoteCoordinator()` inside `fetchNostrEventById`, replace:

```ts
fetchNostrEventById: (eventId: string, relayHints: readonly string[]) =>
  fetchNostrEventById(queryRuntime as QueryRuntimeWithById, eventId, relayHints),
```

with:

```ts
fetchNostrEventById: async (eventId: string, relayHints: readonly string[]) => {
  const event = await fetchNostrEventById<StoredEvent>(
    queryRuntime as QueryRuntimeWithById,
    eventId,
    relayHints
  );
  if (!event) return null;
  const coordinator = createRuntimeEventCoordinator(runtime);
  const materialized = await coordinator.materialize(event, relayHints[0] ?? '');
  return materialized.stored || materialized.durability === 'degraded' ? (event as never) : null;
},
```

- [ ] **Step 7: Run package runtime tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/built-in-plugins.contract.test.ts packages/resonote/src/relay-repair.contract.test.ts packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/built-in-plugins.contract.test.ts packages/resonote/src/relay-repair.contract.test.ts
git commit -m "refactor(auftakt): route runtime reads through coordinator"
```

## Task 5: Move Shared Nostr Bridges Behind The Facade

> Status note: `src/shared/nostr/cached-query.*` was retired by the cached read
> bridge cleanup. The remaining bridge proof is `src/shared/nostr/query.ts`
> delegating backward reads to `$shared/auftakt/resonote.js`; cached read
> behavior is covered under `src/shared/auftakt/cached-read.*`.

**Files:**

- Modify: `src/shared/nostr/query.ts`
- Modify: `src/shared/nostr/query.test.ts`
- Modify: `src/shared/nostr/cached-query.svelte.ts`
- Modify: `src/shared/nostr/cached-query.test.ts`
- Modify: `src/shared/auftakt/resonote.ts`

- [ ] **Step 1: Remove facade dependency on `src/shared/nostr/query.ts`**

In `src/shared/auftakt/resonote.ts`, remove this import:

```ts
import {
  fetchBackwardEvents as fetchBackwardEventsImpl,
  fetchBackwardFirst as fetchBackwardFirstImpl
} from '$shared/nostr/query.js';
```

In the local `runtime` object, remove these properties:

```ts
fetchBackwardEvents: (filters, options) =>
  fetchBackwardEventsImpl(filters, {
    ...options,
    overlay: options?.overlay
      ? {
          ...options.overlay,
          relays: [...options.overlay.relays]
        }
      : undefined
  }),
fetchBackwardFirst: (filters, options) =>
  fetchBackwardFirstImpl(filters, {
    ...options,
    overlay: options?.overlay
      ? {
          ...options.overlay,
          relays: [...options.overlay.relays]
        }
      : undefined
  }),
```

The facade must not import `src/shared/nostr/query.ts`, because `query.ts` will
become a compatibility bridge that delegates back to the facade.

- [ ] **Step 2: Add facade exports for backward reads**

In `src/shared/auftakt/resonote.ts`, add these exports after `fetchNostrEventById()`:

```ts
export async function fetchBackwardEvents<TEvent>(
  filters: readonly Record<string, unknown>[],
  options?: {
    readonly overlay?: {
      readonly relays: readonly string[];
      readonly includeDefaultReadRelays?: boolean;
    };
    readonly timeoutMs?: number;
    readonly rejectOnError?: boolean;
  }
): Promise<TEvent[]> {
  return coordinator.fetchBackwardEvents<TEvent>(filters, options);
}

export async function fetchBackwardFirst<TEvent>(
  filters: readonly Record<string, unknown>[],
  options?: {
    readonly overlay?: {
      readonly relays: readonly string[];
      readonly includeDefaultReadRelays?: boolean;
    };
    readonly timeoutMs?: number;
    readonly rejectOnError?: boolean;
  }
): Promise<TEvent | null> {
  return coordinator.fetchBackwardFirst<TEvent>(filters, options);
}
```

- [ ] **Step 3: Update `src/shared/nostr/query.ts` to delegate to facade**

Replace the file with:

```ts
import {
  fetchBackwardEvents as fetchBackwardEventsFromFacade,
  fetchBackwardFirst as fetchBackwardFirstFromFacade
} from '$shared/auftakt/resonote.js';

type Filter = Record<string, unknown>;

export interface RelayReadOverlayOptions {
  readonly relays: string[];
  readonly includeDefaultReadRelays?: boolean;
}

interface FetchBackwardOptions {
  readonly overlay?: RelayReadOverlayOptions;
  readonly timeoutMs?: number;
  readonly rejectOnError?: boolean;
}

export async function fetchBackwardEvents<TEvent>(
  filters: readonly Filter[],
  options?: FetchBackwardOptions
): Promise<TEvent[]> {
  return fetchBackwardEventsFromFacade<TEvent>(filters, options);
}

export async function fetchBackwardFirst<TEvent>(
  filters: readonly Filter[],
  options?: FetchBackwardOptions
): Promise<TEvent | null> {
  return fetchBackwardFirstFromFacade<TEvent>(filters, options);
}
```

- [ ] **Step 4: Update `src/shared/nostr/query.test.ts` mocks**

Replace the top-level mocks in `src/shared/nostr/query.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchBackwardEventsMock, fetchBackwardFirstMock } = vi.hoisted(() => ({
  fetchBackwardEventsMock: vi.fn(),
  fetchBackwardFirstMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchBackwardEvents: fetchBackwardEventsMock,
  fetchBackwardFirst: fetchBackwardFirstMock
}));

import { fetchBackwardEvents, fetchBackwardFirst } from './query.js';
```

Replace the tests with:

```ts
describe('fetchBackwardEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBackwardEventsMock.mockResolvedValue([]);
    fetchBackwardFirstMock.mockResolvedValue(null);
  });

  it('delegates backward reads to the Auftakt facade', async () => {
    const event = { id: 'event', kind: 1 };
    fetchBackwardEventsMock.mockResolvedValueOnce([event]);

    await expect(fetchBackwardEvents([{ authors: ['pk1'], kinds: [1] }])).resolves.toEqual([event]);
    expect(fetchBackwardEventsMock).toHaveBeenCalledWith(
      [{ authors: ['pk1'], kinds: [1] }],
      undefined
    );
  });

  it('passes relay read options through to the facade', async () => {
    await fetchBackwardEvents([{ ids: ['event'] }], {
      rejectOnError: true,
      timeoutMs: 5_000
    });

    expect(fetchBackwardEventsMock).toHaveBeenCalledWith([{ ids: ['event'] }], {
      rejectOnError: true,
      timeoutMs: 5_000
    });
  });
});

describe('fetchBackwardFirst', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBackwardFirstMock.mockResolvedValue(null);
  });

  it('delegates first backward read to the Auftakt facade', async () => {
    const event = { id: 'first', kind: 1 };
    fetchBackwardFirstMock.mockResolvedValueOnce(event);

    await expect(fetchBackwardFirst([{ ids: ['first'] }])).resolves.toEqual(event);
    expect(fetchBackwardFirstMock).toHaveBeenCalledWith([{ ids: ['first'] }], undefined);
  });
});
```

- [ ] **Step 5: Keep cached query bridge source-compatible**

In `src/shared/nostr/cached-query.svelte.ts`, keep the overloads but import helpers from the facade:

```ts
import type { ReadSettlement, StoredEvent } from '@auftakt/core';
import type { LatestReadDriver } from '@auftakt/resonote';

import {
  cachedFetchById as cachedFetchByIdFromFacade,
  invalidateFetchByIdCache as invalidateFetchByIdCacheFromFacade,
  useCachedLatest as useCachedLatestFromFacade
} from '$shared/auftakt/resonote.js';
```

Replace `createCachedReadRuntime()`, `cachedReadRuntime`, and the runtime overload implementation with direct facade calls. Remove the overloads that accept `CachedReadRuntime`; production callers should use the facade-owned cache path.

```ts
export async function cachedFetchById(eventId: string): Promise<CachedFetchByIdResult> {
  if (!eventId) throw new Error('eventId is required');
  return cachedFetchByIdFromFacade(eventId);
}

export function invalidateFetchByIdCache(eventId: string): void {
  if (!eventId) throw new Error('eventId is required');
  invalidateFetchByIdCacheFromFacade(eventId);
}

export function resetFetchByIdCache(): void {
  // Cache ownership moved to the Auftakt coordinator facade.
}
```

Keep `useCachedLatest()` but create its driver from the facade:

```ts
export function useCachedLatest(pubkey: string, kind: number): UseCachedLatestResult {
  if (typeof kind !== 'number') {
    throw new Error('kind is required');
  }

  const driver = useCachedLatestFromFacade(
    pubkey,
    kind
  ) as unknown as LatestReadDriver<CachedEvent>;
  const initial = driver.getSnapshot();
  let event = $state<CachedEvent | null>(initial.event);
  let settlement = $state<ReadSettlement>(initial.settlement);
  let destroyed = false;

  const unsubscribe = driver.subscribe(() => {
    if (destroyed) return;
    const snapshot = driver.getSnapshot();
    event = snapshot.event;
    settlement = snapshot.settlement;
  });

  return {
    get event() {
      return event;
    },
    get settlement() {
      return settlement;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      driver.destroy();
    }
  };
}
```

- [ ] **Step 6: Update cached-query tests to mock facade**

In `src/shared/nostr/cached-query.test.ts`, replace current module mocks with:

```ts
const { cachedFetchByIdMock, invalidateFetchByIdCacheMock, useCachedLatestMock } = vi.hoisted(
  () => ({
    cachedFetchByIdMock: vi.fn(),
    invalidateFetchByIdCacheMock: vi.fn(),
    useCachedLatestMock: vi.fn()
  })
);

vi.mock('$shared/auftakt/resonote.js', () => ({
  cachedFetchById: cachedFetchByIdMock,
  invalidateFetchByIdCache: invalidateFetchByIdCacheMock,
  useCachedLatest: useCachedLatestMock
}));
```

Use this driver helper in tests:

```ts
function latestDriver(event: Record<string, unknown> | null) {
  return {
    getSnapshot: () => ({
      event,
      settlement: {
        phase: 'settled',
        provenance: event ? 'store' : 'none',
        reason: event ? 'cache-hit' : 'settled-miss'
      }
    }),
    subscribe: vi.fn(() => vi.fn()),
    destroy: vi.fn()
  };
}
```

Replace behavioral tests with facade delegation checks:

```ts
it('delegates cached by-id reads to the Auftakt facade', async () => {
  cachedFetchByIdMock.mockResolvedValueOnce({
    event: null,
    settlement: { phase: 'settled', provenance: 'none', reason: 'settled-miss' }
  });

  await expect(cachedFetchById('event-1')).resolves.toEqual({
    event: null,
    settlement: { phase: 'settled', provenance: 'none', reason: 'settled-miss' }
  });
  expect(cachedFetchByIdMock).toHaveBeenCalledWith('event-1');
});

it('delegates invalidation to the Auftakt facade', () => {
  invalidateFetchByIdCache('event-1');
  expect(invalidateFetchByIdCacheMock).toHaveBeenCalledWith('event-1');
});

it('wraps facade latest driver in Svelte-facing accessors', () => {
  useCachedLatestMock.mockReturnValueOnce(latestDriver({ id: 'latest', kind: 0 }));

  const result = useCachedLatest('pubkey', 0);

  expect(result.event).toEqual({ id: 'latest', kind: 0 });
  expect(result.settlement).toEqual({
    phase: 'settled',
    provenance: 'store',
    reason: 'cache-hit'
  });
});
```

- [ ] **Step 7: Run bridge tests**

Run:

```bash
pnpm exec vitest run src/shared/nostr/query.test.ts src/shared/nostr/cached-query.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add src/shared/auftakt/resonote.ts src/shared/nostr/query.ts src/shared/nostr/query.test.ts src/shared/nostr/cached-query.svelte.ts src/shared/nostr/cached-query.test.ts
git commit -m "refactor(auftakt): move nostr bridges behind facade"
```

## Task 6: Extend Strict Closure Guard And Run Completion Verification

**Files:**

- Modify: `scripts/check-auftakt-strict-closure.ts`
- Modify: `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md`

- [ ] **Step 1: Add guard patterns for shared nostr raw event emission**

In `scripts/check-auftakt-strict-closure.ts`, add this helper after `isProductionResonoteSource()`:

```ts
function isProductionSharedNostrSource(path: string): boolean {
  return (
    path.startsWith('src/shared/nostr/') &&
    path.endsWith('.ts') &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.svelte.test.ts')
  );
}
```

Inside `checkStrictClosure()`, after the production resonote raw packet checks, add:

```ts
if (isProductionSharedNostrSource(file.path) && /events\.push\(\s*packet\.event/.test(file.text)) {
  errors.push(`${file.path} exposes raw packet.event to shared nostr results`);
}
if (
  isProductionSharedNostrSource(file.path) &&
  /callbacks\.next\?\(\s*\{\s*event:\s*packet\.event/.test(file.text)
) {
  errors.push(`${file.path} forwards raw packet.event to shared nostr callbacks`);
}
if (
  isProductionSharedNostrSource(file.path) &&
  /from ['"]\.\.\/\.\.\/\.\.\/packages\/resonote\/src\/runtime\.js['"]/.test(file.text)
) {
  errors.push(`${file.path} imports package runtime internals instead of the Auftakt facade`);
}
```

- [ ] **Step 2: Run strict closure and verify failure or pass**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: PASS after Task 5. If it fails, fix only the reported production raw packet or deep package import path.

- [ ] **Step 3: Update audit note**

In `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md`, replace the `Remaining follow-up is outbox intelligence` paragraph with:

```md
Remaining follow-up is outbox intelligence and relay capability policy: durable
relay hints exist, but broad reply/reaction/nevent/naddr routing policy,
NIP-11 capability cache, and max-subscription-aware command queues remain later
feature plans.
```

In the `Current-Code Findings` table, update the `Single coordinator truth` risk cell to:

```md
Keep the facade as the app boundary; raw transport should remain a coordinator implementation dependency only.
```

- [ ] **Step 4: Run package and guard verification**

Run:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm exec vitest run src/shared/nostr/query.test.ts src/shared/nostr/cached-query.test.ts
pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt:strict-closure
```

Expected: all commands PASS.

- [ ] **Step 5: Commit Task 6**

Run:

```bash
git add scripts/check-auftakt-strict-closure.ts docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md
git commit -m "test(auftakt): guard strict coordinator closure"
```

## Final Verification

Run:

```bash
pnpm run check:auftakt:nips
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm exec vitest run src/shared/nostr/query.test.ts src/shared/nostr/cached-query.test.ts
git status --short
```

Expected:

- All commands pass.
- `git status --short` shows no unstaged implementation files.
- Existing unrelated untracked `.codex` may remain untouched.

## Spec Coverage Self-Check

- Coordinator-owned read path: Tasks 1 and 4.
- Coordinator-owned subscription path: Task 2.
- Coordinator-owned publish path: Task 3.
- Facade and shared bridge cleanup: Task 5.
- Error handling and quarantine behavior: Task 1 uses existing ingress; Task 2 drops rejected candidates; Task 6 guards regressions.
- Handoff items remain outside implementation: Task 6 audit note keeps NIP-11 queueing, NDK entity APIs, and outbox routing as later plans.
