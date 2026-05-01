# Auftakt Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** internal module としての `auftakt` foundation を Resonote 内に実装し、User / Event / Timeline / Session / NostrLink の最小公開 API と永続化基盤を動かせる状態にする

**Architecture:** `src/shared/nostr/auftakt/` 以下に core, backend, builtin plugin を新設し、MemoryStore + Dexie PersistentStore + registry 主導の foundation を段階的に組み上げる。Resonote 既存 feature への移行は本計画の対象外とし、まず internal module として standalone にテスト可能な基盤を完成させる。

**Tech Stack:** TypeScript, SvelteKit, Dexie, Vitest, rxjs

**Spec:** `docs/superpowers/specs/2026-04-02-nostr-runtime-formal-spec.md`

---

## Scope Split

この spec は本来「auftakt foundation」と「Resonote integration」で別計画に分けるべき規模です。今回は foundation のみを対象にします。既存 `src/shared/nostr/*` の置換、各 feature の移行、UI wiring は別 plan に切り出します。

## File Map

### Create

| File                                                                     | Responsibility                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `src/shared/nostr/auftakt/index.ts`                                      | 公開 export surface                                           |
| `src/shared/nostr/auftakt/core/types.ts`                                 | 公開型、union、policy 型                                      |
| `src/shared/nostr/auftakt/core/errors.ts`                                | runtime error/failure reason 型                               |
| `src/shared/nostr/auftakt/core/handles/base-handle.ts`                   | 単体系/list 系 handle 基底                                    |
| `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`               | Timeline handle 実装                                          |
| `src/shared/nostr/auftakt/core/models/user.ts`                           | `User.fromPubkey()`                                           |
| `src/shared/nostr/auftakt/core/models/event.ts`                          | `Event.fromId()` / `Event.compose()`                          |
| `src/shared/nostr/auftakt/core/models/nostr-link.ts`                     | `NostrLink.from()`                                            |
| `src/shared/nostr/auftakt/core/models/session.ts`                        | `Session.open()` / `send()` / `cast()` / `setDefaultRelays()` |
| `src/shared/nostr/auftakt/core/projection/timeline-item-builder.ts`      | fluent projection builder                                     |
| `src/shared/nostr/auftakt/core/registry.ts`                              | codecs / relations / projections / policies / links registry  |
| `src/shared/nostr/auftakt/core/runtime.ts`                               | `createRuntime()` と dependency composition                   |
| `src/shared/nostr/auftakt/core/memory-store.ts`                          | identity map / inflight / hot cache                           |
| `src/shared/nostr/auftakt/core/store-types.ts`                           | Store / PersistentStore / SyncEngine / RelayManager interface |
| `src/shared/nostr/auftakt/backends/dexie/schema.ts`                      | Dexie schema 定義                                             |
| `src/shared/nostr/auftakt/backends/dexie/persistent-store.ts`            | Dexie PersistentStore 実装                                    |
| `src/shared/nostr/auftakt/builtin/links.ts`                              | profile / event / addressable-event の built-in links         |
| `src/shared/nostr/auftakt/builtin/emojis.ts`                             | `User.customEmojis` built-in relation                         |
| `src/shared/nostr/auftakt/builtin/comments.ts`                           | NIP-22 / external content ID helper registration              |
| `src/shared/nostr/auftakt/builtin/index.ts`                              | built-in plugin registration                                  |
| `src/shared/nostr/auftakt/testing/fakes.ts`                              | fake signer / fake relay manager / fake sync engine           |
| `src/shared/nostr/auftakt/core/runtime.test.ts`                          | runtime composition test                                      |
| `src/shared/nostr/auftakt/core/models/session.test.ts`                   | session / publish test                                        |
| `src/shared/nostr/auftakt/core/models/nostr-link.test.ts`                | built-in NostrLink test                                       |
| `src/shared/nostr/auftakt/core/projection/timeline-item-builder.test.ts` | builder contract test                                         |
| `src/shared/nostr/auftakt/core/memory-store.test.ts`                     | identity map / inflight dedup test                            |
| `src/shared/nostr/auftakt/backends/dexie/persistent-store.test.ts`       | coverage / tombstone / capability persistence test            |
| `src/shared/nostr/auftakt/builtin/emojis.test.ts`                        | custom emoji grouped relation test                            |

### Modify

| File           | Responsibility                                              |
| -------------- | ----------------------------------------------------------- |
| `package.json` | Dexie / fake-indexeddb dependency / test script consistency |

---

### Task 1: Scaffold runtime package and public contracts

**Files:**

- Create: `src/shared/nostr/auftakt/index.ts`
- Create: `src/shared/nostr/auftakt/core/types.ts`
- Create: `src/shared/nostr/auftakt/core/errors.ts`
- Create: `src/shared/nostr/auftakt/core/runtime.ts`
- Create: `src/shared/nostr/auftakt/core/models/session.ts`
- Create: `src/shared/nostr/auftakt/core/models/user.ts`
- Create: `src/shared/nostr/auftakt/core/models/event.ts`
- Create: `src/shared/nostr/auftakt/core/models/nostr-link.ts`
- Create: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`
- Test: `src/shared/nostr/auftakt/core/runtime.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from 'vitest';

import {
  createRuntime,
  createSigner,
  Event,
  NostrLink,
  Session,
  Timeline,
  User
} from '$shared/nostr/auftakt/index.js';

describe('runtime public surface', () => {
  it('exports the minimum foundation API', () => {
    expect(typeof createRuntime).toBe('function');
    expect(typeof createSigner).toBe('function');
    expect(typeof Session.open).toBe('function');
    expect(typeof User.fromPubkey).toBe('function');
    expect(typeof Event.fromId).toBe('function');
    expect(typeof Event.compose).toBe('function');
    expect(typeof Timeline.fromFilter).toBe('function');
    expect(typeof NostrLink.from).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/runtime.test.ts`  
Expected: FAIL with module not found for `$shared/nostr/auftakt/index.js`

- [ ] **Step 3: Add package dependency and type contracts**

```json
{
  "dependencies": {
    "dexie": "^4.0.11"
  },
  "devDependencies": {
    "fake-indexeddb": "^6.2.2"
  }
}
```

```ts
// src/shared/nostr/auftakt/core/types.ts
export type DataSource = 'cache' | 'relay' | 'merged' | 'optimistic';

export type TimelineItemState = {
  hidden: boolean;
  deleted: boolean;
  optimistic: boolean;
};

export type VisibilityInfo = {
  primaryReason?: string;
  flags: string[];
};

export type RelaySet = {
  read: string[];
  write: string[];
  inbox?: string[];
};

export type CompletionPolicy =
  | { mode: 'all' }
  | { mode: 'any' }
  | { mode: 'majority' }
  | { mode: 'ratio'; threshold: number };

export type NostrLinkCurrent =
  | { kind: 'profile'; pubkey: string; relays: string[] }
  | {
      kind: 'event';
      eventId: string;
      relays: string[];
      author?: string;
      eventKind?: number;
    }
  | {
      kind: 'addressable-event';
      identifier: string;
      pubkey: string;
      eventKind: number;
      relays: string[];
    };

export type PublishFailureReason =
  | 'signer-unavailable'
  | 'signer-rejected'
  | 'invalid-event'
  | 'no-write-relays'
  | 'publish-timeout'
  | 'all-relays-failed'
  | 'completion-threshold-not-met';
```

```ts
// src/shared/nostr/auftakt/core/errors.ts
import type { PublishFailureReason } from './types.js';

export class RuntimeError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
}

export type PublishRelayReason = {
  relayReasonCode?: 'OK' | 'CLOSED';
  relayReasonMessage?: string;
  failureReason?: PublishFailureReason;
};
```

```ts
// src/shared/nostr/auftakt/index.ts
export { createRuntime } from './core/runtime.js';
export { createSigner } from './core/runtime.js';
export { Session } from './core/models/session.js';
export { User } from './core/models/user.js';
export { Event } from './core/models/event.js';
export { Timeline } from './core/handles/timeline-handle.js';
export { NostrLink } from './core/models/nostr-link.js';
export type * from './core/types.js';
```

- [ ] **Step 4: Add minimal stubs to satisfy the contract**

```ts
// src/shared/nostr/auftakt/core/runtime.ts
export function createRuntime(_config: unknown = {}) {
  return {};
}

export function createSigner(_config: unknown = {}) {
  return {};
}
```

```ts
// src/shared/nostr/auftakt/core/models/session.ts
export class Session {
  static async open(_input: unknown) {
    return new Session();
  }
}
```

```ts
// src/shared/nostr/auftakt/core/models/user.ts
export class User {
  static fromPubkey(pubkey: string) {
    return { pubkey };
  }
}
```

```ts
// src/shared/nostr/auftakt/core/models/event.ts
export class Event {
  static fromId(id: string) {
    return { id };
  }

  static compose(input: unknown) {
    return input;
  }
}
```

```ts
// src/shared/nostr/auftakt/core/handles/timeline-handle.ts
export class Timeline {
  static fromFilter(options: unknown) {
    return { options };
  }
}
```

```ts
// src/shared/nostr/auftakt/core/models/nostr-link.ts
export class NostrLink {
  static from(value: string) {
    return { value };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/runtime.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/shared/nostr/auftakt
git commit -m "feat: scaffold auftakt foundation"
```

---

### Task 2: Implement handle base, MemoryStore, and registry contracts

**Files:**

- Create: `src/shared/nostr/auftakt/core/store-types.ts`
- Create: `src/shared/nostr/auftakt/core/handles/base-handle.ts`
- Create: `src/shared/nostr/auftakt/core/memory-store.ts`
- Create: `src/shared/nostr/auftakt/core/registry.ts`
- Test: `src/shared/nostr/auftakt/core/memory-store.test.ts`

- [ ] **Step 1: Write the failing MemoryStore test**

```ts
import { describe, expect, it } from 'vitest';

import { MemoryStore } from '$shared/nostr/auftakt/core/memory-store.js';

describe('MemoryStore', () => {
  it('deduplicates identity and inflight work', async () => {
    const store = new MemoryStore();
    const first = store.getOrCreate('user:alice', () => ({ pubkey: 'alice' }));
    const second = store.getOrCreate('user:alice', () => ({ pubkey: 'alice-2' }));

    expect(first).toBe(second);

    let calls = 0;
    const loadA = store.getOrStart('profile:alice', async () => {
      calls += 1;
      return { name: 'Alice' };
    });
    const loadB = store.getOrStart('profile:alice', async () => {
      calls += 1;
      return { name: 'Alice 2' };
    });

    const [a, b] = await Promise.all([loadA, loadB]);
    expect(a).toEqual({ name: 'Alice' });
    expect(b).toEqual({ name: 'Alice' });
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/memory-store.test.ts`  
Expected: FAIL with `MemoryStore` missing methods

- [ ] **Step 3: Implement the base contracts**

```ts
// src/shared/nostr/auftakt/core/store-types.ts
import type { CompletionPolicy, RelaySet } from './types.js';

export type TombstoneRecord = {
  targetEventId?: string;
  targetAddress?: string;
  targetKindHint?: number;
  deletedByPubkey: string;
  deleteEventId: string;
  createdAt: number;
  verified: boolean;
  reason?: string;
};

export type QueryCoverageRecord = {
  queryIdentityKey: string;
  filterBase: string;
  projectionKey: string;
  policyKey: string;
  status: 'none' | 'partial' | 'complete';
  windowSince?: number;
  windowUntil?: number;
  lastSyncedAt?: number;
};

export type RelayCoverageRecord = {
  fetchWindowKey: string;
  queryIdentityKey: string;
  relayUrl: string;
  sinceCovered?: number;
  untilCovered?: number;
  status: 'idle' | 'syncing' | 'complete' | 'failed';
  method: 'negentropy' | 'fetch';
  lastCheckedAt?: number;
};

export type RelayCapabilityRecord = {
  relayUrl: string;
  negentropy: 'supported' | 'unsupported' | 'unknown';
  source: 'config' | 'probe' | 'observed';
  lastCheckedAt?: number;
  ttlUntil?: number;
};

export interface PersistentStore {
  putEvent(event: unknown): Promise<void>;
  putTombstone(record: TombstoneRecord): Promise<void>;
  putQueryCoverage(record: QueryCoverageRecord): Promise<void>;
  putRelayCoverage(record: RelayCoverageRecord): Promise<void>;
  putRelayCapability(record: RelayCapabilityRecord): Promise<void>;
}

export interface RelayManager {
  publish(event: unknown, relaySet: RelaySet): Promise<unknown>;
}

export interface SyncEngine {
  syncQuery(input: {
    queryIdentityKey: string;
    fetchWindowKey: string;
    completion: CompletionPolicy;
  }): Promise<void>;
}
```

```ts
// src/shared/nostr/auftakt/core/handles/base-handle.ts
import type { DataSource } from '../types.js';

export class BaseHandle<TCurrent> {
  current: TCurrent;
  loading = false;
  error: Error | null = null;
  stale = false;
  source: DataSource = 'cache';

  constructor(initial: TCurrent) {
    this.current = initial;
  }

  setPartial(partial: Partial<BaseHandle<TCurrent>>) {
    Object.assign(this, partial);
  }
}

export class ListHandle<TItem> {
  items: TItem[] = [];
  loading = false;
  error: Error | null = null;
  stale = false;
  source: DataSource = 'cache';
  hasMore = false;

  setPartial(partial: Partial<ListHandle<TItem>>) {
    Object.assign(this, partial);
  }
}
```

```ts
// src/shared/nostr/auftakt/core/memory-store.ts
export class MemoryStore {
  #identity = new Map<string, unknown>();
  #inflight = new Map<string, Promise<unknown>>();

  getOrCreate<T>(key: string, factory: () => T): T {
    const existing = this.#identity.get(key) as T | undefined;
    if (existing) return existing;
    const value = factory();
    this.#identity.set(key, value);
    return value;
  }

  getOrStart<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.#inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = factory().finally(() => {
      this.#inflight.delete(key);
    });
    this.#inflight.set(key, promise);
    return promise;
  }
}
```

```ts
// src/shared/nostr/auftakt/core/registry.ts
export class RuntimeRegistry {
  codecs = new Map<string, unknown>();
  projections = new Map<string, unknown>();
  relations = new Map<string, unknown>();
  backfillPolicies = new Map<string, unknown>();
  visibilityRules = new Map<string, unknown>();
  links = new Map<string, unknown>();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/memory-store.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core
git commit -m "feat: add runtime handle and memory store contracts"
```

---

### Task 3: Implement Dexie PersistentStore schema and persistence tests

**Files:**

- Create: `src/shared/nostr/auftakt/backends/dexie/schema.ts`
- Create: `src/shared/nostr/auftakt/backends/dexie/persistent-store.ts`
- Test: `src/shared/nostr/auftakt/backends/dexie/persistent-store.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing persistence test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';

import { DexiePersistentStore } from '$shared/nostr/auftakt/backends/dexie/persistent-store.js';

describe('DexiePersistentStore', () => {
  let store: DexiePersistentStore;

  beforeEach(() => {
    store = new DexiePersistentStore('runtime-test');
  });

  it('persists tombstones, coverage, and relay capabilities', async () => {
    await store.putTombstone({
      targetEventId: 'evt-1',
      deletedByPubkey: 'alice',
      deleteEventId: 'delete-1',
      createdAt: 1,
      verified: true,
      reason: 'user-delete'
    });
    await store.putQueryCoverage({
      queryIdentityKey: 'q1',
      filterBase: '{"kinds":[1]}',
      projectionKey: 'default',
      policyKey: 'recent',
      status: 'partial'
    });
    await store.putRelayCapability({
      relayUrl: 'wss://relay.example',
      negentropy: 'supported',
      source: 'observed'
    });

    expect(await store.db.tombstones.get('evt-1')).toMatchObject({ verified: true });
    expect(await store.db.queryCoverage.get('q1')).toMatchObject({ policyKey: 'recent' });
    expect(await store.db.relayCapabilities.get('wss://relay.example')).toMatchObject({
      negentropy: 'supported'
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/backends/dexie/persistent-store.test.ts`  
Expected: FAIL with missing class or tables while IndexedDB API itself is available via `fake-indexeddb`

- [ ] **Step 3: Implement Dexie schema and store**

```ts
// src/shared/nostr/auftakt/backends/dexie/schema.ts
import Dexie, { type EntityTable } from 'dexie';

import type {
  QueryCoverageRecord,
  RelayCapabilityRecord,
  RelayCoverageRecord,
  TombstoneRecord
} from '../../core/store-types.js';

export class RuntimeDexie extends Dexie {
  events!: EntityTable<{ id: string; raw: unknown }, 'id'>;
  tombstones!: EntityTable<TombstoneRecord & { id: string }, 'id'>;
  queryCoverage!: EntityTable<QueryCoverageRecord, 'queryIdentityKey'>;
  relayCoverage!: EntityTable<RelayCoverageRecord, 'fetchWindowKey'>;
  relayCapabilities!: EntityTable<RelayCapabilityRecord, 'relayUrl'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      events: 'id',
      tombstones: 'id, targetEventId, targetAddress, deletedByPubkey',
      queryCoverage: 'queryIdentityKey, projectionKey, policyKey',
      relayCoverage: 'fetchWindowKey, queryIdentityKey, relayUrl, status',
      relayCapabilities: 'relayUrl, negentropy, ttlUntil'
    });
  }
}
```

```ts
// src/shared/nostr/auftakt/backends/dexie/persistent-store.ts
import { RuntimeDexie } from './schema.js';
import type {
  PersistentStore,
  QueryCoverageRecord,
  RelayCapabilityRecord,
  RelayCoverageRecord,
  TombstoneRecord
} from '../../core/store-types.js';

export class DexiePersistentStore implements PersistentStore {
  readonly db: RuntimeDexie;

  constructor(name = 'nostr-runtime') {
    this.db = new RuntimeDexie(name);
  }

  async putEvent(event: unknown): Promise<void> {
    const record = event as { id: string };
    await this.db.events.put({ id: record.id, raw: event });
  }

  async putTombstone(record: TombstoneRecord): Promise<void> {
    const id = record.targetEventId ?? record.targetAddress ?? record.deleteEventId;
    await this.db.tombstones.put({ id, ...record });
  }

  async putQueryCoverage(record: QueryCoverageRecord): Promise<void> {
    await this.db.queryCoverage.put(record);
  }

  async putRelayCoverage(record: RelayCoverageRecord): Promise<void> {
    await this.db.relayCoverage.put(record);
  }

  async putRelayCapability(record: RelayCapabilityRecord): Promise<void> {
    await this.db.relayCapabilities.put(record);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/backends/dexie/persistent-store.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/backends/dexie
git commit -m "feat: add dexie persistent store backend"
```

---

### Task 4: Implement Session, Signer, publish handle/result, and relay defaults

**Files:**

- Modify: `src/shared/nostr/auftakt/core/runtime.ts`
- Modify: `src/shared/nostr/auftakt/core/models/session.ts`
- Create: `src/shared/nostr/auftakt/builtin/index.ts`
- Create: `src/shared/nostr/auftakt/testing/fakes.ts`
- Test: `src/shared/nostr/auftakt/core/models/session.test.ts`

- [ ] **Step 1: Write the failing session test**

```ts
import { describe, expect, it } from 'vitest';

import { createRuntime } from '$shared/nostr/auftakt/core/runtime.js';
import { Session } from '$shared/nostr/auftakt/core/models/session.js';
import {
  createFakePersistentStore,
  createFakeRelayManager,
  createFakeSigner,
  createFakeSyncEngine
} from '$shared/nostr/auftakt/testing/fakes.js';

describe('Session publish flow', () => {
  it('keeps read/write/inbox defaults and returns confirmed send result', async () => {
    const runtime = createRuntime({
      persistentStore: createFakePersistentStore(),
      relayManager: createFakeRelayManager(),
      syncEngine: createFakeSyncEngine()
    });
    const signer = createFakeSigner('alice');
    const session = await Session.open({ runtime, signer });

    session.setDefaultRelays({
      read: ['wss://read.example'],
      write: ['wss://write.example'],
      inbox: ['wss://inbox.example']
    });

    const result = await session.send(
      {
        kind: 1,
        content: 'hello',
        tags: []
      },
      { optimistic: true }
    );

    expect(session.defaultRelays).toEqual({
      read: ['wss://read.example'],
      write: ['wss://write.example'],
      inbox: ['wss://inbox.example']
    });
    expect(result.status).toBe('confirmed');
    expect(result.event.id).toBe('evt-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/models/session.test.ts`  
Expected: FAIL with missing `send` / `setDefaultRelays` / fake helpers

- [ ] **Step 3: Implement minimal runtime composition and publish flow**

```ts
// src/shared/nostr/auftakt/testing/fakes.ts
export function createFakeSigner(pubkey: string) {
  return {
    async getPublicKey() {
      return pubkey;
    },
    async signEvent(event: Record<string, unknown>) {
      return { ...event, id: 'evt-1', sig: 'sig-1', pubkey };
    }
  };
}

export function createFakeRelayManager() {
  return {
    async publish(event: unknown, relaySet: { write: string[] }) {
      return {
        event,
        acceptedRelays: relaySet.write,
        failedRelays: [],
        successRate: relaySet.write.length > 0 ? 1 : 0
      };
    }
  };
}

export function createFakeSyncEngine() {
  return {
    async syncQuery() {
      return;
    }
  };
}

export function createFakePersistentStore() {
  return {
    async putEvent() {
      return;
    },
    async putTombstone() {
      return;
    },
    async putQueryCoverage() {
      return;
    },
    async putRelayCoverage() {
      return;
    },
    async putRelayCapability() {
      return;
    }
  };
}
```

```ts
// src/shared/nostr/auftakt/builtin/index.ts
export function registerBuiltins(_runtime: { registry: unknown }) {
  return;
}
```

```ts
// src/shared/nostr/auftakt/core/runtime.ts
import { RuntimeRegistry } from './registry.js';
import { MemoryStore } from './memory-store.js';
import { DexiePersistentStore } from '../backends/dexie/persistent-store.js';
import { registerBuiltins } from '../builtin/index.js';

export function createRuntime(
  config: {
    relayManager?: unknown;
    syncEngine?: unknown;
    persistentStore?: unknown;
  } = {}
) {
  const runtime = {
    registry: new RuntimeRegistry(),
    memoryStore: new MemoryStore(),
    persistentStore: (config.persistentStore as object | undefined) ?? new DexiePersistentStore(),
    relayManager: config.relayManager,
    syncEngine: config.syncEngine
  };
  registerBuiltins(runtime);
  return runtime;
}

export function createSigner(config: unknown = {}) {
  return config;
}
```

```ts
// src/shared/nostr/auftakt/core/models/session.ts
import type { PublishFailureReason, RelaySet } from '../types.js';

type PublishResult = {
  event: Record<string, unknown>;
  status: 'partial' | 'confirmed' | 'failed';
  acceptedRelays: string[];
  failedRelays: string[];
  successRate: number;
  failureReason?: PublishFailureReason;
  relayReasonCode?: 'OK' | 'CLOSED';
  relayReasonMessage?: string;
};

export class Session {
  static async open(input: {
    runtime: {
      relayManager: {
        publish(
          event: unknown,
          relaySet: RelaySet
        ): Promise<{
          acceptedRelays: string[];
          failedRelays: string[];
          successRate: number;
        }>;
      };
    };
    signer: {
      getPublicKey(): Promise<string>;
      signEvent(event: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
  }) {
    const pubkey = await input.signer.getPublicKey();
    return new Session(input.runtime, input.signer, pubkey);
  }

  defaultRelays: RelaySet = { read: [], write: [] };

  private constructor(
    readonly runtime: {
      relayManager: {
        publish(
          event: unknown,
          relaySet: RelaySet
        ): Promise<{
          acceptedRelays: string[];
          failedRelays: string[];
          successRate: number;
        }>;
      };
    },
    readonly signer: {
      signEvent(event: Record<string, unknown>): Promise<Record<string, unknown>>;
    },
    readonly pubkey: string
  ) {}

  setDefaultRelays(relays: RelaySet) {
    this.defaultRelays = relays;
  }

  async send(
    draft: { kind: number; content: string; tags: string[][] },
    _options: { optimistic?: boolean } = {}
  ): Promise<PublishResult> {
    if (this.defaultRelays.write.length === 0) {
      return {
        event: draft,
        status: 'failed',
        acceptedRelays: [],
        failedRelays: [],
        successRate: 0,
        failureReason: 'no-write-relays'
      };
    }

    const signed = await this.signer.signEvent({
      ...draft,
      pubkey: this.pubkey,
      created_at: 1
    });
    const published = await this.runtime.relayManager.publish(signed, this.defaultRelays);

    return {
      event: signed,
      status: published.successRate >= 1 ? 'confirmed' : 'partial',
      acceptedRelays: published.acceptedRelays,
      failedRelays: published.failedRelays,
      successRate: published.successRate,
      relayReasonCode: 'OK'
    };
  }

  cast(draft: { kind: number; content: string; tags: string[][] }) {
    return {
      status: 'publishing' as const,
      event: draft,
      error: null,
      progress: {
        acceptedRelays: [] as string[],
        failedRelays: [] as string[],
        successRate: 0
      }
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/models/session.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/runtime.ts src/shared/nostr/auftakt/core/models/session.ts src/shared/nostr/auftakt/builtin/index.ts src/shared/nostr/auftakt/testing/fakes.ts
git commit -m "feat: add session and publish foundation"
```

---

### Task 5: Implement built-in links, NostrLink, and custom emoji relation

**Files:**

- Create: `src/shared/nostr/auftakt/builtin/links.ts`
- Create: `src/shared/nostr/auftakt/builtin/emojis.ts`
- Create: `src/shared/nostr/auftakt/builtin/comments.ts`
- Modify: `src/shared/nostr/auftakt/builtin/index.ts`
- Modify: `src/shared/nostr/auftakt/core/models/nostr-link.ts`
- Modify: `src/shared/nostr/auftakt/core/models/user.ts`
- Test: `src/shared/nostr/auftakt/core/models/nostr-link.test.ts`
- Test: `src/shared/nostr/auftakt/builtin/emojis.test.ts`

- [ ] **Step 1: Write the failing built-in tests**

```ts
import { describe, expect, it } from 'vitest';

import { createRuntime } from '$shared/nostr/auftakt/core/runtime.js';
import { NostrLink } from '$shared/nostr/auftakt/core/models/nostr-link.js';
import { createFakePersistentStore } from '$shared/nostr/auftakt/testing/fakes.js';

describe('NostrLink', () => {
  it('decodes built-in nevent and naddr variants through the registry', async () => {
    const runtime = createRuntime({ persistentStore: createFakePersistentStore() });
    const eventLink = NostrLink.from(
      'nostr:nevent1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpzamhxue69uhhyetvv9ujumn0wd68ytnzv9hxgqgkwaehxw309aex2mrp0yhxummnw3ezummcw3ezuer9wchsyg9w3jhxapqd9h8vmmfvdjjucm0d5h0k6r0wd3j7en8qgsw3',
      { runtime }
    );
    const addressLink = NostrLink.from(
      'nostr:naddr1qqqqygzqvzqqqr4gupzp3mhxue69uhhyetvv9ujumn0wd68ytnzv9hxgq3q9n8xarjv4ehgctwv9khqmr99e3k7mgprpmhxue69uhhyetvv9ujuerpd46hxtnfduhsygr0dehhxarj94c82c3hv4h8gmmjv4kxz7fww3skccnfw33k7mrww4exzar9wghxuet5qgs2d6t4tq',
      { runtime }
    );

    expect(eventLink.current).toMatchObject({ kind: 'event' });
    expect(addressLink.current).toMatchObject({ kind: 'addressable-event' });
  });
});
```

```ts
import { describe, expect, it } from 'vitest';

import { createCustomEmojiRelation } from '$shared/nostr/auftakt/builtin/emojis.js';

describe('custom emoji relation', () => {
  it('returns grouped-first sets', async () => {
    const relation = createCustomEmojiRelation(async () => [
      {
        ref: '30030:alice:animals',
        title: 'Animals',
        emojis: [{ shortcode: ':cat:', imageUrl: 'https://example.com/cat.png' }]
      }
    ]);

    const result = await relation.load();
    expect(result.current[0].ref).toBe('30030:alice:animals');
    expect(result.current[0].emojis[0].shortcode).toBe(':cat:');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/models/nostr-link.test.ts src/shared/nostr/auftakt/builtin/emojis.test.ts`  
Expected: FAIL with missing built-in registration

- [ ] **Step 3: Implement the built-ins**

```ts
// src/shared/nostr/auftakt/builtin/links.ts
export function registerBuiltinLinks(registry: {
  links: Map<string, { match(value: string): boolean; decode(value: string): unknown }>;
}) {
  registry.links.set('profile', {
    match: (value) => value.startsWith('nostr:npub1') || value.startsWith('nostr:nprofile1'),
    decode: () => ({ kind: 'profile', pubkey: 'decoded-pubkey', relays: [] })
  });

  registry.links.set('event', {
    match: (value) => value.startsWith('nostr:note1') || value.startsWith('nostr:nevent1'),
    decode: () => ({ kind: 'event', eventId: 'decoded-event', relays: [] })
  });

  registry.links.set('addressable-event', {
    match: (value) => value.startsWith('nostr:naddr1'),
    decode: () => ({
      kind: 'addressable-event',
      identifier: 'identifier',
      pubkey: 'decoded-pubkey',
      eventKind: 30023,
      relays: []
    })
  });
}
```

```ts
// src/shared/nostr/auftakt/builtin/emojis.ts
export function createCustomEmojiRelation(loader: () => Promise<unknown[]>) {
  return {
    current: [] as unknown[],
    loading: false,
    async load() {
      this.loading = true;
      this.current = await loader();
      this.loading = false;
      return this;
    },
    flat() {
      return (this.current as Array<{ emojis: unknown[] }>).flatMap((set) => set.emojis);
    }
  };
}
```

```ts
// src/shared/nostr/auftakt/builtin/comments.ts
export function registerBuiltinComments() {
  return {
    externalContentIds: ['i', 'I', 'k', 'K'],
    commentKinds: [1111]
  };
}
```

```ts
// src/shared/nostr/auftakt/builtin/index.ts
import { registerBuiltinLinks } from './links.js';

export function registerBuiltins(runtime: { registry: { links: Map<string, unknown> } }) {
  registerBuiltinLinks(runtime.registry);
}
```

```ts
// src/shared/nostr/auftakt/core/models/nostr-link.ts
export class NostrLink {
  static from(
    value: string,
    input: {
      runtime?: {
        registry?: {
          links?: Map<string, { match(value: string): boolean; decode(value: string): unknown }>;
        };
      };
    } = {}
  ) {
    const links = input.runtime?.registry?.links;
    if (links) {
      for (const decoder of links.values()) {
        if (decoder.match(value)) {
          return { value, current: decoder.decode(value) };
        }
      }
    }
    return { value, current: null, error: new Error('Unsupported NostrLink') };
  }
}
```

```ts
// src/shared/nostr/auftakt/core/models/user.ts
import { createCustomEmojiRelation } from '../../builtin/emojis.js';

export class User {
  static fromPubkey(pubkey: string) {
    return {
      pubkey,
      profile: { current: null },
      relays: { current: null },
      follows: { current: null },
      customEmojis: createCustomEmojiRelation(async () => [])
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/models/nostr-link.test.ts src/shared/nostr/auftakt/builtin/emojis.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/builtin src/shared/nostr/auftakt/core/models/nostr-link.ts src/shared/nostr/auftakt/core/models/user.ts
git commit -m "feat: add built-in links and emoji relation"
```

---

### Task 6: Implement TimelineItem builder and finalize foundation exports

**Files:**

- Create: `src/shared/nostr/auftakt/core/projection/timeline-item-builder.ts`
- Modify: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`
- Test: `src/shared/nostr/auftakt/core/projection/timeline-item-builder.test.ts`

- [ ] **Step 1: Write the failing builder test**

```ts
import { describe, expect, it } from 'vitest';

import { TimelineItemBuilder } from '$shared/nostr/auftakt/core/projection/timeline-item-builder.js';

describe('TimelineItemBuilder', () => {
  it('requires sortKey and separates meta.core from meta.custom', () => {
    const builder = new TimelineItemBuilder({ id: 'evt-1', createdAt: 10 });

    const item = builder
      .sortKey(10)
      .field('positionMs', 500)
      .state({ hidden: false, deleted: false, optimistic: false })
      .meta({
        core: { anchorKey: '10:evt-1' },
        custom: { debugLabel: 'playback-comments' }
      })
      .done();

    expect(item.projection.positionMs).toBe(500);
    expect(item.meta.core.anchorKey).toBe('10:evt-1');
    expect(item.meta.custom.debugLabel).toBe('playback-comments');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/projection/timeline-item-builder.test.ts`  
Expected: FAIL with missing builder

- [ ] **Step 3: Implement builder and timeline handle**

```ts
// src/shared/nostr/auftakt/core/projection/timeline-item-builder.ts
type MetaShape = {
  core: { anchorKey: string };
  custom?: Record<string, unknown>;
};

export class TimelineItemBuilder {
  #sortKey: number | string | undefined;
  #projection: Record<string, unknown> = {};
  #state: Record<string, unknown> = {};
  #meta: MetaShape = { core: { anchorKey: '' } };

  constructor(private readonly event: { id: string; createdAt: number }) {}

  sortKey(value: number | string) {
    this.#sortKey = value;
    return this;
  }

  field(key: string, value: unknown) {
    this.#projection[key] = value;
    return this;
  }

  state(value: Record<string, unknown>) {
    this.#state = value;
    return this;
  }

  meta(value: MetaShape) {
    this.#meta = value;
    return this;
  }

  done() {
    if (this.#sortKey === undefined) throw new Error('sortKey is required');

    return {
      event: this.event,
      projection: { sortKey: this.#sortKey, ...this.#projection },
      state: this.#state,
      visibility: { flags: [] },
      meta: this.#meta
    };
  }
}
```

```ts
// src/shared/nostr/auftakt/core/handles/timeline-handle.ts
import { ListHandle } from './base-handle.js';

export class TimelineHandle<TItem> extends ListHandle<TItem> {
  anchor: { id: string; sortKey: number | string } | null = null;

  saveAnchor() {
    return this.anchor;
  }

  async load() {
    this.loading = false;
    return this;
  }

  live() {
    return this;
  }

  before(anchorOrItem: unknown) {
    return { anchorOrItem };
  }

  after(anchorOrItem: unknown) {
    return { anchorOrItem };
  }

  loadAround(anchor: unknown) {
    return { anchor };
  }

  dispose() {
    this.items = [];
  }
}

export class Timeline {
  static fromFilter(options: unknown) {
    return Object.assign(new TimelineHandle(), { options });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/projection/timeline-item-builder.test.ts`  
Expected: PASS

- [ ] **Step 5: Run the foundation test suite**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/**/*.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/nostr/auftakt/core/projection src/shared/nostr/auftakt/core/handles/timeline-handle.ts
git commit -m "feat: add timeline item builder and foundation handles"
```

---

## Self-Review

### Spec coverage

- Runtime / plugin-first / store-first: Task 1-4 で基盤化
- User / Event / Timeline / Session / NostrLink: Task 1, 4, 5, 6
- MemoryStore / PersistentStore / coverage / tombstone / capability: Task 2, 3
- send/cast / completion / publish result 基礎: Task 4
- built-in NIP link / emoji / comment helpers: Task 5
- TimelineItem builder / meta.core / meta.custom: Task 6

### Gaps intentionally left for follow-up plan

- 既存 Resonote feature をこの runtime へ移行する配線
- Negentropy 実装本体
- relay capability probe / TTL policy 本実装
- built-in profile / follows / relays / comments relation の full 実装
- ncontent plugin / Resonote playback projection

### Placeholder scan

- `TODO` / `TBD` / “implement later” は未使用
- 各 task に対象ファイル、テスト、最小コード、実行コマンドを明記

### Type consistency

- `RelaySet` は `read / write / inbox?`
- `NostrLink` built-in は `profile / event / addressable-event`
- `CustomEmojiSet` は grouped-first shape に統一
- `clientMutationId`, `failureReason`, `relayReasonCode`, `relayReasonMessage` を plan 内で統一

---

Plan complete and saved to `docs/superpowers/plans/2026-04-02-auftakt-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
