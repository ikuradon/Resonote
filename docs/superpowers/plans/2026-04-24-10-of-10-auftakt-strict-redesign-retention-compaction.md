# Auftakt Retention and Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add quota-aware retention, compaction, migration rollback metadata, and degraded storage settlement without weakening deletion visibility or private/encrypted data safety.

**Architecture:** Dexie store owns durable maintenance APIs. Coordinator observes quota state and adjusts scheduling, but it does not silently report durable settlement when storage is unavailable.

**Tech Stack:** TypeScript, Vitest, Dexie, fake-indexeddb, `@auftakt/adapter-dexie`, `@auftakt/resonote`

---

## File Structure

- Create: `packages/adapter-dexie/src/maintenance.ts`
- Create: `packages/adapter-dexie/src/maintenance.contract.test.ts`
- Modify: `packages/adapter-dexie/src/schema.ts`
- Modify: `packages/adapter-dexie/src/index.ts`
- Modify: `packages/resonote/src/event-coordinator.ts`
- Create: `packages/resonote/src/degraded-storage.contract.test.ts`

### Task 1: Add Migration Metadata and Rollback Rules

**Files:**

- Modify: `packages/adapter-dexie/src/schema.ts`
- Modify: `packages/adapter-dexie/src/index.ts`
- Create: `packages/adapter-dexie/src/maintenance.contract.test.ts`

- [ ] **Step 1: Write failing migration metadata tests**

```ts
import 'fake-indexeddb/auto';
import { createDexieEventStore } from './index.js';

describe('Dexie migration metadata', () => {
  it('allows rollback before Dexie-only writes', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-migration-rollback' });
    await store.recordMigrationState({
      version: 1,
      sourceDbName: 'resonote-events',
      migratedRows: 10,
      dexieOnlyWrites: false
    });

    await expect(store.canRollbackMigration()).resolves.toBe(true);
  });

  it('refuses rollback after Dexie-only writes', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-migration-no-rollback' });
    await store.recordMigrationState({
      version: 1,
      sourceDbName: 'resonote-events',
      migratedRows: 10,
      dexieOnlyWrites: true
    });

    await expect(store.canRollbackMigration()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/adapter-dexie/src/maintenance.contract.test.ts`  
Expected: FAIL because migration metadata APIs are missing.

- [ ] **Step 3: Add metadata table**

In schema:

```ts
migration_state!: Table<{ key: string; version: number; source_db_name: string; migrated_rows: number; dexie_only_writes: boolean }, string>;
```

Add store declaration:

```ts
migration_state: 'key,version,source_db_name,dexie_only_writes';
```

- [ ] **Step 4: Implement metadata APIs**

```ts
async recordMigrationState(input: { version: number; sourceDbName: string; migratedRows: number; dexieOnlyWrites: boolean }): Promise<void> {
  await this.db.migration_state.put({
    key: 'current',
    version: input.version,
    source_db_name: input.sourceDbName,
    migrated_rows: input.migratedRows,
    dexie_only_writes: input.dexieOnlyWrites
  });
}

async canRollbackMigration(): Promise<boolean> {
  const state = await this.db.migration_state.get('current');
  return Boolean(state && !state.dexie_only_writes);
}
```

- [ ] **Step 5: Run migration metadata tests**

Run: `pnpm exec vitest run packages/adapter-dexie/src/maintenance.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-dexie/src/schema.ts packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/maintenance.contract.test.ts
git commit -m "feat: add dexie migration rollback metadata"
```

### Task 2: Add Retention Priority Compaction

**Files:**

- Create: `packages/adapter-dexie/src/maintenance.ts`
- Modify: `packages/adapter-dexie/src/index.ts`
- Modify: `packages/adapter-dexie/src/maintenance.contract.test.ts`

- [ ] **Step 1: Add failing compaction test**

```ts
it('does not compact deletion index or pending publishes before raw old payloads', async () => {
  const store = await createDexieEventStore({ dbName: 'auftakt-compaction-priority' });
  await store.putWithReconcile({
    id: 'delete',
    pubkey: 'alice',
    created_at: 2,
    kind: 5,
    tags: [['e', 'target']],
    content: '',
    sig: 'sig'
  });
  await store.putPendingPublish({
    id: 'pending',
    status: 'retrying',
    created_at: 3,
    event: {
      id: 'pending',
      pubkey: 'alice',
      created_at: 3,
      kind: 1,
      tags: [],
      content: 'x',
      sig: 'sig'
    }
  });
  await store.putEvent({
    id: 'old',
    pubkey: 'bob',
    created_at: 1,
    kind: 1,
    tags: [],
    content: 'old payload',
    sig: 'sig'
  });

  const result = await store.compact({ targetRows: 1, reason: 'quota-critical' });

  expect(result.removedEventIds).toEqual(['old']);
  await expect(store.isDeleted('target', 'alice')).resolves.toBe(true);
  await expect(store.getPendingPublishes()).resolves.toHaveLength(1);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/adapter-dexie/src/maintenance.contract.test.ts`  
Expected: FAIL because pending publish and compaction APIs are missing.

- [ ] **Step 3: Implement pending publish helpers**

```ts
async putPendingPublish(record: { id: string; status: string; created_at: number; event: NostrEvent }): Promise<void> {
  await this.db.pending_publishes.put(record);
  await this.db.migration_state.update('current', { dexie_only_writes: true }).catch(() => {});
}

async getPendingPublishes(): Promise<Array<{ id: string; status: string; created_at: number; event: NostrEvent }>> {
  return this.db.pending_publishes.toArray();
}
```

- [ ] **Step 4: Implement compaction**

```ts
async compact(options: { targetRows: number; reason: 'quota-warning' | 'quota-critical' }): Promise<{ removedEventIds: string[] }> {
  const protectedIds = new Set<string>();
  for (const row of await this.db.pending_publishes.toArray()) protectedIds.add(row.id);
  for (const row of await this.db.deletion_index.toArray()) {
    protectedIds.add(row.deletion_id);
    protectedIds.add(row.target_id);
  }
  const candidates = await this.db.events.orderBy('created_at').toArray();
  const removedEventIds: string[] = [];
  for (const event of candidates) {
    if (removedEventIds.length >= options.targetRows) break;
    if (protectedIds.has(event.id)) continue;
    if (event.kind === 5) continue;
    await this.db.events.delete(event.id);
    removedEventIds.push(event.id);
  }
  return { removedEventIds };
}
```

- [ ] **Step 5: Run compaction tests**

Run: `pnpm exec vitest run packages/adapter-dexie/src/maintenance.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/maintenance.ts packages/adapter-dexie/src/maintenance.contract.test.ts
git commit -m "feat: add dexie retention compaction"
```

### Task 3: Add Degraded Storage Settlement

**Files:**

- Modify: `packages/resonote/src/event-coordinator.ts`
- Create: `packages/resonote/src/degraded-storage.contract.test.ts`

- [ ] **Step 1: Write failing degraded storage test**

```ts
import { createEventCoordinator } from './event-coordinator.js';

it('does not claim durable settlement when store writes fail', async () => {
  const coordinator = createEventCoordinator({
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => {
        throw new Error('quota');
      })
    },
    relay: { verify: vi.fn(async () => []) }
  });

  const result = await coordinator.materializeFromRelay(
    { id: 'e1', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' },
    'wss://relay.example'
  );

  expect(result).toEqual({ stored: false, durability: 'degraded' });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/resonote/src/degraded-storage.contract.test.ts`  
Expected: FAIL until materialization returns degraded state.

- [ ] **Step 3: Return degraded materialization result**

```ts
async function materializeFromRelay(
  event: StoredEvent,
  relayUrl: string
): Promise<{ stored: boolean; durability: 'durable' | 'degraded' }> {
  try {
    const result = await deps.store.putWithReconcile(event);
    return { stored: (result as { stored?: boolean }).stored !== false, durability: 'durable' };
  } catch {
    hotIndex.applyVisible(event);
    return { stored: false, durability: 'degraded' };
  }
}
```

- [ ] **Step 4: Ensure publish requires durable pending state**

When publish is offline or relay fails, call `putPendingPublish()` before returning a local accepted settlement. If `putPendingPublish()` fails, return or throw a degraded storage error instead of claiming durable success.

- [ ] **Step 5: Run degraded tests**

Run: `pnpm exec vitest run packages/resonote/src/degraded-storage.contract.test.ts packages/resonote/src/event-coordinator.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/degraded-storage.contract.test.ts
git commit -m "feat: report degraded storage settlement"
```
