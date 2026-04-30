# Auftakt Hot Index and Performance Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `HotEventIndex` and a prioritized materializer queue so Dexie is durable truth but not the hot read path.

**Architecture:** `HotEventIndex` stores bounded memory indexes for by-id, tag, replaceable head, deletion, and relay hints. `MaterializerQueue` serializes writes and prioritizes kind:5, deletion index, locally authored events, and pending publishes.

**Tech Stack:** TypeScript, Vitest, `@auftakt/core`, `@auftakt/resonote`

---

## File Structure

- Create: `packages/resonote/src/hot-event-index.ts`
- Create: `packages/resonote/src/hot-event-index.contract.test.ts`
- Create: `packages/resonote/src/materializer-queue.ts`
- Create: `packages/resonote/src/materializer-queue.contract.test.ts`
- Modify: `packages/resonote/src/event-coordinator.ts`

### Task 1: Implement HotEventIndex

**Files:**

- Create: `packages/resonote/src/hot-event-index.ts`
- Create: `packages/resonote/src/hot-event-index.contract.test.ts`

- [ ] **Step 1: Write failing hot-index tests**

```ts
import { createHotEventIndex } from './hot-event-index.js';

describe('HotEventIndex', () => {
  it('indexes by id and tag value', () => {
    const index = createHotEventIndex();
    index.applyVisible({
      id: 'e1',
      pubkey: 'p1',
      created_at: 1,
      kind: 1,
      tags: [['e', 'parent']],
      content: '',
      sig: 'sig'
    });

    expect(index.getById('e1')).toMatchObject({ id: 'e1' });
    expect(index.getByTagValue('e:parent')).toEqual([expect.objectContaining({ id: 'e1' })]);
  });

  it('suppresses deleted id and pubkey pairs', () => {
    const index = createHotEventIndex();
    index.applyDeletionIndex('target', 'alice');
    index.applyVisible({
      id: 'target',
      pubkey: 'alice',
      created_at: 1,
      kind: 1,
      tags: [],
      content: '',
      sig: 'sig'
    });

    expect(index.getById('target')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/resonote/src/hot-event-index.contract.test.ts`  
Expected: FAIL because hot index does not exist.

- [ ] **Step 3: Implement hot index**

```ts
import type { StoredEvent } from '@auftakt/core';

export function createHotEventIndex() {
  const byId = new Map<string, StoredEvent>();
  const tagIndex = new Map<string, Set<string>>();
  const deletionIndex = new Set<string>();

  function remove(id: string): void {
    byId.delete(id);
    for (const ids of tagIndex.values()) ids.delete(id);
  }

  return {
    applyVisible(event: StoredEvent): void {
      if (deletionIndex.has(`${event.id}:${event.pubkey}`)) return;
      byId.set(event.id, event);
      for (const tag of event.tags) {
        if (!tag[0] || !tag[1]) continue;
        const key = `${tag[0]}:${tag[1]}`;
        const ids = tagIndex.get(key) ?? new Set<string>();
        ids.add(event.id);
        tagIndex.set(key, ids);
      }
    },
    applyDeletionIndex(id: string, pubkey: string): void {
      deletionIndex.add(`${id}:${pubkey}`);
      remove(id);
    },
    getById(id: string): StoredEvent | null {
      return byId.get(id) ?? null;
    },
    getByTagValue(value: string): StoredEvent[] {
      return [...(tagIndex.get(value) ?? [])].flatMap((id) => byId.get(id) ?? []);
    }
  };
}
```

- [ ] **Step 4: Run hot-index tests**

Run: `pnpm exec vitest run packages/resonote/src/hot-event-index.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/hot-event-index.ts packages/resonote/src/hot-event-index.contract.test.ts
git commit -m "feat: add auftakt hot event index"
```

### Task 2: Implement Prioritized Materializer Queue

**Files:**

- Create: `packages/resonote/src/materializer-queue.ts`
- Create: `packages/resonote/src/materializer-queue.contract.test.ts`

- [ ] **Step 1: Write failing queue priority test**

```ts
import { createMaterializerQueue } from './materializer-queue.js';

describe('MaterializerQueue', () => {
  it('runs deletion work before normal relay events', async () => {
    const order: string[] = [];
    const queue = createMaterializerQueue();

    queue.enqueue({ priority: 'normal', run: async () => order.push('normal') });
    queue.enqueue({ priority: 'critical', run: async () => order.push('critical') });
    await queue.drain();

    expect(order).toEqual(['critical', 'normal']);
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/resonote/src/materializer-queue.contract.test.ts`  
Expected: FAIL because queue does not exist.

- [ ] **Step 3: Implement queue**

```ts
export type MaterializerPriority = 'critical' | 'high' | 'normal' | 'background';

export interface MaterializerTask {
  readonly priority: MaterializerPriority;
  run(): Promise<void>;
}

const rank: Record<MaterializerPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  background: 3
};

export function createMaterializerQueue() {
  const tasks: MaterializerTask[] = [];
  let draining = false;

  return {
    enqueue(task: MaterializerTask): void {
      tasks.push(task);
      tasks.sort((left, right) => rank[left.priority] - rank[right.priority]);
    },
    async drain(): Promise<void> {
      if (draining) return;
      draining = true;
      try {
        while (tasks.length > 0) {
          const task = tasks.shift();
          if (task) await task.run();
        }
      } finally {
        draining = false;
      }
    },
    size(): number {
      return tasks.length;
    }
  };
}
```

- [ ] **Step 4: Run queue tests**

Run: `pnpm exec vitest run packages/resonote/src/materializer-queue.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/materializer-queue.ts packages/resonote/src/materializer-queue.contract.test.ts
git commit -m "feat: add prioritized materializer queue"
```

### Task 3: Wire Hot Index Into Coordinator Reads

**Files:**

- Modify: `packages/resonote/src/event-coordinator.ts`
- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Add failing hot path test**

```ts
it('serves by-id reads from hot index before durable store', async () => {
  const storeGet = vi.fn(async () => null);
  const coordinator = createEventCoordinator({
    hotIndex: createHotEventIndex(),
    store: { getById: storeGet, putWithReconcile: vi.fn() },
    relay: { verify: vi.fn(async () => []) }
  });
  coordinator.applyLocalEvent({
    id: 'hot',
    pubkey: 'p1',
    created_at: 1,
    kind: 1,
    tags: [],
    content: '',
    sig: 'sig'
  });

  const result = await coordinator.read({ ids: ['hot'] }, { policy: 'cacheOnly' });

  expect(result.events).toEqual([expect.objectContaining({ id: 'hot' })]);
  expect(storeGet).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Extend coordinator dependencies**

Add optional `hotIndex` and `applyLocalEvent()`:

```ts
const hotIndex = deps.hotIndex ?? createHotEventIndex();

function applyLocalEvent(event: StoredEvent): void {
  hotIndex.applyVisible(event);
}
```

- [ ] **Step 3: Query hot index before store**

For by-id reads, use:

```ts
const hotHits = ids
  .map((id) => hotIndex.getById(id))
  .filter((event): event is StoredEvent => Boolean(event));
const missingIds = ids.filter((id) => !hotIndex.getById(id));
```

- [ ] **Step 4: Run performance-path tests**

Run: `pnpm exec vitest run packages/resonote/src/hot-event-index.contract.test.ts packages/resonote/src/event-coordinator.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "feat: use hot index for coordinator reads"
```
