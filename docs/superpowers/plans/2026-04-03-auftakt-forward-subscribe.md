# auftakt Forward Subscribe & SyncEngine Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ForwardAssembler (物理 REQ 組み立て)、SubscriptionManager (論理 subscription 管理)、SyncEngine.liveQuery() を実装し、全 Handle の live() を aggregation relay モデルに統一する

**Architecture:** SubscriptionManager は SyncEngine 内部 (`core/sync/`)、ForwardAssembler は RelayManager 内部 (`core/relay/`)。SubscriptionManager が RelayManager.subscribe() を呼び、ForwardAssembler が物理 REQ を組み立てる

**Tech Stack:** TypeScript, vitest

**Dependencies:** Plan A + Plan C 完��

---

## File Structure

| File                                                              | 責務                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| `src/shared/nostr/auftakt/core/relay/forward-assembler.ts`        | 物理 forward REQ 組み立て + event routing + debounce |
| `src/shared/nostr/auftakt/core/relay/forward-assembler.test.ts`   | テスト                                               |
| `src/shared/nostr/auftakt/core/relay/filter-match.ts`             | NIP-01 filter マッチング (event routing 用)          |
| `src/shared/nostr/auftakt/core/relay/filter-match.test.ts`        | テスト                                               |
| `src/shared/nostr/auftakt/core/sync/subscription-manager.ts`      | 論理 subscription 管理 + coverage bridge             |
| `src/shared/nostr/auftakt/core/sync/subscription-manager.test.ts` | テスト                                               |
| `src/shared/nostr/auftakt/core/sync/sync-engine-live.ts`          | SyncEngine.liveQuery() 拡張                          |
| `src/shared/nostr/auftakt/core/sync/sync-engine-live.test.ts`     | テスト                                               |

**変更:**

| File                                                       | 変更内容                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `src/shared/nostr/auftakt/core/store-types.ts`             | SyncEngine に `liveQuery` 追加                           |
| `src/shared/nostr/auftakt/core/handles/timeline-handle.ts` | live() を SyncEngine 経由 + incremental + reconciliation |
| `src/shared/nostr/auftakt/builtin/users.ts`                | live() を SyncEngine 経由                                |
| `src/shared/nostr/auftakt/builtin/relays.ts`               | live() を SyncEngine 経由                                |
| `src/shared/nostr/auftakt/builtin/emojis.ts`               | live() を SyncEngine 経由                                |
| `src/shared/nostr/auftakt/builtin/comments.ts`             | live() を SyncEngine 経由                                |
| `src/shared/nostr/auftakt/testing/fakes.ts`                | createFakeSyncEngine に liveQuery 追加                   |

---

### Task 1: Filter Match (NIP-01 フィルタマッチング)

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/filter-match.ts`
- Test: `src/shared/nostr/auftakt/core/relay/filter-match.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/filter-match.test.ts
import { describe, expect, it } from 'vitest';

import { matchesFilter } from './filter-match.js';

const event = {
  id: 'evt-1',
  pubkey: 'alice',
  kind: 1,
  created_at: 1000,
  tags: [
    ['p', 'bob'],
    ['e', 'parent-1']
  ],
  content: 'hello',
  sig: 'sig'
};

describe('matchesFilter', () => {
  it('matches when filter is empty (matches all)', () => {
    expect(matchesFilter(event, {})).toBe(true);
  });

  it('matches by kind', () => {
    expect(matchesFilter(event, { kinds: [1] })).toBe(true);
    expect(matchesFilter(event, { kinds: [7] })).toBe(false);
  });

  it('matches by authors', () => {
    expect(matchesFilter(event, { authors: ['alice'] })).toBe(true);
    expect(matchesFilter(event, { authors: ['bob'] })).toBe(false);
  });

  it('matches by ids', () => {
    expect(matchesFilter(event, { ids: ['evt-1'] })).toBe(true);
    expect(matchesFilter(event, { ids: ['evt-2'] })).toBe(false);
  });

  it('matches by tag filter #p', () => {
    expect(matchesFilter(event, { '#p': ['bob'] })).toBe(true);
    expect(matchesFilter(event, { '#p': ['charlie'] })).toBe(false);
  });

  it('matches by tag filter #e', () => {
    expect(matchesFilter(event, { '#e': ['parent-1'] })).toBe(true);
  });

  it('matches since/until window', () => {
    expect(matchesFilter(event, { since: 500 })).toBe(true);
    expect(matchesFilter(event, { since: 2000 })).toBe(false);
    expect(matchesFilter(event, { until: 2000 })).toBe(true);
    expect(matchesFilter(event, { until: 500 })).toBe(false);
  });

  it('requires all conditions to match (AND)', () => {
    expect(matchesFilter(event, { kinds: [1], authors: ['alice'] })).toBe(true);
    expect(matchesFilter(event, { kinds: [1], authors: ['bob'] })).toBe(false);
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/filter-match.ts
import type { NostrEvent } from '../types.js';

export function matchesFilter(event: NostrEvent, filter: Record<string, unknown>): boolean {
  if (filter.ids) {
    const ids = filter.ids as string[];
    if (!ids.includes(event.id)) return false;
  }

  if (filter.authors) {
    const authors = filter.authors as string[];
    if (!authors.includes(event.pubkey)) return false;
  }

  if (filter.kinds) {
    const kinds = filter.kinds as number[];
    if (!kinds.includes(event.kind)) return false;
  }

  if (typeof filter.since === 'number') {
    if (event.created_at < filter.since) return false;
  }

  if (typeof filter.until === 'number') {
    if (event.created_at > filter.until) return false;
  }

  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith('#') || !Array.isArray(values)) continue;
    const tagName = key.slice(1);
    const eventTagValues = event.tags
      .filter(([name]) => name === tagName)
      .map(([, value]) => value);
    if (!values.some((v: string) => eventTagValues.includes(v))) return false;
  }

  return true;
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/filter-match.ts src/shared/nostr/auftakt/core/relay/filter-match.test.ts
git commit -m "feat: add NIP-01 filter matching for event routing"
```

---

### Task 2: ForwardAssembler

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/forward-assembler.ts`
- Test: `src/shared/nostr/auftakt/core/relay/forward-assembler.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/forward-assembler.test.ts
import { describe, expect, it, vi } from 'vitest';

import type { NostrEvent } from '$shared/nostr/auftakt/core/types.js';

import { ForwardAssembler } from './forward-assembler.js';

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
    simulateEvent(subId: string, event: NostrEvent) {
      for (const h of messageHandlers) h(['EVENT', subId, event]);
    },
    sent
  };
}

describe('ForwardAssembler', () => {
  it('sends REQ with filter array on subscribe', async () => {
    const conn = createMockConnection();
    const assembler = new ForwardAssembler({ connection: conn as any });

    assembler.addSubscription('sub-1', { kinds: [1] }, vi.fn());
    await new Promise((r) => setTimeout(r, 0)); // debounce

    expect(conn.sent).toHaveLength(1);
    expect(conn.sent[0]![0]).toBe('REQ');
    expect(conn.sent[0]![2]).toEqual({ kinds: [1] });
  });

  it('merges multiple subscriptions into one REQ', async () => {
    const conn = createMockConnection();
    const assembler = new ForwardAssembler({ connection: conn as any });

    assembler.addSubscription('sub-1', { kinds: [1] }, vi.fn());
    assembler.addSubscription('sub-2', { kinds: [7] }, vi.fn());
    await new Promise((r) => setTimeout(r, 0));

    // Single REQ with 2 filters
    expect(conn.sent).toHaveLength(1);
    expect(conn.sent[0]).toHaveLength(4); // ['REQ', subId, filter1, filter2]
  });

  it('rebuilds REQ on unsubscribe', async () => {
    const conn = createMockConnection();
    const assembler = new ForwardAssembler({ connection: conn as any });

    assembler.addSubscription('sub-1', { kinds: [1] }, vi.fn());
    assembler.addSubscription('sub-2', { kinds: [7] }, vi.fn());
    await new Promise((r) => setTimeout(r, 0));

    conn.sent.length = 0;
    assembler.removeSubscription('sub-1');
    await new Promise((r) => setTimeout(r, 0));

    // REQ re-sent with only sub-2's filter
    expect(conn.sent).toHaveLength(1);
    expect(conn.sent[0]).toHaveLength(3); // ['REQ', subId, filter2]
  });

  it('sends CLOSE when all subscriptions are removed', async () => {
    const conn = createMockConnection();
    const assembler = new ForwardAssembler({ connection: conn as any });

    assembler.addSubscription('sub-1', { kinds: [1] }, vi.fn());
    await new Promise((r) => setTimeout(r, 0));

    conn.sent.length = 0;
    assembler.removeSubscription('sub-1');
    await new Promise((r) => setTimeout(r, 0));

    expect(conn.sent[0]![0]).toBe('CLOSE');
  });

  it('routes events to matching subscriptions via filter match', async () => {
    const conn = createMockConnection();
    const assembler = new ForwardAssembler({ connection: conn as any });

    const onEvent1 = vi.fn();
    const onEvent2 = vi.fn();
    assembler.addSubscription('sub-1', { kinds: [1] }, onEvent1);
    assembler.addSubscription('sub-2', { kinds: [7] }, onEvent2);
    await new Promise((r) => setTimeout(r, 0));

    const subId = conn.sent[0]![1] as string;
    const event: NostrEvent = {
      id: 'e1',
      pubkey: 'alice',
      kind: 1,
      created_at: 1000,
      tags: [],
      content: 'hi',
      sig: 'sig'
    };
    conn.simulateEvent(subId, event);

    expect(onEvent1).toHaveBeenCalledWith(event, expect.any(String));
    expect(onEvent2).not.toHaveBeenCalled();
  });

  it('debounces rapid subscribe/unsubscribe into one REQ', async () => {
    const conn = createMockConnection();
    const assembler = new ForwardAssembler({ connection: conn as any });

    assembler.addSubscription('a', { kinds: [1] }, vi.fn());
    assembler.addSubscription('b', { kinds: [7] }, vi.fn());
    assembler.removeSubscription('a');
    assembler.addSubscription('c', { kinds: [30023] }, vi.fn());

    await new Promise((r) => setTimeout(r, 0));

    // Only 1 REQ sent (debounced)
    expect(conn.sent).toHaveLength(1);
    // Contains filters for b and c
    expect(conn.sent[0]).toHaveLength(4); // REQ, subId, filter-b, filter-c
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/forward-assembler.ts
import type { NostrEvent } from '../types.js';
import { matchesFilter } from './filter-match.js';
import { shardFilter, splitFilters } from './filter-shard.js';

interface ForwardConnection {
  send(message: unknown[]): void;
  onMessage(handler: (message: unknown[]) => void): () => void;
  ensureConnected(): void;
}

interface LogicalEntry {
  filter: Record<string, unknown>;
  onEvent: (event: NostrEvent, from: string) => void | Promise<void>;
}

export class ForwardAssembler {
  readonly #connection: ForwardConnection;
  readonly #relayUrl: string;
  readonly #entries = new Map<string, LogicalEntry>();
  #wireSubIds: string[] = [];
  #pendingRebuild = false;
  #offMessage: (() => void) | null = null;
  readonly #chunkSize: number;
  readonly #maxFilters: number;

  constructor(options: {
    connection: ForwardConnection;
    relayUrl?: string;
    chunkSize?: number;
    maxFilters?: number;
  }) {
    this.#connection = options.connection;
    this.#relayUrl = options.relayUrl ?? '';
    this.#chunkSize = options.chunkSize ?? 100;
    this.#maxFilters = options.maxFilters ?? Infinity;

    this.#offMessage = this.#connection.onMessage((message) => {
      if (!Array.isArray(message) || message[0] !== 'EVENT') return;
      const [, subId, rawEvent] = message;
      if (!this.#wireSubIds.includes(subId as string)) return;

      const event = rawEvent as NostrEvent;
      for (const entry of this.#entries.values()) {
        if (matchesFilter(event, entry.filter)) {
          void Promise.resolve(entry.onEvent(event, this.#relayUrl)).catch(() => undefined);
        }
      }
    });
  }

  addSubscription(
    id: string,
    filter: Record<string, unknown>,
    onEvent: (event: NostrEvent, from: string) => void | Promise<void>
  ): void {
    this.#entries.set(id, { filter, onEvent });
    this.#scheduleRebuild();
  }

  removeSubscription(id: string): void {
    this.#entries.delete(id);
    this.#scheduleRebuild();
  }

  replay(): void {
    this.#rebuild();
  }

  dispose(): void {
    this.#offMessage?.();
    this.#offMessage = null;

    for (const subId of this.#wireSubIds) {
      this.#connection.send(['CLOSE', subId]);
    }
    this.#wireSubIds = [];

    this.#entries.clear();
  }

  #scheduleRebuild(): void {
    if (this.#pendingRebuild) return;
    this.#pendingRebuild = true;
    queueMicrotask(() => {
      this.#pendingRebuild = false;
      this.#rebuild();
    });
  }

  #rebuild(): void {
    const rawFilters = [...this.#entries.values()].map((e) => e.filter);

    if (rawFilters.length === 0) {
      for (const subId of this.#wireSubIds) {
        this.#connection.send(['CLOSE', subId]);
      }
      this.#wireSubIds = [];
      return;
    }

    // Auto-shard large authors/ids arrays (spec §4.4)
    const sharded = rawFilters.flatMap((f) => shardFilter(f, this.#chunkSize));

    // Split into groups respecting max_filters per REQ (spec §4.4)
    const groups = splitFilters(sharded, this.#maxFilters);

    // Ensure enough wire subIds
    while (this.#wireSubIds.length < groups.length) {
      this.#wireSubIds.push(`fwd:${Math.random().toString(36).slice(2, 8)}`);
    }
    // Close excess wire subIds
    while (this.#wireSubIds.length > groups.length) {
      const old = this.#wireSubIds.pop()!;
      this.#connection.send(['CLOSE', old]);
    }

    this.#connection.ensureConnected();
    for (let i = 0; i < groups.length; i++) {
      this.#connection.send(['REQ', this.#wireSubIds[i], ...groups[i]]);
    }
  }
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/forward-assembler.ts src/shared/nostr/auftakt/core/relay/forward-assembler.test.ts
git commit -m "feat: implement ForwardAssembler with filter array assembly and event routing"
```

---

### Task 3: SubscriptionManager

**Files:**

- Create: `src/shared/nostr/auftakt/core/sync/subscription-manager.ts`
- Test: `src/shared/nostr/auftakt/core/sync/subscription-manager.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/sync/subscription-manager.test.ts
import { describe, expect, it, vi } from 'vitest';

import { SubscriptionManager } from './subscription-manager.js';

function createMockRelayManager() {
  const subscriptions: Array<{
    filter: Record<string, unknown>;
    relays: string[];
  }> = [];
  const unsubscribeFns: Array<() => void> = [];

  return {
    subscribe(input: { filter: Record<string, unknown>; relays: string[]; onEvent: Function }) {
      subscriptions.push({ filter: input.filter, relays: input.relays });
      const unsub = vi.fn();
      unsubscribeFns.push(unsub);
      return { unsubscribe: unsub };
    },
    subscriptions,
    unsubscribeFns
  };
}

function createMockPersistentStore(coverageUntil?: number) {
  return {
    async getQueryCoverage(key: string) {
      return coverageUntil !== undefined
        ? { status: 'complete' as const, windowUntil: coverageUntil }
        : undefined;
    },
    async putEvent(event: unknown) {}
  };
}

describe('SubscriptionManager', () => {
  it('creates a relay subscription with coverage-aware since', async () => {
    const rm = createMockRelayManager();
    const store = createMockPersistentStore(5000);

    const sm = new SubscriptionManager({
      relayManager: rm as any,
      persistentStore: store as any
    });

    await sm.subscribe({
      queryIdentityKey: 'q1',
      filter: { kinds: [1] },
      relays: ['wss://relay.test'],
      onEvent: vi.fn()
    });

    expect(rm.subscriptions).toHaveLength(1);
    expect(rm.subscriptions[0]!.filter).toMatchObject({ kinds: [1], since: 5000 });
  });

  it('defaults since to now when no coverage exists', async () => {
    const rm = createMockRelayManager();
    const store = createMockPersistentStore();

    const sm = new SubscriptionManager({
      relayManager: rm as any,
      persistentStore: store as any,
      now: () => 9999
    });

    await sm.subscribe({
      queryIdentityKey: 'q1',
      filter: { kinds: [1] },
      relays: ['wss://relay.test'],
      onEvent: vi.fn()
    });

    expect(rm.subscriptions[0]!.filter).toMatchObject({ since: 9999 });
  });

  it('wraps onEvent with store.putEvent', async () => {
    const rm = createMockRelayManager();
    const putEvent = vi.fn();
    const store = { ...createMockPersistentStore(), putEvent };
    const handleOnEvent = vi.fn();

    const sm = new SubscriptionManager({
      relayManager: rm as any,
      persistentStore: store as any
    });

    await sm.subscribe({
      queryIdentityKey: 'q1',
      filter: { kinds: [1] },
      relays: ['wss://relay.test'],
      onEvent: handleOnEvent
    });

    // Simulate RelayManager calling the wrapped onEvent
    const subscribeCall = (rm.subscribe as any).mock.calls[0][0];
    await subscribeCall.onEvent({ id: 'e1' }, 'wss://relay.test');

    expect(putEvent).toHaveBeenCalledWith({ id: 'e1' });
    expect(handleOnEvent).toHaveBeenCalledWith({ id: 'e1' }, 'wss://relay.test');
  });

  it('unsubscribes from relay manager', async () => {
    const rm = createMockRelayManager();
    const store = createMockPersistentStore();

    const sm = new SubscriptionManager({
      relayManager: rm as any,
      persistentStore: store as any
    });

    const handle = await sm.subscribe({
      queryIdentityKey: 'q1',
      filter: { kinds: [1] },
      relays: ['wss://relay.test'],
      onEvent: vi.fn()
    });

    handle.unsubscribe();
    expect(rm.unsubscribeFns[0]).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/sync/subscription-manager.ts
import type { NostrEvent } from '../types.js';

interface SubscriptionRelayManager {
  subscribe(input: {
    filter: Record<string, unknown>;
    relays: string[];
    onEvent(event: NostrEvent, from: string): void | Promise<void>;
  }): { unsubscribe(): void };
}

interface SubscriptionPersistentStore {
  getQueryCoverage(key: string): Promise<{ windowUntil?: number } | undefined>;
  putEvent(event: unknown): Promise<void>;
}

interface SubscriptionManagerConfig {
  relayManager: SubscriptionRelayManager;
  persistentStore: SubscriptionPersistentStore;
  now?: () => number;
}

interface SubscribeInput {
  queryIdentityKey: string;
  filter: Record<string, unknown>;
  relays: string[];
  onEvent(event: NostrEvent, from: string): void | Promise<void>;
}

export class SubscriptionManager {
  readonly #relayManager: SubscriptionRelayManager;
  readonly #persistentStore: SubscriptionPersistentStore;
  readonly #now: () => number;

  constructor(config: SubscriptionManagerConfig) {
    this.#relayManager = config.relayManager;
    this.#persistentStore = config.persistentStore;
    this.#now = config.now ?? (() => Math.floor(Date.now() / 1000));
  }

  async subscribe(input: SubscribeInput): Promise<{ unsubscribe(): void }> {
    const coverage = await this.#persistentStore.getQueryCoverage(input.queryIdentityKey);
    const since = coverage?.windowUntil ?? this.#now();

    const wrappedOnEvent = async (event: NostrEvent, from: string) => {
      try {
        await this.#persistentStore.putEvent(event);
      } catch {
        // warn: putEvent failed, continue with in-memory delivery
      }
      await Promise.resolve(input.onEvent(event, from)).catch(() => undefined);
    };

    const handle = this.#relayManager.subscribe({
      filter: { ...input.filter, since },
      relays: input.relays,
      onEvent: wrappedOnEvent
    });

    return { unsubscribe: () => handle.unsubscribe() };
  }
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/sync/subscription-manager.ts src/shared/nostr/auftakt/core/sync/subscription-manager.test.ts
git commit -m "feat: implement SubscriptionManager with coverage bridge and Store persistence"
```

---

### Task 4: SyncEngine.liveQuery() + store-types 更新

**Files:**

- Modify: `src/shared/nostr/auftakt/core/store-types.ts`
- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Modify: `src/shared/nostr/auftakt/testing/fakes.ts`
- Test: `src/shared/nostr/auftakt/core/sync/sync-engine-live.test.ts`

- [ ] **Step 1: store-types.ts に liveQuery を追加**

`SyncEngine` interface に追加:

```typescript
// store-types.ts の SyncEngine interface に追加
liveQuery?(input: {
  queryIdentityKey: string;
  filter: Record<string, unknown>;
  relays: string[];
  onEvent(event: NostrEvent, from: string): void | Promise<void>;
}): { unsubscribe(): void };
```

- [ ] **Step 2: fakes.ts に createFakeSyncEngine の liveQuery を追加**

```typescript
// fakes.ts の createFakeSyncEngine に追加
liveQuery(input: { onEvent: Function }) {
  return { unsubscribe: () => {} };
}
```

- [ ] **Step 3: SyncEngine に liveQuery を実装**

```typescript
// sync-engine.ts に追加
liveQuery(input: {
  queryIdentityKey: string;
  filter: Record<string, unknown>;
  relays: string[];
  onEvent(event: unknown, from: string): void | Promise<void>;
}) {
  // SubscriptionManager に委譲
  // Plan D 完了時に SubscriptionManager を使用する本実装に差し替え
  // 暫定: RelayManager.subscribe を直接呼ぶ
  return this.#relayManager.subscribe?.({
    filter: input.filter,
    relays: input.relays,
    onEvent: async (event: unknown, from: string) => {
      await this.#persistentStore.putEvent(event);
      await Promise.resolve(input.onEvent(event, from)).catch(() => undefined);
    }
  }) ?? { unsubscribe: () => {} };
}
```

- [ ] **Step 4: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/store-types.ts src/shared/nostr/auftakt/core/sync-engine.ts src/shared/nostr/auftakt/testing/fakes.ts
git commit -m "feat: add SyncEngine.liveQuery with Store persistence wrapper"
```

---

### Task 5: Handle live() を SyncEngine 経由に変更

**Files:**

- Modify: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`
- Modify: `src/shared/nostr/auftakt/builtin/users.ts`
- Modify: `src/shared/nostr/auftakt/builtin/relays.ts`
- Modify: `src/shared/nostr/auftakt/builtin/emojis.ts`
- Modify: `src/shared/nostr/auftakt/builtin/comments.ts`

- [ ] **Step 1: TimelineHandle.live() を書き換え**

```typescript
// timeline-handle.ts の live() メソッドを置換
live() {
  const relays = resolveReadRelays(this.options);
  const queryIdentityKey = getQueryIdentityKey(this.options);
  this.#subscription?.unsubscribe();

  let eventsSinceReconciliation = 0;
  let lastReconciliationTime = Date.now();

  this.#subscription = this.options.runtime?.syncEngine?.liveQuery?.({
    queryIdentityKey,
    filter: (this.options.filter ?? {}) as Record<string, unknown>,
    relays,
    onEvent: async (event) => {
      // Incremental projection (§3.0.1 incremental variant)
      const liveItem = buildItem<TItem>(this.options, event as TimelineEvent);
      const nextItems = [...this.items, liveItem].sort((left, right) => {
        const leftSortKey = (left as { projection?: { sortKey?: number | string } }).projection?.sortKey;
        const rightSortKey = (right as { projection?: { sortKey?: number | string } }).projection?.sortKey;
        return Number(leftSortKey ?? 0) - Number(rightSortKey ?? 0);
      });
      this.items = nextItems;
      this.source = 'relay';
      this.stale = false;
      this.options.runtime?.memoryStore?.setCached(`timeline:${queryIdentityKey}`, nextItems);

      // Periodic reconciliation
      eventsSinceReconciliation++;
      const elapsed = Date.now() - lastReconciliationTime;
      if (eventsSinceReconciliation >= 50 || elapsed >= 30_000) {
        eventsSinceReconciliation = 0;
        lastReconciliationTime = Date.now();
        const refreshed = await buildItems<TItem>({ ...this.options, seedEvents: undefined });
        if (refreshed.length > 0) {
          this.items = refreshed;
          this.options.runtime?.memoryStore?.setCached(`timeline:${queryIdentityKey}`, refreshed);
        }
      }
    }
  }) ?? undefined;

  return this;
}
```

- [ ] **Step 2: builtin relation handles の live() を SyncEngine 経由に変更**

全 builtin の `relayManager?.subscribe?.(...)` を `syncEngine?.liveQuery?.(...)` に置換。onEvent 内の `store.putEvent` は SubscriptionManager が行うので削除。

例 (users.ts profile handle):

```typescript
// Before:
subscription = input?.relayManager?.subscribe?.({
  filter: { authors: [input.pubkey], kinds: [0] },
  relays: input.relays ?? [],
  onEvent: async (event) => {
    await store.putEvent(event);
    await this.load();
  }
});

// After:
subscription = input?.syncEngine?.liveQuery?.({
  queryIdentityKey: `user:profile:${input.pubkey}`,
  filter: { authors: [input.pubkey], kinds: [0] },
  relays: input.relays ?? [],
  onEvent: async () => {
    await this.load();
  }
});
```

同じパターンを relays.ts, emojis.ts, comments.ts (thread + reactions) にも適用。

- [ ] **Step 3: 全テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全テスト pass

- [ ] **Step 4: format + lint + check**

Run: `pnpm format:check && pnpm lint && pnpm check`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: route all Handle live() through SyncEngine.liveQuery"
```

---

## Exit Criteria

- [ ] `matchesFilter` — NIP-01 フィルタマッチング (kinds/authors/ids/tags/since/until)
- [ ] `ForwardAssembler` ��� フィルタ配列組み立て + debounce + event routing + CLOSE
- [ ] `SubscriptionManager` — coverage bridge + Store persistence + 論理 subscription 管理
- [ ] `SyncEngine.liveQuery()` — coverage-aware since、Store 永続化、relay 選択
- [ ] 全 Handle の live() が SyncEngine 経由
- [ ] TimelineHandle に incremental + periodic reconciliation (30s / 50 events)
- [ ] `pnpm format:check && pnpm lint && pnpm check` が全 pass

---

### Task 6: Wiring — ForwardAssembler に LruDedup + EventValidator + SlotCounter 統合

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/forward-assembler.ts`

- [ ] **Step 1: constructor に verifier, dedup, slots を追加。EVENT パイプラインで validateEvent → dedup.check → routing。wire subId を SlotCounter で管理。**

- [ ] **Step 2: テスト追加 — dedup 重複弾き + slot 管理を検証**

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: integrate LruDedup, EventValidator, SlotCounter into ForwardAssembler"
```

---

### Task 7: Wiring — ForwardAssembler.replay() ↔ RelayConnection.onReconnect

- [ ] **Step 1: reconnect 時に ForwardAssembler が REQ を再送するテストを書く**

- [ ] **Step 2: テスト pass → Commit**

```bash
git commit -m "test: verify ForwardAssembler replay on RelayConnection reconnect"
```

---

### Task 8: Wiring — store-types.ts subscribe() を required + onEvent(event, from) に変更

- [ ] **Step 1: store-types.ts の subscribe を required + NostrEvent + from に変更**

- [ ] **Step 2: fakes.ts の subscribe を更新 (emit に from 追加)**

- [ ] **Step 3: SyncEngine.liveQuery の `subscribe?.()` → `subscribe()` に変更 (subscribe が required になったため optional chain 不要)**

- [ ] **Step 4: 既存テスト修正 (timeline-handle.test.ts, event.test.ts の emit に from 追加)**

- [ ] **Step 4: 全テスト pass → Commit**

```bash
git commit -m "refactor: make RelayManager.subscribe required with onEvent(event, from)"
```
