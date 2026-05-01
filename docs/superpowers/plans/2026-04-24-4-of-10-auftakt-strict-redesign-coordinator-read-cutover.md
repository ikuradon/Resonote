# Auftakt Coordinator Read Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut core read APIs over to `EventCoordinator` so local results are emitted first and every non-`cacheOnly` read schedules relay verification.

**Architecture:** Add a coordinator object in `@auftakt/resonote` that owns read policy, local store reads, relay verification scheduling, and materialized emissions. Existing facade exports stay stable and delegate to the coordinator.

**Tech Stack:** TypeScript, Vitest, RxJS-compatible interfaces, `@auftakt/core`, `@auftakt/resonote`, `@auftakt/adapter-dexie`

---

## File Structure

- Create: `packages/resonote/src/event-coordinator.ts`
- Create: `packages/resonote/src/event-coordinator.contract.test.ts`
- Modify: `packages/resonote/src/runtime.ts`
- Modify: `src/shared/auftakt/resonote.ts`

### Task 1: Add Read Policy Coordinator

**Files:**

- Create: `packages/resonote/src/event-coordinator.ts`
- Create: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Write failing local-first test**

```ts
import { createEventCoordinator } from './event-coordinator.js';

describe('EventCoordinator read policy', () => {
  it('returns local hit immediately and schedules remote verification for localFirst', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => ({
          id: 'e1',
          pubkey: 'p1',
          created_at: 1,
          kind: 1,
          tags: [],
          content: 'local',
          sig: 'sig'
        })),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    const result = await coordinator.read({ ids: ['e1'] }, { policy: 'localFirst' });

    expect(result.events).toHaveLength(1);
    expect(result.settlement.phase).toBe('partial');
    expect(verify).toHaveBeenCalledWith(
      [{ ids: ['e1'] }],
      expect.objectContaining({ reason: 'localFirst' })
    );
  });

  it('does not schedule remote verification for cacheOnly', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    await coordinator.read({ ids: ['missing'] }, { policy: 'cacheOnly' });
    expect(verify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts`  
Expected: FAIL because coordinator does not exist.

- [ ] **Step 3: Implement coordinator read API**

```ts
import { reduceReadSettlement, type StoredEvent } from '@auftakt/core';

export type ReadPolicy = 'cacheOnly' | 'localFirst' | 'relayConfirmed' | 'repair';

export function createEventCoordinator(deps: {
  readonly store: {
    getById(id: string): Promise<StoredEvent | null>;
    putWithReconcile(event: StoredEvent): Promise<unknown>;
  };
  readonly relay: {
    verify(
      filters: Array<Record<string, unknown>>,
      options: { reason: ReadPolicy }
    ): Promise<StoredEvent[]>;
  };
}) {
  return {
    async read(filter: Record<string, unknown>, options: { policy: ReadPolicy }) {
      const filters = [filter];
      const ids = Array.isArray(filter.ids)
        ? filter.ids.filter((id): id is string => typeof id === 'string')
        : [];
      const local = (await Promise.all(ids.map((id) => deps.store.getById(id)))).filter(
        (event): event is StoredEvent => Boolean(event)
      );

      if (options.policy !== 'cacheOnly') {
        void deps.relay.verify(filters, { reason: options.policy });
      }

      return {
        events: local,
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: options.policy === 'cacheOnly',
          relayRequired: options.policy !== 'cacheOnly',
          localHitProvenance: local.length > 0 ? 'store' : null,
          relayHit: false
        })
      };
    }
  };
}
```

- [ ] **Step 4: Run coordinator tests**

Run: `pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "feat: add event coordinator read policy"
```

### Task 2: Cut `cachedFetchById` Through Coordinator

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `src/shared/auftakt/resonote.ts`
- Test: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Add by-id regression test**

```ts
it('uses cacheOnly only when explicitly requested', async () => {
  const verify = vi.fn(async () => []);
  const coordinator = createEventCoordinator({
    store: { getById: vi.fn(async () => null), putWithReconcile: vi.fn() },
    relay: { verify }
  });

  await coordinator.read({ ids: ['e1'] }, { policy: 'localFirst' });
  await coordinator.read({ ids: ['e1'] }, { policy: 'cacheOnly' });

  expect(verify).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Add coordinator-backed helper in runtime**

In `packages/resonote/src/runtime.ts`, introduce a helper shaped like:

```ts
async function coordinatorFetchById(
  coordinator: ReturnType<typeof createEventCoordinator>,
  eventId: string
): Promise<SettledReadResult<StoredEvent>> {
  const result = await coordinator.read({ ids: [eventId] }, { policy: 'localFirst' });
  return { event: result.events[0] ?? null, settlement: result.settlement };
}
```

- [ ] **Step 3: Replace only the package-level `cachedFetchById()` implementation**

Keep facade signatures stable. The implementation delegates by id to the coordinator helper and keeps old invalidation maps only as compatibility cache if tests require it.

- [ ] **Step 4: Run package tests**

Run: `pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/public-api.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/event-coordinator.contract.test.ts src/shared/auftakt/resonote.ts
git commit -m "feat: route by-id reads through event coordinator"
```

### Task 3: Cut Latest Reads and Backward Fetch Through Coordinator

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `src/shared/nostr/query.ts`

- [ ] **Step 1: Add tests for latest and backward fetch policy**

```ts
it('schedules verification for latest replaceable reads', async () => {
  const verify = vi.fn(async () => []);
  const coordinator = createEventCoordinator({
    store: { getById: vi.fn(async () => null), putWithReconcile: vi.fn() },
    relay: { verify }
  });

  await coordinator.read({ authors: ['alice'], kinds: [0], limit: 1 }, { policy: 'localFirst' });

  expect(verify).toHaveBeenCalledWith([{ authors: ['alice'], kinds: [0], limit: 1 }], {
    reason: 'localFirst'
  });
});
```

- [ ] **Step 2: Route latest reads to coordinator**

Use this policy mapping:

```ts
const policy = options?.cacheOnly === true ? 'cacheOnly' : 'localFirst';
```

No public caller should get a direct relay-only latest read.

- [ ] **Step 3: Route `fetchBackwardEvents()` compatibility wrapper**

Change `src/shared/nostr/query.ts` from direct `rxNostr.use(req)` to a compatibility call into the app-facing Auftakt facade. Keep the public function name for old imports until cleanup.

- [ ] **Step 4: Run regression set**

Run: `pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts src/shared/nostr/query.test.ts src/shared/nostr/client.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/runtime.ts src/shared/nostr/query.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "feat: route latest and backward reads through coordinator"
```
