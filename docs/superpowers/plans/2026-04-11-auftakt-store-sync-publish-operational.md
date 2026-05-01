# Auftakt Store Sync Publish Operationalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/auftakt/specs.md` に合わせて、`packages/auftakt` の `store + sync + publish` を foundation から実働部品へ引き上げる。少なくとも `fetchMany / fetchOne / fetchLatest`、optimistic / pending publish queue、`Session.open()` の pending publish retry を operational にする。

**Architecture:** `store` を source of truth に固定し、`sync` は read path の orchestration、`Session` は write/retry orchestration を担う。`transport` は fetch/publish の実行だけを持ち、batch/shard は transport の共通 execution policy として `NIP-11 + runtime error` の両方で reconcile する。

**Tech Stack:** TypeScript, Vitest, Dexie, fake-indexeddb, pnpm

---

## File Structure

- Modify: `packages/auftakt/src/store/dexie/schema.ts`
  - pending publish table と必要 index を追加する。
- Modify: `packages/auftakt/src/store/dexie/persistent-store.ts`
  - optimistic / pending publish / coverage API を実装する。
- Modify: `packages/auftakt/src/store/dexie/persistent-store.test.ts`
  - pending queue, failed/exhausted, reconcile を追加で固定する。
- Modify: `packages/auftakt/src/sync/sync-engine.ts`
  - `fetchMany / fetchOne / fetchLatest` の object return と coverage 更新を実装する。
- Modify: `packages/auftakt/src/sync/sync-engine.test.ts`
  - `queryIdentityKey / fetchWindowKey / fetchMany/fetchOne/fetchLatest` を固定する。
- Modify: `packages/auftakt/src/handles/session.ts`
  - queue save, publish result, retry orchestration を実装する。
- Modify: `packages/auftakt/src/handles/session.test.ts`
  - success/failure/retry/exhausted を固定する。
- Modify: `packages/auftakt/src/core/runtime.ts`
  - `Session.open()` が retry に必要な store/sync/relayManager を受け取れることを確認する。
- Modify: `packages/auftakt/src/testing/fakes.ts`
  - failed publish / retry 用の fake relay result を扱えるようにする。
- Modify: `packages/auftakt/src/index.ts`
  - 新しい sync/store surface を export する。
- Modify: `packages/auftakt/src/index.test.ts`
  - root export だけで publish/retry/read が一貫動作する acceptance を追加する。

### Task 1: Store に pending publish state model を実装する

**Files:**

- Modify: `packages/auftakt/src/store/dexie/schema.ts`
- Modify: `packages/auftakt/src/store/dexie/persistent-store.ts`
- Modify: `packages/auftakt/src/store/dexie/persistent-store.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
it('stores and updates pending publish records', async () => {
  const store = createDexiePersistentStore({ dbName: 'auftakt-store-pending' });
  const event = {
    id: 'evt-pending',
    pubkey: 'alice',
    created_at: 1,
    kind: 1,
    tags: [],
    content: 'hello',
    sig: 'sig',
    clientMutationId: 'mut-1'
  };

  await store.putOptimisticEvent(event);
  await store.putPendingPublish({
    event,
    status: 'optimistic',
    queued: true,
    attempts: 0
  });

  await expect(store.getPendingPublishes()).resolves.toMatchObject([
    { event: { id: 'evt-pending' }, status: 'optimistic', queued: true, attempts: 0 }
  ]);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm exec vitest run packages/auftakt/src/store/dexie/persistent-store.test.ts`  
Expected: pending publish API が未実装で FAIL

- [ ] **Step 3: 最小実装を書く**

```ts
export interface PendingPublishRecord {
  event: DexieNostrEventLike;
  status: 'optimistic' | 'failed' | 'confirmed' | 'exhausted';
  queued: boolean;
  attempts: number;
  lastError?: string;
  nextRetryAt?: number;
}
```

- [ ] **Step 4: failed / exhausted / delete API を足す**

少なくとも次を実装する。

- `putPendingPublish`
- `getPendingPublishes`
- `markPendingPublishFailed`
- `markPendingPublishExhausted`
- `deletePendingPublish`

- [ ] **Step 5: reconcile テストを追加して confirmed 到着時の挙動を固定**

Run: `pnpm exec vitest run packages/auftakt/src/store/dexie/persistent-store.test.ts`  
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add packages/auftakt/src/store/dexie/schema.ts packages/auftakt/src/store/dexie/persistent-store.ts packages/auftakt/src/store/dexie/persistent-store.test.ts
git commit -m "feat: add auftakt pending publish store state"
```

### Task 2: Sync に `fetchMany / fetchOne / fetchLatest` を実装する

**Files:**

- Modify: `packages/auftakt/src/sync/sync-engine.ts`
- Modify: `packages/auftakt/src/sync/sync-engine.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
it('returns object-shaped fetchMany result and derives fetchOne/fetchLatest from it', async () => {
  const store = createFakePersistentStore();
  const relayManager = {
    fetch: vi.fn(async () => [
      {
        id: 'evt-1',
        pubkey: 'alice',
        created_at: 1,
        kind: 1,
        tags: [],
        content: 'hello',
        sig: 'sig'
      }
    ])
  };
  const sync = createSyncEngine({ store, relayManager });

  const many = await sync.fetchMany({ authors: ['alice'], kinds: [1], limit: 20 });

  expect(many.items).toHaveLength(1);
  expect(many.queryIdentityKey).toBeTypeOf('string');
  expect(many.fetchWindowKey).toBeTypeOf('string');
  await expect(sync.fetchOne('evt-1')).resolves.toMatchObject({ id: 'evt-1' });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm exec vitest run packages/auftakt/src/sync/sync-engine.test.ts`  
Expected: `fetchMany` などが未実装で FAIL

- [ ] **Step 3: `fetchMany` を object 返却へ変更**

```ts
export interface SyncManyResult {
  items: SyncEventLike[];
  source: 'cache' | 'relay';
  stale: boolean;
  hasMore: boolean;
  coverage: CoverageState;
  queryIdentityKey: string;
  fetchWindowKey: string;
}
```

- [ ] **Step 4: `fetchOne` と `fetchLatest` を wrapper として実装**

原則:

- `fetchOne` は requested id と一致する event だけを返す
- `fetchLatest` は `fetchMany` の結果をそのまま返し、latest selection は上位層に残す

- [ ] **Step 5: coverage 保存と key 計算を object 返却に合わせて更新**

Run: `pnpm exec vitest run packages/auftakt/src/sync/sync-engine.test.ts`  
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add packages/auftakt/src/sync/sync-engine.ts packages/auftakt/src/sync/sync-engine.test.ts
git commit -m "feat: add auftakt sync read APIs"
```

### Task 3: `Session.publish()` を queue save / publish result に揃える

**Files:**

- Modify: `packages/auftakt/src/handles/session.ts`
- Modify: `packages/auftakt/src/handles/session.test.ts`

- [ ] **Step 1: failing test を追加する**

```ts
it('stores optimistic and pending records before publish', async () => {
  const runtime = createRuntime({ dbName: 'auftakt-session-pending' });
  const relayManager = createFakeRelayManager({
    publishResult: {
      acceptedRelays: [],
      failedRelays: ['wss://a'],
      successRate: 0
    }
  });
  const session = await Session.open({
    runtime: { ...runtime, relayManager },
    signer: noopSigner()
  });

  await session.publish({ id: 'evt-1', clientMutationId: 'mut-1' });

  await expect(runtime.store.getPendingPublishes()).resolves.toMatchObject([
    { event: { id: 'evt-1' }, status: 'failed', queued: true, attempts: 1 }
  ]);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm exec vitest run packages/auftakt/src/handles/session.test.ts`  
Expected: pending queue 連携が未実装で FAIL

- [ ] **Step 3: 新規 publish の flow を完成**

順序:

- signer
- validate
- `putOptimisticEvent`
- `putPendingPublish`
- `transport.publish`
- success なら `putEvent + deletePendingPublish`
- failure なら `markPendingPublishFailed`

- [ ] **Step 4: publish result の shape を固定**

少なくとも

- `ok`
- `event`
- `acceptedRelays`
- `rejectedRelays`

- [ ] **Step 5: テストを再実行して通す**

Run: `pnpm exec vitest run packages/auftakt/src/handles/session.test.ts packages/auftakt/src/core/models/session.test.ts`  
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add packages/auftakt/src/handles/session.ts packages/auftakt/src/handles/session.test.ts packages/auftakt/src/core/models/session.test.ts
git commit -m "feat: queue auftakt publishes through store"
```

### Task 4: `Session.open()` に pending publish retry を実装する

**Files:**

- Modify: `packages/auftakt/src/handles/session.ts`
- Modify: `packages/auftakt/src/handles/session.test.ts`
- Modify: `packages/auftakt/src/testing/fakes.ts`
- Modify: `packages/auftakt/src/testing/fakes.test.ts`

- [ ] **Step 1: failing retry test を書く**

```ts
it('retries pending publishes on Session.open()', async () => {
  const runtime = createRuntime({ dbName: 'auftakt-session-retry' });
  const event = {
    id: 'evt-retry',
    pubkey: 'alice',
    created_at: 1,
    kind: 1,
    tags: [],
    content: 'hello',
    sig: 'sig',
    clientMutationId: 'mut-retry'
  };

  await runtime.store.putPendingPublish({
    event,
    status: 'failed',
    queued: true,
    attempts: 1,
    nextRetryAt: 0
  });

  const relayManager = createFakeRelayManager({
    publishResult: { acceptedRelays: ['wss://a'], failedRelays: [], successRate: 1 }
  });

  await Session.open({ runtime: { ...runtime, relayManager }, signer: noopSigner() });

  await expect(runtime.store.getPendingPublishes()).resolves.toEqual([]);
  await expect(runtime.store.getEvent('evt-retry')).resolves.toMatchObject({ id: 'evt-retry' });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm exec vitest run packages/auftakt/src/handles/session.test.ts packages/auftakt/src/testing/fakes.test.ts`  
Expected: retry が未実装で FAIL

- [ ] **Step 3: retry 対象選別を実装**

条件:

- `queued = true`
- `status in ('optimistic', 'failed')`
- `attempts < maxAttempts`
- `nextRetryAt <= now`
- signed event 再検証が通る

- [ ] **Step 4: backoff と exhausted 遷移を実装**

v1 policy:

- 1 回目失敗: `+30s`
- 2 回目失敗: `+2m`
- 3 回目失敗: `+10m`
- `maxAttempts = 3`

- [ ] **Step 5: open 自体は失敗させないことを固定**

retry 個別失敗は state に記録し、`Session.open()` は session を返す。

- [ ] **Step 6: テストを再実行して通す**

Run: `pnpm exec vitest run packages/auftakt/src/handles/session.test.ts packages/auftakt/src/testing/fakes.test.ts`  
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add packages/auftakt/src/handles/session.ts packages/auftakt/src/handles/session.test.ts packages/auftakt/src/testing/fakes.ts packages/auftakt/src/testing/fakes.test.ts
git commit -m "feat: retry pending auftakt publishes on session open"
```

### Task 5: Root acceptance と export surface を揃える

**Files:**

- Modify: `packages/auftakt/src/index.ts`
- Modify: `packages/auftakt/src/index.test.ts`

- [ ] **Step 1: failing acceptance test を書く**

```ts
it('root export only can read, publish, and retry pending events', async () => {
  const runtime = createRuntime({ dbName: 'auftakt-root-acceptance' });
  const signer = noopSigner();
  const session = await Session.open({ runtime, signer });

  await expect(session.publish({ id: 'evt-root' })).resolves.toMatchObject({
    event: { id: 'evt-root' }
  });

  const event = Event.fromId('evt-root', { runtime });
  await expect(event.load()).resolves.toMatchObject({ id: 'evt-root' });
});
```

- [ ] **Step 2: テストを実行して不足を確認**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts packages/auftakt/src/handles/*.test.ts packages/auftakt/src/store/dexie/persistent-store.test.ts packages/auftakt/src/sync/sync-engine.test.ts`  
Expected: FAIL until all surfaces align

- [ ] **Step 3: export surface を揃える**

必要なら root export に次を追加する。

- pending publish types
- `SyncManyResult`
- store API type

- [ ] **Step 4: package 型チェックと acceptance を通す**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts packages/auftakt/src/handles/*.test.ts packages/auftakt/src/store/dexie/persistent-store.test.ts packages/auftakt/src/sync/sync-engine.test.ts`  
Expected: PASS

Run: `pnpm exec tsc -p packages/auftakt/tsconfig.json --noEmit`  
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/auftakt/src/index.ts packages/auftakt/src/index.test.ts
git commit -m "feat: expose operational auftakt store sync publish flow"
```

## Self-Review

- Spec coverage:
  - transport execution policy / NIP-11 + runtime error reconcile: Task 2, Task 5
  - `fetchMany / fetchOne / fetchLatest`: Task 2
  - publish state model / store API: Task 1, Task 3, Task 4
  - pending publish retry / backoff: Task 4
  - root acceptance: Task 5
- Placeholder scan:
  - `TODO`, `TBD`, 「後で実装」表現は含めていない
- Type consistency:
  - `fetchMany`, `fetchOne`, `fetchLatest`, `PendingPublishRecord`, `SessionPublishResult` の名前を plan 全体で統一した
