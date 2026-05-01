# auftakt Backward Fetch & NIP-11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FetchScheduler (backward shard + EOSE + slot queue)、Nip11Registry、probeCapabilities を実装し、RelayManager.fetch() を本実装に置き換える

**Architecture:** Plan A の RelayConnection + LruDedup + EventValidator を基盤に、`core/relay/` に FetchScheduler と Nip11Registry を追加。SlotCounter を FetchScheduler と ForwardAssembler (Plan D) で共有

**Tech Stack:** TypeScript, vitest, fake WebSocket (Plan A の createFakeSocket パターン)

**Dependencies:** Plan A 完了

---

## File Structure

| File                                                          | 責務                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/shared/nostr/auftakt/core/relay/slot-counter.ts`         | per-relay subscription slot 管理 (backward + forward 共有) |
| `src/shared/nostr/auftakt/core/relay/slot-counter.test.ts`    | テスト                                                     |
| `src/shared/nostr/auftakt/core/relay/nip11-registry.ts`       | NIP-11 HTTP fetch + cache + TTL                            |
| `src/shared/nostr/auftakt/core/relay/nip11-registry.test.ts`  | テスト                                                     |
| `src/shared/nostr/auftakt/core/relay/filter-shard.ts`         | フィルタ auto-shard ロジック (pure)                        |
| `src/shared/nostr/auftakt/core/relay/filter-shard.test.ts`    | テスト                                                     |
| `src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts`      | backward REQ: shard + EOSE + queue + Promise coordination  |
| `src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts` | テスト                                                     |

---

### Task 1: SlotCounter

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/slot-counter.ts`
- Test: `src/shared/nostr/auftakt/core/relay/slot-counter.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/slot-counter.test.ts
import { describe, expect, it } from 'vitest';

import { SlotCounter } from './slot-counter.js';

describe('SlotCounter', () => {
  it('allows acquisition up to max', () => {
    const counter = new SlotCounter(3);
    expect(counter.tryAcquire()).toBe(true);
    expect(counter.tryAcquire()).toBe(true);
    expect(counter.tryAcquire()).toBe(true);
    expect(counter.tryAcquire()).toBe(false);
  });

  it('releases slots for reuse', () => {
    const counter = new SlotCounter(1);
    expect(counter.tryAcquire()).toBe(true);
    expect(counter.tryAcquire()).toBe(false);
    counter.release();
    expect(counter.tryAcquire()).toBe(true);
  });

  it('defaults to unlimited', () => {
    const counter = new SlotCounter();
    for (let i = 0; i < 1000; i++) {
      expect(counter.tryAcquire()).toBe(true);
    }
  });

  it('updates max dynamically (NIP-11 result arriving later)', () => {
    const counter = new SlotCounter();
    counter.tryAcquire();
    counter.tryAcquire();
    counter.tryAcquire();
    counter.setMax(2);
    // Already have 3, over limit but don't revoke
    expect(counter.tryAcquire()).toBe(false);
    counter.release();
    counter.release();
    // Now at 1, under new max of 2
    expect(counter.tryAcquire()).toBe(true);
  });

  it('notifies waiters when a slot is released', async () => {
    const counter = new SlotCounter(1);
    counter.tryAcquire();

    const promise = counter.waitForSlot();
    counter.release();

    await expect(promise).resolves.toBeUndefined();
  });

  it('reports available count', () => {
    const counter = new SlotCounter(5);
    counter.tryAcquire();
    counter.tryAcquire();
    expect(counter.available).toBe(3);
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/slot-counter.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/slot-counter.ts
export class SlotCounter {
  #max: number;
  #used = 0;
  #waiters: Array<() => void> = [];

  constructor(max = Infinity) {
    this.#max = max;
  }

  get available(): number {
    return Math.max(0, this.#max - this.#used);
  }

  tryAcquire(): boolean {
    if (this.#used >= this.#max) return false;
    this.#used++;
    return true;
  }

  release(): void {
    if (this.#used > 0) {
      this.#used--;
    }

    const waiter = this.#waiters.shift();
    if (waiter) waiter();
  }

  setMax(max: number): void {
    this.#max = max;
  }

  waitForSlot(): Promise<void> {
    if (this.#used < this.#max) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  dispose(): void {
    this.#waiters = [];
  }
}
```

- [ ] **Step 4: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/slot-counter.ts src/shared/nostr/auftakt/core/relay/slot-counter.test.ts
git commit -m "feat: add SlotCounter for NIP-11 subscription slot management"
```

---

### Task 2: Filter Shard

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/filter-shard.ts`
- Test: `src/shared/nostr/auftakt/core/relay/filter-shard.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/filter-shard.test.ts
import { describe, expect, it } from 'vitest';

import { shardFilter, splitFilters } from './filter-shard.js';

describe('shardFilter', () => {
  it('returns single filter when authors fit within chunk size', () => {
    const result = shardFilter({ kinds: [1], authors: ['a', 'b', 'c'] }, 100);
    expect(result).toHaveLength(1);
    expect(result[0].authors).toEqual(['a', 'b', 'c']);
  });

  it('shards authors into chunks of chunkSize', () => {
    const authors = Array.from({ length: 250 }, (_, i) => `pub-${i}`);
    const result = shardFilter({ kinds: [1], authors }, 100);
    expect(result).toHaveLength(3);
    expect(result[0].authors).toHaveLength(100);
    expect(result[1].authors).toHaveLength(100);
    expect(result[2].authors).toHaveLength(50);
    // All shards keep the same kinds
    for (const shard of result) {
      expect(shard.kinds).toEqual([1]);
    }
  });

  it('shards ids into chunks', () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);
    const result = shardFilter({ ids }, 100);
    expect(result).toHaveLength(2);
    expect(result[0].ids).toHaveLength(100);
    expect(result[1].ids).toHaveLength(50);
  });

  it('does not shard when no large arrays', () => {
    const result = shardFilter({ kinds: [1, 7], since: 1000 }, 100);
    expect(result).toHaveLength(1);
  });
});

describe('splitFilters', () => {
  it('returns single array when within maxFilters', () => {
    const filters = [{ kinds: [1] }, { kinds: [7] }];
    const result = splitFilters(filters, 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  it('splits into multiple arrays when exceeding maxFilters', () => {
    const filters = Array.from({ length: 5 }, (_, i) => ({ kinds: [i] }));
    const result = splitFilters(filters, 2);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toHaveLength(2);
    expect(result[2]).toHaveLength(1);
  });

  it('returns as-is when maxFilters is unlimited', () => {
    const filters = Array.from({ length: 100 }, () => ({ kinds: [1] }));
    const result = splitFilters(filters, Infinity);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/filter-shard.ts
const DEFAULT_CHUNK_SIZE = 100;

export function shardFilter(
  filter: Record<string, unknown>,
  chunkSize = DEFAULT_CHUNK_SIZE
): Array<Record<string, unknown>> {
  const authors = filter.authors as string[] | undefined;
  const ids = filter.ids as string[] | undefined;

  const largeArray =
    authors && authors.length > chunkSize
      ? { key: 'authors', values: authors }
      : ids && ids.length > chunkSize
        ? { key: 'ids', values: ids }
        : null;

  if (!largeArray) return [filter];

  const shards: Array<Record<string, unknown>> = [];
  for (let i = 0; i < largeArray.values.length; i += chunkSize) {
    shards.push({
      ...filter,
      [largeArray.key]: largeArray.values.slice(i, i + chunkSize)
    });
  }

  return shards;
}

export function splitFilters(
  filters: Array<Record<string, unknown>>,
  maxFilters: number
): Array<Array<Record<string, unknown>>> {
  if (!Number.isFinite(maxFilters) || filters.length <= maxFilters) {
    return [filters];
  }

  const groups: Array<Array<Record<string, unknown>>> = [];
  for (let i = 0; i < filters.length; i += maxFilters) {
    groups.push(filters.slice(i, i + maxFilters));
  }

  return groups;
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/filter-shard.ts src/shared/nostr/auftakt/core/relay/filter-shard.test.ts
git commit -m "feat: add filter sharding and splitting for NIP-11 limits"
```

---

### Task 3: Nip11Registry

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/nip11-registry.ts`
- Test: `src/shared/nostr/auftakt/core/relay/nip11-registry.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/nip11-registry.test.ts
import { describe, expect, it, vi } from 'vitest';

import { Nip11Registry } from './nip11-registry.js';

describe('Nip11Registry', () => {
  it('fetches and caches NIP-11 info', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        limitation: { max_subscriptions: 20, max_filters: 10 },
        supported_nips: [1, 11, 77]
      })
    });
    const registry = new Nip11Registry({ fetch: fetchFn, ttlMs: 60_000 });

    const info = await registry.get('wss://relay.test');
    expect(info.maxSubscriptions).toBe(20);
    expect(info.maxFilters).toBe(10);
    expect(info.supportedNips).toContain(77);

    // Second call uses cache
    await registry.get('wss://relay.test');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns unlimited on fetch failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('CORS'));
    const registry = new Nip11Registry({ fetch: fetchFn, ttlMs: 60_000 });

    const info = await registry.get('wss://relay.test');
    expect(info.maxSubscriptions).toBeUndefined();
    expect(info.maxFilters).toBeUndefined();
  });

  it('converts wss:// to https:// for fetch', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    });
    const registry = new Nip11Registry({ fetch: fetchFn, ttlMs: 60_000 });

    await registry.get('wss://relay.test');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://relay.test',
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('re-fetches after TTL expires', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ limitation: { max_subscriptions: 10 } })
    });
    const registry = new Nip11Registry({ fetch: fetchFn, ttlMs: 50 });

    await registry.get('wss://relay.test');
    await new Promise((r) => setTimeout(r, 80));
    await registry.get('wss://relay.test');

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/nip11-registry.ts
export interface Nip11Info {
  maxSubscriptions?: number;
  maxFilters?: number;
  maxEventTags?: number;
  supportedNips?: number[];
}

interface CachedEntry {
  info: Nip11Info;
  fetchedAt: number;
}

interface Nip11RegistryConfig {
  fetch?: typeof globalThis.fetch;
  ttlMs?: number;
}

function wsToHttps(url: string): string {
  return url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

function parseNip11Response(data: Record<string, unknown>): Nip11Info {
  const limitation = data.limitation as Record<string, unknown> | undefined;

  return {
    maxSubscriptions:
      typeof limitation?.max_subscriptions === 'number' ? limitation.max_subscriptions : undefined,
    maxFilters: typeof limitation?.max_filters === 'number' ? limitation.max_filters : undefined,
    maxEventTags:
      typeof limitation?.max_event_tags === 'number' ? limitation.max_event_tags : undefined,
    supportedNips: Array.isArray(data.supported_nips)
      ? (data.supported_nips as number[])
      : undefined
  };
}

export class Nip11Registry {
  readonly #fetch: typeof globalThis.fetch;
  readonly #ttlMs: number;
  readonly #cache = new Map<string, CachedEntry>();
  readonly #inflight = new Map<string, Promise<Nip11Info>>();

  constructor(config: Nip11RegistryConfig = {}) {
    this.#fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.#ttlMs = config.ttlMs ?? 3_600_000;
  }

  async get(relayUrl: string): Promise<Nip11Info> {
    const cached = this.#cache.get(relayUrl);
    if (cached && Date.now() - cached.fetchedAt < this.#ttlMs) {
      return cached.info;
    }

    const inflight = this.#inflight.get(relayUrl);
    if (inflight) return inflight;

    const promise = this.#fetchNip11(relayUrl);
    this.#inflight.set(relayUrl, promise);

    try {
      return await promise;
    } finally {
      this.#inflight.delete(relayUrl);
    }
  }

  async #fetchNip11(relayUrl: string): Promise<Nip11Info> {
    try {
      const response = await this.#fetch(wsToHttps(relayUrl), {
        headers: { Accept: 'application/nostr+json' }
      });

      if (!response.ok) {
        return this.#cacheEmpty(relayUrl);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const info = parseNip11Response(data);
      this.#cache.set(relayUrl, { info, fetchedAt: Date.now() });
      return info;
    } catch {
      return this.#cacheEmpty(relayUrl);
    }
  }

  #cacheEmpty(relayUrl: string): Nip11Info {
    const info: Nip11Info = {};
    this.#cache.set(relayUrl, { info, fetchedAt: Date.now() });
    return info;
  }
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/nip11-registry.ts src/shared/nostr/auftakt/core/relay/nip11-registry.test.ts
git commit -m "feat: add Nip11Registry with HTTP fetch, cache, and TTL"
```

---

### Task 4: FetchScheduler

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts`
- Test: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts
import { describe, expect, it, vi } from 'vitest';

import { FetchScheduler } from './fetch-scheduler.js';
import { SlotCounter } from './slot-counter.js';

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
    simulateEvent(subId: string, event: Record<string, unknown>) {
      for (const h of messageHandlers) h(['EVENT', subId, event]);
    },
    simulateEose(subId: string) {
      for (const h of messageHandlers) h(['EOSE', subId]);
    },
    sent
  };
}

describe('FetchScheduler', () => {
  it('sends REQ and resolves on EOSE', async () => {
    const conn = createMockConnection();
    const slots = new SlotCounter(10);
    const scheduler = new FetchScheduler({ eoseTimeout: 5000 });

    const promise = scheduler.fetch({
      filter: { kinds: [1] },
      connection: conn as any,
      slots,
      onEvent: () => {}
    });

    const subId = conn.sent[0]?.[1] as string;
    expect(conn.sent[0]?.[0]).toBe('REQ');

    conn.simulateEvent(subId, { id: 'e1', kind: 1 });
    conn.simulateEose(subId);

    const result = await promise;
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ id: 'e1' });
  });

  it('auto-shards large authors arrays', async () => {
    const conn = createMockConnection();
    const slots = new SlotCounter(10);
    const scheduler = new FetchScheduler({ eoseTimeout: 5000, chunkSize: 2 });

    const authors = ['a', 'b', 'c', 'd', 'e'];
    const promise = scheduler.fetch({
      filter: { kinds: [1], authors },
      connection: conn as any,
      slots,
      onEvent: () => {}
    });

    // 5 authors / chunk 2 = 3 shards
    expect(conn.sent).toHaveLength(3);

    // Complete all shards
    for (const req of conn.sent) {
      const subId = req[1] as string;
      conn.simulateEose(subId);
    }

    const result = await promise;
    expect(result.events).toHaveLength(0);
  });

  it('queues shards when slots are exhausted', async () => {
    const conn = createMockConnection();
    const slots = new SlotCounter(1);
    const scheduler = new FetchScheduler({ eoseTimeout: 5000, chunkSize: 2 });

    const promise = scheduler.fetch({
      filter: { kinds: [1], authors: ['a', 'b', 'c', 'd'] },
      connection: conn as any,
      slots,
      onEvent: () => {}
    });

    // Only 1 shard dispatched (slot limit)
    expect(conn.sent).toHaveLength(1);

    // Complete first shard → releases slot → next shard dispatched
    const firstSubId = conn.sent[0]![1] as string;
    conn.simulateEose(firstSubId);

    // Wait for microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(conn.sent).toHaveLength(2);

    const secondSubId = conn.sent[1]![1] as string;
    conn.simulateEose(secondSubId);

    const result = await promise;
    expect(result.events).toHaveLength(0);
  });

  it('resolves with timeout when EOSE is not received', async () => {
    const conn = createMockConnection();
    const slots = new SlotCounter(10);
    const scheduler = new FetchScheduler({ eoseTimeout: 30 });

    conn.simulateEvent = () => {}; // no events
    const result = await scheduler.fetch({
      filter: { kinds: [1] },
      connection: conn as any,
      slots,
      onEvent: () => {}
    });

    expect(result.events).toHaveLength(0);
  });

  it('calls onEvent for each received event', async () => {
    const conn = createMockConnection();
    const slots = new SlotCounter(10);
    const scheduler = new FetchScheduler({ eoseTimeout: 5000 });
    const received: unknown[] = [];

    const promise = scheduler.fetch({
      filter: { kinds: [1] },
      connection: conn as any,
      slots,
      onEvent: (event) => {
        received.push(event);
      }
    });

    const subId = conn.sent[0]![1] as string;
    conn.simulateEvent(subId, { id: 'e1' });
    conn.simulateEvent(subId, { id: 'e2' });
    conn.simulateEose(subId);

    await promise;
    expect(received).toHaveLength(2);
  });

  it('releases slot on EOSE', async () => {
    const conn = createMockConnection();
    const slots = new SlotCounter(1);
    const scheduler = new FetchScheduler({ eoseTimeout: 5000 });

    expect(slots.available).toBe(1);

    const promise = scheduler.fetch({
      filter: { kinds: [1] },
      connection: conn as any,
      slots,
      onEvent: () => {}
    });

    expect(slots.available).toBe(0);

    const subId = conn.sent[0]![1] as string;
    conn.simulateEose(subId);
    await promise;

    expect(slots.available).toBe(1);
  });
});
```

- [ ] **Step 2: テスト fail → 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts
import { shardFilter } from './filter-shard.js';
import type { SlotCounter } from './slot-counter.js';

interface FetchConnection {
  send(message: unknown[]): void;
  onMessage(handler: (message: unknown[]) => void): () => void;
  ensureConnected(): void;
}

interface FetchInput {
  filter: Record<string, unknown>;
  connection: FetchConnection;
  slots: SlotCounter;
  maxFilters?: number;
  onEvent: (event: unknown) => void;
}

interface FetchResult {
  events: unknown[];
}

let subIdCounter = 0;
function nextSubId() {
  subIdCounter++;
  return `fetch:${subIdCounter}`;
}

export class FetchScheduler {
  readonly #eoseTimeout: number;
  readonly #chunkSize: number;

  constructor(options: { eoseTimeout: number; chunkSize?: number }) {
    this.#eoseTimeout = options.eoseTimeout;
    this.#chunkSize = options.chunkSize ?? 100;
  }

  async fetch(input: FetchInput): Promise<FetchResult> {
    const shards = shardFilter(input.filter, this.#chunkSize);
    const allEvents: unknown[] = [];
    const queue = [...shards];

    const dispatchNext = async (): Promise<void> => {
      const filter = queue.shift();
      if (!filter) return;

      if (!input.slots.tryAcquire()) {
        await input.slots.waitForSlot();
        if (!input.slots.tryAcquire()) return;
      }

      const events = await this.#executeShard(filter, input);
      allEvents.push(...events);
      input.slots.release();

      for (const event of events) {
        input.onEvent(event);
      }

      await dispatchNext();
    };

    const concurrentDispatches = Math.min(shards.length, input.slots.available || 1);
    await Promise.all(Array.from({ length: concurrentDispatches }, () => dispatchNext()));

    return { events: allEvents };
  }

  #executeShard(filter: Record<string, unknown>, input: FetchInput): Promise<unknown[]> {
    return new Promise<unknown[]>((resolve) => {
      const subId = nextSubId();
      const events: unknown[] = [];

      const timer = setTimeout(() => {
        off();
        resolve(events);
      }, this.#eoseTimeout);

      const off = input.connection.onMessage((message) => {
        if (!Array.isArray(message)) return;
        const [type, msgSubId] = message;

        if (type === 'EVENT' && msgSubId === subId) {
          events.push(message[2]);
        }

        if (type === 'EOSE' && msgSubId === subId) {
          clearTimeout(timer);
          off();
          resolve(events);
        }
      });

      input.connection.ensureConnected();
      input.connection.send(['REQ', subId, filter]);
    });
  }
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts
git commit -m "feat: implement FetchScheduler with auto-shard, EOSE tracking, and slot queue"
```

---

### Task 5: 全体テスト + format + lint

- [ ] **Step 1: 全 auftakt テスト pass**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全テスト pass

- [ ] **Step 2: format + lint + check**

Run: `pnpm format:check && pnpm lint && pnpm check`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: format and lint compliance for backward fetch"
```

---

### Task 6: Wiring — FetchScheduler reconnect replay

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts`
- Test: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts` に追加

- [ ] **Step 1: FetchScheduler に in-progress shard 追跡 + replay を追加**

`#executeShard` で in-progress な shard を `#activeShards` Map (subId → filter) に保持。EOSE/timeout で削除。`replay(connection)` メソッドで全 active shards の REQ を再送。

```typescript
// fetch-scheduler.ts に追加
readonly #activeShards = new Map<string, Record<string, unknown>>();

// #executeShard 内で:
this.#activeShards.set(subId, filter);
// EOSE/timeout の resolve 時:
this.#activeShards.delete(subId);

// Public method:
replay(connection: FetchConnection): void {
  for (const [subId, filter] of this.#activeShards) {
    connection.send(['REQ', subId, filter]);
  }
}
```

- [ ] **Step 2: テスト — reconnect 後に in-progress shard が再送されることを検証**

```typescript
it('replays in-progress shards on reconnect', async () => {
  // ... start fetch, don't simulate EOSE
  // ... call scheduler.replay(conn)
  // ... verify REQ is re-sent with same subId and filter
});
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git commit -m "feat: add FetchScheduler reconnect replay for in-progress backward shards"
```

---

### Task 7: Wiring — FetchScheduler に LruDedup + EventValidator を統合

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts`
- Test: `src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts` に追加

- [ ] **Step 1: FetchScheduler に verifier と dedup を注入可能にする**

FetchScheduler constructor に `verifier` と `dedup` オプションを追加。`#executeShard` 内で受信イベントを `validateEvent()` → `dedup.check()` → `onEvent()` のパイプラインに通す。

```typescript
// fetch-scheduler.ts constructor に追加
constructor(options: {
  eoseTimeout: number;
  chunkSize?: number;
  verifier?: EventVerifier;
  dedup?: LruDedup;
}) {
  // ...
  this.#verifier = options.verifier ?? (async () => true);
  this.#dedup = options.dedup;
}
```

`#executeShard` の EVENT 受信部分:

```typescript
if (type === 'EVENT' && msgSubId === subId) {
  const validated = await validateEvent(message[2], this.#verifier);
  if (!validated) return; // structural or sig invalid
  if (this.#dedup && !this.#dedup.check(validated.id)) return; // duplicate
  events.push(validated);
}
```

- [ ] **Step 2: テスト追加 — dedup が重複を弾くことを検証**

```typescript
it('deduplicates events across shards via LruDedup', async () => {
  const conn = createMockConnection();
  const slots = new SlotCounter(10);
  const dedup = new LruDedup(100);
  const scheduler = new FetchScheduler({ eoseTimeout: 5000, dedup });

  const promise = scheduler.fetch({
    filter: { kinds: [1] },
    connection: conn as any,
    slots,
    onEvent: () => {}
  });

  const subId = conn.sent[0]![1] as string;
  conn.simulateEvent(subId, {
    id: 'e1',
    pubkey: 'a',
    kind: 1,
    created_at: 1,
    tags: [],
    content: '',
    sig: 's'
  });
  conn.simulateEvent(subId, {
    id: 'e1',
    pubkey: 'a',
    kind: 1,
    created_at: 1,
    tags: [],
    content: '',
    sig: 's'
  }); // dup
  conn.simulateEose(subId);

  const result = await promise;
  expect(result.events).toHaveLength(1);
});
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts
git commit -m "feat: integrate LruDedup and EventValidator into FetchScheduler pipeline"
```

---

### Task 7: Wiring — Nip11Registry を PersistentStore に persist + FetchScheduler と連携

**Files:**

- Modify: `src/shared/nostr/auftakt/core/relay/nip11-registry.ts`
- Test: `src/shared/nostr/auftakt/core/relay/nip11-registry.test.ts` に追加

- [ ] **Step 1: Nip11Registry に PersistentStore 書き込みオプションを追加**

constructor に `persistentStore` を渡し、NIP-11 取得成功時に `putRelayCapability()` を呼ぶ。

```typescript
constructor(config: {
  fetch?: typeof globalThis.fetch;
  ttlMs?: number;
  persistentStore?: {
    putRelayCapability(record: { relayUrl: string; nip11?: Nip11Info; source: string; lastCheckedAt: number; ttlUntil: number }): Promise<void>;
    getRelayCapability(url: string, options?: { now?: number }): Promise<{ nip11?: Nip11Info } | undefined>;
  };
})
```

get() で PersistentStore も参照し、メモリキャッシュ miss 時に PersistentStore からフォールバック。

- [ ] **Step 2: CLOSED handling — subscription limit exceeded で observed capability を記録**

```typescript
// Nip11Registry に追加
async recordObservedLimit(relayUrl: string, maxSubscriptions: number): Promise<void> {
  const existing = await this.get(relayUrl);
  const updated = { ...existing, maxSubscriptions };
  this.#cache.set(relayUrl, { info: updated, fetchedAt: Date.now() });
  await this.#persistentStore?.putRelayCapability({
    relayUrl,
    nip11: updated,
    source: 'observed',
    lastCheckedAt: Date.now(),
    ttlUntil: Date.now() + this.#ttlMs
  });
}
```

- [ ] **Step 3: テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/nip11-registry.ts src/shared/nostr/auftakt/core/relay/nip11-registry.test.ts
git commit -m "feat: persist Nip11Registry results to PersistentStore"
```

---

### Task 8: store-types.ts — fetch() を required に変更 + onEvent 追加

**Files:**

- Modify: `src/shared/nostr/auftakt/core/store-types.ts`
- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Modify: `src/shared/nostr/auftakt/testing/fakes.ts`

- [ ] **Step 1: store-types.ts の RelayManager.fetch を optional → required に変更、onEvent パラメータ追加**

```typescript
// Before: fetch?(input: { ... }): Promise<...>;
// After:
fetch(input: {
  filter: Record<string, unknown>;
  relays: string[];
  methods?: Record<string, 'negentropy' | 'fetch'>;
  completion: CompletionPolicy;
  onEvent?(event: NostrEvent, from: string): void;
}): Promise<{
  events: NostrEvent[];
  // ... rest
}>;
```

- [ ] **Step 2: sync-engine.ts の optional chain を削除**

`this.#relayManager.fetch?.({` → `this.#relayManager.fetch({`

- [ ] **Step 3: fakes.ts の createFakeRelayManager に onEvent 対応**

fetch の input に `onEvent` があれば各イベントに対して呼ぶ。

- [ ] **Step 4: 全テスト pass → Commit**

```bash
git add src/shared/nostr/auftakt/core/store-types.ts src/shared/nostr/auftakt/core/sync-engine.ts src/shared/nostr/auftakt/testing/fakes.ts
git commit -m "refactor: make RelayManager.fetch required with onEvent parameter"
```

---

## Exit Criteria

- [ ] `SlotCounter` — slot 管理、waitForSlot、動的 max 更新
- [ ] `shardFilter` / `splitFilters` — authors/ids chunk、max_filters split
- [ ] `Nip11Registry` — HTTP fetch + cache + TTL + failure fallback + PersistentStore persist
- [ ] `FetchScheduler` — shard + EOSE + slot queue + timeout + LruDedup + EventValidator 統合 + reconnect replay
- [ ] CLOSED handling — subscription limit exceeded で observed capability を記録
- [ ] store-types.ts の `fetch()` が required + `onEvent` パラメータ付き
- [ ] `pnpm format:check && pnpm lint && pnpm check` が全 pass
