# Auftakt Relay Selection Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish relay selection routing so coordinator-owned policy is configurable, by-id relay hints go through the planner, publish routing accepts minimal `EventParameters`, and the existing closure guarantees remain intact.

**Architecture:** Keep generic routing vocabulary and manual plan construction in `@auftakt/core`. Keep `@auftakt/resonote` coordinator-owned routing as the default behavior, with an optional `relaySelectionPolicy` on `createResonoteCoordinator()` and explicit safe overlays/options as the manual escape hatch. Do not expose DB-backed routing helpers or raw relay/storage internals from the Resonote package root.

**Tech Stack:** TypeScript, Vitest, SvelteKit type checking, `@auftakt/core`, `@auftakt/resonote`, RxJS.

---

## Scope Check

This plan implements the approved completion spec at
`docs/superpowers/specs/2026-04-26-auftakt-relay-selection-completion-design.md`.

The plan is one focused subsystem: relay selection completion. It does not add a
relay settings UI, does not redesign repair transport, and does not expose raw
relay sessions or raw storage handles.

## File Structure

- Modify `packages/resonote/src/relay-selection-runtime.ts`
  - Accept event-parameter-shaped publish inputs where `tags`, `id`, and
    `pubkey` are optional.
  - Normalize missing `tags` to `[]` before collecting audience candidates.
- Modify `packages/resonote/src/relay-selection-runtime.contract.test.ts`
  - Add publish input normalization coverage.
  - Add by-id hint planner integration coverage.
  - Add coordinator read policy override coverage.
  - Add repair-interoperable overlay coverage.
- Modify `packages/resonote/src/relay-routing-publish.contract.test.ts`
  - Add coordinator publish policy override coverage.
- Modify `packages/resonote/src/subscription-visibility.contract.test.ts`
  - Capture subscription transport options.
  - Add subscription policy override coverage.
- Modify `packages/resonote/src/runtime.ts`
  - Add `relaySelectionPolicy?: RelaySelectionPolicyOptions` to
    `CreateResonoteCoordinatorOptions`.
  - Pass the resolved policy through read, subscription, by-id read, and publish
    routing.
  - Convert by-id `relayHints` to temporary planner inputs instead of direct
    overlays.
  - Format the touched import area.
- Modify `packages/resonote/src/public-api.contract.test.ts`
  - Keep existing raw routing helper closure assertions; add no public helper
    exports.
- No changes to `packages/core/src/relay-selection.ts` are expected. Core already
  exposes the pure planner for manual routing.

---

### Task 1: Accept Minimal Publish Event Parameters

**Files:**

- Modify: `packages/resonote/src/relay-selection-runtime.contract.test.ts`
- Modify: `packages/resonote/src/relay-selection-runtime.ts`

- [ ] **Step 1: Add the failing contract for missing publish tags**

Append this test inside the `resonote relay selection runtime` describe block in
`packages/resonote/src/relay-selection-runtime.contract.test.ts`, immediately
after the test named `builds publish options for unsigned event parameters
without author relay lookup`:

```ts
it('builds publish options when event parameters omit tags and pubkey', async () => {
  const runtime = createRuntimeFixture();

  const options = await buildPublishRelaySendOptions(runtime, {
    event: {
      kind: 1
    },
    policy
  });

  expect(runtime.getByPubkeyAndKind).not.toHaveBeenCalled();
  expect(options).toEqual({
    on: {
      relays: ['wss://default.example/'],
      defaultWriteRelays: false
    }
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the type failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts
```

Expected: FAIL because `buildPublishRelaySendOptions()` still requires
`event.tags`.

- [ ] **Step 3: Add an internal publish-event input type**

In `packages/resonote/src/relay-selection-runtime.ts`, add this interface after
`PublishRelaySendOptions`:

```ts
export interface RelaySelectionPublishEvent {
  readonly kind: number;
  readonly tags?: readonly (readonly string[])[];
  readonly id?: string;
  readonly pubkey?: string;
}
```

- [ ] **Step 4: Make publish routing normalize optional tags**

Replace the `buildPublishRelaySendOptions()` input type and the tag reads in
`packages/resonote/src/relay-selection-runtime.ts` with this version:

```ts
export async function buildPublishRelaySendOptions(
  runtime: RelaySelectionRuntime,
  input: {
    readonly event: RelaySelectionPublishEvent;
    readonly policy?: RelaySelectionPolicyOptions;
  }
): Promise<PublishRelaySendOptions | undefined> {
  const policy = input.policy ?? RESONOTE_DEFAULT_RELAY_SELECTION_POLICY;
  const db = await runtime.getEventsDB();
  const tags = input.event.tags ?? [];
  const candidates: RelaySelectionCandidate[] = [];

  candidates.push(...(await defaultCandidates(runtime, 'write')));
  if (typeof input.event.pubkey === 'string') {
    candidates.push(...(await authorWriteCandidates(db, input.event.pubkey)));
  }

  for (const eventId of collectTagValues(tags, new Set(['e', 'q']))) {
    candidates.push(...(await durableHintCandidates(db, eventId, 'write')));
  }
  for (const relay of collectExplicitRelayHints(tags)) {
    candidates.push({ relay, source: 'audience', role: 'write' });
  }
  for (const pubkey of collectTagValues(tags, new Set(['p']))) {
    if (typeof input.event.pubkey === 'string' && pubkey === input.event.pubkey) continue;
    candidates.push(...(await audienceRelayCandidates(db, pubkey)));
  }

  const plan = buildRelaySelectionPlan({
    intent: publishIntentForKind(input.event.kind, tags),
    policy,
    candidates
  });
  const relays = [...plan.writeRelays, ...plan.temporaryRelays];
  if (relays.length === 0) return undefined;

  return {
    on: {
      relays,
      defaultWriteRelays: false
    }
  };
}
```

- [ ] **Step 5: Run the focused test and type check**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts
pnpm run check
```

Expected: the focused test passes. `pnpm run check` may still fail if later
tasks have not formatted `runtime.ts`, but the previous `EventParameters.tags`
type errors at `packages/resonote/src/runtime.ts:2202` and
`packages/resonote/src/runtime.ts:2214` are gone.

- [ ] **Step 6: Commit publish input normalization**

Run:

```bash
git add packages/resonote/src/relay-selection-runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts
git commit -m "fix(auftakt): accept minimal publish routing inputs"
```

---

### Task 2: Add Coordinator Relay Selection Policy Configuration

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/relay-selection-runtime.contract.test.ts`
- Modify: `packages/resonote/src/relay-routing-publish.contract.test.ts`
- Modify: `packages/resonote/src/subscription-visibility.contract.test.ts`

- [ ] **Step 1: Add a failing read policy override contract**

Append this test inside the `coordinator read relay selection integration`
describe block in `packages/resonote/src/relay-selection-runtime.contract.test.ts`:

```ts
it('applies coordinator relay selection policy overrides to by-id reads', async () => {
  const createdRequests: Array<{ options: unknown; emitted: unknown[] }> = [];
  const runtime = {
    async fetchLatestEvent() {
      return null;
    },
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        getByPubkeyAndKind: async () => null,
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async () => null,
        getByTagValue: async () => [],
        getById: async () => null,
        getAllByKind: async () => [],
        listNegentropyEventRefs: async () => [],
        getRelayHints: async () => [
          {
            eventId: 'target',
            relayUrl: 'wss://durable.example',
            source: 'seen' as const,
            lastSeenAt: 1
          }
        ],
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async () => ({ stored: true, emissions: [] })
      };
    },
    async getRelaySession() {
      return {
        use(_req: { emit(input: unknown): void }, options: unknown) {
          const entry = { options, emitted: [] as unknown[] };
          createdRequests.push(entry);
          return {
            subscribe(observer: { complete?: () => void }) {
              queueMicrotask(() => observer.complete?.());
              return { unsubscribe() {} };
            }
          };
        }
      };
    },
    createBackwardReq() {
      return {
        emit(input: unknown) {
          createdRequests.at(-1)?.emitted.push(input);
        },
        over() {}
      };
    },
    createForwardReq() {
      return { emit() {}, over() {} };
    },
    uniq: () => ({}) as unknown,
    merge: () => ({}) as unknown,
    getRelayConnectionState: async () => null,
    observeRelayConnectionStates: async () => ({ unsubscribe() {} })
  };

  const coordinator = createResonoteCoordinator({
    runtime,
    relaySelectionPolicy: { strategy: 'default-only' },
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: { useCachedLatest: () => null },
    publishTransportRuntime: { castSigned: async () => {} },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    }
  });

  await coordinator.fetchNostrEventById('target', ['wss://temporary.example']);

  expect(createdRequests[0]?.options).toEqual({
    on: {
      relays: ['wss://default.example/'],
      defaultReadRelays: false
    }
  });
});
```

- [ ] **Step 2: Add a failing publish policy override contract**

Append this test inside the `coordinator publish relay routing` describe block
in `packages/resonote/src/relay-routing-publish.contract.test.ts`:

```ts
it('applies coordinator relay selection policy overrides to publish routing', async () => {
  const castSigned = vi.fn(async () => {});
  const event = {
    id: 'reply',
    pubkey: 'alice',
    created_at: 10,
    kind: 1111,
    tags: [['e', 'target', 'wss://explicit-target.example']],
    content: 'reply',
    sig: 'sig'
  } satisfies NostrEvent;

  const coordinator = createResonoteCoordinator({
    runtime: createRuntime(),
    relaySelectionPolicy: { strategy: 'default-only' },
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: { useCachedLatest: () => null },
    publishTransportRuntime: { castSigned },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    }
  });

  await coordinator.publishSignedEvent(event as EventParameters);

  expect(castSigned).toHaveBeenCalledWith(event, {
    on: {
      relays: ['wss://default.example/'],
      defaultWriteRelays: false
    }
  });
});
```

- [ ] **Step 3: Add a failing subscription policy override contract**

In `packages/resonote/src/subscription-visibility.contract.test.ts`, change
`CapturingRelaySession` to capture use options:

```ts
class CapturingRelaySession {
  readonly observers: RelayObserver[] = [];
  readonly useOptions: unknown[] = [];

  use(_req?: unknown, options?: unknown): Observable<{ event: unknown; from?: string }> {
    this.useOptions.push(options);
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
```

Change `createCoordinatorFixture()` to accept a relay selection policy and expose
default relays:

```ts
function createCoordinatorFixture(options: {
  relaySelectionPolicy?: Parameters<typeof createResonoteCoordinator>[0]['relaySelectionPolicy'];
} = {}) {
  const relaySession = new CapturingRelaySession();
  const materialized: StoredEvent[] = [];
  const quarantined: unknown[] = [];
  const runtime: ResonoteRuntime = {
    async fetchLatestEvent() {
      return null;
    },
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
```

Then pass the option into `createResonoteCoordinator()`:

```ts
  const coordinator = createResonoteCoordinator({
    runtime,
    relaySelectionPolicy: options.relaySelectionPolicy,
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
```

Append this test inside the `@auftakt/resonote subscription visibility` describe block:

```ts
it('applies coordinator relay selection policy overrides to subscription routing', async () => {
  const { coordinator, relaySession } = createCoordinatorFixture({
    relaySelectionPolicy: {
      strategy: 'default-only',
      includeDefaultFallback: false
    }
  });
  const refs = await coordinator.loadCommentSubscriptionDeps();

  startCommentSubscription(
    refs,
    [{ kinds: [1111], '#I': ['spotify:track:abc'] }],
    null,
    vi.fn(),
    vi.fn()
  );

  await waitFor(() => relaySession.useOptions.length > 0);

  expect(relaySession.useOptions[0]).toBeUndefined();
});
```

- [ ] **Step 4: Run policy override tests and confirm failures**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/subscription-visibility.contract.test.ts
```

Expected: FAIL because `relaySelectionPolicy` is not yet accepted or used.

- [ ] **Step 5: Import the policy type and format the relay-selection import**

In `packages/resonote/src/runtime.ts`, add `RelaySelectionPolicyOptions` to the
existing type import from `@auftakt/core`:

```ts
import type {
  NamedRegistration,
  NamedRegistrationRegistry,
  NegentropyTransportResult,
  ProjectionDefinition,
  ReadSettlement,
  ReadSettlementLocalProvenance,
  RelayCapabilityLearningEvent,
  RelayCapabilityPacket,
  RelayCapabilityRecord,
  RelayCapabilitySnapshot,
  RelayExecutionCapability,
  RelayObservationPacket,
  RelayObservationRuntime,
  RelayObservationSnapshot,
  RelaySelectionPolicyOptions,
  RequestKey,
  StoredEvent
} from '@auftakt/core';
```

Replace the malformed relay-selection import with:

```ts
import {
  buildPublishRelaySendOptions,
  buildReadRelayOverlay,
  type PublishRelaySendOptions,
  RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
} from './relay-selection-runtime.js';
```

- [ ] **Step 6: Add the coordinator option**

In `packages/resonote/src/runtime.ts`, add the option to
`CreateResonoteCoordinatorOptions`:

```ts
export interface CreateResonoteCoordinatorOptions<TResult, TLatestResult> {
  readonly runtime: ResonoteRuntime;
  readonly cachedFetchByIdRuntime: Pick<
    CachedFetchByIdRuntime<TResult>,
    'cachedFetchById' | 'invalidateFetchByIdCache'
  >;
  readonly cachedLatestRuntime: Pick<CachedLatestRuntime<TLatestResult>, 'useCachedLatest'>;
  readonly publishTransportRuntime: Pick<PublishRuntime, 'castSigned' | 'observePublishAcks'>;
  readonly pendingPublishQueueRuntime: PendingPublishQueueRuntime;
  readonly relayStatusRuntime: RelayStatusRuntime;
  readonly relayCapabilityRuntime?: RelayCapabilityRuntime;
  readonly relaySelectionPolicy?: RelaySelectionPolicyOptions;
}
```

- [ ] **Step 7: Thread policy through read option resolution**

Replace `fetchBackwardEventsFromReadRuntime()` and `resolveReadOptions()` in
`packages/resonote/src/runtime.ts` with:

```ts
async function fetchBackwardEventsFromReadRuntime<TEvent>(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions,
  relaySelectionPolicy: RelaySelectionPolicyOptions = RESONOTE_DEFAULT_RELAY_SELECTION_POLICY,
  temporaryRelays: readonly string[] = []
): Promise<TEvent[]> {
  const resolvedOptions = await resolveReadOptions(
    runtime,
    filters,
    options,
    'read',
    relaySelectionPolicy,
    temporaryRelays
  );
  const coordinator = createRuntimeEventCoordinator(runtime, resolvedOptions);
  const result = await coordinator.read([...filters], { policy: 'localFirst' });

  if (resolvedOptions?.rejectOnError && result.settlement.phase !== 'settled') {
    throw new Error('Relay read did not settle');
  }

  return result.events as TEvent[];
}

async function resolveReadOptions(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options: FetchBackwardOptions | undefined,
  intent: 'read' | 'subscribe' | 'repair',
  relaySelectionPolicy: RelaySelectionPolicyOptions = RESONOTE_DEFAULT_RELAY_SELECTION_POLICY,
  temporaryRelays: readonly string[] = []
): Promise<FetchBackwardOptions | undefined> {
  if (options?.overlay) return options;

  const overlay = await buildReadRelayOverlay(runtime, {
    intent,
    filters,
    temporaryRelays,
    policy: relaySelectionPolicy
  });

  if (!overlay) return options;
  return {
    ...options,
    overlay
  };
}
```

- [ ] **Step 8: Thread policy through subscription registry creation**

Replace the subscription registry WeakMap declaration and helper functions in
`packages/resonote/src/runtime.ts` with this policy-keyed version:

```ts
const subscriptionRegistries = new WeakMap<
  SessionRuntime<StoredEvent>,
  Map<string, CoordinatorSubscriptionRegistry>
>();
```

Change the registry constructor:

```ts
class CoordinatorSubscriptionRegistry {
  private readonly entries = new Map<string, SharedSubscriptionEntry>();
  private rawSessionPromise: Promise<RelaySessionLike> | null = null;

  constructor(
    private readonly runtime: SessionRuntime<StoredEvent>,
    private readonly relaySelectionPolicy: RelaySelectionPolicyOptions = RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
  ) {}
```

Change `resolveUseOptions()` to use `this.relaySelectionPolicy`:

```ts
const overlay = await buildReadRelayOverlay(this.runtime, {
  intent: 'subscribe',
  filters: entry.filters,
  policy: this.relaySelectionPolicy
});
```

Replace `getCoordinatorSubscriptionRegistry()` and
`createRegistryBackedSessionRuntime()` with:

```ts
function getCoordinatorSubscriptionRegistry(
  runtime: SessionRuntime<StoredEvent>,
  relaySelectionPolicy: RelaySelectionPolicyOptions = RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
): CoordinatorSubscriptionRegistry {
  const policyKey = relaySelectionPolicyRegistryKey(relaySelectionPolicy);
  const byPolicy = subscriptionRegistries.get(runtime) ?? new Map<string, CoordinatorSubscriptionRegistry>();
  const existing = byPolicy.get(policyKey);
  if (existing) return existing;

  const registry = new CoordinatorSubscriptionRegistry(runtime, relaySelectionPolicy);
  byPolicy.set(policyKey, registry);
  subscriptionRegistries.set(runtime, byPolicy);
  return registry;
}

function relaySelectionPolicyRegistryKey(policy: RelaySelectionPolicyOptions): string {
  return JSON.stringify({
    strategy: policy.strategy,
    maxReadRelays: policy.maxReadRelays ?? null,
    maxWriteRelays: policy.maxWriteRelays ?? null,
    maxTemporaryRelays: policy.maxTemporaryRelays ?? null,
    maxAudienceRelays: policy.maxAudienceRelays ?? null,
    includeDefaultFallback: policy.includeDefaultFallback ?? null,
    allowTemporaryHints: policy.allowTemporaryHints ?? null,
    includeDurableHints: policy.includeDurableHints ?? null,
    includeAudienceRelays: policy.includeAudienceRelays ?? null
  });
}

function createRegistryBackedSessionRuntime(
  runtime: SessionRuntime<StoredEvent>,
  relaySelectionPolicy: RelaySelectionPolicyOptions = RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
): SessionRuntime<StoredEvent> {
  const registry = getCoordinatorSubscriptionRegistry(runtime, relaySelectionPolicy);
```

Inside `createRegistryBackedSessionRuntime()`, pass the policy to the two
`fetchBackwardEventsFromReadRuntime()` calls:

```ts
      fetchBackwardEventsFromReadRuntime<TOutput>(
        runtime as unknown as CoordinatorReadRuntime,
        filters,
        options,
        relaySelectionPolicy
      ),
```

```ts
const events = await fetchBackwardEventsFromReadRuntime<TOutput>(
  runtime as unknown as CoordinatorReadRuntime,
  filters,
  options,
  relaySelectionPolicy
);
```

- [ ] **Step 9: Resolve the coordinator policy once**

In `packages/resonote/src/runtime.ts`, change the `createResonoteCoordinator()`
parameter destructuring to include `relaySelectionPolicy`, and add a local
resolved policy:

```ts
export function createResonoteCoordinator<TResult, TLatestResult>({
  runtime,
  cachedFetchByIdRuntime,
  cachedLatestRuntime,
  publishTransportRuntime,
  pendingPublishQueueRuntime,
  relayStatusRuntime,
  relayCapabilityRuntime,
  relaySelectionPolicy: configuredRelaySelectionPolicy
}: CreateResonoteCoordinatorOptions<TResult, TLatestResult>): ResonoteCoordinator<
  TResult,
  TLatestResult
> {
  const relaySelectionPolicy =
    configuredRelaySelectionPolicy ?? RESONOTE_DEFAULT_RELAY_SELECTION_POLICY;
  const coordinatorReadRuntime = runtime as unknown as CoordinatorReadRuntime;
```

Pass the policy into coordinator-owned read wrappers:

```ts
      fetchBackwardEventsFromReadRuntime<TOutput>(
        coordinatorReadRuntime,
        filters,
        cloneFetchBackwardOptions(options),
        relaySelectionPolicy
      ),
```

```ts
const events = await fetchBackwardEventsFromReadRuntime<TOutput>(
  coordinatorReadRuntime,
  filters,
  cloneFetchBackwardOptions(options),
  relaySelectionPolicy
);
```

Create the registry-backed runtime with the same policy:

```ts
const registrySessionRuntime = createRegistryBackedSessionRuntime(
  sessionRuntime,
  relaySelectionPolicy
);
```

Pass the policy into publish routing:

```ts
await buildPublishRelaySendOptions(runtime, {
  event: params,
  policy: relaySelectionPolicy
});
```

```ts
buildPublishRelaySendOptions(runtime, {
  event,
  policy: relaySelectionPolicy
});
```

- [ ] **Step 10: Run policy override tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/subscription-visibility.contract.test.ts
```

Expected: the new policy override tests pass except the by-id relay hints test
added in the next task is not present yet.

- [ ] **Step 11: Commit coordinator policy configuration**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/subscription-visibility.contract.test.ts
git commit -m "feat(auftakt): configure coordinator relay selection policy"
```

---

### Task 3: Route By-Id Relay Hints Through The Planner

**Files:**

- Modify: `packages/resonote/src/relay-selection-runtime.contract.test.ts`
- Modify: `packages/resonote/src/runtime.ts`

- [ ] **Step 1: Add a failing contract for explicit by-id relay hints**

Append this test inside the `coordinator read relay selection integration`
describe block in `packages/resonote/src/relay-selection-runtime.contract.test.ts`:

```ts
it('routes by-id relay hints as temporary planner candidates', async () => {
  const createdRequests: Array<{ options: unknown; emitted: unknown[] }> = [];
  const runtime = {
    async fetchLatestEvent() {
      return null;
    },
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        getByPubkeyAndKind: async () => null,
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async () => null,
        getByTagValue: async () => [],
        getById: async () => null,
        getAllByKind: async () => [],
        listNegentropyEventRefs: async () => [],
        getRelayHints: async () => [
          {
            eventId: 'target',
            relayUrl: 'wss://durable.example',
            source: 'seen' as const,
            lastSeenAt: 1
          }
        ],
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async () => ({ stored: true, emissions: [] })
      };
    },
    async getRelaySession() {
      return {
        use(_req: { emit(input: unknown): void }, options: unknown) {
          const entry = { options, emitted: [] as unknown[] };
          createdRequests.push(entry);
          return {
            subscribe(observer: { complete?: () => void }) {
              queueMicrotask(() => observer.complete?.());
              return { unsubscribe() {} };
            }
          };
        }
      };
    },
    createBackwardReq() {
      return {
        emit(input: unknown) {
          createdRequests.at(-1)?.emitted.push(input);
        },
        over() {}
      };
    },
    createForwardReq() {
      return { emit() {}, over() {} };
    },
    uniq: () => ({}) as unknown,
    merge: () => ({}) as unknown,
    getRelayConnectionState: async () => null,
    observeRelayConnectionStates: async () => ({ unsubscribe() {} })
  };

  const coordinator = createResonoteCoordinator({
    runtime,
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: { useCachedLatest: () => null },
    publishTransportRuntime: { castSigned: async () => {} },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    }
  });

  await coordinator.fetchNostrEventById('target', ['wss://temporary.example']);

  expect(createdRequests[0]?.options).toEqual({
    on: {
      relays: ['wss://temporary.example/', 'wss://default.example/', 'wss://durable.example/'],
      defaultReadRelays: false
    }
  });
});
```

- [ ] **Step 2: Run the by-id contract and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts
```

Expected: FAIL because `fetchNostrEventById()` still sends explicit hints as a
direct overlay with `defaultReadRelays: true`.

- [ ] **Step 3: Route by-id hints through `temporaryRelays`**

In `packages/resonote/src/runtime.ts`, replace the `fetchNostrEventById`
implementation's `fetchBackwardEventsFromReadRuntime()` call with:

```ts
const events = await fetchBackwardEventsFromReadRuntime<StoredEvent>(
  coordinatorReadRuntime,
  [{ ids: [eventId] }],
  { timeoutMs: 10_000 },
  relaySelectionPolicy,
  relayHints
);
```

The full method should read:

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

- [ ] **Step 4: Add a repair-interoperable overlay contract**

Append this test inside the `resonote relay selection runtime` describe block in
`packages/resonote/src/relay-selection-runtime.contract.test.ts`:

```ts
it('builds repair overlays with the shared relay selection policy path', async () => {
  const runtime = createRuntimeFixture();

  const overlay = await buildReadRelayOverlay(runtime, {
    intent: 'repair',
    filters: [{ ids: ['target'] }],
    temporaryRelays: ['wss://repair-temporary.example'],
    policy: {
      strategy: 'conservative-outbox',
      maxReadRelays: 2,
      maxTemporaryRelays: 1
    }
  });

  expect(overlay).toEqual({
    relays: ['wss://repair-temporary.example/', 'wss://default.example/', 'wss://durable.example/'],
    includeDefaultReadRelays: false
  });
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit by-id and repair-interoperable routing**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts
git commit -m "feat(auftakt): route by-id hints through relay selection"
```

---

### Task 4: Lock Public Surface And Manual Routing Closure

**Files:**

- Modify: `packages/resonote/src/public-api.contract.test.ts`
- Modify: `packages/core/src/public-api.contract.test.ts`

- [ ] **Step 1: Strengthen Resonote package-root closure assertions**

In `packages/resonote/src/public-api.contract.test.ts`, keep the existing
forbidden list and add an assertion that the coordinator factory remains the
only routing configuration entry point:

```ts
expect(exportNames).toContain('createResonoteCoordinator');
expect(exportNames).not.toContain('buildReadRelayOverlay');
expect(exportNames).not.toContain('buildPublishRelaySendOptions');
expect(exportNames).not.toContain('RESONOTE_DEFAULT_RELAY_SELECTION_POLICY');
```

Place these assertions after the forbidden-name loop. The file already asserts
some of these names; keep one set of non-duplicated assertions in that location.

- [ ] **Step 2: Strengthen core manual planner public assertions**

In `packages/core/src/public-api.contract.test.ts`, add these expected exports
inside the existing `expect.objectContaining()` object literal:

```ts
        relayListEntriesToSelectionCandidates: expect.any(Function),
        normalizeRelayUrl: expect.any(Function),
```

The resulting block includes:

```ts
        buildRelaySelectionPlan: expect.any(Function),
        buildRequestExecutionPlan: expect.any(Function),
        calculateRelayReconnectDelay: expect.any(Function),
        createRuntimeRequestKey: expect.any(Function),
        createRelaySession: expect.any(Function),
        filterNegentropyEventRefs: expect.any(Function),
        normalizeRelayLifecycleOptions: expect.any(Function),
        normalizeRelaySelectionPolicy: expect.any(Function),
        normalizeRelayUrl: expect.any(Function),
        parseNip65RelayListTags: expect.any(Function),
        relayListEntriesToSelectionCandidates: expect.any(Function),
        reconcileReplayRepairSubjects: expect.any(Function),
        reduceReadSettlement: expect.any(Function),
        validateRelayEvent: expect.any(Function)
```

- [ ] **Step 3: Run public surface tests**

Run:

```bash
pnpm exec vitest run packages/core/src/public-api.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/plugin-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit closure assertions**

Run:

```bash
git add packages/core/src/public-api.contract.test.ts packages/resonote/src/public-api.contract.test.ts
git commit -m "test(auftakt): lock relay selection public surface"
```

---

### Task 5: Format And Verify Completion Gates

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: any touched test files from previous tasks if Prettier reports drift.

- [ ] **Step 1: Format only touched relay-selection files**

Run:

```bash
pnpm exec prettier --write packages/core/src/public-api.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/relay-selection-runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/subscription-visibility.contract.test.ts packages/resonote/src/runtime.ts
```

Expected: Prettier rewrites only the listed files.

- [ ] **Step 2: Run targeted Prettier check from the spec**

Run:

```bash
pnpm exec prettier --check packages/core/src/relay-selection.ts packages/core/src/relay-selection.contract.test.ts packages/resonote/src/relay-selection-runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/runtime.ts src/shared/nostr/client.ts src/shared/auftakt/resonote.ts docs/auftakt/status-verification.md docs/superpowers/specs/2026-04-26-auftakt-relay-selection-outbox-routing-design.md docs/superpowers/plans/2026-04-26-auftakt-relay-selection-outbox-routing.md
```

Expected: PASS.

- [ ] **Step 3: Run Svelte/TypeScript check**

Run:

```bash
pnpm run check
```

Expected: PASS with `svelte-check found 0 errors and 0 warnings`.

- [ ] **Step 4: Run focused relay selection and facade tests**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-selection.contract.test.ts packages/core/src/public-api.contract.test.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/plugin-api.contract.test.ts packages/resonote/src/subscription-visibility.contract.test.ts src/shared/nostr/client.test.ts src/features/relays/application/relay-actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full Auftakt gates**

Run:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: all commands PASS. The migration proof prints `Status: COMPLETE`.

- [ ] **Step 6: Commit formatting and verification adjustments**

Run:

```bash
git add packages/core/src/public-api.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/relay-selection-runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/subscription-visibility.contract.test.ts packages/resonote/src/runtime.ts
git commit -m "test(auftakt): verify relay selection completion"
```

If there are no unstaged changes after verification, skip this commit and record
the verification output in the final handoff.

---

## Self-Review

Spec coverage:

- `pnpm run check` type failure is covered by Task 1 and verified in Task 5.
- Formatting drift in `runtime.ts` is covered by Task 5.
- By-id hints through planner are covered by Task 3.
- Coordinator-level strategy configuration is covered by Task 2.
- Safe manual routing through `@auftakt/core` is covered by Task 4.
- Resonote closure and plugin isolation are covered by Task 4.
- Repair vocabulary alignment is covered by Task 3 without redesigning
  `repairEventsFromRelay()`.

Placeholder scan:

- The plan contains no unspecified red-flag markers.
- Every code-changing step includes concrete snippets and exact commands.

Type consistency:

- The policy type is `RelaySelectionPolicyOptions`.
- The coordinator option is `relaySelectionPolicy`.
- The internal publish input type is `RelaySelectionPublishEvent`.
- The internal default remains `RESONOTE_DEFAULT_RELAY_SELECTION_POLICY`.
