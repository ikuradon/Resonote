# Auftakt Transport/Store/Sync Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/auftakt` に、現行仕様に沿った transport/store/sync の foundation を、破棄済みブランチの局所回収だけを使って実装する。

**Architecture:** `feat/auftakt-foundation` からは純ロジックとテスト観点だけを回収し、現行の monorepo package 境界に合わせて新規実装する。実装順は `testing/fakes -> transport helpers -> dexie persistent store -> sync orchestration` とし、`handles` や `Session` の厚い責務はこの段階では作らない。

**Tech Stack:** pnpm workspace, TypeScript, Vitest, Dexie, `packages/auftakt`, current `docs/auftakt/specs.md`

---

### Task 1: testing/fakes の土台を作る

**Files:**

- Create: `packages/auftakt/src/testing/fakes.ts`
- Create: `packages/auftakt/src/testing/fakes.test.ts`
- Modify: `packages/auftakt/src/index.ts`

- [ ] **Step 1: 先に fake の契約テストを書く**

```ts
import { describe, expect, it } from 'vitest';
import { createFakeRelayManager, createFakePersistentStore } from './fakes';

describe('testing fakes', () => {
  it('stores events in memory and lists them back', async () => {
    const store = createFakePersistentStore();
    await store.putEvent({
      id: 'e1',
      pubkey: 'p1',
      created_at: 1,
      kind: 1,
      tags: [],
      content: 'hello',
      sig: 'sig'
    });

    const events = await store.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('e1');
  });

  it('records publish calls on fake relay manager', async () => {
    const relay = createFakeRelayManager();
    await relay.publish(
      { id: 'e1', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' },
      { read: ['wss://a'], write: ['wss://a'] }
    );

    expect(relay.publishes).toHaveLength(1);
    expect(relay.publishes[0]?.relaySet.write).toEqual(['wss://a']);
  });
});
```

- [ ] **Step 2: テストだけ実行して失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/testing/fakes.test.ts`
Expected: FAIL with module or export not found

- [ ] **Step 3: fake 実装を追加する**

```ts
type NostrEventLike = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export function createFakePersistentStore() {
  const events = new Map<string, NostrEventLike>();

  return {
    async putEvent(event: NostrEventLike) {
      events.set(event.id, event);
    },
    async getEvent(id: string) {
      return events.get(id) ?? null;
    },
    async listEvents() {
      return [...events.values()];
    }
  };
}

export function createFakeRelayManager() {
  const publishes: Array<{
    event: NostrEventLike;
    relaySet: { read: string[]; write: string[]; inbox?: string[] };
  }> = [];

  return {
    publishes,
    async publish(
      event: NostrEventLike,
      relaySet: { read: string[]; write: string[]; inbox?: string[] }
    ) {
      publishes.push({ event, relaySet });
      return {
        acceptedRelays: relaySet.write,
        failedRelays: [],
        successRate: relaySet.write.length > 0 ? 1 : 0
      };
    }
  };
}
```

- [ ] **Step 4: index export を追加する**

```ts
export * from './testing/fakes.js';
```

- [ ] **Step 5: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/testing/fakes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/auftakt/src/testing/fakes.ts packages/auftakt/src/testing/fakes.test.ts packages/auftakt/src/index.ts
git commit -m "feat: add auftakt testing fakes"
```

### Task 2: transport helper の純ロジックを実装する

**Files:**

- Create: `packages/auftakt/src/transport/filter-match.ts`
- Create: `packages/auftakt/src/transport/filter-shard.ts`
- Create: `packages/auftakt/src/transport/slot-counter.ts`
- Create: `packages/auftakt/src/transport/transport-helpers.test.ts`
- Modify: `packages/auftakt/src/index.ts`

- [ ] **Step 1: helper の失敗テストを書く**

```ts
import { describe, expect, it } from 'vitest';
import { filterMatchesEvent, shardFiltersByLimit, createSlotCounter } from './transport-helpers';

describe('transport helpers', () => {
  it('matches event against kinds/authors filter', () => {
    expect(
      filterMatchesEvent(
        { kinds: [1], authors: ['p1'] },
        { id: 'e1', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
      )
    ).toBe(true);
  });

  it('shards filters by limit', () => {
    const shards = shardFiltersByLimit([{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }], 2);
    expect(shards).toEqual([[{ ids: ['a'] }, { ids: ['b'] }], [{ ids: ['c'] }]]);
  });

  it('tracks slot acquire and release', () => {
    const counter = createSlotCounter(1);
    expect(counter.tryAcquire()).toBe(true);
    expect(counter.tryAcquire()).toBe(false);
    counter.release();
    expect(counter.tryAcquire()).toBe(true);
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/transport/transport-helpers.test.ts`
Expected: FAIL with missing module or export

- [ ] **Step 3: 最小実装を書く**

```ts
export function filterMatchesEvent(
  filter: { kinds?: number[]; authors?: string[]; ids?: string[] },
  event: { id: string; pubkey: string; kind: number }
) {
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  return true;
}

export function shardFiltersByLimit<T>(filters: T[], maxPerShard: number): T[][] {
  if (maxPerShard <= 0) return [filters];
  const shards: T[][] = [];
  for (let i = 0; i < filters.length; i += maxPerShard) {
    shards.push(filters.slice(i, i + maxPerShard));
  }
  return shards;
}

export function createSlotCounter(maxSlots: number) {
  let inUse = 0;
  return {
    tryAcquire() {
      if (inUse >= maxSlots) return false;
      inUse += 1;
      return true;
    },
    release() {
      inUse = Math.max(0, inUse - 1);
    },
    getInUse() {
      return inUse;
    }
  };
}
```

- [ ] **Step 4: export を追加する**

```ts
export * from './transport/filter-match.js';
export * from './transport/filter-shard.js';
export * from './transport/slot-counter.js';
```

- [ ] **Step 5: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/transport/transport-helpers.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/auftakt/src/transport/filter-match.ts packages/auftakt/src/transport/filter-shard.ts packages/auftakt/src/transport/slot-counter.ts packages/auftakt/src/transport/transport-helpers.test.ts packages/auftakt/src/index.ts
git commit -m "feat: add auftakt transport helpers"
```

### Task 3: Dexie persistent store の最小 foundation を実装する

**Files:**

- Create: `packages/auftakt/src/store/dexie/schema.ts`
- Create: `packages/auftakt/src/store/dexie/persistent-store.ts`
- Create: `packages/auftakt/src/store/dexie/persistent-store.test.ts`
- Modify: `packages/auftakt/src/index.ts`

- [ ] **Step 1: persistent store の契約テストを書く**

```ts
import { describe, expect, it } from 'vitest';
import { createDexiePersistentStore } from './persistent-store';

describe('dexie persistent store', () => {
  it('stores and loads an event by id', async () => {
    const store = createDexiePersistentStore({ dbName: 'auftakt-test-events' });
    await store.putEvent({
      id: 'e1',
      pubkey: 'p1',
      created_at: 1,
      kind: 1,
      tags: [],
      content: 'hello',
      sig: 'sig'
    });

    await expect(store.getEvent('e1')).resolves.toMatchObject({ id: 'e1' });
    await store.dispose();
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/store/dexie/persistent-store.test.ts`
Expected: FAIL with missing implementation

- [ ] **Step 3: Dexie schema と store を実装する**

```ts
import Dexie, { type Table } from 'dexie';

type StoredEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

class AuftaktDexie extends Dexie {
  events!: Table<StoredEvent, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      events: 'id,pubkey,kind,created_at'
    });
  }
}

export function createDexiePersistentStore(input: { dbName: string }) {
  const db = new AuftaktDexie(input.dbName);
  return {
    async putEvent(event: StoredEvent) {
      await db.events.put(event);
    },
    async getEvent(id: string) {
      return (await db.events.get(id)) ?? null;
    },
    async dispose() {
      db.close();
      await Dexie.delete(input.dbName);
    }
  };
}
```

- [ ] **Step 4: export を追加する**

```ts
export * from './store/dexie/persistent-store.js';
```

- [ ] **Step 5: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/store/dexie/persistent-store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/auftakt/src/store/dexie/schema.ts packages/auftakt/src/store/dexie/persistent-store.ts packages/auftakt/src/store/dexie/persistent-store.test.ts packages/auftakt/src/index.ts
git commit -m "feat: add auftakt dexie persistent store foundation"
```

### Task 4: sync orchestration の最小形を実装する

**Files:**

- Create: `packages/auftakt/src/sync/sync-engine.ts`
- Create: `packages/auftakt/src/sync/sync-engine.test.ts`
- Modify: `packages/auftakt/src/index.ts`

- [ ] **Step 1: sync engine の失敗テストを書く**

```ts
import { describe, expect, it } from 'vitest';
import { createFakePersistentStore, createFakeRelayManager } from '../testing/fakes';
import { createSyncEngine } from './sync-engine';

describe('sync engine', () => {
  it('writes fetched events into store', async () => {
    const store = createFakePersistentStore();
    const relay = createFakeRelayManager();
    relay.fetch = async () => [
      { id: 'e1', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
    ];

    const sync = createSyncEngine({ store, relayManager: relay });
    const events = await sync.fetch({ kinds: [1], authors: ['p1'] });

    expect(events).toHaveLength(1);
    await expect(store.getEvent('e1')).resolves.toMatchObject({ id: 'e1' });
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/sync/sync-engine.test.ts`
Expected: FAIL with missing implementation

- [ ] **Step 3: sync engine の最小実装を書く**

```ts
type Filter = { kinds?: number[]; authors?: string[]; ids?: string[] };

export function createSyncEngine(input: {
  store: { putEvent(event: unknown): Promise<void> };
  relayManager: { fetch?(filter: Filter): Promise<unknown[]> };
}) {
  return {
    async fetch(filter: Filter) {
      const events = (await input.relayManager.fetch?.(filter)) ?? [];
      for (const event of events) {
        await input.store.putEvent(event);
      }
      return events;
    }
  };
}
```

- [ ] **Step 4: export を追加する**

```ts
export * from './sync/sync-engine.js';
```

- [ ] **Step 5: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/sync/sync-engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/auftakt/src/sync/sync-engine.ts packages/auftakt/src/sync/sync-engine.test.ts packages/auftakt/src/index.ts
git commit -m "feat: add auftakt sync engine foundation"
```

## Self-Review

- 監査結果どおり `tests/fakes -> transport -> store -> sync` の順になっている
- `Session` や `handles` の厚い責務をこの段階に入れていない
- 破棄済みブランチの wholesale revive ではなく、局所回収前提になっている
- 現行 `packages/auftakt` 配下だけで完結する

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-09-auftakt-transport-store-sync-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
