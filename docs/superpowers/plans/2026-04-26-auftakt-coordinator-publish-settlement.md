# Auftakt Coordinator Publish Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make publish outcomes first-class coordinator-owned settlement data while preserving the public `Promise<void>` publish API.

**Architecture:** Add publish settlement vocabulary to `@auftakt/core`, then make `EventCoordinator.publish()` own local materialization, relay publish, relay hint recording, and queue decisions. Keep app-facing helpers interoperable by delegating signed publish attempts through a coordinator-backed path and by retaining existing retry drain result shapes.

**Tech Stack:** TypeScript, Vitest, `@auftakt/core`, `@auftakt/resonote`, existing event coordinator, relay selection runtime, pending publish queue.

---

## File Structure

- Modify `packages/core/src/vocabulary.ts`: add publish settlement type unions and `PublishSettlement`.
- Modify `packages/core/src/settlement.ts`: add `PublishSettlementReducerInput` and `reducePublishSettlement()`.
- Modify `packages/core/src/index.ts`: export publish settlement types and reducer.
- Create `packages/core/src/publish-settlement.contract.test.ts`: reducer contract tests.
- Modify `packages/resonote/src/event-coordinator.ts`: return publish settlement data and materialize before transport.
- Modify `packages/resonote/src/event-coordinator.contract.test.ts`: coordinator publish workflow contracts.
- Modify `packages/resonote/src/runtime.ts`: add coordinator-backed publish helper and route public coordinator publish methods through it.
- Modify `packages/resonote/src/publish-queue.contract.test.ts`: interop and helper-level settlement coverage.
- Modify `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`: update follow-up status for coordinator-owned publish settlement.
- Modify `scripts/check-auftakt-strict-goal-audit.ts`: require the updated publish settlement evidence.
- Modify `scripts/check-auftakt-strict-goal-audit.test.ts`: lock the audit gate.

## Task 1: Add Core Publish Settlement Contracts

**Files:**

- Create: `packages/core/src/publish-settlement.contract.test.ts`

- [ ] **Step 1: Write the failing reducer tests**

Create `packages/core/src/publish-settlement.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { reducePublishSettlement } from './settlement.js';

describe('publish settlement contract', () => {
  it('represents local materialization before relay delivery', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: true,
        relayAccepted: false,
        queued: false
      })
    ).toEqual({
      phase: 'partial',
      state: 'confirmed',
      durability: 'local',
      reason: 'local-materialized'
    });
  });

  it('represents relay accepted delivery as settled relay durability', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: true,
        relayAccepted: true,
        queued: false
      })
    ).toEqual({
      phase: 'settled',
      state: 'confirmed',
      durability: 'relay',
      reason: 'relay-accepted'
    });
  });

  it('represents offline queueing as pending queued settlement', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: true,
        relayAccepted: false,
        queued: true,
        deliveryDecision: 'retrying'
      })
    ).toEqual({
      phase: 'pending',
      state: 'retrying',
      durability: 'queued',
      reason: 'retrying-offline'
    });
  });

  it('represents rejected retry drains as settled queued rejection', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: false,
        relayAccepted: false,
        queued: false,
        deliveryDecision: 'rejected'
      })
    ).toEqual({
      phase: 'settled',
      state: 'rejected',
      durability: 'queued',
      reason: 'rejected-offline'
    });
  });

  it('represents degraded local materialization without hiding retry state', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: false,
        relayAccepted: false,
        queued: true,
        deliveryDecision: 'retrying',
        materializationDurability: 'degraded'
      })
    ).toEqual({
      phase: 'pending',
      state: 'retrying',
      durability: 'degraded',
      reason: 'materialization-degraded'
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run packages/core/src/publish-settlement.contract.test.ts
```

Expected: FAIL with an import error for `reducePublishSettlement`.

## Task 2: Implement Core Publish Settlement Vocabulary

**Files:**

- Modify: `packages/core/src/vocabulary.ts`
- Modify: `packages/core/src/settlement.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/publish-settlement.contract.test.ts`
- Test: `packages/core/src/public-api.contract.test.ts`

- [ ] **Step 1: Add publish settlement types**

In `packages/core/src/vocabulary.ts`, after the existing `ReadSettlement` interface, add:

```ts
export type PublishSettlementPhase = 'pending' | 'partial' | 'settled';
export type PublishSettlementState = 'confirmed' | 'queued' | 'retrying' | 'rejected';
export type PublishSettlementDurability = 'local' | 'queued' | 'relay' | 'degraded';
export type PublishSettlementReason =
  | 'local-materialized'
  | 'relay-accepted'
  | 'queued-offline'
  | 'retrying-offline'
  | 'rejected-offline'
  | 'materialization-degraded';

export interface PublishSettlement {
  readonly phase: PublishSettlementPhase;
  readonly state: PublishSettlementState;
  readonly durability: PublishSettlementDurability;
  readonly reason: PublishSettlementReason;
}
```

- [ ] **Step 2: Add the reducer**

In `packages/core/src/settlement.ts`, change the import to include `OfflineDeliveryDecision` and the publish types:

```ts
import type { OfflineDeliveryDecision } from './reconcile.js';
import type {
  PublishSettlement,
  PublishSettlementDurability,
  PublishSettlementPhase,
  PublishSettlementReason,
  PublishSettlementState,
  ReadSettlement,
  ReadSettlementLocalProvenance
} from './vocabulary.js';
```

Then append this reducer after `reduceReadSettlement()`:

```ts
export interface PublishSettlementReducerInput {
  readonly localMaterialized: boolean;
  readonly relayAccepted: boolean;
  readonly queued: boolean;
  readonly deliveryDecision?: OfflineDeliveryDecision;
  readonly materializationDurability?: 'durable' | 'degraded';
}

export function reducePublishSettlement(input: PublishSettlementReducerInput): PublishSettlement {
  if (input.materializationDurability === 'degraded') {
    return {
      phase: input.queued ? 'pending' : 'partial',
      state: input.deliveryDecision === 'rejected' ? 'rejected' : 'retrying',
      durability: 'degraded',
      reason: 'materialization-degraded'
    };
  }

  if (input.deliveryDecision === 'rejected') {
    return {
      phase: 'settled',
      state: 'rejected',
      durability: 'queued',
      reason: 'rejected-offline'
    };
  }

  if (input.deliveryDecision === 'retrying') {
    return {
      phase: 'pending',
      state: 'retrying',
      durability: 'queued',
      reason: 'retrying-offline'
    };
  }

  if (input.queued) {
    return {
      phase: 'pending',
      state: 'queued',
      durability: 'queued',
      reason: 'queued-offline'
    };
  }

  if (input.relayAccepted) {
    return {
      phase: 'settled',
      state: 'confirmed',
      durability: 'relay',
      reason: 'relay-accepted'
    };
  }

  const phase: PublishSettlementPhase = input.localMaterialized ? 'partial' : 'pending';
  const state: PublishSettlementState = input.localMaterialized ? 'confirmed' : 'retrying';
  const durability: PublishSettlementDurability = input.localMaterialized ? 'local' : 'queued';
  const reason: PublishSettlementReason = input.localMaterialized
    ? 'local-materialized'
    : 'retrying-offline';

  return { phase, state, durability, reason };
}
```

- [ ] **Step 3: Export the reducer and types**

In `packages/core/src/index.ts`, add publish settlement types to the existing `vocabulary.js` export block:

```ts
export type {
  PublishSettlement,
  PublishSettlementDurability,
  PublishSettlementPhase,
  PublishSettlementReason,
  PublishSettlementState
} from './vocabulary.js';
```

Add `PublishSettlementReducerInput` to the settlement type export and `reducePublishSettlement` to the settlement value export:

```ts
export type { PublishSettlementReducerInput, ReadSettlementReducerInput } from './settlement.js';
export { reducePublishSettlement, reduceReadSettlement } from './settlement.js';
```

- [ ] **Step 4: Run focused core tests**

Run:

```bash
pnpm exec vitest run packages/core/src/publish-settlement.contract.test.ts packages/core/src/read-settlement.contract.test.ts packages/core/src/public-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/core/src/vocabulary.ts packages/core/src/settlement.ts packages/core/src/index.ts packages/core/src/publish-settlement.contract.test.ts
git commit -m "feat(auftakt): add publish settlement vocabulary"
```

## Task 3: Add Coordinator Publish Settlement Tests

**Files:**

- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Replace the happy-path publish assertion with settlement and materialization proof**

In `packages/resonote/src/event-coordinator.contract.test.ts`, update the existing `publishes through coordinator transport and records successful relay hints` test so the arrange/assert section contains:

```ts
const calls: string[] = [];
const putWithReconcile = vi.fn(async () => {
  calls.push('materialize');
  return { stored: true };
});
const publish = vi.fn(async (_event, handlers) => {
  calls.push('publish');
  await handlers.onAck({ eventId: 'published', relayUrl: 'wss://relay.example', ok: true });
});
const coordinator = createEventCoordinator({
  publishTransport: { publish },
  pendingPublishes: { add: vi.fn(async () => {}) },
  store: {
    getById: vi.fn(async () => null),
    putWithReconcile,
    recordRelayHint
  },
  relay: { verify: vi.fn(async () => []) }
});

await expect(coordinator.publish(event)).resolves.toEqual({
  queued: false,
  ok: true,
  settlement: {
    phase: 'settled',
    state: 'confirmed',
    durability: 'relay',
    reason: 'relay-accepted'
  }
});

expect(calls).toEqual(['materialize', 'publish']);
expect(putWithReconcile).toHaveBeenCalledWith(event);
expect(publish).toHaveBeenCalledWith(event, expect.any(Object));
expect(recordRelayHint).toHaveBeenCalledWith({
  eventId: 'published',
  relayUrl: 'wss://relay.example',
  source: 'published',
  lastSeenAt: expect.any(Number)
});
expect(recordRelayHint).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Update the failure publish assertion with queued settlement side effect**

In the existing `queues retryable publish failures through coordinator pending storage` test, keep the rejection assertion and add:

```ts
expect(add).toHaveBeenCalledWith(event);
```

The implementation still rethrows, so the settlement cannot be returned on this public error path. The queue call is the settlement side effect contract for this path.

- [ ] **Step 3: Add no-transport queued settlement test**

Append this test inside the same `describe` block:

```ts
it('returns queued settlement when no publish transport is available', async () => {
  const event = {
    id: 'queued-no-transport',
    pubkey: 'alice',
    created_at: 20,
    kind: 1,
    tags: [],
    content: 'publish',
    sig: 'sig'
  };
  const add = vi.fn(async () => {});
  const coordinator = createEventCoordinator({
    pendingPublishes: { add },
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => ({ stored: true }))
    },
    relay: { verify: vi.fn(async () => []) }
  });

  await expect(coordinator.publish(event)).resolves.toEqual({
    queued: true,
    ok: false,
    settlement: {
      phase: 'pending',
      state: 'queued',
      durability: 'queued',
      reason: 'queued-offline'
    }
  });
  expect(add).toHaveBeenCalledWith(event);
});
```

- [ ] **Step 4: Add degraded materialization test**

Append:

```ts
it('returns degraded settlement when local materialization fails before publish', async () => {
  const event = {
    id: 'degraded-publish',
    pubkey: 'alice',
    created_at: 20,
    kind: 1,
    tags: [],
    content: 'publish',
    sig: 'sig'
  };
  const publish = vi.fn(async () => {});
  const coordinator = createEventCoordinator({
    publishTransport: { publish },
    pendingPublishes: { add: vi.fn(async () => {}) },
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => {
        throw new Error('indexeddb unavailable');
      })
    },
    relay: { verify: vi.fn(async () => []) }
  });

  await expect(coordinator.publish(event)).resolves.toEqual({
    queued: false,
    ok: true,
    settlement: {
      phase: 'partial',
      state: 'retrying',
      durability: 'degraded',
      reason: 'materialization-degraded'
    }
  });
  expect(publish).toHaveBeenCalledWith(event, expect.any(Object));
});
```

- [ ] **Step 5: Run the focused coordinator test and verify RED**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: FAIL because `EventCoordinator.publish()` does not return `settlement` and does not materialize before publish.

## Task 4: Implement Coordinator-Owned Publish Settlement

**Files:**

- Modify: `packages/resonote/src/event-coordinator.ts`
- Test: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Import publish settlement reducer and type**

At the top of `packages/resonote/src/event-coordinator.ts`, change the import to:

```ts
import {
  reducePublishSettlement,
  reduceReadSettlement,
  type PublishSettlement,
  type StoredEvent
} from '@auftakt/core';
```

- [ ] **Step 2: Add settlement to the publish result type**

Replace `EventCoordinatorPublishResult` with:

```ts
export interface EventCoordinatorPublishResult {
  readonly queued: boolean;
  readonly ok: boolean;
  readonly settlement: PublishSettlement;
}
```

- [ ] **Step 3: Materialize before publish and return settlement**

In the existing `materialize()` function, prevent local publish materialization
from recording an empty `seen` relay hint. Replace both direct calls to
`recordSeenHint(event.id, relayUrl)` with:

```ts
if (relayUrl) {
  await recordSeenHint(event.id, relayUrl);
}
```

Replace `async function publish(event: StoredEvent): Promise<EventCoordinatorPublishResult>` with:

```ts
async function publish(event: StoredEvent): Promise<EventCoordinatorPublishResult> {
  const materialized = await materialize(event, '');

  if (!deps.publishTransport) {
    await deps.pendingPublishes?.add(event);
    return {
      queued: true,
      ok: false,
      settlement: reducePublishSettlement({
        localMaterialized: materialized.stored,
        relayAccepted: false,
        queued: true,
        materializationDurability: materialized.durability
      })
    };
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
    return {
      queued: false,
      ok: true,
      settlement: reducePublishSettlement({
        localMaterialized: materialized.stored,
        relayAccepted: materialized.durability !== 'degraded',
        queued: false,
        materializationDurability: materialized.durability
      })
    };
  } catch (error) {
    await deps.pendingPublishes?.add(event);
    throw error;
  }
}
```

- [ ] **Step 4: Run focused coordinator tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "feat(auftakt): settle coordinator publishes"
```

## Task 5: Add Runtime Publish Helper Contracts

**Files:**

- Modify: `packages/resonote/src/publish-queue.contract.test.ts`

- [ ] **Step 1: Import the new helper name used by runtime code**

Update the import from `./runtime.js` to include `publishSignedEventThroughCoordinator`:

```ts
import {
  publishSignedEventThroughCoordinator,
  publishSignedEventsWithOfflineFallback,
  publishSignedEventWithOfflineFallback,
  type RetryableSignedEvent,
  retryQueuedSignedPublishes
} from './runtime.js';
```

- [ ] **Step 2: Add a helper-level settlement contract test**

Append this test inside `describe('@auftakt/resonote publish queue contract', () => { ... })`:

```ts
it('publishes signed events through coordinator materialization and relay hints', async () => {
  const signed = makeEvent({ id: 'coordinator-signed' });
  const calls: string[] = [];
  const recordRelayHint = vi.fn(async () => {});
  const result = await publishSignedEventThroughCoordinator({
    event: signed,
    options: { on: { relays: ['wss://relay.example'] } },
    openStore: async () => ({
      getById: async () => null,
      putWithReconcile: async () => {
        calls.push('materialize');
        return { stored: true };
      },
      recordRelayHint
    }),
    publish: async (_event, handlers) => {
      calls.push('publish');
      await handlers.onAck({
        eventId: 'coordinator-signed',
        relayUrl: 'wss://relay.example',
        ok: true
      });
    },
    addPendingPublish: async () => {
      throw new Error('should not queue');
    }
  });

  expect(result).toEqual({
    queued: false,
    ok: true,
    settlement: {
      phase: 'settled',
      state: 'confirmed',
      durability: 'relay',
      reason: 'relay-accepted'
    }
  });
  expect(calls).toEqual(['materialize', 'publish']);
  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'coordinator-signed',
    relayUrl: 'wss://relay.example',
    source: 'published',
    lastSeenAt: expect.any(Number)
  });
});
```

- [ ] **Step 3: Add signed failure interop assertion**

Keep the existing `queues retryable single publish failures while preserving the caller-visible error` test. It must still expect:

```ts
await expect(async () => {
  await publishSignedEventWithOfflineFallback({ castSigned }, { addPendingPublish }, signed);
}).rejects.toThrow('offline');

expect(addPendingPublish).toHaveBeenCalledOnce();
expect(addPendingPublish).toHaveBeenCalledWith(signed);
```

- [ ] **Step 4: Run focused publish tests and verify RED**

Run:

```bash
pnpm exec vitest run packages/resonote/src/publish-queue.contract.test.ts
```

Expected: FAIL because `publishSignedEventThroughCoordinator` does not exist.

## Task 6: Route Runtime Signed Publishes Through Coordinator

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Test: `packages/resonote/src/publish-queue.contract.test.ts`
- Test: `packages/resonote/src/relay-routing-publish.contract.test.ts`

- [ ] **Step 1: Add coordinator-backed helper types**

In `packages/resonote/src/runtime.ts`, after `PendingPublishQueueRuntime`, add:

```ts
interface CoordinatorPublishStore {
  getById(id: string): Promise<StoredEvent | null>;
  putWithReconcile(event: StoredEvent): Promise<unknown>;
  recordRelayHint?(hint: {
    readonly eventId: string;
    readonly relayUrl: string;
    readonly source: 'published';
    readonly lastSeenAt: number;
  }): Promise<void>;
}

export interface CoordinatorSignedPublishRuntime {
  readonly event: RetryableSignedEvent;
  readonly options?: PublishTransportOptions;
  readonly openStore: () => Promise<CoordinatorPublishStore>;
  readonly publish: (
    event: RetryableSignedEvent,
    handlers: { readonly onAck: (packet: PublishAckPacket) => Promise<void> | void },
    options?: PublishTransportOptions
  ) => Promise<void>;
  readonly addPendingPublish: (event: RetryableSignedEvent) => Promise<void>;
}
```

- [ ] **Step 2: Add the helper implementation**

Before `retryQueuedSignedPublishes()`, add:

```ts
export async function publishSignedEventThroughCoordinator(input: CoordinatorSignedPublishRuntime) {
  const store = await input.openStore();
  const coordinator = createEventCoordinator({
    publishTransport: {
      publish: (event, handlers) =>
        input.publish(event as RetryableSignedEvent, handlers, input.options)
    },
    pendingPublishes: {
      add: (event) => input.addPendingPublish(event as RetryableSignedEvent)
    },
    store,
    relay: { verify: async () => [] }
  });

  return coordinator.publish(input.event);
}
```

- [ ] **Step 3: Add a local publish method inside `createResonoteCoordinator()`**

Inside `createResonoteCoordinator()`, after `const entityHandles = createEntityHandleFactories(...)`
and before the returned coordinator object, add:

```ts
const publishSignedEventFromCoordinator = async (params: EventParameters): Promise<void> => {
  const options = await buildPublishRelaySendOptions(runtime, {
    event: params,
    policy: relaySelectionPolicy
  });
  const pending = toRetryableSignedEvent(params);
  if (!pending) {
    return publishSignedEventWithOfflineFallback(
      publishTransportRuntime,
      pendingPublishQueueRuntime,
      params,
      publishHintRecorder,
      options
    );
  }

  await publishSignedEventThroughCoordinator({
    event: pending,
    options,
    openStore: () => runtime.getEventsDB(),
    publish: (event, handlers, sendOptions) =>
      publishTransportRuntimeWithAcks(publishTransportRuntime, event, handlers, sendOptions),
    addPendingPublish: (event) => pendingPublishQueueRuntime.addPendingPublish(event)
  });
};
```

Then replace the `publishSignedEvent` property in the returned coordinator object with:

```ts
publishSignedEvent: publishSignedEventFromCoordinator,
```

- [ ] **Step 4: Add the publish transport ack adapter**

Before `publishSignedEventThroughCoordinator()`, add:

```ts
async function publishTransportRuntimeWithAcks(
  runtime: Pick<PublishRuntime, 'castSigned' | 'observePublishAcks'>,
  event: RetryableSignedEvent,
  handlers: { readonly onAck: (packet: PublishAckPacket) => Promise<void> | void },
  options?: PublishTransportOptions
): Promise<void> {
  await runtime.castSigned(event, options);
  if (!runtime.observePublishAcks) return;
  await runtime.observePublishAcks(event, handlers.onAck);
}
```

- [ ] **Step 5: Wire `publishSignedEvents()` through the single publish method**

Replace the `publishSignedEvents` property in `createResonoteCoordinator()` with:

```ts
publishSignedEvents: async (params) => {
  if (params.length === 0) return;
  await Promise.allSettled(params.map((event) => publishSignedEventFromCoordinator(event)));
},
```

- [ ] **Step 6: Keep standalone helper interop**

Leave `publishSignedEventWithOfflineFallback()` and `publishSignedEventsWithOfflineFallback()` behavior unchanged. These exported helpers remain legacy-interoperable package utilities used by focused contracts.

- [ ] **Step 7: Run focused runtime publish tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/publish-queue.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/public-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/publish-queue.contract.test.ts
git commit -m "feat(auftakt): route signed publishes through coordinator"
```

## Task 7: Update Strict Audit Evidence

**Files:**

- Modify: `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`
- Modify: `scripts/check-auftakt-strict-goal-audit.ts`
- Modify: `scripts/check-auftakt-strict-goal-audit.test.ts`

- [ ] **Step 1: Update the audit text**

In `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`, change the offline strict gap sentence from:

```md
Sync cursor and restart-safe incremental repair semantics are not first-class strict proof for all read flows. Publish settlement is durable but not a full coordinator settlement vocabulary.
```

to:

```md
Sync cursor and restart-safe incremental repair semantics are not first-class strict proof for all read flows. Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof.
```

In the follow-up candidates list, change:

```md
2. Coordinator-owned publish settlement.
```

to:

```md
2. Coordinator-owned publish settlement. `Implemented in this slice; keep regression gates active.`
```

- [ ] **Step 2: Add strict gate checks**

In `scripts/check-auftakt-strict-goal-audit.ts`, add these constants after
`REQUIRED_FIRST_PHASE_NAME`:

```ts
const REQUIRED_PUBLISH_SETTLEMENT_AUDIT_EVIDENCE =
  'Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof.';

const REQUIRED_PUBLISH_SETTLEMENT_FILES = [
  {
    path: 'packages/core/src/settlement.ts',
    text: 'reducePublishSettlement',
    description: 'core publish settlement reducer'
  },
  {
    path: 'packages/resonote/src/event-coordinator.ts',
    text: 'settlement: reducePublishSettlement',
    description: 'coordinator publish settlement return'
  }
];
```

Add this helper after `requireTextIncludes()`:

```ts
function findFileText(files: readonly StrictGoalAuditFile[], path: string): string | null {
  return files.find((file) => file.path === path)?.text ?? null;
}
```

Inside `checkStrictGoalAudit()`, after the `REQUIRED_FIRST_PHASE_NAME` check,
add:

```ts
if (!strictAudit.text.includes(REQUIRED_PUBLISH_SETTLEMENT_AUDIT_EVIDENCE)) {
  errors.push(
    `${strictAudit.path} is missing coordinator-owned publish settlement implementation evidence`
  );
}

for (const required of REQUIRED_PUBLISH_SETTLEMENT_FILES) {
  const text = findFileText(files, required.path);
  if (text === null) {
    errors.push(`${required.path} is missing for strict publish settlement audit`);
    continue;
  }
  if (!text.includes(required.text)) {
    errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
  }
}
```

Update `collectFiles()` so it reads the source files needed by the new gate:

```ts
const paths = [
  STRICT_GOAL_AUDIT_PATH,
  'docs/auftakt/spec.md',
  'packages/core/src/settlement.ts',
  'packages/resonote/src/event-coordinator.ts'
].filter((path) => existsSync(join(root, path)));
```

- [ ] **Step 3: Update checker tests**

In `scripts/check-auftakt-strict-goal-audit.test.ts`, add the publish evidence
line to `validAuditText` after `pnpm run check:auftakt:strict-closure`:

```md
Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof.
```

Add this helper fixture after `validAuditText`:

```ts
const validPublishSettlementFiles = [
  file('packages/core/src/settlement.ts', 'export function reducePublishSettlement() {}'),
  file(
    'packages/resonote/src/event-coordinator.ts',
    'return { settlement: reducePublishSettlement({ localMaterialized: true, relayAccepted: true, queued: false }) };'
  )
];
```

Then update every passing `checkStrictGoalAudit([...])` call to include the
fixture spread:

```ts
const result = checkStrictGoalAudit([
  file(STRICT_GOAL_AUDIT_PATH, validAuditText),
  ...validPublishSettlementFiles
]);
```

For tests that intentionally fail for a different reason, include
`...validPublishSettlementFiles` so they keep asserting only their named
failure. Add one dedicated missing-proof test:

```ts
it('requires coordinator-owned publish settlement implementation proof', () => {
  const result = checkStrictGoalAudit([
    file(
      STRICT_GOAL_AUDIT_PATH,
      validAuditText.replace(
        'Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof.',
        'Publish settlement evidence removed.'
      )
    ),
    ...validPublishSettlementFiles
  ]);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    `${STRICT_GOAL_AUDIT_PATH} is missing coordinator-owned publish settlement implementation evidence`
  );
});
```

- [ ] **Step 4: Run strict audit tests**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
pnpm run check:auftakt:strict-goal-audit
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/auftakt/2026-04-26-strict-goal-gap-audit.md scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts
git commit -m "test(auftakt): gate coordinator publish settlement"
```

## Task 8: Final Verification

**Files:**

- No source edits expected.

- [ ] **Step 1: Run package-focused tests**

Run:

```bash
pnpm exec vitest run packages/core/src/publish-settlement.contract.test.ts packages/core/src/read-settlement.contract.test.ts packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/publish-queue.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/public-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run package suites**

Run:

```bash
pnpm run test:auftakt:resonote
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 3: Run strict Auftakt gates**

Run:

```bash
pnpm run check:auftakt:strict-goal-audit
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: only pre-existing unrelated untracked or modified files remain outside this implementation, and recent commits include this plan plus the publish settlement implementation commits.
