# auftakt Negentropy & GC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NIP-77 negentropy 差分同期、temporary relay hints、optimistic/failed row GC を実装する

**Architecture:** hoytech/negentropy JS を vendor 取り込み。SyncEngine が capability に基づいて negentropy/fetch を切り替え。GC は PersistentStore 所有

**Tech Stack:** TypeScript, vitest, hoytech/negentropy (vendor JS)

**Dependencies:** Plan C + Plan D 完了

---

## File Structure

| File                                                                  | 責務                                           |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| `src/shared/nostr/auftakt/vendor/negentropy/Negentropy.js`            | hoytech/negentropy vendor JS                   |
| `src/shared/nostr/auftakt/vendor/negentropy/negentropy.d.ts`          | TypeScript 型定義                              |
| `src/shared/nostr/auftakt/core/relay/negentropy-session.ts`           | NEG-OPEN/MSG/CLOSE session 管理                |
| `src/shared/nostr/auftakt/core/relay/negentropy-session.test.ts`      | テスト                                         |
| `src/shared/nostr/auftakt/core/relay/temporary-relay-tracker.ts`      | lazy/lazy-keep mode 追跡 + dormant TTL cleanup |
| `src/shared/nostr/auftakt/core/relay/temporary-relay-tracker.test.ts` | テスト                                         |
| `src/shared/nostr/auftakt/core/gc.ts`                                 | optimistic/failed row GC                       |
| `src/shared/nostr/auftakt/core/gc.test.ts`                            | テスト                                         |

**変更:**

| File                                           | 変更内容               |
| ---------------------------------------------- | ---------------------- |
| `src/shared/nostr/auftakt/core/sync-engine.ts` | negentropy path の統合 |
| `.eslintignore` or `eslint.config.js`          | vendor/ を除外         |
| `.prettierignore`                              | vendor/ を除外         |

---

### Task 1: Negentropy vendor 取り込み + 型定義

**Files:**

- Create: `src/shared/nostr/auftakt/vendor/negentropy/Negentropy.js` (hoytech/negentropy から取得)
- Create: `src/shared/nostr/auftakt/vendor/negentropy/negentropy.d.ts`

- [ ] **Step 1: hoytech/negentropy の JS ファイルを取得**

```bash
mkdir -p src/shared/nostr/auftakt/vendor/negentropy
curl -sL https://raw.githubusercontent.com/hoytech/negentropy/master/js/Negentropy.js \
  > src/shared/nostr/auftakt/vendor/negentropy/Negentropy.js
```

- [ ] **Step 2: TypeScript 型定義を作成**

```typescript
// src/shared/nostr/auftakt/vendor/negentropy/negentropy.d.ts
export interface NegentropyStorageItem {
  timestamp: number;
  id: Uint8Array;
}

export declare class NegentropyStorageVector {
  constructor();
  insert(timestamp: number, id: Uint8Array): void;
  seal(): void;
  size(): number;
}

export declare class Negentropy {
  constructor(storage: NegentropyStorageVector, frameSizeLimit?: number);
  initiate(): Promise<Uint8Array>;
  setInitiator(): void;
  reconcile(msg: Uint8Array): Promise<{
    output: Uint8Array | undefined;
    haveIds: Uint8Array[];
    needIds: Uint8Array[];
  }>;
}
```

- [ ] **Step 3: lint/prettier ignore に vendor を追加**

`.prettierignore` に追加:

```
src/shared/nostr/auftakt/vendor/
```

ESLint config に vendor 除外が必要な場合は `.eslintignore` or `eslint.config.js` に追加。

- [ ] **Step 4: Commit**

```bash
git add src/shared/nostr/auftakt/vendor/ .prettierignore
git commit -m "feat: vendor hoytech/negentropy JS with TypeScript declarations"
```

---

### Task 2: Negentropy Session

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/negentropy-session.ts`
- Test: `src/shared/nostr/auftakt/core/relay/negentropy-session.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/negentropy-session.test.ts
import { describe, expect, it, vi } from 'vitest';

import { NegentropySession } from './negentropy-session.js';

function createMockConnection() {
  const sent: unknown[][] = [];
  const messageHandlers = new Set<(msg: unknown[]) => void>();

  return {
    send(msg: unknown[]) {
      sent.push(msg);
    },
    onMessage(handler: (msg: unknown[]) => void) {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },
    ensureConnected() {},
    simulateNegMsg(subId: string, msg: string) {
      for (const h of messageHandlers) h(['NEG-MSG', subId, msg]);
    },
    simulateClosed(subId: string, reason: string) {
      for (const h of messageHandlers) h(['CLOSED', subId, reason]);
    },
    sent
  };
}

describe('NegentropySession', () => {
  it('sends NEG-OPEN on start', async () => {
    const conn = createMockConnection();
    const session = new NegentropySession({
      connection: conn as any,
      filter: { kinds: [1] },
      localEvents: [],
      timeout: 5000,
      maxRounds: 10
    });

    // Start returns a promise for missing IDs
    const promise = session.start();

    expect(conn.sent.length).toBeGreaterThanOrEqual(1);
    expect(conn.sent[0]![0]).toBe('NEG-OPEN');

    // Simulate immediate completion (empty diff)
    const subId = conn.sent[0]![1] as string;
    conn.simulateNegMsg(subId, ''); // empty = reconciliation complete

    const result = await promise;
    expect(result.needIds).toEqual([]);
  });

  it('falls back on CLOSED message', async () => {
    const conn = createMockConnection();
    const session = new NegentropySession({
      connection: conn as any,
      filter: { kinds: [1] },
      localEvents: [],
      timeout: 5000,
      maxRounds: 10
    });

    const promise = session.start();
    const subId = conn.sent[0]![1] as string;
    conn.simulateClosed(subId, 'unsupported');

    const result = await promise;
    expect(result.fallback).toBe(true);
  });

  it('respects maxRounds limit', async () => {
    const conn = createMockConnection();
    const session = new NegentropySession({
      connection: conn as any,
      filter: { kinds: [1] },
      localEvents: [],
      timeout: 5000,
      maxRounds: 2
    });

    const promise = session.start();
    const subId = conn.sent[0]![1] as string;

    // Simulate ongoing rounds that never complete
    conn.simulateNegMsg(subId, 'round1data');
    conn.simulateNegMsg(subId, 'round2data');

    const result = await promise;
    // Should have sent NEG-CLOSE after max rounds
    const closeMsg = conn.sent.find((m) => m[0] === 'NEG-CLOSE');
    expect(closeMsg).toBeDefined();
  });

  it('times out if no NEG-MSG received', async () => {
    const conn = createMockConnection();
    const session = new NegentropySession({
      connection: conn as any,
      filter: { kinds: [1] },
      localEvents: [],
      timeout: 30,
      maxRounds: 10
    });

    const result = await session.start();
    expect(result.fallback).toBe(true);
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/negentropy-session.ts

interface NegConnection {
  send(message: unknown[]): void;
  onMessage(handler: (message: unknown[]) => void): () => void;
  ensureConnected(): void;
}

interface NegentropySessionConfig {
  connection: NegConnection;
  filter: Record<string, unknown>;
  localEvents: Array<{ id: string; created_at: number }>;
  timeout: number;
  maxRounds: number;
}

export interface NegentropyResult {
  needIds: string[];
  haveIds: string[];
  fallback: boolean;
}

let negSubIdCounter = 0;

export class NegentropySession {
  readonly #connection: NegConnection;
  readonly #filter: Record<string, unknown>;
  readonly #localEvents: Array<{ id: string; created_at: number }>;
  readonly #timeout: number;
  readonly #maxRounds: number;

  constructor(config: NegentropySessionConfig) {
    this.#connection = config.connection;
    this.#filter = config.filter;
    this.#localEvents = config.localEvents;
    this.#timeout = config.timeout;
    this.#maxRounds = config.maxRounds;
  }

  async start(): Promise<NegentropyResult> {
    negSubIdCounter++;
    const subId = `neg:${negSubIdCounter}`;
    const needIds: string[] = [];
    const haveIds: string[] = [];

    return new Promise<NegentropyResult>((resolve) => {
      let rounds = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        off();
        if (timer) clearTimeout(timer);
      };

      const fallback = () => {
        cleanup();
        this.#connection.send(['NEG-CLOSE', subId]);
        resolve({ needIds, haveIds, fallback: true });
      };

      const resetTimer = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fallback, this.#timeout);
      };

      const off = this.#connection.onMessage((message) => {
        if (!Array.isArray(message)) return;

        const [type, msgSubId] = message;
        if (msgSubId !== subId) return;

        if (type === 'CLOSED') {
          cleanup();
          resolve({ needIds, haveIds, fallback: true });
          return;
        }

        if (type === 'NEG-MSG') {
          rounds++;
          resetTimer();

          const msg = message[2] as string;

          // Empty message or reconciliation complete
          if (!msg || msg === '') {
            cleanup();
            this.#connection.send(['NEG-CLOSE', subId]);
            resolve({ needIds, haveIds, fallback: false });
            return;
          }

          if (rounds >= this.#maxRounds) {
            fallback();
            return;
          }

          // In real implementation: use vendored Negentropy to process msg
          // and send next NEG-MSG. For now, send back empty to complete.
          this.#connection.send(['NEG-MSG', subId, '']);
        }
      });

      resetTimer();
      this.#connection.ensureConnected();

      // In real implementation: use vendored Negentropy to create initial message
      // For now, send placeholder
      this.#connection.send(['NEG-OPEN', subId, this.#filter, '']);
    });
  }
}
```

注意: 本 Task の実装は negentropy プロトコルのスタブ。Task 3 で vendored Negentropy ライブラリとの統合を完成させる。

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/negentropy-session.ts src/shared/nostr/auftakt/core/relay/negentropy-session.test.ts
git commit -m "feat: add NegentropySession with NEG-OPEN/MSG/CLOSE lifecycle"
```

---

### Task 3: SyncEngine negentropy 統合

**Files:**

- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`

- [ ] **Step 1: SyncEngine.syncQuery に negentropy path を統合**

`syncQuery` の `methods` が `negentropy` を含む relay に対して `NegentropySession` を使用し、missing IDs を `FetchScheduler` 経由で取得。

```typescript
// sync-engine.ts の syncQuery 内、relayManager.fetch 呼び出しの前に:
// negentropy supported な relay は NegentropySession で diff を取得
// missing IDs を relayManager.fetch({ filter: { ids: missingIds } }) で取得
// unsupported な relay は従来の relayManager.fetch({ filter }) で取得
```

具体的な統合コードは NegentropySession と vendor Negentropy ライブラリの統合が前提。TDD で段階的に実装。

- [ ] **Step 2: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/sync-engine.ts
git commit -m "feat: integrate negentropy path into SyncEngine.syncQuery"
```

---

### Task 4: Temporary Relay Tracker

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/temporary-relay-tracker.ts`
- Test: `src/shared/nostr/auftakt/core/relay/temporary-relay-tracker.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/temporary-relay-tracker.test.ts
import { describe, expect, it, vi } from 'vitest';

import { TemporaryRelayTracker } from './temporary-relay-tracker.js';

describe('TemporaryRelayTracker', () => {
  it('registers default relays as lazy-keep', () => {
    const tracker = new TemporaryRelayTracker({ temporaryRelayTtl: 5000 });
    tracker.registerDefault('wss://relay.test');
    expect(tracker.getMode('wss://relay.test')).toBe('lazy-keep');
  });

  it('registers unknown relays as lazy', () => {
    const tracker = new TemporaryRelayTracker({ temporaryRelayTtl: 5000 });
    tracker.touch('wss://hint.test');
    expect(tracker.getMode('wss://hint.test')).toBe('lazy');
  });

  it('disposes dormant temporary relays after TTL', async () => {
    const onDispose = vi.fn();
    const tracker = new TemporaryRelayTracker({
      temporaryRelayTtl: 30,
      onDisposeRelay: onDispose
    });

    tracker.touch('wss://hint.test');
    tracker.markDormant('wss://hint.test');

    await new Promise((r) => setTimeout(r, 60));

    expect(onDispose).toHaveBeenCalledWith('wss://hint.test');
  });

  it('resets dormant timer on touch', async () => {
    const onDispose = vi.fn();
    const tracker = new TemporaryRelayTracker({
      temporaryRelayTtl: 50,
      onDisposeRelay: onDispose
    });

    tracker.touch('wss://hint.test');
    tracker.markDormant('wss://hint.test');

    await new Promise((r) => setTimeout(r, 30));
    tracker.touch('wss://hint.test'); // reset

    await new Promise((r) => setTimeout(r, 30));
    expect(onDispose).not.toHaveBeenCalled();
  });

  it('does not dispose default relays', async () => {
    const onDispose = vi.fn();
    const tracker = new TemporaryRelayTracker({
      temporaryRelayTtl: 30,
      onDisposeRelay: onDispose
    });

    tracker.registerDefault('wss://relay.test');
    tracker.markDormant('wss://relay.test');

    await new Promise((r) => setTimeout(r, 60));
    expect(onDispose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/temporary-relay-tracker.ts
interface TrackerConfig {
  temporaryRelayTtl: number;
  onDisposeRelay?: (url: string) => void;
}

interface RelayEntry {
  mode: 'lazy' | 'lazy-keep';
  dormantTimer: ReturnType<typeof setTimeout> | null;
}

export class TemporaryRelayTracker {
  readonly #ttl: number;
  readonly #onDispose: (url: string) => void;
  readonly #relays = new Map<string, RelayEntry>();

  constructor(config: TrackerConfig) {
    this.#ttl = config.temporaryRelayTtl;
    this.#onDispose = config.onDisposeRelay ?? (() => {});
  }

  registerDefault(url: string): void {
    const existing = this.#relays.get(url);
    if (existing?.dormantTimer) clearTimeout(existing.dormantTimer);
    this.#relays.set(url, { mode: 'lazy-keep', dormantTimer: null });
  }

  touch(url: string): void {
    const existing = this.#relays.get(url);
    if (existing) {
      if (existing.dormantTimer) {
        clearTimeout(existing.dormantTimer);
        existing.dormantTimer = null;
      }
      return;
    }
    this.#relays.set(url, { mode: 'lazy', dormantTimer: null });
  }

  markDormant(url: string): void {
    const entry = this.#relays.get(url);
    if (!entry || entry.mode === 'lazy-keep') return;

    if (entry.dormantTimer) clearTimeout(entry.dormantTimer);
    entry.dormantTimer = setTimeout(() => {
      this.#relays.delete(url);
      this.#onDispose(url);
    }, this.#ttl);
  }

  getMode(url: string): 'lazy' | 'lazy-keep' {
    return this.#relays.get(url)?.mode ?? 'lazy';
  }

  dispose(): void {
    for (const entry of this.#relays.values()) {
      if (entry.dormantTimer) clearTimeout(entry.dormantTimer);
    }
    this.#relays.clear();
  }
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/temporary-relay-tracker.ts src/shared/nostr/auftakt/core/relay/temporary-relay-tracker.test.ts
git commit -m "feat: add TemporaryRelayTracker with dormant TTL cleanup"
```

---

### Task 5: Optimistic/Failed Row GC

**Files:**

- Create: `src/shared/nostr/auftakt/core/gc.ts`
- Test: `src/shared/nostr/auftakt/core/gc.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/gc.test.ts
import { describe, expect, it } from 'vitest';

import { createFakePersistentStore } from '$shared/nostr/auftakt/testing/fakes.js';

import { gcExpiredOptimistic } from './gc.js';

describe('gcExpiredOptimistic', () => {
  it('deletes failed optimistic rows older than retention period', async () => {
    const store = createFakePersistentStore();
    const now = 100_000;

    await store.putEvent({
      id: 'optimistic:old-failed',
      kind: 1,
      pubkey: 'alice',
      created_at: now - 90_000, // 90,000 seconds ago
      content: '',
      tags: [],
      optimistic: true,
      publishStatus: 'failed'
    });

    await store.putEvent({
      id: 'optimistic:recent-failed',
      kind: 1,
      pubkey: 'alice',
      created_at: now - 1000, // 1,000 seconds ago
      content: '',
      tags: [],
      optimistic: true,
      publishStatus: 'failed'
    });

    await store.putEvent({
      id: 'normal-event',
      kind: 1,
      pubkey: 'bob',
      created_at: now - 50_000,
      content: 'hello',
      tags: []
    });

    await gcExpiredOptimistic(store, { retentionSeconds: 86_400, now });

    expect(store.events.has('optimistic:old-failed')).toBe(false);
    expect(store.events.has('optimistic:recent-failed')).toBe(true);
    expect(store.events.has('normal-event')).toBe(true);
  });

  it('deletes confirmed optimistic rows immediately', async () => {
    const store = createFakePersistentStore();

    await store.putEvent({
      id: 'optimistic:confirmed',
      kind: 1,
      pubkey: 'alice',
      created_at: Date.now(),
      content: '',
      tags: [],
      optimistic: true,
      publishStatus: 'confirmed'
    });

    await gcExpiredOptimistic(store, { retentionSeconds: 86_400, now: Date.now() });

    expect(store.events.has('optimistic:confirmed')).toBe(false);
  });

  it('does nothing when no optimistic rows exist', async () => {
    const store = createFakePersistentStore();
    await store.putEvent({
      id: 'normal',
      kind: 1,
      pubkey: 'alice',
      created_at: 1000,
      content: '',
      tags: []
    });

    await gcExpiredOptimistic(store, { retentionSeconds: 86_400, now: 100_000 });
    expect(store.events.has('normal')).toBe(true);
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/gc.ts
interface GcStore {
  events: Map<string, unknown>;
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

  for (const [id, event] of store.events) {
    if (typeof event !== 'object' || event === null) continue;
    const record = event as {
      optimistic?: boolean;
      publishStatus?: string;
      created_at?: number;
    };

    if (!record.optimistic) continue;

    // Confirmed optimistic rows: delete immediately
    if (record.publishStatus === 'confirmed') {
      await store.deleteEvent(id);
      deleted++;
      continue;
    }

    // Failed/partial optimistic rows: delete if older than retention
    if (
      (record.publishStatus === 'failed' || record.publishStatus === 'partial') &&
      typeof record.created_at === 'number' &&
      record.created_at < cutoff
    ) {
      await store.deleteEvent(id);
      deleted++;
    }
  }

  return deleted;
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/gc.ts src/shared/nostr/auftakt/core/gc.test.ts
git commit -m "feat: add optimistic/failed row GC for auftakt"
```

---

### Task 6: 全体テスト + format + lint

- [ ] **Step 1: 全 auftakt テスト pass**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全テスト pass

- [ ] **Step 2: format + lint + check**

Run: `pnpm format:check && pnpm lint && pnpm check`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: format and lint compliance for negentropy and GC"
```

---

### Task 7: Wiring — RelayManagerV2 orchestrator

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/relay-manager-v2.ts`
- Test: `src/shared/nostr/auftakt/core/relay/relay-manager-v2.test.ts`

- [ ] **Step 1: RelayManagerV2 — RelayConnection + FetchScheduler + ForwardAssembler + PublishManager + LruDedup + EventValidator + Nip11Registry + TemporaryRelayTracker を compose する orchestrator を実装**

- [ ] **Step 2: onReconnect で ForwardAssembler.replay() + PublishManager.replayPending() を接続**

- [ ] **Step 3: getRelayState() + onConnectionStateChange() を RelayConnection から委譲**

- [ ] **Step 4: テスト pass → Commit**

---

### Task 8: Wiring — store-types.ts 最終更新 + runtime.ts で RelayManagerV2 をデフォルトに

- [ ] **Step 1: store-types.ts を spec §4.5 + §13 に合わせて最終更新 (probeCapabilities required, getRelayState, onConnectionStateChange, dispose 追加)**

- [ ] **Step 2: runtime.ts のデフォルト RelayManager を RelayManagerV2 に変更**

- [ ] **Step 3: fakes.ts を最終更新**

- [ ] **Step 4: 全テスト pass → Commit**

---

### Task 9: Wiring — GC triggering (Session.open + periodic timer)

- [ ] **Step 1: Session.open() で gcExpiredOptimistic を呼ぶ**

```typescript
// session.ts の Session.open() 末尾に追加
if (input.runtime.persistentStore) {
  void gcExpiredOptimistic(input.runtime.persistentStore, {
    retentionSeconds: 86_400
  }).catch(() => undefined);
}
```

- [ ] **Step 2: runtime.ts に periodic GC timer を追加**

`createRuntime()` の返り値に GC timer を設定。`dispose()` で clearInterval。

```typescript
// runtime.ts createRuntime() 内に追加
const gcTimer = config.gcInterval
  ? setInterval(() => {
      void gcExpiredOptimistic(persistentStore, { retentionSeconds: 86_400 }).catch(
        () => undefined
      );
    }, config.gcInterval ?? 3_600_000)
  : null;

// runtime の dispose に追加 (Plan E Task 7 の RelayManagerV2.dispose で呼ぶ)
// if (gcTimer) clearInterval(gcTimer);
```

- [ ] **Step 3: テスト → Commit**

---

### Task 10: 旧 relay-manager.ts 削除 + 全体検証

- [ ] **Step 1: 旧 core/relay-manager.ts を削除**

- [ ] **Step 2: 全テスト pass (unit + e2e)**

Run: `pnpm test && pnpm test:e2e`

- [ ] **Step 3: format + lint + check**

- [ ] **Step 4: Commit**

---

## Exit Criteria

- [ ] hoytech/negentropy JS が vendor 取り���み済み + .d.ts 型定義
- [ ] `NegentropySession` — NEG-OPEN/MSG/CLOSE ライフサイクル + CLOSED fallback + timeout + max rounds
- [ ] SyncEngine が capability に基づいて negentropy/fetch を切り替え
- [ ] `TemporaryRelayTracker` — lazy/lazy-keep mode 追跡 + dormant TTL cleanup
- [ ] `gcExpiredOptimistic` — confirmed 即削除 + failed 24h 後削除 + Session.open() トリガー
- [ ] **RelayManagerV2** — 全コンポーネ��ト compose + spec §4.5 Public Interface 準拠
- [ ] **getRelayState() + onConnectionStateChange()** — connection state API
- [ ] store-types.ts が spec §4.5 + §13 の最終 interface に合致
- [ ] 旧 relay-manager.ts が削除済み
- [ ] vendor/ が ESLint/Prettier ignore 済み
- [ ] `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e` が全 pass
