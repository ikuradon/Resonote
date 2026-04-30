# Auftakt Strict Coordinator Surface Remaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining strict coordinator surface gaps left after `2026-04-25-auftakt-strict-coordinator-surface.md` by routing runtime backward reads through `EventCoordinator.read()`, removing raw backward read helpers from `ResonoteRuntime`, and landing subscription visibility guards.

**Architecture:** `packages/resonote/src/runtime.ts` should use a single runtime-created `EventCoordinator` for backward reads. Raw relay packets may still be transport inputs inside runtime helpers, but they become consumer-visible only after coordinator ingress, quarantine/materialization, and local visibility merging. Subscription wrappers should keep emitting only materialized visible events.

**Tech Stack:** TypeScript, Vitest, RxJS `Observable`, `@auftakt/core`, `@auftakt/resonote`, SvelteKit facade tests.

---

## Current Status

Already implemented and verified before this remaining plan was written:

- `EventCoordinator.read()`, `materialize()`, `subscribe()`, and `publish()` contract tests pass.
- `src/shared/nostr/query.ts` delegates backward reads to `$shared/auftakt/resonote.js`.
- strict closure, NIP matrix, migration proof, and package tests pass with the current worktree.
- A subscription visibility runtime wrapper and `packages/resonote/src/subscription-visibility.contract.test.ts` are present but uncommitted.

Remaining gaps to close:

- `fetchBackwardEventsFromReadRuntime()` still opens the raw session directly instead of using `EventCoordinator.read()`.
- `ResonoteRuntime` still requires `fetchBackwardEvents()` and `fetchBackwardFirst()`.
- Several test fixtures still include raw backward read helpers because the type has not been narrowed.
- The original plan mentions retired `src/shared/nostr/cached-query.*` files; this remaining plan treats those paths as superseded by cached-read facade retirement.

## File Structure

- Modify `packages/resonote/src/runtime.ts`: add reusable runtime coordinator helpers, route backward reads through coordinator, keep subscription materialization wrapper, and remove raw backward read methods from `ResonoteRuntime`.
- Modify `packages/resonote/src/built-in-plugins.contract.test.ts`: pin coordinator-owned backward read behavior without requiring raw runtime read helpers.
- Modify `packages/resonote/src/subscription-visibility.contract.test.ts`: keep or add the subscription visibility tests that prove invalid raw packets are quarantined and not emitted.
- Modify `packages/resonote/src/plugin-api.contract.test.ts`, `packages/resonote/src/plugin-isolation.contract.test.ts`, `packages/resonote/src/relay-repair.contract.test.ts`, `packages/resonote/src/subscription-registry.contract.test.ts`, and any other `packages/resonote/src/*.contract.test.ts` fixture that still adds `fetchBackwardEvents` or `fetchBackwardFirst` only to satisfy `ResonoteRuntime`.
- Modify `docs/superpowers/plans/2026-04-25-auftakt-strict-coordinator-surface.md`: add a short status note that `cached-query.*` bridge steps are superseded by cached read bridge retirement.

## Task 1: Land Subscription Visibility Guard

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Create or modify: `packages/resonote/src/subscription-visibility.contract.test.ts`

- [ ] **Step 1: Add the failing subscription visibility tests**

Create `packages/resonote/src/subscription-visibility.contract.test.ts` if it is not already present. Use this complete test file:

```ts
import { finalizeEvent, type StoredEvent } from '@auftakt/core';
import { Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  createResonoteCoordinator,
  startCommentSubscription,
  type ResonoteRuntime
} from './runtime.js';

const RELAY_SECRET_KEY = new Uint8Array(32).fill(9);

interface RelayObserver {
  next?: (packet: { event: unknown; from?: string }) => void;
  complete?: () => void;
  error?: (error: unknown) => void;
}

class CapturingRelaySession {
  readonly observers: RelayObserver[] = [];

  use(): Observable<{ event: unknown; from?: string }> {
    return new Observable((subscriber) => {
      const observer: RelayObserver = {
        next: (packet) => subscriber.next(packet),
        complete: () => subscriber.complete(),
        error: (error) => subscriber.error(error)
      };
      this.observers.push(observer);

      return () => {
        const index = this.observers.indexOf(observer);
        if (index >= 0) this.observers.splice(index, 1);
      };
    });
  }

  emit(index: number, event: unknown, from = 'wss://relay.example'): void {
    this.observers[index]?.next?.({ event, from });
  }
}

function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('waitFor timeout'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function validEvent(overrides: Partial<StoredEvent> = {}) {
  return finalizeEvent(
    {
      kind: overrides.kind ?? 1111,
      content: overrides.content ?? 'visible',
      tags: overrides.tags ?? [['I', 'spotify:track:abc']],
      created_at: overrides.created_at ?? 100
    },
    RELAY_SECRET_KEY
  );
}

function invalidRelayEvent() {
  return {
    id: 'not-a-valid-nostr-event',
    pubkey: 'alice',
    created_at: 1,
    kind: 1111,
    tags: [],
    content: 'invalid'
  };
}

function createCoordinatorFixture() {
  const relaySession = new CapturingRelaySession();
  const materialized: StoredEvent[] = [];
  const quarantined: unknown[] = [];
  const runtime: ResonoteRuntime = {
    async fetchLatestEvent() {
      return null;
    },
    async getEventsDB() {
      return {
        async getByPubkeyAndKind() {
          return null;
        },
        async getManyByPubkeysAndKind() {
          return [];
        },
        async getByReplaceKey() {
          return null;
        },
        async getByTagValue() {
          return [];
        },
        async getById() {
          return null;
        },
        async getAllByKind() {
          return [];
        },
        async listNegentropyEventRefs() {
          return [];
        },
        async recordRelayHint() {},
        async deleteByIds() {},
        async clearAll() {},
        async put(event: StoredEvent) {
          materialized.push(event);
          return true;
        },
        async putWithReconcile(event: StoredEvent) {
          materialized.push(event);
          return { stored: true, emissions: [] };
        },
        async putQuarantine(record: unknown) {
          quarantined.push(record);
        }
      };
    },
    async getRelaySession() {
      return relaySession as unknown;
    },
    createBackwardReq() {
      return { emit() {}, over() {} };
    },
    createForwardReq() {
      return { emit() {}, over() {} };
    },
    uniq() {
      return (source: Observable<unknown>) => source;
    },
    merge(...streams) {
      return new Observable((subscriber) => {
        const subscriptions = streams.map((stream) =>
          (stream as Observable<unknown>).subscribe({
            next: (value) => subscriber.next(value),
            error: (error) => subscriber.error(error),
            complete: () => {}
          })
        );
        return () => {
          for (const subscription of subscriptions) {
            subscription.unsubscribe();
          }
        };
      }) as unknown;
    },
    async getRelayConnectionState() {
      return null;
    },
    async observeRelayConnectionStates() {
      return { unsubscribe() {} };
    }
  };

  const coordinator = createResonoteCoordinator({
    runtime,
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
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    }
  });

  return { coordinator, materialized, quarantined, relaySession };
}

describe('@auftakt/resonote subscription visibility', () => {
  it('materializes comment subscription relay packets before consumer callbacks', async () => {
    const { coordinator, materialized, quarantined, relaySession } = createCoordinatorFixture();
    const refs = await coordinator.loadCommentSubscriptionDeps();
    const onPacket = vi.fn();

    startCommentSubscription(
      refs,
      [{ kinds: [1111], '#I': ['spotify:track:abc'] }],
      null,
      onPacket,
      vi.fn()
    );

    await waitFor(() => relaySession.observers.length > 0);
    relaySession.emit(0, invalidRelayEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onPacket).not.toHaveBeenCalled();

    const event = validEvent();
    relaySession.emit(0, event);
    await waitFor(() => onPacket.mock.calls.length === 1);

    expect(onPacket).toHaveBeenCalledWith(event, 'wss://relay.example');
    expect(materialized).toEqual([event]);
    expect(quarantined).toHaveLength(1);
  });

  it('materializes notification subscription relay packets before handlers run', async () => {
    const { coordinator, materialized, quarantined, relaySession } = createCoordinatorFixture();
    const onMentionPacket = vi.fn();

    await coordinator.subscribeNotificationStreams(
      {
        myPubkey: 'alice',
        follows: new Set(),
        mentionKinds: [1],
        followCommentKind: 1111,
        mentionSince: 0,
        followCommentSince: 0
      },
      {
        onMentionPacket,
        onFollowCommentPacket: vi.fn(),
        onError: vi.fn()
      }
    );

    await waitFor(() => relaySession.observers.length > 0);
    relaySession.emit(0, invalidRelayEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onMentionPacket).not.toHaveBeenCalled();

    const event = validEvent({ kind: 1, tags: [['p', 'alice']] });
    relaySession.emit(0, event);
    await waitFor(() => onMentionPacket.mock.calls.length === 1);

    expect(onMentionPacket).toHaveBeenCalledWith({ event, from: 'wss://relay.example' });
    expect(materialized).toEqual([event]);
    expect(quarantined).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/subscription-visibility.contract.test.ts
```

Expected before implementation: FAIL because subscription helpers can emit raw relay packets without the materialized runtime wrapper.

- [ ] **Step 3: Add the materialized subscription runtime wrapper**

In `packages/resonote/src/runtime.ts`, add this helper after `createRegistryBackedSessionRuntime()`:

```ts
function createMaterializedSubscriptionRuntime(
  runtime: SessionRuntime<StoredEvent>
): SessionRuntime<StoredEvent> {
  const materializationRuntime = runtime as unknown as EventMaterializationRuntime;

  return {
    fetchBackwardEvents: <TOutput = StoredEvent>(
      filters: readonly RuntimeFilter[],
      options?: FetchBackwardOptions
    ) => runtime.fetchBackwardEvents<TOutput>(filters, options),
    fetchBackwardFirst: <TOutput = StoredEvent>(
      filters: readonly RuntimeFilter[],
      options?: FetchBackwardOptions
    ) => runtime.fetchBackwardFirst<TOutput>(filters, options),
    fetchLatestEvent: (...args) => runtime.fetchLatestEvent(...args),
    getEventsDB: () => runtime.getEventsDB(),
    getRelaySession: async () => {
      const session = await runtime.getRelaySession();

      return {
        use: (req, options) =>
          new Observable<unknown>((observer) => {
            const pendingMaterializations = new Set<Promise<void>>();
            let settled:
              | { readonly type: 'complete' }
              | { readonly type: 'error'; readonly error: unknown }
              | null = null;
            let disposed = false;

            const finishIfIdle = () => {
              if (!settled || pendingMaterializations.size > 0 || disposed) return;
              if (settled.type === 'error') {
                observer.error(settled.error);
                return;
              }
              observer.complete();
            };

            const subscription = session.use(req, options).subscribe({
              next: (packet) => {
                const candidate = readRelayPacketCandidate(packet);
                if (!candidate) return;

                const task = (async () => {
                  const accepted = await ingestRelayCandidateForRuntime(materializationRuntime, {
                    event: candidate.event,
                    relayUrl: candidate.relayUrl
                  });
                  if (!accepted.ok || disposed) return;

                  observer.next({
                    ...candidate.packet,
                    event: accepted.event,
                    from: candidate.relayUrl || undefined
                  });
                })();

                pendingMaterializations.add(task);
                void task
                  .catch((error) => {
                    if (!disposed) observer.error(error);
                  })
                  .finally(() => {
                    pendingMaterializations.delete(task);
                    finishIfIdle();
                  });
              },
              complete: () => {
                settled = { type: 'complete' };
                finishIfIdle();
              },
              error: (error) => {
                settled = { type: 'error', error };
                finishIfIdle();
              }
            });

            return () => {
              disposed = true;
              subscription.unsubscribe();
              pendingMaterializations.clear();
            };
          })
      };
    },
    createBackwardReq: (options) => runtime.createBackwardReq(options),
    createForwardReq: (options) => runtime.createForwardReq(options),
    uniq: () => runtime.uniq(),
    merge: (...streams) => runtime.merge(...streams),
    getRelayConnectionState: (url) => runtime.getRelayConnectionState(url),
    observeRelayConnectionStates: (onPacket) => runtime.observeRelayConnectionStates(onPacket)
  };
}

function readRelayPacketCandidate(packet: unknown): {
  readonly packet: Record<string, unknown>;
  readonly event: unknown;
  readonly relayUrl: string;
} | null {
  if (typeof packet !== 'object' || packet === null || !('event' in packet)) {
    return null;
  }

  const record = packet as Record<string, unknown>;
  return {
    packet: record,
    event: record.event,
    relayUrl: typeof record.from === 'string' ? record.from : ''
  };
}
```

- [ ] **Step 4: Route subscription entry points through the wrapper**

In `createResonoteCoordinator()`, create the wrapper after `registrySessionRuntime`:

```ts
const materializedSubscriptionRuntime =
  createMaterializedSubscriptionRuntime(registrySessionRuntime);
```

Use `materializedSubscriptionRuntime` for notification and comments subscription dependencies:

```ts
return subscribeDualFilterStreams(
  materializedSubscriptionRuntime,
  {
    primaryFilter: {
      kinds: [...options.mentionKinds],
      '#p': [options.myPubkey],
      since: options.mentionSince
    },
    secondaryFilters
  },
  {
    onPrimaryPacket: handlers.onMentionPacket,
    onSecondaryPacket: handlers.onFollowCommentPacket,
    onError: handlers.onError
  }
);
```

For the comments built-in plugin, use:

```ts
createResonoteCommentsFlowPlugin({
  loadCommentSubscriptionDeps: () => loadEventSubscriptionDeps(materializedSubscriptionRuntime),
  buildCommentContentFilters,
  startCommentSubscription,
  startMergedCommentSubscription,
  startCommentDeletionReconcile
});
```

For exported helpers at the bottom of `runtime.ts`, wrap the registry runtime:

```ts
export async function loadCommentSubscriptionDeps(
  runtime: SessionRuntime
): Promise<CommentSubscriptionRefs> {
  return loadEventSubscriptionDeps(
    createMaterializedSubscriptionRuntime(
      createRegistryBackedSessionRuntime(runtime as SessionRuntime<StoredEvent>)
    )
  );
}
```

```ts
return subscribeDualFilterStreams(
  createMaterializedSubscriptionRuntime(
    createRegistryBackedSessionRuntime(runtime as SessionRuntime<StoredEvent>)
  ),
  {
    primaryFilter: {
      kinds: [...options.mentionKinds],
      '#p': [options.myPubkey],
      since: options.mentionSince
    },
    secondaryFilters
  },
  {
    onPrimaryPacket: handlers.onMentionPacket,
    onSecondaryPacket: handlers.onFollowCommentPacket,
    onError: handlers.onError
  }
);
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run packages/resonote/src/subscription-visibility.contract.test.ts
```

Expected: PASS with 2 tests.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/subscription-visibility.contract.test.ts
git commit -m "test(auftakt): guard materialized subscription visibility"
```

## Task 2: Pin Backward Reads Without Raw Runtime Helpers

**Files:**

- Modify: `packages/resonote/src/built-in-plugins.contract.test.ts`

- [ ] **Step 1: Update the coordinator backward read regression test**

In `packages/resonote/src/built-in-plugins.contract.test.ts`, keep the existing `exposes coordinator-owned backward reads that materialize relay events` test, but remove the raw runtime helper methods from the fixture. The runtime object in that test should start like this:

```ts
runtime: {
  fetchLatestEvent: async () => null,
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
    putWithReconcile: async (event) => {
      materialized.push(event);
      return { stored: true, emissions: [] };
    }
  }),
  getRelaySession: async () => ({
    use: () => ({
      subscribe: (observer: {
        next?: (packet: { event: unknown; from?: string }) => void;
        complete?: () => void;
      }) => {
        queueMicrotask(() => {
          observer.next?.({ event: relayEvent, from: 'wss://relay.example' });
          observer.complete?.();
        });
        return { unsubscribe() {} };
      }
    })
  }),
  createBackwardReq: () => ({ emit() {}, over() {} }),
  createForwardReq: () => ({ emit() {}, over() {} }),
  uniq: () => ({}) as unknown,
  merge: () => ({}) as unknown,
  getRelayConnectionState: async () => null,
  observeRelayConnectionStates: async () => ({ unsubscribe() {} })
}
```

The assertion remains:

```ts
const events = await coordinator.fetchBackwardEvents<typeof relayEvent>([{ kinds: [1] }]);

expect(events).toEqual([relayEvent]);
expect(materialized).toEqual([relayEvent]);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/built-in-plugins.contract.test.ts
```

Expected before Task 3: FAIL or type-check fail once `ResonoteRuntime` is narrowed, because runtime backward reads are not fully coordinator-owned yet.

- [ ] **Step 3: Commit only if the test is red for the intended reason**

Do not commit this task by itself if it leaves the test suite red. Keep the edit staged or unstaged and continue to Task 3.

## Task 3: Route Runtime Backward Reads Through `EventCoordinator.read()`

**Files:**

- Modify: `packages/resonote/src/runtime.ts`

- [ ] **Step 1: Extend the coordinator runtime DB shape**

In `packages/resonote/src/runtime.ts`, update `CoordinatorReadRuntime.getEventsDB()` so it includes the local visibility APIs required by `EventCoordinatorStore`:

```ts
interface CoordinatorReadRuntime {
  getEventsDB(): Promise<{
    getById(id: string): Promise<StoredEvent | null>;
    getByPubkeyAndKind(pubkey: string, kind: number): Promise<StoredEvent | null>;
    getAllByKind(kind: number): Promise<StoredEvent[]>;
    getByTagValue(tagQuery: string, kind?: number): Promise<StoredEvent[]>;
    listNegentropyEventRefs(): Promise<NegentropyEventRef[]>;
    putQuarantine?(record: QuarantineRecord): Promise<void>;
    put(event: StoredEvent): Promise<unknown>;
    putWithReconcile?(event: StoredEvent): Promise<{
      stored: boolean;
      emissions: ReconcileEmission[];
    }>;
    recordRelayHint?(hint: {
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }): Promise<void>;
  }>;
  getRelaySession(): Promise<NegentropySessionRuntime>;
  createBackwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): {
    emit(input: unknown): void;
    over(): void;
  };
}
```

Also delete the separate `BackwardFetchRuntime` interface after the new helper is in place; `CoordinatorReadRuntime` becomes the single runtime type for coordinator-owned reads.

- [ ] **Step 2: Add reusable runtime coordinator helpers**

Add `validateRelayEvent` to the existing `@auftakt/core` import in `packages/resonote/src/runtime.ts`:

```ts
import {
  buildRequestExecutionPlan,
  cacheEvent,
  createNegentropyRepairRequestKey,
  createRuntimeRequestKey,
  validateRelayEvent,
  type EventSubscriptionRefs as CommentSubscriptionRefs,
  fetchEventById,
  fetchFollowGraph,
  fetchLatestEventsForKinds,
  fetchReplaceableEventsByAuthorsAndKind,
  filterNegentropyEventRefs,
  type LatestEventSnapshot,
  loadEventSubscriptionDeps,
  type NegentropyEventRef,
  observeRelayStatuses as observeRelayStatusesImpl,
  type OfflineDeliveryDecision,
  type QueryRuntime,
  type ReconcileEmission,
  reconcileNegentropyRepairSubjects,
  reconcileReplayRepairSubjects,
  reduceReadSettlement,
  type RelayRequestLike,
  type RelaySessionLike,
  REPAIR_REQUEST_COALESCING_SCOPE,
  type SessionRuntime,
  snapshotRelayStatuses as snapshotRelayStatusesImpl,
  sortNegentropyEventRefsAsc,
  startBackfillAndLiveSubscription,
  startDeletionReconcile as startDeletionReconcileImpl,
  startMergedLiveSubscription,
  subscribeDualFilterStreams,
  type SubscriptionHandle,
  type SubscriptionLike
} from '@auftakt/core';
```

Add these helpers near `ingestRelayCandidateForRuntime()`. `acceptRelayCandidateForRuntime()` validates and quarantines only; `EventCoordinator.materialize()` remains the single write path for coordinator reads.

```ts
function getRawRelayEventId(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const id = (event as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

async function acceptRelayCandidateForRuntime(
  runtime: EventMaterializationRuntime,
  candidate: { readonly event: unknown; readonly relayUrl: string }
): Promise<{ readonly ok: true; readonly event: StoredEvent } | { readonly ok: false }> {
  const validation = await validateRelayEvent(candidate.event);
  if (!validation.ok) {
    await quarantineRelayEvent(runtime, {
      relayUrl: candidate.relayUrl,
      eventId: getRawRelayEventId(candidate.event),
      reason: validation.reason,
      rawEvent: candidate.event
    });
    return { ok: false };
  }

  return { ok: true, event: validation.event };
}

function createCoordinatorStore(runtime: CoordinatorReadRuntime) {
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
    putWithReconcile: async (event: StoredEvent) => materializeIncomingEvent(runtime, event),
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

function createRuntimeEventCoordinator(
  runtime: CoordinatorReadRuntime,
  readOptions?: Pick<FetchBackwardOptions, 'overlay' | 'timeoutMs'>
) {
  return createEventCoordinator({
    materializerQueue: createMaterializerQueue(),
    relayGateway: {
      verify: async (filters, verifyOptions) => {
        const candidates = await fetchRelayCandidateEventsFromRuntime(runtime, filters, {
          overlay: readOptions?.overlay,
          timeoutMs: readOptions?.timeoutMs,
          scope: `coordinator:runtime-read:${verifyOptions.reason}`
        });
        return { candidates };
      }
    },
    ingestRelayCandidate: (candidate) => acceptRelayCandidateForRuntime(runtime, candidate),
    store: createCoordinatorStore(runtime),
    relay: {
      verify: async () => []
    }
  });
}
```

- [ ] **Step 3: Add relay candidate collection for runtime reads**

Add this helper near `fetchRelayCandidateEventsFromRelay()`:

```ts
async function fetchRelayCandidateEventsFromRuntime(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options: {
    readonly overlay?: RelayReadOverlayOptions;
    readonly timeoutMs?: number;
    readonly scope: string;
  }
): Promise<Array<{ event: unknown; relayUrl: string }>> {
  if (filters.length === 0) return [];

  const relaySession = await runtime.getRelaySession();
  const req = runtime.createBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      filters,
      overlay: options.overlay,
      scope: options.scope
    })
  });
  const candidates: Array<{ event: unknown; relayUrl: string }> = [];
  const useOptions =
    options.overlay && options.overlay.relays.length > 0
      ? {
          on: {
            relays: options.overlay.relays,
            defaultReadRelays: options.overlay.includeDefaultReadRelays ?? true
          }
        }
      : undefined;

  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => finish(), options.timeoutMs ?? 10_000);
    const sub = relaySession.use(req, useOptions).subscribe({
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

- [ ] **Step 4: Replace `fetchBackwardEventsFromReadRuntime()`**

Replace the existing direct raw-session body with:

```ts
async function fetchBackwardEventsFromReadRuntime<TEvent>(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent[]> {
  const coordinator = createRuntimeEventCoordinator(runtime, options);
  const result = await coordinator.read([...filters], { policy: 'localFirst' });

  if (options?.rejectOnError && result.settlement.phase !== 'settled') {
    throw new Error('Relay read did not settle');
  }

  return result.events as TEvent[];
}
```

- [ ] **Step 5: Remove direct raw packet materialization from backward reads**

After replacing `fetchBackwardEventsFromReadRuntime()`, this search must return no matches inside that function body:

```bash
rg -n "function fetchBackwardEventsFromReadRuntime|packet\\.event|ingestRelayEvent\\(" packages/resonote/src/runtime.ts
```

Expected: `ingestRelayEvent(` can still appear in `ingestRelayCandidateForRuntime()`, cached by-id, and repair code, but not inside `fetchBackwardEventsFromReadRuntime()`.

- [ ] **Step 6: Run focused package tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/built-in-plugins.contract.test.ts packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/relay-repair.contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2 and Task 3 together**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/built-in-plugins.contract.test.ts
git commit -m "refactor(auftakt): route runtime reads through event coordinator"
```

## Task 4: Remove Raw Backward Helpers From `ResonoteRuntime`

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/plugin-api.contract.test.ts`
- Modify: `packages/resonote/src/plugin-isolation.contract.test.ts`
- Modify: `packages/resonote/src/relay-repair.contract.test.ts`
- Modify: `packages/resonote/src/subscription-registry.contract.test.ts`
- Modify: `packages/resonote/src/subscription-visibility.contract.test.ts`
- Modify any additional file reported by the search in Step 2.

- [ ] **Step 1: Narrow `ResonoteRuntime`**

In `packages/resonote/src/runtime.ts`, remove these methods from `export interface ResonoteRuntime`:

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

Keep `ResonoteCoordinator.fetchBackwardEvents()` and `ResonoteCoordinator.fetchBackwardFirst()` unchanged.

- [ ] **Step 2: Find fixtures that still include removed methods**

Run:

```bash
rg -n "fetchBackwardEvents|fetchBackwardFirst" packages/resonote/src/*.test.ts packages/resonote/src/*.contract.test.ts
```

Expected before cleanup: matches in test fixtures that construct `ResonoteRuntime`.

- [ ] **Step 3: Remove fixture-only raw helpers**

In each fixture object typed as `ResonoteRuntime`, delete properties that only return empty results:

```ts
async fetchBackwardEvents() {
  return [];
},
async fetchBackwardFirst() {
  return null;
},
```

Also delete object-literal properties with the same purpose:

```ts
fetchBackwardEvents: async () => [],
fetchBackwardFirst: async () => null,
```

Do not delete `fetchBackwardEvents` or `fetchBackwardFirst` on `QueryRuntime`, `ResonoteCoordinator`, helper exports, or tests that intentionally call `coordinator.fetchBackwardEvents()`.

- [ ] **Step 4: Run TypeScript and package checks**

Run:

```bash
pnpm run check
pnpm run test:auftakt:resonote
```

Expected: both commands PASS. `pnpm run check` proves the narrowed interface no longer requires raw backward helpers and no excess fixture properties remain.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/*.contract.test.ts packages/resonote/src/*.test.ts
git commit -m "refactor(auftakt): remove raw backward read runtime contract"
```

## Task 5: Align Docs And Strict Closure Notes

**Files:**

- Modify: `docs/superpowers/plans/2026-04-25-auftakt-strict-coordinator-surface.md`
- Modify: `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md` only if Task 3 changes the audit status wording.

- [ ] **Step 1: Mark retired cached-query steps as superseded**

In `docs/superpowers/plans/2026-04-25-auftakt-strict-coordinator-surface.md`, add this note under `## Task 5: Move Shared Nostr Bridges Behind The Facade`:

```md
> Status note: `src/shared/nostr/cached-query.*` was retired by the cached read
> bridge cleanup. The remaining bridge proof is `src/shared/nostr/query.ts`
> delegating backward reads to `$shared/auftakt/resonote.js`; cached read
> behavior is covered under `src/shared/auftakt/cached-read.*`.
```

- [ ] **Step 2: Verify no active cached-query files are expected**

Run:

```bash
git ls-files src/shared/nostr | rg 'cached-query' || true
```

Expected: no output.

- [ ] **Step 3: Run strict closure**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: PASS.

- [ ] **Step 4: Commit Task 5**

Run:

```bash
git add docs/superpowers/plans/2026-04-25-auftakt-strict-coordinator-surface.md docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md
git commit -m "docs(auftakt): close coordinator surface plan status"
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
pnpm exec vitest run src/shared/nostr/query.test.ts
pnpm run check
git status --short
```

Expected:

- `check:auftakt:nips` exits 0.
- `check:auftakt:strict-closure` exits 0.
- migration proof prints `Status: COMPLETE`.
- core, storage, and resonote package tests pass.
- `src/shared/nostr/query.test.ts` passes.
- `pnpm run check` exits 0.
- `git status --short` shows no unstaged implementation files from this remaining plan.

## Self-Review Checklist

- Coordinator-owned read path: Task 3 replaces the raw-session body of `fetchBackwardEventsFromReadRuntime()` with `EventCoordinator.read()`.
- Coordinator-owned subscription path: Task 1 keeps subscription callbacks behind validated and materialized relay candidates.
- Runtime contract cleanup: Task 4 removes `fetchBackwardEvents()` and `fetchBackwardFirst()` from `ResonoteRuntime` while preserving coordinator and facade read helpers.
- Cached bridge status: Task 5 documents that `cached-query.*` was retired and is not an active remaining implementation target.
- Verification: final commands include NIP matrix, strict closure, migration proof, package tests, shared query test, and `pnpm run check`.
