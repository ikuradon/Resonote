# Auftakt Deletion and Replaceable Materialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement strfry-aligned kind:5 deletion visibility and replaceable head materialization in the Dexie adapter.

**Architecture:** Keep deletion events as normal events, write `deletion_index [target_id+pubkey]`, and remove target events from visible reads only when deletion author matches target author. Replaceable and parameterized replaceable events update `replaceable_heads`.

**Tech Stack:** TypeScript, Vitest, Dexie, fake-indexeddb, `@auftakt/core`

---

## File Structure

- Modify: `packages/adapter-dexie/src/index.ts`
- Create: `packages/adapter-dexie/src/materialization.contract.test.ts`
- Modify: `packages/adapter-dexie/src/schema.ts`

### Task 1: Implement kind:5 Deletion Index

**Files:**

- Modify: `packages/adapter-dexie/src/index.ts`
- Create: `packages/adapter-dexie/src/materialization.contract.test.ts`

- [ ] **Step 1: Write failing deletion tests**

```ts
import 'fake-indexeddb/auto';
import { createDexieEventStore } from './index.js';

describe('Dexie deletion materialization', () => {
  it('stores deletion and hides matching existing target', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-delete-existing' });
    await store.putWithReconcile({
      id: 'target',
      pubkey: 'alice',
      created_at: 1,
      kind: 1,
      tags: [],
      content: 'x',
      sig: 'sig'
    });
    await store.putWithReconcile({
      id: 'delete',
      pubkey: 'alice',
      created_at: 2,
      kind: 5,
      tags: [['e', 'target']],
      content: '',
      sig: 'sig'
    });

    await expect(store.getById('target')).resolves.toBeNull();
    await expect(store.getById('delete')).resolves.toMatchObject({ id: 'delete', kind: 5 });
    await expect(store.isDeleted('target', 'alice')).resolves.toBe(true);
  });

  it('suppresses late target by target id and pubkey', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-delete-late' });
    await store.putWithReconcile({
      id: 'delete',
      pubkey: 'alice',
      created_at: 2,
      kind: 5,
      tags: [['e', 'target']],
      content: '',
      sig: 'sig'
    });

    const result = await store.putWithReconcile({
      id: 'target',
      pubkey: 'alice',
      created_at: 1,
      kind: 1,
      tags: [],
      content: 'x',
      sig: 'sig'
    });

    expect(result.stored).toBe(false);
    await expect(store.getById('target')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm exec vitest run packages/adapter-dexie/src/materialization.contract.test.ts`  
Expected: FAIL because `putWithReconcile()` and `isDeleted()` are missing.

- [ ] **Step 3: Implement deletion materialization**

```ts
const DELETION_KIND = 5;

function deletionTargets(event: Pick<NostrEvent, 'tags'>): string[] {
  return [...new Set(event.tags.filter((tag) => tag[0] === 'e' && tag[1]).map((tag) => tag[1] as string))];
}

async isDeleted(id: string, pubkey: string): Promise<boolean> {
  return Boolean(await this.db.deletion_index.get(`${id}:${pubkey}`));
}

async applyDeletion(event: NostrEvent): Promise<{ stored: boolean; emissions: Array<{ subjectId: string; state: string; reason: string }> }> {
  const targets = deletionTargets(event);
  await this.db.transaction('rw', this.db.events, this.db.deletion_index, async () => {
    await this.putEvent(event);
    for (const targetId of targets) {
      await this.db.deletion_index.put({
        key: `${targetId}:${event.pubkey}`,
        target_id: targetId,
        pubkey: event.pubkey,
        deletion_id: event.id,
        created_at: event.created_at
      });
      const target = await this.db.events.get(targetId);
      if (target?.pubkey === event.pubkey) await this.db.events.delete(targetId);
    }
  });
  return { stored: true, emissions: targets.map((id) => ({ subjectId: id, state: 'deleted', reason: 'tombstoned' })) };
}
```

- [ ] **Step 4: Wire `putWithReconcile()`**

```ts
async putWithReconcile(event: NostrEvent): Promise<{ stored: boolean; emissions: Array<{ subjectId: string; state: string; reason: string }> }> {
  if (event.kind === DELETION_KIND) return this.applyDeletion(event);
  if (await this.isDeleted(event.id, event.pubkey)) {
    return { stored: false, emissions: [{ subjectId: event.id, state: 'deleted', reason: 'tombstoned' }] };
  }
  await this.putEvent(event);
  return { stored: true, emissions: [{ subjectId: event.id, state: 'confirmed', reason: 'accepted-new' }] };
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run packages/adapter-dexie/src/materialization.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/materialization.contract.test.ts
git commit -m "feat: add dexie deletion materialization"
```

### Task 2: Implement Replaceable Heads

**Files:**

- Modify: `packages/adapter-dexie/src/index.ts`
- Modify: `packages/adapter-dexie/src/materialization.contract.test.ts`

- [ ] **Step 1: Add failing replaceable tests**

```ts
it('keeps newest replaceable head by pubkey and kind', async () => {
  const store = await createDexieEventStore({ dbName: 'auftakt-dexie-replaceable' });
  await store.putWithReconcile({
    id: 'old',
    pubkey: 'alice',
    created_at: 1,
    kind: 0,
    tags: [],
    content: 'old',
    sig: 'sig'
  });
  await store.putWithReconcile({
    id: 'new',
    pubkey: 'alice',
    created_at: 2,
    kind: 0,
    tags: [],
    content: 'new',
    sig: 'sig'
  });

  await expect(store.getReplaceableHead('alice', 0, '')).resolves.toMatchObject({ id: 'new' });
  await expect(store.getById('old')).resolves.toBeNull();
});

it('keeps newest parameterized replaceable head by d tag', async () => {
  const store = await createDexieEventStore({ dbName: 'auftakt-dexie-addressable' });
  await store.putWithReconcile({
    id: 'old',
    pubkey: 'alice',
    created_at: 1,
    kind: 30030,
    tags: [['d', 'emoji']],
    content: 'old',
    sig: 'sig'
  });
  await store.putWithReconcile({
    id: 'new',
    pubkey: 'alice',
    created_at: 2,
    kind: 30030,
    tags: [['d', 'emoji']],
    content: 'new',
    sig: 'sig'
  });

  await expect(store.getReplaceableHead('alice', 30030, 'emoji')).resolves.toMatchObject({
    id: 'new'
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm exec vitest run packages/adapter-dexie/src/materialization.contract.test.ts`  
Expected: FAIL because replaceable head methods are missing.

- [ ] **Step 3: Implement replaceable helpers**

```ts
function isReplaceable(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind <= 19999);
}

function isParameterizedReplaceable(kind: number): boolean {
  return kind >= 30000 && kind <= 39999;
}

async getReplaceableHead(pubkey: string, kind: number, d_tag = ''): Promise<NostrEvent | null> {
  const head = await this.db.replaceable_heads.get(`${pubkey}:${kind}:${d_tag}`);
  return head ? this.getById(head.event_id) : null;
}

async applyReplaceable(event: NostrEvent): Promise<{ stored: boolean; emissions: Array<{ subjectId: string; state: string; reason: string }> }> {
  const d_tag = isParameterizedReplaceable(event.kind) ? dTag(event.tags) : '';
  const key = `${event.pubkey}:${event.kind}:${d_tag}`;
  const current = await this.db.replaceable_heads.get(key);
  if (current && current.created_at >= event.created_at) {
    return { stored: false, emissions: [{ subjectId: event.id, state: 'shadowed', reason: 'ignored-older' }] };
  }
  await this.db.transaction('rw', this.db.events, this.db.replaceable_heads, async () => {
    if (current) await this.db.events.delete(current.event_id);
    await this.putEvent(event);
    await this.db.replaceable_heads.put({ key, event_id: event.id, pubkey: event.pubkey, kind: event.kind, d_tag, created_at: event.created_at });
  });
  return { stored: true, emissions: [{ subjectId: event.id, state: 'confirmed', reason: current ? 'replaced-winner' : 'accepted-new' }] };
}
```

- [ ] **Step 4: Route replaceable events from `putWithReconcile()`**

```ts
if (isReplaceable(event.kind) || isParameterizedReplaceable(event.kind)) {
  return this.applyReplaceable(event);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run packages/adapter-dexie/src/materialization.contract.test.ts packages/adapter-dexie/src/schema.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/materialization.contract.test.ts
git commit -m "feat: add dexie replaceable materialization"
```
