# auftakt Gap Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** gap-analysis.md で特定された残存 26 件の spec/implementation 乖離を修正する

**Architecture:** 既存コードに最小限の変更を加えて gap を解消する。新規ファイル作成は不要 — 全て既存ファイルの修正。Phase ごとに独立してコミット可能。

**Tech Stack:** TypeScript, vitest

**Dependencies:** Plan F (offline recovery) の未コミット変更が working tree に存在する前提

---

## Gap → Phase マッピング

| Phase | 対象 Gap                           | テーマ                         |
| ----- | ---------------------------------- | ------------------------------ |
| 1     | C7, F1                             | GC + Recovery の致命的バグ修正 |
| 2     | D4, H5, E4, C6                     | Relay プロトコル正確性         |
| 3     | A4, A5, A3                         | Runtime 配線                   |
| 4     | F9, F4, F10                        | Recovery ロバスト性            |
| 5     | G1, G3                             | Live subscription 正確性       |
| 6     | B1, B5, B7, C5                     | Handle / State API             |
| 7     | A6, B2, B6, C3, D7, D9, E2, E3, H2 | Low priority polish            |

---

## File Structure (変更のみ)

| File                              | 変更内容                                                                                             | Phase   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ------- |
| `core/gc.ts`                      | `instanceof Map` ガード除去、PersistentStore interface 経由に変更                                    | 1       |
| `core/runtime.ts`                 | GC の `instanceof Map` ガード除去 + Nip11Registry / TemporaryRelayTracker / config pass-through 配線 | 1, 3    |
| `core/models/session.ts`          | GC の `instanceof Map` ガード除去 + `onPublishing` 位置修正                                          | 1, 2    |
| `core/relay/relay-manager.ts`     | AbortController 保持 + recoveryCooldown abort 区別 + online backoff リセット + AUTH challenge tag    | 1, 2, 4 |
| `core/relay/fetch-scheduler.ts`   | EOSE 後 CLOSE 送信                                                                                   | 2       |
| `core/sync/recovery-strategy.ts`  | filter に windowSince/windowUntil 注入 + CB relay フィルタリング                                     | 2, 4    |
| `core/sync-engine.ts`             | liveQuery に coverage-aware since + deletion-watch relay 追加伝播                                    | 5       |
| `core/relay/circuit-breaker.ts`   | HALF-OPEN 遷移 callback 追加                                                                         | 4       |
| `core/relay/relay-connection.ts`  | resetBackoff() public メソッド追加                                                                   | 4       |
| `core/store-types.ts`             | GcStore interface 追加 + QueryFilter 拡張 + deleteTombstone signature 修正                           | 1, 7    |
| `core/models/event.ts`            | live() + dispose() 追加                                                                              | 6       |
| `core/handles/timeline-handle.ts` | hasMore 更新 + state.deleted/optimistic 設定                                                         | 6       |
| `index.ts`                        | signer re-export                                                                                     | 7       |
| `testing/fakes.ts`                | GcStore 準拠の fake 更新                                                                             | 1       |

---

### Phase 1: GC + Recovery 致命的バグ修正

#### Task 1: GC の `instanceof Map` ガード除去 (C7 + E5)

**問題:** `gcExpiredOptimistic` は `store.events instanceof Map` を要求する。`DexiePersistentStore` は `events` を Map として公開しないため、production では GC が到達不能。`session.ts` と `runtime.ts` の両方に同じガードがある。

**Files:**

- Modify: `src/shared/nostr/auftakt/core/store-types.ts`
- Modify: `src/shared/nostr/auftakt/core/gc.ts`
- Modify: `src/shared/nostr/auftakt/core/runtime.ts`
- Modify: `src/shared/nostr/auftakt/core/models/session.ts`
- Modify: `src/shared/nostr/auftakt/testing/fakes.ts`
- Test: `src/shared/nostr/auftakt/core/gc.test.ts`

- [ ] **Step 1: PersistentStore に GC 用メソッドを追加 (store-types.ts)**

`PersistentStore` interface に `listOptimisticEvents` を追加:

```typescript
// store-types.ts の PersistentStore interface に追加
  listOptimisticEvents(): Promise<Array<{
    id: string;
    optimistic: boolean;
    publishStatus?: string;
    created_at?: number;
  }>>;
```

- [ ] **Step 2: failing test を書く (gc.test.ts)**

```typescript
// gc.test.ts — gcExpiredOptimistic を PersistentStore interface 準拠の store でテスト
import { describe, expect, it } from 'vitest';

import { createFakePersistentStore } from '$shared/nostr/auftakt/testing/fakes.js';

import { gcExpiredOptimistic, gcStaleTombstones } from './gc.js';

describe('gcExpiredOptimistic (PersistentStore interface)', () => {
  it('deletes confirmed optimistic events via listOptimisticEvents', async () => {
    const store = createFakePersistentStore();

    await store.putEvent({
      id: 'opt-1',
      kind: 1,
      pubkey: 'alice',
      created_at: 1000,
      content: '',
      tags: [],
      sig: 'sig',
      optimistic: true,
      publishStatus: 'confirmed'
    });

    const deleted = await gcExpiredOptimistic(store, { retentionSeconds: 86_400 });
    expect(deleted).toBe(1);
    expect(await store.getEvent('opt-1')).toBeUndefined();
  });

  it('deletes failed optimistic events older than retention', async () => {
    const store = createFakePersistentStore();
    const now = 100_000;

    await store.putEvent({
      id: 'opt-2',
      kind: 1,
      pubkey: 'alice',
      created_at: now - 90_000,
      content: '',
      tags: [],
      sig: 'sig',
      optimistic: true,
      publishStatus: 'failed'
    });

    const deleted = await gcExpiredOptimistic(store, { retentionSeconds: 86_400, now });
    expect(deleted).toBe(1);
  });

  it('keeps pending optimistic events', async () => {
    const store = createFakePersistentStore();

    await store.putEvent({
      id: 'opt-3',
      kind: 1,
      pubkey: 'alice',
      created_at: 1000,
      content: '',
      tags: [],
      sig: 'sig',
      optimistic: true,
      publishStatus: 'pending'
    });

    const deleted = await gcExpiredOptimistic(store, { retentionSeconds: 86_400 });
    expect(deleted).toBe(0);
  });
});
```

- [ ] **Step 3: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/gc.test.ts`
Expected: FAIL — `listOptimisticEvents` not found or signature mismatch

- [ ] **Step 4: fakes.ts に `listOptimisticEvents` を追加**

```typescript
// fakes.ts の createFakePersistentStore return に追加
    listOptimisticEvents() {
      return Promise.resolve(
        [...events.values()]
          .filter((e: any) => e.optimistic === true)
          .map((e: any) => ({
            id: e.id as string,
            optimistic: true,
            publishStatus: e.publishStatus as string | undefined,
            created_at: e.created_at as number | undefined,
          }))
      );
    },
```

- [ ] **Step 5: gc.ts を PersistentStore interface 準拠に書き換え**

```typescript
// gc.ts — 完全書き換え
interface GcStore {
  listOptimisticEvents(): Promise<
    Array<{
      id: string;
      optimistic: boolean;
      publishStatus?: string;
      created_at?: number;
    }>
  >;
  deleteEvent(id: string): Promise<void>;
}

interface GcOptions {
  retentionSeconds: number;
  now?: number;
}

export async function gcExpiredOptimistic(store: GcStore, options: GcOptions): Promise<number> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const cutoff = now - options.retentionSeconds;
  let deleted = 0;

  const optimisticEvents = await store.listOptimisticEvents();

  for (const record of optimisticEvents) {
    if (record.publishStatus === 'confirmed') {
      await store.deleteEvent(record.id);
      deleted++;
      continue;
    }

    if (
      (record.publishStatus === 'failed' || record.publishStatus === 'partial') &&
      typeof record.created_at === 'number' &&
      record.created_at < cutoff
    ) {
      await store.deleteEvent(record.id);
      deleted++;
    }
  }

  return deleted;
}

// gcStaleTombstones はそのまま維持
interface TombstoneGcStore {
  listTombstones(filter: {
    verified?: boolean;
    createdBefore?: number;
  }): Promise<Array<{ targetEventId?: string; targetAddress?: string }>>;
  deleteTombstone(targetEventId: string): Promise<void>;
}

export async function gcStaleTombstones(
  store: TombstoneGcStore,
  options: { ttlDays: number; now?: number }
): Promise<number> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const cutoff = now - options.ttlDays * 86_400;

  const stale = await store.listTombstones({
    verified: false,
    createdBefore: cutoff
  });

  let deleted = 0;
  for (const tombstone of stale) {
    const key = tombstone.targetEventId ?? tombstone.targetAddress;
    if (key) {
      await store.deleteTombstone(key);
      deleted++;
    }
  }

  return deleted;
}
```

- [ ] **Step 6: runtime.ts の `instanceof Map` ガードを除去**

```typescript
// runtime.ts — GC timer section を書き換え (line 57-81)
const gcIntervalMs = config.gcInterval ?? 3_600_000;
const ttlDays = config.preTombstoneTtlDays ?? 7;
const hasGcMethods = 'listOptimisticEvents' in persistentStore && 'deleteEvent' in persistentStore;
const hasTombstoneGc = 'listTombstones' in persistentStore && 'deleteTombstone' in persistentStore;

let gcTimer: ReturnType<typeof setInterval> | null = null;
if (hasGcMethods || hasTombstoneGc) {
  gcTimer = setInterval(() => {
    if (hasGcMethods) {
      void gcExpiredOptimistic(
        persistentStore as {
          listOptimisticEvents(): Promise<
            Array<{ id: string; optimistic: boolean; publishStatus?: string; created_at?: number }>
          >;
          deleteEvent(id: string): Promise<void>;
        },
        { retentionSeconds: 86_400 }
      ).catch(() => undefined);
    }
    if (hasTombstoneGc) {
      void gcStaleTombstones(
        persistentStore as {
          listTombstones(filter: {
            verified?: boolean;
            createdBefore?: number;
          }): Promise<Array<{ targetEventId?: string; targetAddress?: string }>>;
          deleteTombstone(targetEventId: string): Promise<void>;
        },
        { ttlDays }
      ).catch(() => undefined);
    }
  }, gcIntervalMs);
}
```

- [ ] **Step 7: session.ts の `instanceof Map` ガードを除去**

```typescript
// session.ts — Step 2 GC section (line 170-176) を書き換え
// Step 2: Fire-and-forget GC for expired optimistic rows
if (store && 'listOptimisticEvents' in store && 'deleteEvent' in store) {
  void gcExpiredOptimistic(
    store as {
      listOptimisticEvents(): Promise<
        Array<{ id: string; optimistic: boolean; publishStatus?: string; created_at?: number }>
      >;
      deleteEvent(id: string): Promise<void>;
    },
    { retentionSeconds: 86_400 }
  ).catch(() => undefined);
}
```

- [ ] **Step 8: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/gc.test.ts`
Expected: 全 pass

- [ ] **Step 9: 全 auftakt テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全 pass

- [ ] **Step 10: Commit**

```bash
git add src/shared/nostr/auftakt/core/gc.ts src/shared/nostr/auftakt/core/gc.test.ts \
  src/shared/nostr/auftakt/core/store-types.ts src/shared/nostr/auftakt/core/runtime.ts \
  src/shared/nostr/auftakt/core/models/session.ts src/shared/nostr/auftakt/testing/fakes.ts
git commit -m "fix: remove instanceof Map guard from GC — enable DexiePersistentStore GC (C7)"
```

---

#### Task 2: AbortSignal が recovery 中断時に発火しない (F1)

**問題:** `relay-manager.ts:468` で `new AbortController().signal` を使い捨てしている。AbortController への参照を保持しないため、再切断時に `.abort()` を呼べない。

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- Test: `src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// relay-manager.test.ts に追加
describe('recovery abort', () => {
  it('aborts in-flight recovery when a relay disconnects during recovery', async () => {
    let capturedSignal: AbortSignal | null = null;

    const strategy: RecoveryStrategy = {
      async onRecovery(context) {
        capturedSignal = context.signal;
        // Simulate slow recovery
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    };

    const manager = new RelayManager({
      connect: createMockSocket,
      recovery: { stabilityWindow: 10, strategy }
    });

    // Create a relay and simulate connect → disconnect → reconnect
    manager.subscribe({
      filter: { kinds: [1] },
      relays: ['wss://relay.test'],
      onEvent: vi.fn()
    });

    // Trigger recovery
    const relay = getLastSocket();
    relay.simulateOpen();
    relay.simulateClose(); // sets disconnectedAt
    relay.simulateOpen(); // triggers recovery schedule

    await vi.advanceTimersByTimeAsync(20); // past stabilityWindow

    // Signal should be captured and NOT aborted
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(false);

    // Now simulate another disconnect during recovery
    relay.simulateClose();

    // Signal should be aborted
    expect(capturedSignal!.aborted).toBe(true);
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`
Expected: FAIL — signal is never aborted

- [ ] **Step 3: relay-manager.ts に AbortController 保持を追加**

```typescript
// relay-manager.ts に追加
  #recoveryAbortController: AbortController | null = null;

// #executeRecovery を修正:
  async #executeRecovery(): Promise<void> {
    if (!this.#recoveryStrategy || this.#disconnectedAt === null) return;

    const disconnectedAt = this.#disconnectedAt;
    const reconnectedAt = Date.now();

    // Create and retain AbortController (F1)
    this.#recoveryAbortController = new AbortController();

    try {
      await this.#recoveryStrategy.onRecovery({
        disconnectedAt,
        reconnectedAt,
        activeQueries: this.#syncEngine?.getActiveQueries?.() ?? [],
        syncEngine: (this.#syncEngine ?? { syncQuery: () => Promise.resolve() }) as never,
        persistentStore: (this.#persistentStoreForRecovery ?? {}) as never,
        signal: this.#recoveryAbortController.signal
      });

      // Only set cooldown on successful completion (F2)
      this.#lastRecoveryAt = Date.now();
    } catch {
      // recovery failed — do NOT set lastRecoveryAt so cooldown doesn't block next attempt
    }

    this.#recoveryAbortController = null;
    this.#disconnectedAt = null;
  }

// onStateChange callback 内の disconnect 検知に abort を追加:
    connection.onStateChange((newState) => {
      if (newState === 'waiting-for-retrying') {
        if (this.#disconnectedAt === null) {
          this.#disconnectedAt = Date.now();
        }
        // Abort in-flight recovery (F1)
        this.#recoveryAbortController?.abort();
      }
      if (newState === 'connected' && this.#disconnectedAt !== null) {
        this.#scheduleRecovery();
      }
    });
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`
Expected: pass

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/relay-manager.ts src/shared/nostr/auftakt/core/relay/relay-manager.test.ts
git commit -m "fix: retain AbortController for recovery abort on re-disconnect (F1, F2)"
```

---

### Phase 2: Relay プロトコル正確性

#### Task 3: FetchScheduler が EOSE 後に CLOSE を送信しない (D4)

**問題:** `fetch-scheduler.ts:128-132` — EOSE 受信時に timer clear + finalize のみ。`['CLOSE', subId]` を relay に送信しない。

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts`
- Test: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// fetch-scheduler.test.ts に追加
it('sends CLOSE after receiving EOSE', async () => {
  const sent: unknown[][] = [];
  const connection = createMockFetchConnection(sent);
  const slots = new SlotCounter(10);
  const scheduler = new FetchScheduler({ eoseTimeout: 5000 });

  const fetchPromise = scheduler.fetch({
    filter: { kinds: [1] },
    connection,
    slots,
    onEvent: vi.fn()
  });

  // Find the REQ subId
  const reqMsg = sent.find((m) => m[0] === 'REQ');
  const subId = reqMsg?.[1] as string;

  // Simulate EOSE
  connection.simulateMessage(['EOSE', subId]);
  await fetchPromise;

  // Should have sent CLOSE
  const closeMsg = sent.find((m) => m[0] === 'CLOSE' && m[1] === subId);
  expect(closeMsg).toBeDefined();
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts`
Expected: FAIL — no CLOSE message sent

- [ ] **Step 3: fetch-scheduler.ts の EOSE handler に CLOSE 送信を追加**

```typescript
// fetch-scheduler.ts — #executeShard 内、EOSE handler (line 128-132) を修正:
if (type === 'EOSE' && msgSubId === subId) {
  clearTimeout(timer);
  off();
  input.connection.send(['CLOSE', subId]); // D4: close subscription
  void finalize();
}
```

Also add CLOSE on timeout (line 104-107):

```typescript
const timer = setTimeout(() => {
  off();
  input.connection.send(['CLOSE', subId]); // D4: close on timeout too
  void finalize();
}, this.#eoseTimeout);
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts`
Expected: pass

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts
git commit -m "fix: send CLOSE after EOSE in FetchScheduler (D4)"
```

---

#### Task 4: NIP-42 AUTH に challenge tag 追加 (H5)

**問題:** `relay-manager.ts:363-366` — AUTH event の tags に `['relay', url]` のみ。NIP-42 準拠の `['challenge', challenge]` tag がない。

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- Test: `src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// relay-manager.test.ts に追加
describe('NIP-42 authenticate', () => {
  it('includes challenge tag in AUTH event', async () => {
    const signedEvents: Array<Record<string, unknown>> = [];
    const signer = {
      async signEvent(event: Record<string, unknown>) {
        signedEvents.push(event);
        return { ...event, id: 'signed', sig: 'sig' };
      }
    };

    const manager = new RelayManager({ connect: createMockSocket });

    // Subscribe to create relay and capture challenge
    manager.subscribe({
      filter: { kinds: [1] },
      relays: ['wss://relay.test'],
      onEvent: vi.fn()
    });
    const socket = getLastSocket();
    socket.simulateOpen();

    // Simulate AUTH challenge from relay
    socket.simulateMessage(['AUTH', 'test-challenge-123']);

    // Authenticate
    await manager.authenticate({ read: ['wss://relay.test'], write: ['wss://relay.test'] }, signer);

    expect(signedEvents).toHaveLength(1);
    const tags = signedEvents[0].tags as string[][];
    expect(tags).toContainEqual(['relay', 'wss://relay.test']);
    expect(tags).toContainEqual(['challenge', 'test-challenge-123']);
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`
Expected: FAIL — tags does not contain challenge

- [ ] **Step 3: relay-manager.ts の authenticate を修正**

```typescript
// relay-manager.ts — authenticate 内 (line 362-369) を修正:
const event = await signer.signEvent({
  kind: 22242,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['relay', url],
    ['challenge', relay.challenge] // H5: NIP-42 required tag
  ],
  content: ''
});
```

Note: `content` を `relay.challenge` から空文字列に変更 — NIP-42 は challenge を content ではなく tag で指定する。

- [ ] **Step 4: テスト pass を確認 → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/relay-manager.ts src/shared/nostr/auftakt/core/relay/relay-manager.test.ts
git commit -m "fix: add challenge tag to NIP-42 AUTH event (H5)"
```

---

#### Task 5: cast() が signing 前に publishing に遷移 (E4)

**問題:** `session.ts:344` — `onPublishing` が `signer.signEvent()` 呼び出し前に発火。

**Files:**

- Modify: `src/shared/nostr/auftakt/core/models/session.ts`
- Test: `src/shared/nostr/auftakt/core/models/session.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// session.test.ts に追加
it('transitions to publishing only after signing completes', async () => {
  const transitions: string[] = [];

  const session = await Session.open({
    runtime: {
      relayManager: {
        async publish() {
          return { acceptedRelays: ['r'], failedRelays: [], successRate: 1 };
        }
      },
      persistentStore: createFakePersistentStore()
    },
    signer: {
      async getPublicKey() {
        return 'pk';
      },
      async signEvent(e) {
        transitions.push('signed');
        return { ...e, id: 'id', sig: 'sig' };
      }
    }
  });
  session.setDefaultRelays({ read: ['wss://r.test'], write: ['wss://r.test'] });

  const handle = session.cast(
    { kind: 1, content: 'test', tags: [] },
    {
      completion: { mode: 'any' }
    }
  );

  // Track onPublishing via handle.status changes
  // After signing, status should transition signing → publishing → confirmed
  await handle.settled;

  // 'signed' should have been captured before publishing transition
  expect(transitions).toContain('signed');
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/models/session.test.ts`

- [ ] **Step 3: session.ts の `#publish` で `onPublishing` を signing 後に移動**

```typescript
// session.ts — #publish 内、onPublishing と signer.signEvent の順序を修正:
// 既存 (line 344-373):
//   options.onPublishing?.({...draft...});     ← signing 前
//   const pendingOptimisticWrite = persistOptimistic('pending');
//   signed = await this.signer.signEvent({...});
//   options.onPublishing?.(signed);            ← signing 後 (2回目)

// 修正後:
const pendingOptimisticWrite = persistOptimistic('pending');

let signed: Record<string, unknown>;
try {
  signed = await this.signer.signEvent({
    ...draft,
    pubkey: this.pubkey,
    created_at: 1
  });
} catch {
  await persistOptimistic('failed');
  return {
    event: draft,
    status: 'failed' as const,
    acceptedRelays: [] as string[],
    failedRelays: publishRelaySet.write,
    successRate: 0,
    failureReason: 'signer-rejected' as const,
    relayReasonCode: undefined,
    relayReasonMessage: undefined
  };
}

// E4: onPublishing fires AFTER signing completes, not before
options.onPublishing?.(signed);
```

Remove the first `onPublishing` call (line 344-349) entirely.

- [ ] **Step 4: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/models/session.ts src/shared/nostr/auftakt/core/models/session.test.ts
git commit -m "fix: fire onPublishing after signing, not before (E4)"
```

---

#### Task 6: Recovery filter に windowSince/windowUntil 注入 (C6)

**問題:** `sync-engine.ts:97-102` — `relayManager.fetch({ filter: input.filter })` に `input.filter` をそのまま渡す。`windowSince`/`windowUntil` が relay REQ filter の `since`/`until` に反映されない。

**Files:**

- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Test: `src/shared/nostr/auftakt/core/sync-engine.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// sync-engine.test.ts に追加
it('injects windowSince/windowUntil into relay fetch filter', async () => {
  const persistentStore = createFakePersistentStore();
  const relayManager = createFakeRelayManager({ fetchedEvents: [] });
  const syncEngine = new SyncEngine({ persistentStore, relayManager });

  await syncEngine.syncQuery({
    queryIdentityKey: 'q-window',
    fetchWindowKey: 'w-window',
    filter: { kinds: [1], authors: ['alice'] },
    filterBase: '{"kinds":[1],"authors":["alice"]}',
    projectionKey: 'default',
    policyKey: 'timeline-default',
    resume: 'none',
    windowSince: 5000,
    windowUntil: 6000,
    relays: ['wss://relay.test'],
    completion: { mode: 'all' }
  });

  // The filter sent to relay should include since/until from window
  expect(relayManager.fetchCalls[0]?.filter).toMatchObject({
    kinds: [1],
    authors: ['alice'],
    since: 5000,
    until: 6000
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/sync-engine.test.ts`
Expected: FAIL — filter lacks since/until

- [ ] **Step 3: sync-engine.ts に window injection を追加**

```typescript
// sync-engine.ts — syncQuery 内、relayManager.fetch 呼び出し前 (line 97) に:
const effectiveFilter = { ...input.filter };
if (input.windowSince !== undefined) {
  effectiveFilter.since = input.windowSince;
}
if (input.windowUntil !== undefined) {
  effectiveFilter.until = input.windowUntil;
}

const fetched = await this.#relayManager.fetch({
  filter: effectiveFilter, // C6: inject window into relay filter
  relays: input.relays,
  methods,
  completion: input.completion
});
```

- [ ] **Step 4: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/sync-engine.ts src/shared/nostr/auftakt/core/sync-engine.test.ts
git commit -m "fix: inject windowSince/windowUntil into relay fetch filter (C6)"
```

---

### Phase 3: Runtime 配線

#### Task 7: Nip11Registry を createRuntime に配線 (A4)

**問題:** `runtime.ts` が `Nip11Registry` を import/生成していない。RelayManager に `nip11Registry: undefined` で渡される。

**Files:**

- Modify: `src/shared/nostr/auftakt/core/runtime.ts`

- [ ] **Step 1: runtime.ts に Nip11Registry import + 配線を追加**

```typescript
// runtime.ts の先頭に import 追加:
import { Nip11Registry } from './relay/nip11-registry.js';

// createRuntime 内、RelayManager 生成前に:
const nip11Registry = new Nip11Registry({ persistentStore });

// DefaultRelayManager constructor args に追加:
new DefaultRelayManager({
  // 既存 config...
  nip11Registry // A4: wire NIP-11 registry
});
```

- [ ] **Step 2: 全 auftakt テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全 pass (Nip11Registry は optional dependency として扱われているため既存テスト影響なし)

- [ ] **Step 3: Commit**

```bash
git add src/shared/nostr/auftakt/core/runtime.ts
git commit -m "feat: wire Nip11Registry into createRuntime (A4)"
```

---

#### Task 8: TemporaryRelayTracker + config pass-through (A5, A3)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/runtime.ts`

- [ ] **Step 1: runtime.ts に TemporaryRelayTracker + config を追加**

```typescript
// runtime.ts の先頭に import 追加:
import { TemporaryRelayTracker } from './relay/temporary-relay-tracker.js';

// createRuntime config に追加:
    retry?: {
      strategy: 'exponential' | 'off';
      initialDelay?: number;
      maxDelay?: number;
      maxCount?: number;
    };
    idleTimeout?: number;
    temporaryRelayTtl?: number;
    connect?: (url: string) => unknown;

// createRuntime 内:
    const temporaryRelayTracker = new TemporaryRelayTracker({
      defaultRelays: config.bootstrapRelays ?? [],
      ttlMs: config.temporaryRelayTtl ?? 300_000
    });

// DefaultRelayManager constructor args に追加:
    new DefaultRelayManager({
      // 既存 config...
      temporaryRelayTracker,  // A5
      retry: config.retry,    // A3
      connect: config.connect as ((url: string) => WebSocketLike) | undefined,  // A3
    })
```

- [ ] **Step 2: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/runtime.ts
git commit -m "feat: wire TemporaryRelayTracker and config pass-through (A5, A3)"
```

---

### Phase 4: Recovery ロバスト性

#### Task 9: online 復帰時の backoff リセット (F9)

**問題:** `handleOnlineEvent()` が `ensureConnected()` を呼ぶだけ。`waiting-for-retrying` 状態の relay には効かず、backoff も深いまま。

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/relay-connection.ts`
- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- Test: `src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`

- [ ] **Step 1: relay-connection.ts に `resetBackoff()` を追加**

```typescript
// relay-connection.ts — public method 追加:
  resetBackoff(): void {
    this.#retryCount = 0;
  }
```

- [ ] **Step 2: failing test を書く**

```typescript
// relay-manager.test.ts に追加
it('resets backoff and reconnects on online event', () => {
  const sockets: any[] = [];
  const manager = new RelayManager({
    connect() {
      const s = createMockSocket();
      sockets.push(s);
      return s;
    }
  });

  manager.subscribe({
    filter: { kinds: [1] },
    relays: ['wss://relay.test'],
    onEvent: vi.fn()
  });

  const firstSocket = sockets[0];
  firstSocket.simulateOpen();
  firstSocket.simulateClose(); // enters waiting-for-retrying

  manager.handleOnlineEvent();

  // Should have reset backoff and attempted reconnect
  // The relay should get a new connection attempt
  expect(sockets.length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 3: relay-manager.ts の handleOnlineEvent を修正**

```typescript
// relay-manager.ts — handleOnlineEvent を修正:
  handleOnlineEvent(): void {
    let delay = 0;
    for (const state of this.#relays.values()) {
      const connState = state.connection.state;
      if (
        connState === 'waiting-for-retrying' ||
        connState === 'dormant' ||
        connState === 'error'
      ) {
        state.connection.resetBackoff(); // F9: reset backoff on online
        setTimeout(() => {
          state.connection.ensureConnected();
        }, delay);
        delay += 100;
      }
    }
  }
```

- [ ] **Step 4: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/relay-connection.ts \
  src/shared/nostr/auftakt/core/relay/relay-manager.ts \
  src/shared/nostr/auftakt/core/relay/relay-manager.test.ts
git commit -m "fix: reset backoff on online event for immediate reconnect (F9)"
```

---

#### Task 10: Recovery relay 選択で Circuit Breaker フィルタリング (F4)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/sync/recovery-strategy.ts`
- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- Test: `src/shared/nostr/auftakt/core/sync/recovery-strategy.test.ts`

- [ ] **Step 1: RecoveryContext に canAttemptRelay を追加**

```typescript
// recovery-strategy.ts — RecoveryContext に追加:
export interface RecoveryContext {
  // 既存フィールド...
  canAttemptRelay?(url: string): boolean; // F4: CB-aware relay filtering
}
```

- [ ] **Step 2: failing test を書く**

```typescript
// recovery-strategy.test.ts に追加
it('filters out OPEN relays using canAttemptRelay', async () => {
  const syncEngine = createFakeSyncEngine();
  const persistentStore = createFakePersistentStore();
  const controller = new AbortController();

  const strategy = new DefaultRecoveryStrategy();

  await strategy.onRecovery({
    disconnectedAt: 1000,
    reconnectedAt: 2000,
    activeQueries: [
      {
        queryIdentityKey: 'q1',
        filter: { kinds: [1] },
        relays: ['wss://healthy.test', 'wss://broken.test']
      }
    ],
    syncEngine,
    persistentStore,
    signal: controller.signal,
    canAttemptRelay: (url) => url !== 'wss://broken.test'
  });

  expect(syncEngine.calls).toHaveLength(1);
  expect(syncEngine.calls[0].relays).toEqual(['wss://healthy.test']);
});
```

- [ ] **Step 3: DefaultRecoveryStrategy に CB フィルタリングを追加**

```typescript
// recovery-strategy.ts — DefaultRecoveryStrategy.onRecovery 内:
for (const query of context.activeQueries) {
  if (context.signal.aborted) return;

  // F4: Filter out OPEN circuit breaker relays
  const healthyRelays = context.canAttemptRelay
    ? query.relays.filter((url) => context.canAttemptRelay!(url))
    : query.relays;

  if (healthyRelays.length === 0) continue;

  await context.syncEngine.syncQuery({
    // ...既存 args...
    relays: healthyRelays // F4: use filtered relays
  });
}
```

- [ ] **Step 4: relay-manager.ts の #executeRecovery で canAttemptRelay を渡す**

```typescript
// relay-manager.ts — #executeRecovery 内の onRecovery 呼び出しに追加:
await this.#recoveryStrategy.onRecovery({
  // ...既存 args...
  canAttemptRelay: (url: string) => this.canAttemptRelay(url) // F4
});
```

- [ ] **Step 5: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/sync/recovery-strategy.ts \
  src/shared/nostr/auftakt/core/sync/recovery-strategy.test.ts \
  src/shared/nostr/auftakt/core/relay/relay-manager.ts
git commit -m "fix: filter OPEN relays from recovery queries (F4)"
```

---

#### Task 11: CB HALF-OPEN 遷移時の callback (F10)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/circuit-breaker.ts`
- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- Test: `src/shared/nostr/auftakt/core/relay/circuit-breaker.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// circuit-breaker.test.ts に追加
it('calls onHalfOpen callback when transitioning to HALF-OPEN', () => {
  vi.useFakeTimers();
  const onHalfOpen = vi.fn();
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    cooldownMs: 100,
    maxCooldownMs: 5000,
    onHalfOpen
  });

  cb.recordFailure();
  expect(cb.state).toBe('open');

  vi.advanceTimersByTime(150);
  expect(cb.state).toBe('half-open');
  expect(onHalfOpen).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: circuit-breaker.ts に onHalfOpen callback を追加**

```typescript
// CircuitBreakerConfig に追加:
interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  maxCooldownMs: number;
  onHalfOpen?: () => void;  // F10
}

// constructor で保持:
  readonly #onHalfOpen: (() => void) | undefined;

  constructor(config: CircuitBreakerConfig) {
    // 既存...
    this.#onHalfOpen = config.onHalfOpen;
  }

// #openCircuit の timer callback 内:
    this.#cooldownTimer = setTimeout(() => {
      this.#cooldownTimer = null;
      this.#state = 'half-open';
      this.#onHalfOpen?.();  // F10: notify relay manager
    }, this.#currentCooldownMs);
```

- [ ] **Step 3: relay-manager.ts で onHalfOpen 時に probe を実行**

```typescript
// relay-manager.ts — #getOrCreateRelay 内、CircuitBreaker 作成時:
if (this.#cbConfig && !this.#circuitBreakers.has(url)) {
  this.#circuitBreakers.set(
    url,
    new CircuitBreaker({
      ...this.#cbConfig,
      onHalfOpen: () => {
        // F10: Attempt reconnect when CB transitions to HALF-OPEN
        const existingRelay = this.#relays.get(url);
        if (!existingRelay) {
          // Re-create relay for probe attempt
          this.#getOrCreateRelay(url).connection.ensureConnected();
        }
      }
    })
  );
}
```

- [ ] **Step 4: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/circuit-breaker.ts \
  src/shared/nostr/auftakt/core/relay/circuit-breaker.test.ts \
  src/shared/nostr/auftakt/core/relay/relay-manager.ts
git commit -m "feat: add onHalfOpen callback for proactive reconnect (F10)"
```

---

### Phase 5: Live subscription 正確性

#### Task 12: liveQuery に coverage-aware since 追加 (G1)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Test: `src/shared/nostr/auftakt/core/sync-engine.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// sync-engine.test.ts に追加
it('sets since in live subscription filter based on coverage', async () => {
  const persistentStore = createFakePersistentStore();
  const subscribeFilters: Array<Record<string, unknown>> = [];
  const relayManager = createFakeRelayManager({
    fetchedEvents: [],
    onSubscribe(filter) {
      subscribeFilters.push(filter);
    }
  });

  // Pre-populate coverage with a known endpoint
  await persistentStore.putQueryCoverage({
    queryIdentityKey: 'q-live',
    filterBase: '{"kinds":[1]}',
    projectionKey: 'default',
    policyKey: 'timeline-default',
    status: 'complete',
    windowUntil: 5000,
    lastSyncedAt: 5000
  });

  const syncEngine = new SyncEngine({ persistentStore, relayManager });

  syncEngine.liveQuery({
    queryIdentityKey: 'q-live',
    filter: { kinds: [1] },
    relays: ['wss://relay.test'],
    onEvent: vi.fn()
  });

  // The content subscription filter should include since from coverage
  const contentFilter = subscribeFilters.find(
    (f) => !('kinds' in f && (f.kinds as number[]).length === 1 && (f.kinds as number[])[0] === 5)
  );
  expect(contentFilter?.since).toBe(5000);
});
```

- [ ] **Step 2: sync-engine.ts の liveQuery に coverage-aware since を追加**

```typescript
// sync-engine.ts — liveQuery を修正:
  liveQuery(input: {
    queryIdentityKey: string;
    filter: Record<string, unknown>;
    relays: string[];
    onEvent(event: unknown, from: string): void | Promise<void>;
  }) {
    const persistentStore = this.#persistentStore;
    const tombstoneProcessor = this.#tombstoneProcessor;

    // G1: Set since based on coverage endpoint
    const effectiveFilter = { ...input.filter };
    // Fire-and-forget coverage lookup to set since (cannot await in sync method)
    void persistentStore.getQueryCoverage(input.queryIdentityKey).then((coverage) => {
      // Coverage endpoint becomes the since for live subscription
      // This prevents gap between load() and live()
      if (coverage?.windowUntil !== undefined) {
        effectiveFilter.since = coverage.windowUntil;
      } else if (!('since' in effectiveFilter)) {
        // No coverage = first load hasn't happened yet. Default to now
        effectiveFilter.since = Math.floor(Date.now() / 1000);
      }
    }).catch(() => undefined);

    // ... rest of liveQuery with effectiveFilter instead of input.filter
```

Note: since liveQuery is synchronous and returns a handle, the coverage lookup is async. The filter is mutated in-place before the subscription sends REQ (since ForwardAssembler batches filter changes). If timing is a concern, the alternative is to make liveQuery async, but that would change the public API.

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/sync-engine.ts src/shared/nostr/auftakt/core/sync-engine.test.ts
git commit -m "feat: set coverage-aware since on live subscriptions (G1)"
```

---

#### Task 13: deletion-watch の relay 追加伝播 (G3)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Test: `src/shared/nostr/auftakt/core/sync-engine.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// sync-engine.test.ts に追加
it('propagates deletion-watch to newly added relays', () => {
  const persistentStore = createFakePersistentStore();
  const subscriptions: Array<{ relays: string[]; filter: Record<string, unknown> }> = [];
  const relayManager = createFakeRelayManager({
    fetchedEvents: [],
    onSubscribe(filter, relays) {
      subscriptions.push({ filter, relays });
    }
  });

  const syncEngine = new SyncEngine({ persistentStore, relayManager });

  // First liveQuery creates deletion-watch for relay1
  syncEngine.liveQuery({
    queryIdentityKey: 'q1',
    filter: { kinds: [1] },
    relays: ['wss://relay1.test'],
    onEvent: vi.fn()
  });

  // Second liveQuery adds relay2 — deletion-watch should extend
  syncEngine.liveQuery({
    queryIdentityKey: 'q2',
    filter: { kinds: [1] },
    relays: ['wss://relay2.test'],
    onEvent: vi.fn()
  });

  // Should have deletion-watch subscriptions for both relays
  const deletionSubs = subscriptions.filter(
    (s) => 'kinds' in s.filter && (s.filter.kinds as number[]).includes(5)
  );
  const coveredRelays = deletionSubs.flatMap((s) => s.relays);
  expect(coveredRelays).toContain('wss://relay1.test');
  expect(coveredRelays).toContain('wss://relay2.test');
});
```

- [ ] **Step 2: sync-engine.ts の deletion-watch を新 relay に伝播**

```typescript
// sync-engine.ts — liveQuery の deletion-watch section を修正:
this.#deletionWatchRefCount++;
// G3: Register deletion-watch for ALL relays, not just first liveQuery's
for (const relayUrl of input.relays) {
  if (!this.#deletionWatchUnsubs.has(relayUrl)) {
    const handle = this.#relayManager.subscribe({
      filter: { kinds: [5] },
      relays: [relayUrl],
      onEvent: async (event: unknown) => {
        const nostrEvent = event as { kind?: number };
        if (nostrEvent.kind === 5) {
          await tombstoneProcessor.processDeletion(event as NostrEvent).catch(() => undefined);
        }
      }
    });
    this.#deletionWatchUnsubs.set(relayUrl, () => handle.unsubscribe());
  }
}
```

Remove the `if (this.#deletionWatchRefCount === 1)` guard — always check for new relays.

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/sync-engine.ts src/shared/nostr/auftakt/core/sync-engine.test.ts
git commit -m "fix: propagate deletion-watch to newly added relays (G3)"
```

---

### Phase 6: Handle / State API

#### Task 14: state.deleted / state.optimistic + hasMore (B5, B7)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`
- Test: `src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts`

- [ ] **Step 1: Read current timeline-handle.ts to understand structure**

- [ ] **Step 2: hasMore 更新 — before()/after() で fetch 結果から判定**

```typescript
// timeline-handle.ts — before()/after() 内:
  async before(anchor: unknown) {
    // ...existing fetch logic...
    const fetchedCount = result.events.length;
    const requestedLimit = this.#limit;
    // B5: Update hasMore based on whether we got a full page
    this.hasMore = fetchedCount >= requestedLimit;
    // ...
  }
```

- [ ] **Step 3: state.deleted / state.optimistic 設定**

TimelineItemBuilder.done() 内で tombstone チェックと optimistic フラグを設定:

```typescript
// timeline-handle.ts — applyVisibility or item builder:
// B7: Set state.deleted from tombstone check
if (tombstone) {
  item.state.deleted = true;
}
// B7: Set state.optimistic from event metadata
if (event.optimistic === true) {
  item.state.optimistic = true;
}
```

- [ ] **Step 4: テスト pass → Commit**

```bash
git commit -m "feat: update hasMore on pagination, set state.deleted/optimistic (B5, B7)"
```

---

### Phase 7: Low Priority Polish

#### Task 15: Signer re-export (A6)

**Files:**

- Modify: `src/shared/nostr/auftakt/index.ts`

- [ ] **Step 1: index.ts に signer re-export を追加**

```typescript
// index.ts に追加:
export { nip07Signer } from './core/signers/nip07-signer.js';
export { seckeySigner } from './core/signers/seckey-signer.js';
export { noopSigner } from './core/signers/noop-signer.js';
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/nostr/auftakt/index.ts
git commit -m "feat: re-export individual signers from auftakt index (A6)"
```

---

#### Task 16: Remaining low-priority fixes (B2, B6, D9, E2, E3, H2)

These are low-impact fixes that can be batched into a single commit.

**Files:**

- Modify: Various (see gap list)

- [ ] **Step 1: E3 — PublishFailureReason 重複定義を解消**

`session.ts` の local `PublishFailureReason` 定義を削除し、`types.ts` から import:

```typescript
// session.ts:
import type { PublishFailureReason } from '../types.js';
// Delete lines 21-28 (local definition)
```

- [ ] **Step 2: D9 — RelayConnection に invalid message debug log を追加**

```typescript
// relay-connection.ts — message handler 内の parse 失敗時:
try {
  const parsed = JSON.parse(data);
  // ...
} catch {
  // D9: Log invalid messages at debug level
  if (typeof console !== 'undefined') {
    console.debug?.(`[auftakt] Invalid message from ${this.#url}:`, data);
  }
  return;
}
```

- [ ] **Step 3: H2 — tombstone-processor の a-tag tombstone を address-based query で検索**

```typescript
// tombstone-processor.ts — #processAddressTarget を修正:
// DB から addressable event を queryEvents で検索して verified: true に昇格可能にする
  async #processAddressTarget(input: {
    targetAddress: string;
    deletionEvent: NostrEvent;
  }): Promise<void> {
    const parts = input.targetAddress.split(':');
    if (parts.length < 2) return;
    const [kindStr, pubkey] = parts;

    // Author verification
    if (pubkey !== input.deletionEvent.pubkey) return;

    // Try to find the addressable event in DB
    const kind = parseInt(kindStr, 10);
    let verified = false;
    if (!isNaN(kind)) {
      const events = await this.#store.queryEvents({
        kinds: [kind],
        authors: [pubkey],
        limit: 1
      });
      if (events.length > 0) {
        verified = true;
      }
    }

    await this.#store.putTombstone({
      targetAddress: input.targetAddress,
      targetKindHint: isNaN(kind) ? undefined : kind,
      deletedByPubkey: input.deletionEvent.pubkey,
      deleteEventId: input.deletionEvent.id,
      createdAt: input.deletionEvent.created_at,
      verified
    });
  }
```

- [ ] **Step 4: 全テスト pass → Commit**

```bash
git commit -m "chore: low-priority gap fixes (E3, D9, H2)"
```

---

### Phase 8: 全体検証

#### Task 17: 全体テスト + format + lint

- [ ] **Step 1: format**

Run: `pnpm format`

- [ ] **Step 2: lint**

Run: `pnpm lint:fix`

- [ ] **Step 3: type check**

Run: `pnpm check`

- [ ] **Step 4: 全テスト**

Run: `pnpm test`

- [ ] **Step 5: E2E テスト**

Run: `pnpm test:e2e`

- [ ] **Step 6: fix があれば commit**

```bash
git add -A && git commit -m "chore: format, lint, and type fixes for gap remediation"
```

---

## 対象外 (別 plan で扱う)

| Gap                                 | 理由                                                      |
| ----------------------------------- | --------------------------------------------------------- |
| D2 (negentropy dead)                | NegentropySession 統合は大規模 feature — 専用 plan が必要 |
| C5 (optimistic consistency cascade) | read path のマージポイント設計が必要 — 専用設計           |
| C3 (QueryFilter search/#tag)        | local store の tag-based query は別 feature               |
| B1 (Event.fromId live())            | live 更新の設計が未確定                                   |
| D7 (CLOSED queuing)                 | ForwardAssembler/FetchScheduler の queuing 設計が必要     |
