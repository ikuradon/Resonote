# Auftakt Relay Capability Strict Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strictly complete the remaining relay capability queue acceptance gaps by adding coordinator ingress in-flight duplicate suppression and fixing the remaining TypeScript check failure.

**Architecture:** `@auftakt/resonote` keeps duplicate relay candidate coordination inside `event-coordinator.ts`, where ingress, materialization, relay hint recording, and subscription callbacks already meet. The coordinator tracks in-flight accepted event ids only while validation/materialization is running, records relay hints for duplicate observations, and keeps a per-subscription delivered-id set so a logical subscription emits an event id once even after the in-flight window ends. The app facade test fix is type-only and does not change runtime behavior.

**Tech Stack:** TypeScript, Vitest, SvelteKit `svelte-check`, RxJS-adjacent coordinator contracts, existing Auftakt package scripts.

---

## File Structure

- Modify `packages/resonote/src/event-coordinator.contract.test.ts`: add strict duplicate-ingress contract tests beside the existing coordinator relay candidate tests.
- Modify `packages/resonote/src/event-coordinator.ts`: add short-lived in-flight event-id coordination, relay hint recording for duplicate observations, and per-subscription delivered-id suppression.
- Modify `src/shared/auftakt/relay-capability.test.ts`: type the `importOriginal()` result in the Vitest module mock so `pnpm run check` passes.
- No schema, public API, facade runtime, package export, or UI files should change for this completion slice.

## Task 1: Prove Coordinator In-Flight Duplicate Suppression

**Files:**

- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`
- Modify later: `packages/resonote/src/event-coordinator.ts`

- [ ] **Step 1: Add failing read-path duplicate tests**

Append these tests inside the existing `describe('EventCoordinator read policy', () => { ... })` block in `packages/resonote/src/event-coordinator.contract.test.ts`, before the publish tests:

```ts
it('coalesces duplicate gateway candidates while materialization is in flight', async () => {
  const remote = {
    id: 'dupe',
    pubkey: 'alice',
    created_at: 4,
    kind: 1,
    tags: [],
    content: 'accepted'
  };
  const releaseMaterialization: Array<() => void> = [];
  const putWithReconcile = vi.fn(
    async () =>
      new Promise<{ stored: true }>((resolve) => {
        releaseMaterialization.push(() => resolve({ stored: true }));
      })
  );
  const recordRelayHint = vi.fn(async () => {});
  const ingestRelayCandidate = vi.fn(async () => ({ ok: true as const, event: remote }));
  const coordinator = createEventCoordinator({
    relayGateway: {
      verify: vi.fn(async () => ({
        strategy: 'fallback-req' as const,
        candidates: [
          { event: { raw: 'relay-a' }, relayUrl: 'wss://relay-a.example' },
          { event: { raw: 'relay-b' }, relayUrl: 'wss://relay-b.example' }
        ]
      }))
    },
    ingestRelayCandidate,
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile,
      recordRelayHint
    },
    relay: { verify: vi.fn(async () => []) }
  });

  const readPromise = coordinator.read({ ids: ['dupe'] }, { policy: 'relayConfirmed' });
  await vi.waitFor(() => expect(releaseMaterialization).toHaveLength(1));
  const secondCandidateReachedIngressWhileFirstWasPending =
    ingestRelayCandidate.mock.calls.length === 2;
  releaseMaterialization.splice(0).forEach((release) => release());
  if (!secondCandidateReachedIngressWhileFirstWasPending) {
    await vi.waitFor(() => expect(releaseMaterialization).toHaveLength(1));
    releaseMaterialization.splice(0).forEach((release) => release());
  }

  await expect(readPromise).resolves.toMatchObject({
    events: [remote]
  });
  expect(secondCandidateReachedIngressWhileFirstWasPending).toBe(true);
  expect(ingestRelayCandidate).toHaveBeenCalledTimes(2);
  expect(putWithReconcile).toHaveBeenCalledTimes(1);
  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'dupe',
    relayUrl: 'wss://relay-a.example',
    source: 'seen',
    lastSeenAt: expect.any(Number)
  });
  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'dupe',
    relayUrl: 'wss://relay-b.example',
    source: 'seen',
    lastSeenAt: expect.any(Number)
  });
});

it('does not let a rejected duplicate candidate poison a later valid event id', async () => {
  const remote = {
    id: 'recovered',
    pubkey: 'alice',
    created_at: 5,
    kind: 1,
    tags: [],
    content: 'accepted'
  };
  const putWithReconcile = vi.fn(async () => ({ stored: true }));
  const coordinator = createEventCoordinator({
    relayGateway: {
      verify: vi.fn(async () => ({
        strategy: 'fallback-req' as const,
        candidates: [
          { event: { raw: 'bad' }, relayUrl: 'wss://relay-a.example' },
          { event: { raw: 'good' }, relayUrl: 'wss://relay-b.example' }
        ]
      }))
    },
    ingestRelayCandidate: vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const })
      .mockResolvedValueOnce({ ok: true as const, event: remote }),
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile
    },
    relay: { verify: vi.fn(async () => []) }
  });

  const result = await coordinator.read({ ids: ['recovered'] }, { policy: 'relayConfirmed' });

  expect(result.events).toEqual([remote]);
  expect(putWithReconcile).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: FAIL. The first new test should show `putWithReconcile` called twice because duplicate candidates are materialized independently.

- [ ] **Step 3: Add coordinator accepted-candidate helper types**

In `packages/resonote/src/event-coordinator.ts`, add these types after `EventCoordinatorIngressResult`:

```ts
interface AcceptedRelayCandidate {
  readonly event: StoredEvent;
  readonly relayUrl: string;
}

type AcceptedRelayCandidateResult =
  | { readonly ok: true; readonly accepted: AcceptedRelayCandidate }
  | { readonly ok: false };
```

- [ ] **Step 4: Add the in-flight map and accepted-candidate processor**

Inside `createEventCoordinator()`, immediately after `const materializerQueue = deps.materializerQueue ?? createMaterializerQueue();`, add:

```ts
const inflightAcceptedByEventId = new Map<string, Promise<AcceptedRelayCandidateResult>>();

async function acceptAndMaterializeCandidate(
  candidate: EventCoordinatorRelayCandidate
): Promise<AcceptedRelayCandidateResult> {
  const accepted = deps.ingestRelayCandidate
    ? await deps.ingestRelayCandidate(candidate)
    : { ok: false as const };
  if (!accepted.ok) return { ok: false };

  const existing = inflightAcceptedByEventId.get(accepted.event.id);
  if (existing) {
    const result = await existing;
    if (result.ok) {
      await recordSeenHint(result.accepted.event.id, candidate.relayUrl);
    }
    return result;
  }

  const task = (async (): Promise<AcceptedRelayCandidateResult> => {
    const materialized = await materialize(accepted.event, candidate.relayUrl);
    if (!materialized.stored && materialized.durability !== 'degraded') {
      return { ok: false };
    }
    return {
      ok: true,
      accepted: {
        event: accepted.event,
        relayUrl: candidate.relayUrl
      }
    };
  })();

  inflightAcceptedByEventId.set(accepted.event.id, task);
  try {
    return await task;
  } finally {
    if (inflightAcceptedByEventId.get(accepted.event.id) === task) {
      inflightAcceptedByEventId.delete(accepted.event.id);
    }
  }
}

async function recordSeenHint(eventId: string, relayUrl: string): Promise<void> {
  const hint = buildSeenHint(eventId, relayUrl);
  hotIndex.applyRelayHint(hint);
  await deps.store.recordRelayHint?.(hint);
}
```

- [ ] **Step 5: Reuse `recordSeenHint()` inside `materialize()`**

In the `materialize()` function, replace both direct hint blocks with `recordSeenHint()`.

Replace:

```ts
hotIndex.applyVisible(event);
hotIndex.applyRelayHint(buildSeenHint(event.id, relayUrl));
materializeResult = { stored: false, durability: 'degraded' };
return;
```

with:

```ts
hotIndex.applyVisible(event);
await recordSeenHint(event.id, relayUrl);
materializeResult = { stored: false, durability: 'degraded' };
return;
```

Replace:

```ts
hotIndex.applyVisible(event);
const hint = buildSeenHint(event.id, relayUrl);
hotIndex.applyRelayHint(hint);
await deps.store.recordRelayHint?.(hint);
materializeResult = { stored: true, durability: 'durable' };
```

with:

```ts
hotIndex.applyVisible(event);
await recordSeenHint(event.id, relayUrl);
materializeResult = { stored: true, durability: 'durable' };
```

- [ ] **Step 6: Route read relay candidates through the processor**

In `read()`, replace the relay gateway candidate loop:

```ts
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
```

with:

```ts
const acceptedResults = await Promise.all(
  result.candidates.map((candidate) => acceptAndMaterializeCandidate(candidate))
);
for (const acceptedResult of acceptedResults) {
  if (!acceptedResult.ok) continue;
  relayEvents.push(acceptedResult.accepted.event);
}
```

The existing `mergeEventsById(local, relayEvents)` remains the durable read-path deduplication step.

- [ ] **Step 7: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: PASS for all event coordinator contract tests.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "fix(auftakt): coalesce duplicate relay ingress"
```

Expected: commit succeeds.

## Task 2: Prove Subscription Duplicate Emission Suppression

**Files:**

- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`
- Modify later: `packages/resonote/src/event-coordinator.ts`

- [ ] **Step 1: Add failing subscription duplicate tests**

Append these tests inside the existing `describe('EventCoordinator read policy', () => { ... })` block, near the existing subscription tests:

```ts
it('emits duplicate subscription candidates once while preserving relay hints', async () => {
  const accepted = {
    id: 'visible-once',
    pubkey: 'alice',
    created_at: 10,
    kind: 1,
    tags: [],
    content: 'visible'
  };
  const onEvent = vi.fn();
  const recordRelayHint = vi.fn(async () => {});
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
      putWithReconcile: vi.fn(async () => ({ stored: true })),
      recordRelayHint
    },
    relay: { verify: vi.fn(async () => []) }
  });

  coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent });
  await candidateHandler?.({ event: { raw: 'first' }, relayUrl: 'wss://relay-a.example' });
  await candidateHandler?.({ event: { raw: 'second' }, relayUrl: 'wss://relay-b.example' });

  expect(onEvent).toHaveBeenCalledTimes(1);
  expect(onEvent).toHaveBeenCalledWith({
    event: accepted,
    relayHint: 'wss://relay-a.example'
  });
  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'visible-once',
    relayUrl: 'wss://relay-a.example',
    source: 'seen',
    lastSeenAt: expect.any(Number)
  });
  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'visible-once',
    relayUrl: 'wss://relay-b.example',
    source: 'seen',
    lastSeenAt: expect.any(Number)
  });
});

it('does not share delivered-id suppression across subscription handles', async () => {
  const accepted = {
    id: 'visible-per-handle',
    pubkey: 'alice',
    created_at: 11,
    kind: 1,
    tags: [],
    content: 'visible'
  };
  const handlersBySubscription: Array<{
    onCandidate(candidate: { event: unknown; relayUrl: string }): Promise<void> | void;
  }> = [];
  const leftOnEvent = vi.fn();
  const rightOnEvent = vi.fn();
  const coordinator = createEventCoordinator({
    transport: {
      subscribe: vi.fn((_filters, _options, handlers) => {
        handlersBySubscription.push({ onCandidate: handlers.onCandidate });
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

  coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent: leftOnEvent });
  coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent: rightOnEvent });

  await handlersBySubscription[0]?.onCandidate({
    event: { raw: 'left' },
    relayUrl: 'wss://relay-a.example'
  });
  await handlersBySubscription[1]?.onCandidate({
    event: { raw: 'right' },
    relayUrl: 'wss://relay-b.example'
  });

  expect(leftOnEvent).toHaveBeenCalledTimes(1);
  expect(rightOnEvent).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: FAIL. The first new subscription test should show `onEvent` called twice.

- [ ] **Step 3: Add per-subscription delivered-id state**

In the `subscribe()` function in `packages/resonote/src/event-coordinator.ts`, after the early `if (!deps.transport)` block and before `return deps.transport.subscribe(...)`, add:

```ts
const deliveredEventIds = new Set<string>();
```

- [ ] **Step 4: Route subscription candidates through the processor and suppress duplicate callbacks**

In the subscription `onCandidate` callback, replace:

```ts
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
```

with:

```ts
      onCandidate: async (candidate) => {
        const acceptedResult = await acceptAndMaterializeCandidate(candidate);
        if (!acceptedResult.ok) return;

        const event = acceptedResult.accepted.event;
        if (deliveredEventIds.has(event.id)) return;
        deliveredEventIds.add(event.id);

        await handlers.onEvent({
          event: event as TEvent,
          relayHint: acceptedResult.accepted.relayUrl || undefined
        });
      },
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: PASS for all event coordinator contract tests.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "fix(auftakt): suppress duplicate subscription events"
```

Expected: commit succeeds.

## Task 3: Fix Relay Capability Facade Test Typing

**Files:**

- Modify: `src/shared/auftakt/relay-capability.test.ts`

- [ ] **Step 1: Run the failing type check**

Run:

```bash
pnpm run check
```

Expected: FAIL with `Spread types may only be created from object types` in `src/shared/auftakt/relay-capability.test.ts`.

- [ ] **Step 2: Type the Vitest import-original call**

In `src/shared/auftakt/relay-capability.test.ts`, replace:

```ts
vi.mock('@auftakt/resonote', async (importOriginal) => {
  const actual = (await importOriginal());
  return {
```

with:

```ts
vi.mock('@auftakt/resonote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@auftakt/resonote')>();
  return {
```

- [ ] **Step 3: Run the facade test**

Run:

```bash
pnpm exec vitest run src/shared/auftakt/relay-capability.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the type check**

Run:

```bash
pnpm run check
```

Expected: PASS with `svelte-check found 0 errors and 0 warnings`.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add src/shared/auftakt/relay-capability.test.ts
git commit -m "test(auftakt): type relay capability facade mock"
```

Expected: commit succeeds.

## Task 4: Final Verification

**Files:**

- No source edits expected.
- Inspect: `docs/superpowers/specs/2026-04-25-auftakt-relay-capability-queue-design.md`
- Inspect: `docs/superpowers/plans/2026-04-25-auftakt-relay-capability-queue.md`

- [ ] **Step 1: Run core verification**

Run:

```bash
pnpm run test:auftakt:core
```

Expected: PASS.

- [ ] **Step 2: Run storage verification**

Run:

```bash
pnpm run test:auftakt:storage
```

Expected: PASS.

- [ ] **Step 3: Run resonote verification**

Run:

```bash
pnpm run test:auftakt:resonote
```

Expected: PASS, including the new event coordinator duplicate-ingress tests.

- [ ] **Step 4: Run facade regression**

Run:

```bash
pnpm exec vitest run src/shared/auftakt/relay-capability.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run strict closure and migration proof**

Run:

```bash
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: both commands exit 0. The migration proof output should include `Status: COMPLETE`.

- [ ] **Step 6: Run type checking**

Run:

```bash
pnpm run check
```

Expected: PASS with no Svelte diagnostics.

- [ ] **Step 7: Inspect the strict completion diff**

Run:

```bash
git status --short
git diff -- packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts src/shared/auftakt/relay-capability.test.ts
```

Expected: no uncommitted source changes if each task was committed. If work is intentionally left uncommitted, the diff should be limited to the three files in this plan and this plan document.

- [ ] **Step 8: Commit the plan document if it is still uncommitted**

Run:

```bash
git add docs/superpowers/plans/2026-04-25-auftakt-relay-capability-strict-completion.md
git commit -m "docs(auftakt): plan relay capability strict completion"
```

Expected: commit succeeds if this plan document is not already committed.

## Self-Review

- Spec coverage: The plan covers the strict leftover items from `2026-04-25-auftakt-relay-capability-queue-design.md`: coordinator ingress in-flight duplicate suppression, per-logical-subscription duplicate callback suppression, relay hint preservation for duplicate observations, invalid candidate non-poisoning, and final strict closure/migration proof checks.
- Placeholder scan: The plan has no unfinished placeholder markers and no steps that ask the worker to invent tests or implementation details.
- Type consistency: The plan uses existing `StoredEvent`, `EventCoordinatorRelayCandidate`, `EventCoordinatorIngressResult`, `materialize()`, `buildSeenHint()`, and `recordRelayHint()` names consistently with current `packages/resonote/src/event-coordinator.ts`.
