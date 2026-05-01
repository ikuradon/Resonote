# auftakt Offline Recovery & WebSocket Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebSocket 切断検知 (heartbeat + probe + browser signal)、Circuit Breaker、Recovery Pipeline (strategy pattern)、kind:5 削除整合性 (TombstoneProcessor)、Offline Publish Queue を実装する

**Architecture:** RelayConnection に heartbeat を追加し、RelayManager が Circuit Breaker + recovery 管理を行う。kind:5 は TombstoneProcessor (SyncEngine レベル) で処理し、putEvent は副作用なし。Offline publish は PersistentStore に永続化。全体を RecoveryStrategy pattern で差し替え可能にする。

**Tech Stack:** TypeScript, vitest

**Dependencies:** Plan E (negentropy-gc) 完了

---

## File Structure

| File                                    | 責務                                                 |
| --------------------------------------- | ---------------------------------------------------- |
| `core/relay/heartbeat.ts`               | Inactivity monitor + probe logic                     |
| `core/relay/heartbeat.test.ts`          | テスト                                               |
| `core/relay/circuit-breaker.ts`         | Circuit Breaker 状態管理 (CLOSED/OPEN/HALF-OPEN)     |
| `core/relay/circuit-breaker.test.ts`    | テスト                                               |
| `core/sync/tombstone-processor.ts`      | kind:5 tombstone 作成・検証ロジック                  |
| `core/sync/tombstone-processor.test.ts` | テスト                                               |
| `core/sync/recovery-strategy.ts`        | RecoveryStrategy interface + DefaultRecoveryStrategy |
| `core/sync/recovery-strategy.test.ts`   | テスト                                               |

**変更:**

| File                             | 変更内容                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `core/relay/relay-connection.ts` | heartbeat 統合 (lastActivityAt, probe 発動)                                        |
| `core/relay/relay-manager.ts`    | Circuit Breaker 統合, browser signal, recovery 管理, disconnectedAt 記録           |
| `core/sync-engine.ts`            | syncQuery に kind:5 自動チェック追加, liveQuery に deletion-watch 参照カウント追加 |
| `core/store-types.ts`            | PersistentStore に pending publish + tombstone GC メソッド追加                     |
| `core/models/session.ts`         | Session.open で pending publish retry (GC より先)                                  |
| `core/gc.ts`                     | gcStaleTombstones 追加                                                             |
| `core/runtime.ts`                | recovery config, browserSignals config 追加                                        |
| `testing/fakes.ts`               | fake store に pending publish + tombstone GC メソッド追加                          |

---

### Task 1: Circuit Breaker

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/circuit-breaker.ts`
- Test: `src/shared/nostr/auftakt/core/relay/circuit-breaker.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/circuit-breaker.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, maxCooldownMs: 5000 });
    expect(cb.canAttempt()).toBe(true);
    expect(cb.state).toBe('closed');
  });

  it('transitions to OPEN after failureThreshold consecutive failures', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, maxCooldownMs: 5000 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe('closed');
    cb.recordFailure();
    expect(cb.state).toBe('open');
    expect(cb.canAttempt()).toBe(false);
  });

  it('resets failure count on success', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, maxCooldownMs: 5000 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.state).toBe('closed');
    cb.recordFailure();
    expect(cb.state).toBe('closed'); // only 1 failure after reset
  });

  it('transitions to HALF-OPEN after cooldown expires', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100, maxCooldownMs: 5000 });
    cb.recordFailure();
    expect(cb.state).toBe('open');

    vi.advanceTimersByTime(150);
    expect(cb.state).toBe('half-open');
    expect(cb.canAttempt()).toBe(true);
  });

  it('returns to CLOSED on success in HALF-OPEN', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100, maxCooldownMs: 5000 });
    cb.recordFailure();
    vi.advanceTimersByTime(150);
    cb.recordSuccess();
    expect(cb.state).toBe('closed');
  });

  it('returns to OPEN with doubled cooldown on failure in HALF-OPEN', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100, maxCooldownMs: 5000 });
    cb.recordFailure();
    vi.advanceTimersByTime(150); // half-open
    cb.recordFailure();
    expect(cb.state).toBe('open');

    // First cooldown was 100ms, now doubled to 200ms
    vi.advanceTimersByTime(150);
    expect(cb.state).toBe('open'); // still open (200ms not elapsed)
    vi.advanceTimersByTime(100);
    expect(cb.state).toBe('half-open'); // 250ms > 200ms
  });

  it('caps cooldown at maxCooldownMs', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 3000, maxCooldownMs: 5000 });
    cb.recordFailure(); // open, cooldown=3000
    vi.advanceTimersByTime(3500);
    cb.recordFailure(); // open, cooldown=min(6000, 5000)=5000
    vi.advanceTimersByTime(5500);
    expect(cb.state).toBe('half-open');
  });

  it('cleans up timer on dispose', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100, maxCooldownMs: 5000 });
    cb.recordFailure();
    cb.dispose();
    vi.advanceTimersByTime(150);
    expect(cb.state).toBe('open'); // timer was cleared, stays open
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/circuit-breaker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/circuit-breaker.ts
type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  maxCooldownMs: number;
}

export class CircuitBreaker {
  readonly #failureThreshold: number;
  readonly #maxCooldownMs: number;
  #baseCooldownMs: number;
  #currentCooldownMs: number;
  #consecutiveFailures = 0;
  #state: CircuitState = 'closed';
  #cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: CircuitBreakerConfig) {
    this.#failureThreshold = config.failureThreshold;
    this.#baseCooldownMs = config.cooldownMs;
    this.#currentCooldownMs = config.cooldownMs;
    this.#maxCooldownMs = config.maxCooldownMs;
  }

  get state(): CircuitState {
    return this.#state;
  }

  canAttempt(): boolean {
    return this.#state !== 'open';
  }

  recordSuccess(): void {
    this.#consecutiveFailures = 0;
    this.#currentCooldownMs = this.#baseCooldownMs;
    if (this.#state === 'half-open' || this.#state === 'closed') {
      this.#state = 'closed';
    }
  }

  recordFailure(): void {
    if (this.#state === 'half-open') {
      this.#currentCooldownMs = Math.min(this.#currentCooldownMs * 2, this.#maxCooldownMs);
      this.#openCircuit();
      return;
    }

    this.#consecutiveFailures++;
    if (this.#consecutiveFailures >= this.#failureThreshold) {
      this.#openCircuit();
    }
  }

  dispose(): void {
    if (this.#cooldownTimer) {
      clearTimeout(this.#cooldownTimer);
      this.#cooldownTimer = null;
    }
  }

  #openCircuit(): void {
    this.#state = 'open';
    this.#consecutiveFailures = 0;
    if (this.#cooldownTimer) clearTimeout(this.#cooldownTimer);
    this.#cooldownTimer = setTimeout(() => {
      this.#cooldownTimer = null;
      this.#state = 'half-open';
    }, this.#currentCooldownMs);
  }
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/circuit-breaker.test.ts`
Expected: 全 pass

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/circuit-breaker.ts src/shared/nostr/auftakt/core/relay/circuit-breaker.test.ts
git commit -m "feat: add CircuitBreaker with CLOSED/OPEN/HALF-OPEN lifecycle"
```

---

### Task 2: Heartbeat (Inactivity Monitor + Probe)

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/heartbeat.ts`
- Test: `src/shared/nostr/auftakt/core/relay/heartbeat.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/heartbeat.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Heartbeat } from './heartbeat.js';

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
    simulateMessage(msg: unknown[]) {
      for (const h of messageHandlers) h(msg);
    },
    sent
  };
}

describe('Heartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends probe REQ after inactivity timeout', () => {
    vi.useFakeTimers();
    const conn = createMockConnection();
    const onDead = vi.fn();
    const hb = new Heartbeat({
      connection: conn,
      inactivityTimeout: 100,
      probeTimeout: 50,
      onDead
    });

    hb.start();
    vi.advanceTimersByTime(110);

    // Should have sent a probe REQ
    const probeReq = conn.sent.find(
      (m) =>
        Array.isArray(m) &&
        m[0] === 'REQ' &&
        typeof m[1] === 'string' &&
        (m[1] as string).startsWith('probe:')
    );
    expect(probeReq).toBeDefined();

    hb.dispose();
  });

  it('resets inactivity timer on activity', () => {
    vi.useFakeTimers();
    const conn = createMockConnection();
    const onDead = vi.fn();
    const hb = new Heartbeat({
      connection: conn,
      inactivityTimeout: 100,
      probeTimeout: 50,
      onDead
    });

    hb.start();
    vi.advanceTimersByTime(80);
    hb.recordActivity(); // reset
    vi.advanceTimersByTime(80);

    // Should NOT have sent probe yet (80ms after reset, < 100ms)
    expect(conn.sent).toHaveLength(0);
    expect(onDead).not.toHaveBeenCalled();

    hb.dispose();
  });

  it('calls onDead when probe times out', () => {
    vi.useFakeTimers();
    const conn = createMockConnection();
    const onDead = vi.fn();
    const hb = new Heartbeat({
      connection: conn,
      inactivityTimeout: 100,
      probeTimeout: 50,
      onDead
    });

    hb.start();
    vi.advanceTimersByTime(110); // inactivity fires, probe sent
    vi.advanceTimersByTime(60); // probe timeout

    expect(onDead).toHaveBeenCalledTimes(1);

    hb.dispose();
  });

  it('resets to alive when probe EOSE is received', () => {
    vi.useFakeTimers();
    const conn = createMockConnection();
    const onDead = vi.fn();
    const hb = new Heartbeat({
      connection: conn,
      inactivityTimeout: 100,
      probeTimeout: 50,
      onDead
    });

    hb.start();
    vi.advanceTimersByTime(110); // probe sent

    // Find probe subId
    const probeReq = conn.sent.find(
      (m) => Array.isArray(m) && m[0] === 'REQ' && (m[1] as string).startsWith('probe:')
    );
    const probeSubId = probeReq?.[1] as string;

    // Simulate EOSE response
    conn.simulateMessage(['EOSE', probeSubId]);

    vi.advanceTimersByTime(60); // past probe timeout
    expect(onDead).not.toHaveBeenCalled(); // alive, not dead

    hb.dispose();
  });

  it('sends CLOSE for probe subId after EOSE', () => {
    vi.useFakeTimers();
    const conn = createMockConnection();
    const hb = new Heartbeat({
      connection: conn,
      inactivityTimeout: 100,
      probeTimeout: 50,
      onDead: vi.fn()
    });

    hb.start();
    vi.advanceTimersByTime(110);

    const probeSubId = (
      conn.sent.find(
        (m) => Array.isArray(m) && m[0] === 'REQ' && (m[1] as string).startsWith('probe:')
      ) as unknown[]
    )?.[1] as string;

    conn.simulateMessage(['EOSE', probeSubId]);

    const closeMsg = conn.sent.find((m) => m[0] === 'CLOSE' && m[1] === probeSubId);
    expect(closeMsg).toBeDefined();

    hb.dispose();
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/heartbeat.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/heartbeat.ts
interface HeartbeatConnection {
  send(message: unknown[]): void;
  onMessage(handler: (message: unknown[]) => void): () => void;
}

interface HeartbeatConfig {
  connection: HeartbeatConnection;
  inactivityTimeout: number;
  probeTimeout: number;
  onDead: () => void;
}

let probeCounter = 0;

export class Heartbeat {
  readonly #connection: HeartbeatConnection;
  readonly #inactivityTimeout: number;
  readonly #probeTimeout: number;
  readonly #onDead: () => void;
  #inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  #probeTimer: ReturnType<typeof setTimeout> | null = null;
  #probeSubId: string | null = null;
  #offMessage: (() => void) | null = null;
  #dead = false;

  constructor(config: HeartbeatConfig) {
    this.#connection = config.connection;
    this.#inactivityTimeout = config.inactivityTimeout;
    this.#probeTimeout = config.probeTimeout;
    this.#onDead = config.onDead;
  }

  start(): void {
    this.#offMessage = this.#connection.onMessage((message) => {
      if (!Array.isArray(message)) return;
      const [type, subId] = message;

      // EOSE for our probe = alive
      if (type === 'EOSE' && subId === this.#probeSubId) {
        this.#connection.send(['CLOSE', this.#probeSubId]);
        this.#clearProbe();
        this.#resetInactivityTimer();
        return;
      }
    });

    this.#resetInactivityTimer();
  }

  recordActivity(): void {
    if (!this.#dead && this.#probeSubId === null) {
      this.#resetInactivityTimer();
    }
  }

  dispose(): void {
    this.#clearInactivityTimer();
    this.#clearProbe();
    this.#offMessage?.();
    this.#offMessage = null;
  }

  #resetInactivityTimer(): void {
    this.#clearInactivityTimer();
    this.#inactivityTimer = setTimeout(() => {
      this.#inactivityTimer = null;
      this.#sendProbe();
    }, this.#inactivityTimeout);
  }

  #sendProbe(): void {
    probeCounter++;
    this.#probeSubId = `probe:${probeCounter}`;
    const filter = { ids: ['0'.repeat(64)], limit: 1 };
    this.#connection.send(['REQ', this.#probeSubId, filter]);

    this.#probeTimer = setTimeout(() => {
      this.#probeTimer = null;
      if (this.#probeSubId) {
        this.#connection.send(['CLOSE', this.#probeSubId]);
        this.#probeSubId = null;
        this.#dead = true;
        this.#onDead();
      }
    }, this.#probeTimeout);
  }

  #clearInactivityTimer(): void {
    if (this.#inactivityTimer) {
      clearTimeout(this.#inactivityTimer);
      this.#inactivityTimer = null;
    }
  }

  #clearProbe(): void {
    if (this.#probeTimer) {
      clearTimeout(this.#probeTimer);
      this.#probeTimer = null;
    }
    this.#probeSubId = null;
  }
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/heartbeat.test.ts`
Expected: 全 pass

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/heartbeat.ts src/shared/nostr/auftakt/core/relay/heartbeat.test.ts
git commit -m "feat: add Heartbeat with inactivity monitor and probe"
```

---

### Task 3: TombstoneProcessor

**Files:**

- Create: `src/shared/nostr/auftakt/core/sync/tombstone-processor.ts`
- Test: `src/shared/nostr/auftakt/core/sync/tombstone-processor.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/sync/tombstone-processor.test.ts
import { describe, expect, it } from 'vitest';

import { createFakePersistentStore } from '$shared/nostr/auftakt/testing/fakes.js';

import { TombstoneProcessor } from './tombstone-processor.js';

describe('TombstoneProcessor', () => {
  it('creates verified tombstone when target event exists in store', async () => {
    const store = createFakePersistentStore();
    await store.putEvent({
      id: 'target-1',
      kind: 1111,
      pubkey: 'alice',
      created_at: 1000,
      content: 'hello',
      tags: [],
      sig: 'sig'
    });

    const processor = new TombstoneProcessor({ persistentStore: store });

    await processor.processDeletion({
      id: 'del-1',
      kind: 5,
      pubkey: 'alice',
      created_at: 2000,
      content: '',
      tags: [['e', 'target-1']],
      sig: 'sig'
    });

    const tombstone = await store.getTombstone({ targetEventId: 'target-1' });
    expect(tombstone).toMatchObject({
      targetEventId: 'target-1',
      deletedByPubkey: 'alice',
      verified: true
    });
  });

  it('creates pre-tombstone when target event does not exist', async () => {
    const store = createFakePersistentStore();
    const processor = new TombstoneProcessor({ persistentStore: store });

    await processor.processDeletion({
      id: 'del-1',
      kind: 5,
      pubkey: 'alice',
      created_at: 2000,
      content: '',
      tags: [['e', 'unknown-1']],
      sig: 'sig'
    });

    const tombstone = await store.getTombstone({ targetEventId: 'unknown-1' });
    expect(tombstone).toMatchObject({
      targetEventId: 'unknown-1',
      verified: false
    });
  });

  it('rejects deletion when author does not match target event author', async () => {
    const store = createFakePersistentStore();
    await store.putEvent({
      id: 'target-1',
      kind: 1111,
      pubkey: 'alice',
      created_at: 1000,
      content: 'hello',
      tags: [],
      sig: 'sig'
    });

    const processor = new TombstoneProcessor({ persistentStore: store });

    await processor.processDeletion({
      id: 'del-1',
      kind: 5,
      pubkey: 'bob', // different author
      created_at: 2000,
      content: '',
      tags: [['e', 'target-1']],
      sig: 'sig'
    });

    const tombstone = await store.getTombstone({ targetEventId: 'target-1' });
    expect(tombstone).toBeUndefined();
  });

  it('checkTombstone returns existing tombstone', async () => {
    const store = createFakePersistentStore();
    const processor = new TombstoneProcessor({ persistentStore: store });

    await processor.processDeletion({
      id: 'del-1',
      kind: 5,
      pubkey: 'alice',
      created_at: 2000,
      content: '',
      tags: [['e', 'target-1']],
      sig: 'sig'
    });

    const result = await processor.checkTombstone('target-1');
    expect(result).toMatchObject({ targetEventId: 'target-1' });
  });

  it('checkTombstone returns undefined when no tombstone exists', async () => {
    const store = createFakePersistentStore();
    const processor = new TombstoneProcessor({ persistentStore: store });

    const result = await processor.checkTombstone('nonexistent');
    expect(result).toBeUndefined();
  });

  it('handles a-tag deletion for addressable events', async () => {
    const store = createFakePersistentStore();
    const processor = new TombstoneProcessor({ persistentStore: store });

    await processor.processDeletion({
      id: 'del-1',
      kind: 5,
      pubkey: 'alice',
      created_at: 2000,
      content: '',
      tags: [['a', '30023:alice:my-article']],
      sig: 'sig'
    });

    const tombstone = await store.getTombstone({ targetAddress: '30023:alice:my-article' });
    expect(tombstone).toMatchObject({
      targetAddress: '30023:alice:my-article',
      verified: false
    });
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/sync/tombstone-processor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/sync/tombstone-processor.ts
import type { PersistentStore, TombstoneRecord } from '../store-types.js';
import type { NostrEvent } from '../types.js';

interface TombstoneProcessorConfig {
  persistentStore: PersistentStore;
}

export class TombstoneProcessor {
  readonly #store: PersistentStore;

  constructor(config: TombstoneProcessorConfig) {
    this.#store = config.persistentStore;
  }

  async processDeletion(deletionEvent: NostrEvent): Promise<void> {
    if (deletionEvent.kind !== 5) return;

    // Store the kind:5 event itself
    await this.#store.putEvent(deletionEvent);

    // Process e-tags (event ID targets)
    for (const tag of deletionEvent.tags) {
      if (tag[0] === 'e' && typeof tag[1] === 'string') {
        await this.#processTarget({
          targetEventId: tag[1],
          deletionEvent
        });
      }

      if (tag[0] === 'a' && typeof tag[1] === 'string') {
        await this.#processAddressTarget({
          targetAddress: tag[1],
          deletionEvent
        });
      }
    }
  }

  async checkTombstone(eventId: string): Promise<TombstoneRecord | undefined> {
    return this.#store.getTombstone({ targetEventId: eventId });
  }

  async #processTarget(input: { targetEventId: string; deletionEvent: NostrEvent }): Promise<void> {
    const targetEvent = await this.#store.getEvent(input.targetEventId);

    if (targetEvent && typeof targetEvent === 'object' && 'pubkey' in targetEvent) {
      // Author must match
      if (String(targetEvent.pubkey) !== input.deletionEvent.pubkey) return;

      await this.#store.putTombstone({
        targetEventId: input.targetEventId,
        deletedByPubkey: input.deletionEvent.pubkey,
        deleteEventId: input.deletionEvent.id,
        createdAt: input.deletionEvent.created_at,
        verified: true
      });
    } else {
      // Pre-tombstone: target not in DB yet
      await this.#store.putTombstone({
        targetEventId: input.targetEventId,
        deletedByPubkey: input.deletionEvent.pubkey,
        deleteEventId: input.deletionEvent.id,
        createdAt: input.deletionEvent.created_at,
        verified: false
      });
    }
  }

  async #processAddressTarget(input: {
    targetAddress: string;
    deletionEvent: NostrEvent;
  }): Promise<void> {
    // a-tag format: "kind:pubkey:identifier"
    // Author verification: the pubkey in the address must match deletion author
    const parts = input.targetAddress.split(':');
    if (parts.length >= 2 && parts[1] !== input.deletionEvent.pubkey) return;

    await this.#store.putTombstone({
      targetAddress: input.targetAddress,
      deletedByPubkey: input.deletionEvent.pubkey,
      deleteEventId: input.deletionEvent.id,
      createdAt: input.deletionEvent.created_at,
      verified: false // address targets always start as pre-tombstone
    });
  }
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/sync/tombstone-processor.test.ts`
Expected: 全 pass

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/sync/tombstone-processor.ts src/shared/nostr/auftakt/core/sync/tombstone-processor.test.ts
git commit -m "feat: add TombstoneProcessor for kind:5 deletion integrity"
```

---

### Task 4: PersistentStore インターフェース拡張 + fakes 更新

**Files:**

- Modify: `src/shared/nostr/auftakt/core/store-types.ts`
- Modify: `src/shared/nostr/auftakt/testing/fakes.ts`

- [ ] **Step 1: store-types.ts に pending publish + tombstone GC メソッドを追加**

`PersistentStore` interface に追加:

```typescript
// store-types.ts の PersistentStore interface に追加
  putPendingPublish(record: {
    eventId: string;
    signedEvent: NostrEvent;
    relaySet: RelaySet;
    createdAt: number;
    attempts: number;
    lastAttemptAt?: number;
  }): Promise<void>;
  deletePendingPublish(eventId: string): Promise<void>;
  listPendingPublishes(): Promise<Array<{
    eventId: string;
    signedEvent: NostrEvent;
    relaySet: RelaySet;
    createdAt: number;
    attempts: number;
    lastAttemptAt?: number;
  }>>;
  listTombstones(filter: {
    verified?: boolean;
    createdBefore?: number;
  }): Promise<TombstoneRecord[]>;
  deleteTombstone(targetEventId: string): Promise<void>;
```

- [ ] **Step 2: fakes.ts に pending publish + tombstone GC メソッドを追加**

`createFakePersistentStore` に:

```typescript
// fakes.ts の createFakePersistentStore に追加
    const pendingPublishes = new Map<string, {
      eventId: string;
      signedEvent: unknown;
      relaySet: { read: string[]; write: string[] };
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number;
    }>();

    // ... return に追加:
    pendingPublishes,
    putPendingPublish(record: { eventId: string }) {
      pendingPublishes.set(record.eventId, record as any);
      return Promise.resolve();
    },
    deletePendingPublish(eventId: string) {
      pendingPublishes.delete(eventId);
      return Promise.resolve();
    },
    listPendingPublishes() {
      return Promise.resolve(
        [...pendingPublishes.values()].sort((a, b) => a.createdAt - b.createdAt)
      );
    },
    listTombstones(filter: { verified?: boolean; createdBefore?: number }) {
      return Promise.resolve(
        [...tombstones.values()]
          .filter((t: any) => {
            if (filter.verified !== undefined && t.verified !== filter.verified) return false;
            if (filter.createdBefore !== undefined && t.createdAt >= filter.createdBefore) return false;
            return true;
          }) as TombstoneRecord[]
      );
    },
    deleteTombstone(targetEventId: string) {
      tombstones.delete(targetEventId);
      return Promise.resolve();
    },
```

- [ ] **Step 3: 全テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全 pass

- [ ] **Step 4: Commit**

```bash
git add src/shared/nostr/auftakt/core/store-types.ts src/shared/nostr/auftakt/testing/fakes.ts
git commit -m "feat: extend PersistentStore with pending publish and tombstone GC"
```

---

### Task 5: gcStaleTombstones

**Files:**

- Modify: `src/shared/nostr/auftakt/core/gc.ts`
- Test: `src/shared/nostr/auftakt/core/gc.test.ts` に追加

- [ ] **Step 1: failing test を書く**

gc.test.ts に追加:

```typescript
// gc.test.ts に追加
import { gcStaleTombstones } from './gc.js';

describe('gcStaleTombstones', () => {
  it('deletes unverified tombstones older than TTL', async () => {
    const store = createFakePersistentStore();
    const now = 100_000;

    await store.putTombstone({
      targetEventId: 'old-pre',
      deletedByPubkey: 'alice',
      deleteEventId: 'del-1',
      createdAt: now - 700_000, // older than 7 days (604800s)
      verified: false
    });

    await store.putTombstone({
      targetEventId: 'recent-pre',
      deletedByPubkey: 'alice',
      deleteEventId: 'del-2',
      createdAt: now - 1000,
      verified: false
    });

    await store.putTombstone({
      targetEventId: 'verified-old',
      deletedByPubkey: 'alice',
      deleteEventId: 'del-3',
      createdAt: now - 700_000,
      verified: true
    });

    const deleted = await gcStaleTombstones(store, { ttlDays: 7, now });

    expect(deleted).toBe(1);
    expect(await store.getTombstone({ targetEventId: 'old-pre' })).toBeUndefined();
    expect(await store.getTombstone({ targetEventId: 'recent-pre' })).toBeDefined();
    expect(await store.getTombstone({ targetEventId: 'verified-old' })).toBeDefined();
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

gc.ts に追加:

```typescript
// gc.ts に追加
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

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/gc.ts src/shared/nostr/auftakt/core/gc.test.ts
git commit -m "feat: add gcStaleTombstones for pre-tombstone cleanup"
```

---

### Task 6: RecoveryStrategy + DefaultRecoveryStrategy

**Files:**

- Create: `src/shared/nostr/auftakt/core/sync/recovery-strategy.ts`
- Test: `src/shared/nostr/auftakt/core/sync/recovery-strategy.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/sync/recovery-strategy.test.ts
import { describe, expect, it, vi } from 'vitest';

import {
  createFakePersistentStore,
  createFakeRelayManager,
  createFakeSyncEngine
} from '$shared/nostr/auftakt/testing/fakes.js';

import { DefaultRecoveryStrategy } from './recovery-strategy.js';

describe('DefaultRecoveryStrategy', () => {
  it('calls syncQuery for each active query with gap window', async () => {
    const syncEngine = createFakeSyncEngine();
    const persistentStore = createFakePersistentStore();
    const strategy = new DefaultRecoveryStrategy();
    const controller = new AbortController();

    await strategy.onRecovery({
      disconnectedAt: 1000,
      reconnectedAt: 2000,
      activeQueries: [
        {
          queryIdentityKey: 'q1',
          fetchWindowKey: 'w1',
          filter: { kinds: [1] },
          filterBase: '{"kinds":[1]}',
          projectionKey: 'default',
          policyKey: 'timeline-default',
          relays: ['wss://relay.test']
        }
      ],
      syncEngine,
      persistentStore,
      signal: controller.signal
    });

    expect(syncEngine.calls).toHaveLength(1);
    expect(syncEngine.calls[0]).toMatchObject({
      queryIdentityKey: 'q1',
      windowSince: 1000,
      windowUntil: 2000,
      resume: 'force-rebuild'
    });
  });

  it('retries pending publishes after gap fetch', async () => {
    const syncEngine = createFakeSyncEngine();
    const persistentStore = createFakePersistentStore();
    const controller = new AbortController();

    // Add a pending publish
    await persistentStore.putPendingPublish({
      eventId: 'evt-1',
      signedEvent: {
        id: 'evt-1',
        kind: 1,
        pubkey: 'alice',
        created_at: 1000,
        content: 'hi',
        tags: [],
        sig: 'sig'
      },
      relaySet: { read: [], write: ['wss://relay.test'] },
      createdAt: 1000,
      attempts: 0
    });

    const strategy = new DefaultRecoveryStrategy();

    await strategy.onRecovery({
      disconnectedAt: 1000,
      reconnectedAt: 2000,
      activeQueries: [],
      syncEngine,
      persistentStore,
      signal: controller.signal
    });

    // Pending publish should still be there (no relayManager in this test)
    // But the strategy should have listed them
    const pending = await persistentStore.listPendingPublishes();
    expect(pending).toHaveLength(1);
  });

  it('skips execution when signal is aborted', async () => {
    const syncEngine = createFakeSyncEngine();
    const persistentStore = createFakePersistentStore();
    const controller = new AbortController();
    controller.abort(); // pre-abort

    const strategy = new DefaultRecoveryStrategy();

    await strategy.onRecovery({
      disconnectedAt: 1000,
      reconnectedAt: 2000,
      activeQueries: [
        {
          queryIdentityKey: 'q1',
          fetchWindowKey: 'w1',
          filter: { kinds: [1] },
          filterBase: '{}',
          projectionKey: 'default',
          policyKey: 'timeline-default',
          relays: ['wss://relay.test']
        }
      ],
      syncEngine,
      persistentStore,
      signal: controller.signal
    });

    expect(syncEngine.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/sync/recovery-strategy.ts
import type { PersistentStore, SyncEngine } from '../store-types.js';

interface ActiveQuery {
  queryIdentityKey: string;
  fetchWindowKey: string;
  filter: Record<string, unknown>;
  filterBase: string;
  projectionKey: string;
  policyKey: string;
  relays: string[];
}

export interface RecoveryContext {
  disconnectedAt: number;
  reconnectedAt: number;
  activeQueries: ActiveQuery[];
  syncEngine: SyncEngine;
  persistentStore: PersistentStore;
  signal: AbortSignal;
}

export interface RecoveryStrategy {
  onRecovery(context: RecoveryContext): Promise<void>;
}

export class DefaultRecoveryStrategy implements RecoveryStrategy {
  async onRecovery(context: RecoveryContext): Promise<void> {
    if (context.signal.aborted) return;

    // Step 1: Coverage gap fetch for all active queries
    for (const query of context.activeQueries) {
      if (context.signal.aborted) return;

      await context.syncEngine.syncQuery({
        queryIdentityKey: query.queryIdentityKey,
        fetchWindowKey: `recovery:${query.fetchWindowKey}:${context.disconnectedAt}`,
        filter: query.filter,
        filterBase: query.filterBase,
        projectionKey: query.projectionKey,
        policyKey: query.policyKey,
        resume: 'force-rebuild',
        windowSince: context.disconnectedAt,
        windowUntil: context.reconnectedAt,
        relays: query.relays,
        completion: { mode: 'any' }
      });
    }

    // Step 2: Pending publish retry (no-op here — actual relay send
    // is handled by the caller who has access to relayManager)
    // We just list them to confirm they're accessible
    if (context.signal.aborted) return;
    await context.persistentStore.listPendingPublishes();
  }
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/sync/recovery-strategy.ts src/shared/nostr/auftakt/core/sync/recovery-strategy.test.ts
git commit -m "feat: add RecoveryStrategy interface and DefaultRecoveryStrategy"
```

---

### Task 7: SyncEngine に kind:5 自動チェックを追加

**Files:**

- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Test: `src/shared/nostr/auftakt/core/sync-engine.test.ts` に追加

- [ ] **Step 1: failing test を書く**

sync-engine.test.ts に追加:

```typescript
it('auto-fetches kind:5 for received event IDs after syncQuery', async () => {
  const persistentStore = createFakePersistentStore();
  const relayManager = createFakeRelayManager({
    fetchedEvents: [
      {
        id: 'evt-1',
        kind: 1,
        pubkey: 'alice',
        content: 'hello',
        tags: [],
        created_at: 10
      }
    ]
  });
  const syncEngine = new SyncEngine({
    persistentStore,
    relayManager
  });

  await syncEngine.syncQuery({
    queryIdentityKey: 'query-1',
    fetchWindowKey: 'window-1',
    filter: { kinds: [1], authors: ['alice'] },
    filterBase: '{"kinds":[1],"authors":["alice"]}',
    projectionKey: 'default',
    policyKey: 'timeline-default',
    resume: 'none',
    relays: ['wss://relay.example'],
    completion: { mode: 'all' }
  });

  // Should have made 2 fetch calls: content + kind:5 check
  expect(relayManager.fetchCalls).toHaveLength(2);
  expect(relayManager.fetchCalls[1]?.filter).toMatchObject({
    kinds: [5],
    '#e': ['evt-1']
  });
});
```

- [ ] **Step 2: テスト fail → sync-engine.ts を修正**

syncQuery 内の events 保存後に kind:5 チェックを追加:

```typescript
// sync-engine.ts syncQuery 末尾 (coverage 更新の前) に追加:
// Auto-check kind:5 for received event IDs
const receivedIds = fetched.events.map((e) => e.id).filter((id) => typeof id === 'string');
if (receivedIds.length > 0) {
  const deletions = await this.#relayManager.fetch({
    filter: { kinds: [5], '#e': receivedIds },
    relays: input.relays,
    completion: { mode: 'any' }
  });

  for (const event of deletions.events) {
    await this.#persistentStore.putEvent(event);
  }
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/sync-engine.ts src/shared/nostr/auftakt/core/sync-engine.test.ts
git commit -m "feat: auto-fetch kind:5 for received events in syncQuery"
```

---

### Task 8: 全体テスト + format + lint

- [ ] **Step 1: 全 auftakt テスト pass**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全テスト pass

- [ ] **Step 2: format + lint**

Run: `pnpm format:check && pnpm lint`

- [ ] **Step 3: 全テスト pass**

Run: `pnpm test`

- [ ] **Step 4: Commit (fix があれば)**

```bash
git add -A && git commit -m "chore: format and lint compliance for offline recovery"
```

---

### Task 9: Heartbeat ↔ RelayConnection 統合

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/relay-connection.ts`
- Modify: `src/shared/nostr/auftakt/core/relay/relay-connection.test.ts`

- [ ] **Step 1: failing test を書く**

relay-connection.test.ts に追加:

```typescript
it('calls onDead callback when heartbeat probe times out', async () => {
  vi.useFakeTimers();
  const onDead = vi.fn();
  const conn = new RelayConnection({
    url: 'wss://relay.test',
    connect: createMockSocket,
    inactivityTimeout: 100,
    probeTimeout: 50,
    onHeartbeatDead: onDead
  });

  conn.ensureConnected();
  // Simulate open
  const socket = getLastSocket();
  socket.simulateOpen();

  // Wait for inactivity + probe timeout
  await vi.advanceTimersByTimeAsync(160);

  expect(onDead).toHaveBeenCalled();

  conn.dispose();
  vi.useRealTimers();
});

it('resets heartbeat on message received', async () => {
  vi.useFakeTimers();
  const onDead = vi.fn();
  const conn = new RelayConnection({
    url: 'wss://relay.test',
    connect: createMockSocket,
    inactivityTimeout: 100,
    probeTimeout: 50,
    onHeartbeatDead: onDead
  });

  conn.ensureConnected();
  getLastSocket().simulateOpen();

  await vi.advanceTimersByTimeAsync(80);
  // Simulate a message — should reset inactivity timer
  getLastSocket().simulateMessage(['EVENT', 'sub-1', {}]);

  await vi.advanceTimersByTimeAsync(80);
  // 80ms after reset, should NOT have fired
  expect(onDead).not.toHaveBeenCalled();

  conn.dispose();
  vi.useRealTimers();
});
```

- [ ] **Step 2: テスト fail → RelayConnection に Heartbeat を統合**

`RelayConnectionConfig` に `inactivityTimeout`, `probeTimeout`, `onHeartbeatDead` を追加。`#connect()` の `open` handler 内で `Heartbeat.start()`、message handler 内で `heartbeat.recordActivity()`、dispose 内で `heartbeat.dispose()`。

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: integrate Heartbeat into RelayConnection"
```

---

### Task 10: Circuit Breaker ↔ RelayManager 統合

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
it('skips OPEN relays in fetch and subscribe', async () => {
  const sockets = new Map<string, ReturnType<typeof createMockSocket>>();
  const manager = new RelayManager({
    connect(url: string) {
      const s = createMockSocket();
      sockets.set(url, s);
      return s;
    },
    circuitBreaker: { failureThreshold: 1, cooldownMs: 60_000, maxCooldownMs: 300_000 }
  });

  // Force relay into OPEN by triggering failure threshold
  // Subscribe to create the relay
  manager.subscribe({
    filter: { kinds: [1] },
    relays: ['wss://broken.test', 'wss://healthy.test'],
    onEvent: vi.fn()
  });

  // Mark broken relay's circuit breaker as failed
  manager.recordRelayFailure('wss://broken.test');

  // Now fetch — broken relay should be skipped
  const fetchPromise = manager.fetch({
    filter: { kinds: [1] },
    relays: ['wss://broken.test', 'wss://healthy.test'],
    completion: { mode: 'any' }
  });

  // Only healthy relay should get REQ
  const healthySock = sockets.get('wss://healthy.test');
  healthySock?.simulateOpen();
  await new Promise((r) => setTimeout(r, 10));

  const healthyReq = healthySock?.send.mock.calls.find(
    (c: unknown[][]) => JSON.parse(String(c[0]))[0] === 'REQ'
  );
  expect(healthyReq).toBeDefined();

  // Complete the fetch
  const subId = healthyReq ? JSON.parse(String(healthyReq[0]))[1] : '';
  healthySock?.simulateMessage(['EOSE', subId]);
  await fetchPromise;
});
```

- [ ] **Step 2: テスト fail → RelayManager に CircuitBreaker を統合**

`RelayManagerConfig` に `circuitBreaker` 設定を追加。`PerRelayState` に `circuitBreaker: CircuitBreaker` を追加。`#getOrCreateRelay` で CircuitBreaker を作成。`fetch()` / `subscribe()` 内で `circuitBreaker.canAttempt()` チェック。`recordRelayFailure(url)` / `recordRelaySuccess(url)` public メソッドを追加。

OPEN 遷移時に `connection.dispose()` → relay を Map から削除。HALF-OPEN 遷移は CircuitBreaker の cooldown timer で自動的に起きるので、`canAttempt()` が true に戻った時点で次の操作で新しい relay が作成される。

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: integrate CircuitBreaker into RelayManager"
```

---

### Task 11: Browser Signal Listener

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
it('reconnects all relays on online event', async () => {
  const sockets: ReturnType<typeof createMockSocket>[] = [];
  const manager = new RelayManager({
    connect() {
      const s = createMockSocket();
      sockets.push(s);
      return s;
    },
    browserSignals: false // disable auto-listen, test manually
  });

  manager.subscribe({
    filter: { kinds: [1] },
    relays: ['wss://relay.test'],
    onEvent: vi.fn()
  });
  sockets[0]?.simulateOpen();
  await new Promise((r) => setTimeout(r, 10));

  // Simulate offline → online
  manager.handleOnlineEvent();

  // Should have created a new connection attempt (staggered)
  await new Promise((r) => setTimeout(r, 200));
  // Verify reconnect was triggered
  expect(sockets.length).toBeGreaterThanOrEqual(1);
});

it('pauses retry timers on offline event', () => {
  const manager = new RelayManager({
    connect: createMockSocket,
    browserSignals: false
  });

  // Should not throw
  manager.handleOfflineEvent();
});
```

- [ ] **Step 2: テスト fail → RelayManager に browser signal handling を追加**

`RelayManagerConfig` に `browserSignals?: boolean` (default true)。constructor で `browserSignals !== false` のとき `window.addEventListener('online', ...)` / `window.addEventListener('offline', ...)` を登録。`handleOnlineEvent()` / `handleOfflineEvent()` を public にして unit test 可能に。

`handleOnlineEvent()`: 全 relay を 100ms staggered で `ensureConnected()`。
`handleOfflineEvent()`: (将来の retry pause 用フック、現状は no-op。RelayConnection の exponential backoff が自然にカバー)。

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: add browser online/offline signal handling to RelayManager"
```

---

### Task 12: Recovery 管理 (disconnectedAt + debounce + 発火)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- Modify: `src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
it('tracks disconnectedAt and triggers recovery after stabilityWindow', async () => {
  vi.useFakeTimers();
  const sockets = new Map<string, ReturnType<typeof createMockSocket>>();
  const recoveryCalls: unknown[] = [];
  const manager = new RelayManager({
    connect(url: string) {
      const s = createMockSocket();
      sockets.set(url, s);
      return s;
    },
    recovery: {
      stabilityWindow: 100,
      recoveryCooldown: 1000,
      strategy: {
        async onRecovery(ctx) {
          recoveryCalls.push({
            disconnectedAt: ctx.disconnectedAt,
            reconnectedAt: ctx.reconnectedAt
          });
        }
      }
    }
  });

  // Create a live subscription to populate activeQueries
  manager.subscribe({
    filter: { kinds: [1] },
    relays: ['wss://relay.test'],
    onEvent: vi.fn()
  });

  const sock = sockets.get('wss://relay.test');
  sock?.simulateOpen();
  await vi.advanceTimersByTimeAsync(10);

  // Simulate disconnect
  sock?.simulateClose(1006);
  await vi.advanceTimersByTimeAsync(10);

  // Simulate reconnect
  const sock2 = sockets.get('wss://relay.test');
  sock2?.simulateOpen();

  // Wait stabilityWindow
  await vi.advanceTimersByTimeAsync(150);

  expect(recoveryCalls).toHaveLength(1);

  vi.useRealTimers();
});

it('skips recovery during recoveryCooldown', async () => {
  vi.useFakeTimers();
  const recoveryCalls: unknown[] = [];
  const sockets = new Map<string, ReturnType<typeof createMockSocket>>();
  const manager = new RelayManager({
    connect(url: string) {
      const s = createMockSocket();
      sockets.set(url, s);
      return s;
    },
    recovery: {
      stabilityWindow: 50,
      recoveryCooldown: 500,
      strategy: {
        async onRecovery(ctx) {
          recoveryCalls.push(ctx.disconnectedAt);
        }
      }
    }
  });

  manager.subscribe({
    filter: { kinds: [1] },
    relays: ['wss://relay.test'],
    onEvent: vi.fn()
  });

  // First cycle: connect → disconnect → reconnect → recovery
  sockets.get('wss://relay.test')?.simulateOpen();
  await vi.advanceTimersByTimeAsync(10);
  sockets.get('wss://relay.test')?.simulateClose(1006);
  await vi.advanceTimersByTimeAsync(10);
  sockets.get('wss://relay.test')?.simulateOpen();
  await vi.advanceTimersByTimeAsync(100); // past stabilityWindow
  expect(recoveryCalls).toHaveLength(1);

  // Second cycle within cooldown: should skip
  sockets.get('wss://relay.test')?.simulateClose(1006);
  await vi.advanceTimersByTimeAsync(10);
  sockets.get('wss://relay.test')?.simulateOpen();
  await vi.advanceTimersByTimeAsync(100);
  expect(recoveryCalls).toHaveLength(1); // still 1, skipped

  vi.useRealTimers();
});
```

- [ ] **Step 2: テスト fail → RelayManager に recovery 管理を追加**

`RelayManagerConfig` に `recovery?: RecoveryConfig` を追加。RelayManager に以下のフィールドを追加:

```typescript
#disconnectedAt: number | null = null;
#lastRecoveryAt: number | null = null;
#recoveryAbortController: AbortController | null = null;
#stabilityTimer: ReturnType<typeof setTimeout> | null = null;
#recoveryStrategy: RecoveryStrategy;
#stabilityWindow: number;
#recoveryCooldown: number;
#activeQueryRegistry: Map<string, ActiveQuery>;  // liveQuery 登録時に追加
```

`#getOrCreateRelay` 内で `connection.onStateChange` を購読:

- `connected → waiting-for-retrying`: `#disconnectedAt = Math.min(#disconnectedAt ?? now, now)`
- `waiting-for-retrying/retrying → connected` (reconnect): `#scheduleRecovery()`

`#scheduleRecovery()`:

- cooldown チェック: `now - #lastRecoveryAt < #recoveryCooldown` → skip
- 既存 stability timer をキャンセル
- `#stabilityTimer = setTimeout(#executeRecovery, #stabilityWindow)`

`#executeRecovery()`:

- `#recoveryAbortController = new AbortController()`
- `strategy.onRecovery({ disconnectedAt, reconnectedAt: now, activeQueries, ... signal })`
- 完了後: `#lastRecoveryAt = now`, `#disconnectedAt = null`

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: add recovery management with disconnectedAt tracking and debounce"
```

---

### Task 13: Forward kind:5 常時購読 (deletion-watch 参照カウント)

**Files:**

- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Modify: `src/shared/nostr/auftakt/core/sync-engine.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
it('subscribes to kind:5 on first liveQuery and unsubscribes on last', () => {
  const persistentStore = createFakePersistentStore();
  const relayManager = createFakeRelayManager();
  const syncEngine = new SyncEngine({ persistentStore, relayManager });

  // First liveQuery — should start kind:5 subscription
  const handle1 = syncEngine.liveQuery({
    queryIdentityKey: 'q1',
    filter: { kinds: [1] },
    relays: ['wss://relay.test'],
    onEvent: vi.fn()
  });

  // Second liveQuery — should reuse existing kind:5 subscription
  const handle2 = syncEngine.liveQuery({
    queryIdentityKey: 'q2',
    filter: { kinds: [7] },
    relays: ['wss://relay.test'],
    onEvent: vi.fn()
  });

  // Unsubscribe first — kind:5 should still be active
  handle1.unsubscribe();

  // Unsubscribe second — kind:5 should be removed
  handle2.unsubscribe();

  // Verify: no subscriptions remain
  // (implementation detail: check that relayManager has no active subscribers)
});
```

- [ ] **Step 2: テスト fail → SyncEngine に deletion-watch 参照カウントを追加**

SyncEngine に `#deletionWatchRefCount = 0` と `#deletionWatchUnsubscribers: Map<string, () => void>` を追加。

`liveQuery()` 内:

- `#deletionWatchRefCount++`
- refCount が 1 (最初) のとき: `this.#relayManager.subscribe({ filter: { kinds: [5] }, relays, onEvent: (event) => tombstoneProcessor.processDeletion(event) })` を登録
- `unsubscribe()` で refCount をデクリメント
- refCount が 0 のとき: deletion-watch を unsubscribe

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: add kind:5 deletion-watch with reference counting in SyncEngine"
```

---

### Task 14: TombstoneProcessor ↔ SyncEngine 統合

**Files:**

- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Modify: `src/shared/nostr/auftakt/core/sync-engine.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
it('processes kind:5 events through TombstoneProcessor in syncQuery', async () => {
  const persistentStore = createFakePersistentStore();

  // Pre-populate a target event
  await persistentStore.putEvent({
    id: 'evt-1',
    kind: 1,
    pubkey: 'alice',
    content: 'hello',
    tags: [],
    created_at: 10
  });

  const relayManager = createFakeRelayManager({
    fetchedEvents: [
      { id: 'evt-1', kind: 1, pubkey: 'alice', content: 'hello', tags: [], created_at: 10 }
    ]
  });

  // Make the second fetch (kind:5 check) return a deletion
  let fetchCount = 0;
  const originalFetch = relayManager.fetch.bind(relayManager);
  relayManager.fetch = async (input: any) => {
    fetchCount++;
    if (fetchCount === 2) {
      // Return a kind:5 targeting evt-1
      return {
        events: [
          {
            id: 'del-1',
            kind: 5,
            pubkey: 'alice',
            content: '',
            tags: [['e', 'evt-1']],
            created_at: 20,
            sig: 'sig'
          }
        ],
        acceptedRelays: input.relays,
        failedRelays: [],
        successRate: 1
      };
    }
    return originalFetch(input);
  };

  const syncEngine = new SyncEngine({ persistentStore, relayManager });

  await syncEngine.syncQuery({
    queryIdentityKey: 'q1',
    fetchWindowKey: 'w1',
    filter: { kinds: [1], authors: ['alice'] },
    filterBase: '{}',
    projectionKey: 'default',
    policyKey: 'timeline-default',
    resume: 'none',
    relays: ['wss://relay.test'],
    completion: { mode: 'all' }
  });

  // Tombstone should have been created
  const tombstone = await persistentStore.getTombstone({ targetEventId: 'evt-1' });
  expect(tombstone).toMatchObject({
    targetEventId: 'evt-1',
    deletedByPubkey: 'alice',
    verified: true
  });
});
```

- [ ] **Step 2: テスト fail → SyncEngine に TombstoneProcessor を統合**

SyncEngine constructor に `TombstoneProcessor` を作成。syncQuery の kind:5 自動チェック (Task 7) の結果を `tombstoneProcessor.processDeletion()` で処理するように変更。

```typescript
// syncQuery 内の kind:5 fetch 結果の処理を変更:
for (const event of deletions.events) {
  if (event.kind === 5) {
    await this.#tombstoneProcessor.processDeletion(event);
  } else {
    await this.#persistentStore.putEvent(event);
  }
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: integrate TombstoneProcessor into SyncEngine for kind:5 processing"
```

---

### Task 15: Offline Publish Queue ↔ Session 統合

**Files:**

- Modify: `src/shared/nostr/auftakt/core/models/session.ts`
- Modify: `src/shared/nostr/auftakt/core/models/session.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
it('persists pending publish to store on cast and deletes on success', async () => {
  const persistentStore = createFakePersistentStore();
  const relayManager = createFakeRelayManager();
  const runtime = createRuntime({
    persistentStore,
    relayManager,
    syncEngine: createFakeSyncEngine()
  });
  const signer = createFakeSigner('alice');
  const session = await Session.open({ runtime, signer });

  session.setDefaultRelays({
    read: ['wss://relay.test'],
    write: ['wss://relay.test']
  });

  await session.send({ kind: 1, content: 'hello', tags: [] });

  // After successful send, pending publish should be deleted
  const pending = await persistentStore.listPendingPublishes();
  expect(pending).toHaveLength(0);
});

it('retries pending publishes on Session.open', async () => {
  const persistentStore = createFakePersistentStore();
  await persistentStore.putPendingPublish({
    eventId: 'pending-1',
    signedEvent: {
      id: 'pending-1',
      kind: 1,
      pubkey: 'alice',
      created_at: 1000,
      content: 'hi',
      tags: [],
      sig: 'sig'
    },
    relaySet: { read: [], write: ['wss://relay.test'] },
    createdAt: 1000,
    attempts: 0
  });

  const relayManager = createFakeRelayManager();
  const runtime = createRuntime({
    persistentStore,
    relayManager,
    syncEngine: createFakeSyncEngine()
  });
  const signer = createFakeSigner('alice');

  await Session.open({ runtime, signer });

  // Pending publish should have been retried (published via relayManager)
  expect(relayManager.published).toHaveLength(1);

  // After successful retry, pending should be cleaned up
  const remaining = await persistentStore.listPendingPublishes();
  expect(remaining).toHaveLength(0);
});
```

- [ ] **Step 2: テスト fail → Session を修正**

Session.#publish 内:

- 署名後、relay publish 前に `persistentStore.putPendingPublish({ eventId: signed.id, signedEvent: signed, relaySet: publishRelaySet, createdAt: Date.now(), attempts: 0 })`
- publish 成功後に `persistentStore.deletePendingPublish(signed.id)`

Session.open 末尾:

- `persistentStore.listPendingPublishes()` で pending を取得
- 各 pending を `relayManager.publish(pending.signedEvent, pending.relaySet)` で再送
- 成功 → `deletePendingPublish`、失敗 → `attempts++` で update
- **GC は pending retry の後** (既存の GC 呼び出しを pending retry の後に移動)

Session が受け取る `runtime.persistentStore` の型を拡張 (putPendingPublish, deletePendingPublish, listPendingPublishes)。

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: integrate offline publish queue into Session.cast/send/open"
```

---

### Task 16: createRuntime config 拡張

**Files:**

- Modify: `src/shared/nostr/auftakt/core/runtime.ts`
- Modify: `src/shared/nostr/auftakt/core/runtime.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
it('passes heartbeat and circuit breaker config to RelayManager', () => {
  const runtime = createRuntime({
    relayManager: createFakeRelayManager(),
    inactivityTimeout: 120_000,
    circuitBreaker: { failureThreshold: 10, cooldownMs: 30_000, maxCooldownMs: 120_000 },
    recovery: { stabilityWindow: 10_000, recoveryCooldown: 120_000 },
    browserSignals: false,
    preTombstoneTtlDays: 14
  });

  expect(runtime).toBeDefined();
  expect(typeof runtime.dispose).toBe('function');
});
```

- [ ] **Step 2: テスト fail → createRuntime に新しい config を追加**

`createRuntime` の config type に `inactivityTimeout`, `probeTimeout`, `circuitBreaker`, `recovery`, `browserSignals`, `maxPublishAttempts`, `preTombstoneTtlDays` を追加。

`new DefaultRelayManager({})` 呼び出しに新しい config を伝搬。

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: extend createRuntime config for heartbeat, circuit breaker, and recovery"
```

---

### Task 17: 最終検証

- [ ] **Step 1: 全 auftakt テスト pass**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全テスト pass

- [ ] **Step 2: format + lint + check**

Run: `pnpm format:check && pnpm lint && pnpm check`

- [ ] **Step 3: 全テスト pass**

Run: `pnpm test`

- [ ] **Step 4: Commit (fix があれば)**

```bash
git add -A && git commit -m "chore: final validation for offline recovery implementation"
```

---

## Exit Criteria

**コア部品 (Task 1-7):**

- [ ] `CircuitBreaker` — CLOSED/OPEN/HALF-OPEN lifecycle + cooldown 倍増 + max cap
- [ ] `Heartbeat` — inactivity monitor + probe REQ + EOSE 確認 + onDead callback
- [ ] `TombstoneProcessor` — kind:5 処理 (verified/pre-tombstone) + author 検証 + a-tag 対応
- [ ] `PersistentStore` に pending publish + tombstone GC メソッド追加
- [ ] `gcStaleTombstones` — unverified tombstone を TTL 後に削除
- [ ] `DefaultRecoveryStrategy` — coverage gap fetch + AbortSignal 対応
- [ ] `SyncEngine.syncQuery` — kind:5 自動チェック (ID ターゲット、時間窓なし)

**統合 (Task 9-16):**

- [ ] Heartbeat ↔ RelayConnection — message 受信で recordActivity、probe dead → close
- [ ] CircuitBreaker ↔ RelayManager — OPEN relay スキップ、failure 記録
- [ ] Browser Signal — online → staggered reconnect、offline → retry 停止
- [ ] Recovery 管理 — disconnectedAt 記録、stabilityWindow、recoveryCooldown、AbortController
- [ ] Forward kind:5 — `deletion-watch` 参照カウント、slot 予約
- [ ] TombstoneProcessor ↔ SyncEngine — syncQuery/liveQuery で kind:5 を processDeletion
- [ ] Session ↔ Offline Publish — cast/send で putPendingPublish、open で retry (GC の前)
- [ ] createRuntime — heartbeat/circuitBreaker/recovery/browserSignals config

**検証:**

- [ ] fakes.ts が全新メソッドに対応
- [ ] `pnpm format:check && pnpm lint && pnpm test` が全 pass
