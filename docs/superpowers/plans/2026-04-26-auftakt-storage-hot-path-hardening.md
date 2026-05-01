# Auftakt Storage Hot-Path Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Auftakt storage hot paths so kind-bounded traversal, projection reads, hot memory lookups, deletion visibility, and strict audit proof cannot regress into broad scans.

**Architecture:** Keep Dexie as the durable database and make traversal APIs use Dexie compound indexes before in-memory filtering. Expand `HotEventIndex` as an opportunistic coordinator hot layer for id, tag, kind, replaceable head, deletion, and relay-hint lookups while Dexie remains responsible for complete collection reads. Add strict audit proof so storage hot-path hardening is tracked with the other strict follow-up closures.

**Tech Stack:** TypeScript, Vitest, fake-indexeddb, Dexie, Auftakt workspace packages, strict audit scripts.

---

## File Structure

- Create `packages/adapter-dexie/src/hot-path.contract.test.ts`
  - Responsibility: Dexie storage hot-path regression tests. It proves kind-bounded traversal and projection source traversal avoid the global `[created_at+id]` scan, proves max-created lookups use a pubkey-kind-created_at index, and locks tag/relay-hint indexes.
- Modify `packages/adapter-dexie/src/schema.ts`
  - Responsibility: Dexie schema/index ownership. Add a version with `[pubkey+kind+created_at]`.
- Modify `packages/adapter-dexie/src/schema.contract.test.ts`
  - Responsibility: schema proof. Add the new event index to the expected index list.
- Modify `packages/adapter-dexie/src/index.ts`
  - Responsibility: durable storage APIs. Update `listOrderedEvents()`, `listProjectionSourceEvents()`, and `getMaxCreatedAt()` to use indexed traversal.
- Modify `packages/resonote/src/hot-event-index.contract.test.ts`
  - Responsibility: hot index behavior proof. Add tests for kind ordering, tag-kind filtering, replaceable heads, deletion cleanup across indexes, and relay hint ordering.
- Modify `packages/resonote/src/hot-event-index.ts`
  - Responsibility: in-memory hot index. Add kind and replaceable-head indexes and extend lookup APIs.
- Modify `packages/resonote/src/event-coordinator.contract.test.ts`
  - Responsibility: coordinator hot prefill proof. Add tests showing tag/kind reads use hot hits while still checking durable storage.
- Modify `packages/resonote/src/event-coordinator.ts`
  - Responsibility: local read orchestration. Merge opportunistic hot hits with durable store results for tag/kind filters.
- Modify `scripts/check-auftakt-strict-goal-audit.test.ts`
  - Responsibility: strict audit checker regression coverage for storage hot-path proof.
- Modify `scripts/check-auftakt-strict-goal-audit.ts`
  - Responsibility: require storage hot-path implementation proof.
- Modify `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`
  - Responsibility: human-readable strict goal gap audit status and verification evidence.

---

### Task 1: Add Dexie Hot-Path Red Tests

**Files:**

- Create: `packages/adapter-dexie/src/hot-path.contract.test.ts`
- Modify: `packages/adapter-dexie/src/schema.contract.test.ts`

- [ ] **Step 1: Create the Dexie hot-path contract test**

Create `packages/adapter-dexie/src/hot-path.contract.test.ts` with this content:

```ts
import 'fake-indexeddb/auto';

import type { Event as NostrEvent } from 'nostr-typedef';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDexieEventStore, type DexieEventStore } from './index.js';

function event(id: string, overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id,
    pubkey: overrides.pubkey ?? 'alice',
    created_at: overrides.created_at ?? 1,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? '',
    sig: overrides.sig ?? 'sig'
  };
}

function forbidGlobalCreatedAtOrder(store: DexieEventStore): void {
  const original = store.db.events.orderBy.bind(store.db.events);
  vi.spyOn(store.db.events, 'orderBy').mockImplementation((index: string | string[]) => {
    if (index === '[created_at+id]') {
      throw new Error('global created_at scan forbidden for bounded hot path');
    }
    return original(index as string);
  });
}

function forbidLegacyPubkeyKindMaxScan(store: DexieEventStore): void {
  const original = store.db.events.where.bind(store.db.events);
  vi.spyOn(store.db.events, 'where').mockImplementation((index: string | string[]) => {
    if (index === '[pubkey+kind]') {
      throw new Error('legacy pubkey-kind max scan forbidden');
    }
    return original(index as string);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dexie storage hot paths', () => {
  it('uses kind index for ordered traversal', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-hot-kind-${Date.now()}` });
    await store.putMany([
      event('old-kind-1', { kind: 1, created_at: 1 }),
      event('kind-2', { kind: 2, created_at: 2 }),
      event('new-kind-1', { kind: 1, created_at: 3 })
    ]);
    forbidGlobalCreatedAtOrder(store);

    await expect(
      store.listOrderedEvents({ kinds: [1], direction: 'desc', limit: 2 })
    ).resolves.toMatchObject([{ id: 'new-kind-1' }, { id: 'old-kind-1' }]);
  });

  it('uses kind index for projection source traversal', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-hot-projection-${Date.now()}` });
    await store.putMany([
      event('kind-1-a', { kind: 1, created_at: 1 }),
      event('kind-2', { kind: 2, created_at: 2 }),
      event('kind-1-b', { kind: 1, created_at: 3 })
    ]);
    forbidGlobalCreatedAtOrder(store);

    await expect(
      store.listProjectionSourceEvents(
        {
          name: 'kind-one',
          sourceKinds: [1],
          sorts: [{ key: 'created_at', pushdownSupported: true }]
        },
        { direction: 'desc', limit: 2 }
      )
    ).resolves.toMatchObject([{ id: 'kind-1-b' }, { id: 'kind-1-a' }]);
  });

  it('uses pubkey kind created_at index for author max created_at lookups', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-hot-max-${Date.now()}` });
    await store.putMany([
      event('alice-old', { pubkey: 'alice', kind: 1, created_at: 1 }),
      event('bob-newer', { pubkey: 'bob', kind: 1, created_at: 5 }),
      event('alice-new', { pubkey: 'alice', kind: 1, created_at: 3 })
    ]);
    expect(store.db.events.schema.indexes.map((index) => index.name)).toContain(
      '[pubkey+kind+created_at]'
    );
    forbidLegacyPubkeyKindMaxScan(store);

    await expect(store.getMaxCreatedAt(1, 'alice')).resolves.toBe(3);
  });

  it('keeps tag and relay hint hot paths indexed', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-hot-existing-${Date.now()}` });
    const eventTagIndexes = store.db.event_tags.schema.indexes.map((index) => index.name);
    const relayHintIndexes = store.db.event_relay_hints.schema.indexes.map((index) => index.name);

    expect(eventTagIndexes).toContain('[tag+value]');
    expect(eventTagIndexes).toContain('event_id');
    expect(relayHintIndexes).toContain('event_id');
    expect(relayHintIndexes).toContain('[event_id+source]');
  });
});
```

- [ ] **Step 2: Add the schema index expectation**

In `packages/adapter-dexie/src/schema.contract.test.ts`, inside the `opens all strict coordinator tables` test, after the `tableNames()` expectation and before the `sync_cursors` index expectation, add:

```ts
expect(store.db.events.schema.indexes.map((index) => index.name).sort()).toEqual(
  [
    '*tag_values',
    '[created_at+id]',
    '[kind+created_at]',
    '[pubkey+kind]',
    '[pubkey+kind+created_at]',
    '[pubkey+kind+d_tag]'
  ].sort()
);
```

- [ ] **Step 3: Run the red Dexie tests**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/hot-path.contract.test.ts packages/adapter-dexie/src/schema.contract.test.ts
```

Expected: FAIL. The failures should mention the missing `[pubkey+kind+created_at]` index and/or the guarded global `[created_at+id]` traversal for kind-bounded reads.

---

### Task 2: Implement Dexie Index-First Traversal

**Files:**

- Modify: `packages/adapter-dexie/src/schema.ts`
- Modify: `packages/adapter-dexie/src/index.ts`
- Test: `packages/adapter-dexie/src/hot-path.contract.test.ts`
- Test: `packages/adapter-dexie/src/schema.contract.test.ts`

- [ ] **Step 1: Add the Dexie schema index**

In `packages/adapter-dexie/src/schema.ts`, keep versions 1-3 intact and add `versionFourStores` after `versionTwoStores`/version 3 setup:

```ts
const versionFourStores = {
  ...versionTwoStores,
  events:
    'id,[pubkey+kind],[pubkey+kind+created_at],[pubkey+kind+d_tag],[kind+created_at],[created_at+id],*tag_values',
  sync_cursors: 'key,relay,request_key,[relay+request_key],updated_at,[cursor_created_at+cursor_id]'
};
```

Then add:

```ts
this.version(4).stores(versionFourStores);
```

The final constructor should still define versions 1, 2, 3, and 4 in order.

- [ ] **Step 2: Replace `getMaxCreatedAt()`**

In `packages/adapter-dexie/src/index.ts`, replace the whole `getMaxCreatedAt()` method with:

```ts
  async getMaxCreatedAt(kind: number, pubkey?: string): Promise<number | null> {
    const record = pubkey
      ? await this.db.events
          .where('[pubkey+kind+created_at]')
          .between([pubkey, kind, Dexie.minKey], [pubkey, kind, Dexie.maxKey])
          .reverse()
          .first()
      : await this.db.events
          .where('[kind+created_at]')
          .between([kind, Dexie.minKey], [kind, Dexie.maxKey])
          .reverse()
          .first();

    return record?.created_at ?? null;
  }
```

- [ ] **Step 3: Add indexed traversal helpers**

In `packages/adapter-dexie/src/index.ts`, after `normalizeTraversalLimit()`, add:

```ts
async function listOrderedEventsByKind(
  db: AuftaktDexieDatabase,
  kind: number,
  options: OrderedEventTraversalOptions,
  limit: number
): Promise<DexieEventRecord[]> {
  const direction = options.direction ?? 'asc';
  const collection = db.events
    .where('[kind+created_at]')
    .between([kind, Dexie.minKey], [kind, Dexie.maxKey]);
  const ordered = direction === 'desc' ? collection.reverse() : collection;
  const records = await ordered.toArray();

  return records
    .filter((event) => isBeyondCursor(event, options.cursor, direction))
    .slice(0, limit);
}

function mergeOrderedTraversalRecords(
  records: readonly DexieEventRecord[],
  direction: OrderedEventTraversalDirection,
  limit: number
): DexieEventRecord[] {
  return [...records]
    .sort((left, right) => {
      const createdAtDelta =
        direction === 'desc'
          ? right.created_at - left.created_at
          : left.created_at - right.created_at;
      if (createdAtDelta !== 0) return createdAtDelta;
      return direction === 'desc'
        ? right.id.localeCompare(left.id)
        : left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}
```

- [ ] **Step 4: Replace `listOrderedEvents()`**

In `packages/adapter-dexie/src/index.ts`, replace the whole `listOrderedEvents()` method with:

```ts
  async listOrderedEvents(options: OrderedEventTraversalOptions = {}): Promise<NostrEvent[]> {
    const limit = normalizeTraversalLimit(options.limit);
    if (limit === 0) return [];

    const direction = options.direction ?? 'asc';
    const kinds = [...new Set(options.kinds ?? [])];

    if (kinds.length > 0) {
      const records = (
        await Promise.all(
          kinds.map((kind) => listOrderedEventsByKind(this.db, kind, options, limit))
        )
      ).flat();
      return mergeOrderedTraversalRecords(records, direction, limit).map(toNostrEvent);
    }

    const ordered =
      direction === 'desc'
        ? await this.db.events.orderBy('[created_at+id]').reverse().toArray()
        : await this.db.events.orderBy('[created_at+id]').toArray();

    return ordered
      .filter((event) => isBeyondCursor(event, options.cursor, direction))
      .slice(0, limit)
      .map(toNostrEvent);
  }
```

- [ ] **Step 5: Verify Dexie tests are green**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/hot-path.contract.test.ts packages/adapter-dexie/src/schema.contract.test.ts packages/adapter-dexie/src/app-bridge.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Dexie hot-path hardening**

Run:

```bash
git add packages/adapter-dexie/src/hot-path.contract.test.ts packages/adapter-dexie/src/schema.contract.test.ts packages/adapter-dexie/src/schema.ts packages/adapter-dexie/src/index.ts
git commit -m "feat(auftakt): harden dexie storage hot paths"
```

---

### Task 3: Add HotEventIndex Red Tests

**Files:**

- Modify: `packages/resonote/src/hot-event-index.contract.test.ts`

- [ ] **Step 1: Replace the HotEventIndex contract test**

Replace `packages/resonote/src/hot-event-index.contract.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';

import { createHotEventIndex } from './hot-event-index.js';

function event(
  id: string,
  overrides: {
    readonly pubkey?: string;
    readonly created_at?: number;
    readonly kind?: number;
    readonly tags?: string[][];
    readonly content?: string;
  } = {}
) {
  return {
    id,
    pubkey: overrides.pubkey ?? 'p1',
    created_at: overrides.created_at ?? 1,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? ''
  };
}

describe('HotEventIndex', () => {
  it('indexes by id and tag value', () => {
    const index = createHotEventIndex();
    index.applyVisible(event('e1', { tags: [['e', 'parent']] }));

    expect(index.getById('e1')).toMatchObject({ id: 'e1' });
    expect(index.getByTagValue('e:parent')).toEqual([expect.objectContaining({ id: 'e1' })]);
  });

  it('orders hot kind lookups and applies limit and cursor', () => {
    const index = createHotEventIndex();
    index.applyVisible(event('old', { kind: 1, created_at: 1 }));
    index.applyVisible(event('other-kind', { kind: 2, created_at: 2 }));
    index.applyVisible(event('new', { kind: 1, created_at: 3 }));

    expect(index.getByKind(1, { direction: 'desc', limit: 1 })).toEqual([
      expect.objectContaining({ id: 'new' })
    ]);
    expect(index.getByKind(1, { direction: 'asc', cursor: { created_at: 1, id: 'old' } })).toEqual([
      expect.objectContaining({ id: 'new' })
    ]);
  });

  it('filters hot tag lookups by kind', () => {
    const index = createHotEventIndex();
    index.applyVisible(event('comment', { kind: 1111, tags: [['e', 'root']] }));
    index.applyVisible(event('reaction', { kind: 7, tags: [['e', 'root']] }));

    expect(index.getByTagValue('e:root', 1111)).toEqual([
      expect.objectContaining({ id: 'comment' })
    ]);
  });

  it('keeps hot replaceable heads', () => {
    const index = createHotEventIndex();
    index.applyVisible(event('old-profile', { pubkey: 'alice', kind: 0, created_at: 1 }));
    index.applyVisible(event('new-profile', { pubkey: 'alice', kind: 0, created_at: 2 }));
    index.applyVisible(
      event('old-emoji', {
        pubkey: 'alice',
        kind: 30030,
        created_at: 1,
        tags: [['d', 'emoji']]
      })
    );
    index.applyVisible(
      event('new-emoji', {
        pubkey: 'alice',
        kind: 30030,
        created_at: 3,
        tags: [['d', 'emoji']]
      })
    );

    expect(index.getReplaceableHead('alice', 0)).toMatchObject({ id: 'new-profile' });
    expect(index.getById('old-profile')).toBeNull();
    expect(index.getReplaceableHead('alice', 30030, 'emoji')).toMatchObject({
      id: 'new-emoji'
    });
    expect(index.getById('old-emoji')).toBeNull();
  });

  it('removes deleted events from all hot indexes', () => {
    const index = createHotEventIndex();
    index.applyVisible(
      event('target', {
        pubkey: 'alice',
        kind: 30030,
        created_at: 1,
        tags: [
          ['d', 'emoji'],
          ['e', 'root']
        ]
      })
    );

    index.applyDeletionIndex('target', 'alice');
    index.applyVisible(
      event('target', {
        pubkey: 'alice',
        kind: 30030,
        created_at: 2,
        tags: [
          ['d', 'emoji'],
          ['e', 'root']
        ]
      })
    );

    expect(index.getById('target')).toBeNull();
    expect(index.getByTagValue('e:root')).toEqual([]);
    expect(index.getByKind(30030)).toEqual([]);
    expect(index.getReplaceableHead('alice', 30030, 'emoji')).toBeNull();
  });

  it('sorts hot relay hints newest first', () => {
    const index = createHotEventIndex();
    index.applyRelayHint({
      eventId: 'event',
      relayUrl: 'wss://old.example/',
      source: 'seen',
      lastSeenAt: 1
    });
    index.applyRelayHint({
      eventId: 'event',
      relayUrl: 'wss://new.example/',
      source: 'seen',
      lastSeenAt: 2
    });

    expect(index.getRelayHints('event')).toEqual([
      expect.objectContaining({ relayUrl: 'wss://new.example/' }),
      expect.objectContaining({ relayUrl: 'wss://old.example/' })
    ]);
  });
});
```

- [ ] **Step 2: Run the red HotEventIndex test**

Run:

```bash
pnpm exec vitest run packages/resonote/src/hot-event-index.contract.test.ts
```

Expected: FAIL. The failures should mention missing `getByKind`, missing `getReplaceableHead`, or tag-kind filtering not being implemented.

---

### Task 4: Implement HotEventIndex Expansion

**Files:**

- Modify: `packages/resonote/src/hot-event-index.ts`
- Test: `packages/resonote/src/hot-event-index.contract.test.ts`

- [ ] **Step 1: Replace the HotEventIndex implementation**

Replace `packages/resonote/src/hot-event-index.ts` with:

```ts
import type {
  OrderedEventCursor,
  OrderedEventTraversalDirection,
  StoredEvent
} from '@auftakt/core';

export interface RelayHint {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly source: string;
  readonly lastSeenAt: number;
}

export interface HotEventTraversalOptions {
  readonly direction?: OrderedEventTraversalDirection;
  readonly cursor?: OrderedEventCursor | null;
  readonly limit?: number;
}

export interface HotEventIndex {
  applyVisible(event: StoredEvent): void;
  applyDeletionIndex(id: string, pubkey: string): void;
  applyRelayHint(hint: RelayHint): void;
  getById(id: string): StoredEvent | null;
  getByTagValue(value: string, kind?: number): StoredEvent[];
  getByKind(kind: number, options?: HotEventTraversalOptions): StoredEvent[];
  getReplaceableHead(pubkey: string, kind: number, dTag?: string): StoredEvent | null;
  getRelayHints(eventId: string): RelayHint[];
}

export function createHotEventIndex(): HotEventIndex {
  const byId = new Map<string, StoredEvent>();
  const tagIndex = new Map<string, Set<string>>();
  const kindIndex = new Map<number, Set<string>>();
  const replaceableHeads = new Map<string, string>();
  const deletionIndex = new Set<string>();
  const relayHints = new Map<string, Map<string, RelayHint>>();

  function remove(id: string): void {
    const existing = byId.get(id);
    byId.delete(id);

    if (!existing) {
      for (const ids of tagIndex.values()) ids.delete(id);
      for (const ids of kindIndex.values()) ids.delete(id);
      for (const [key, eventId] of replaceableHeads.entries()) {
        if (eventId === id) replaceableHeads.delete(key);
      }
      return;
    }

    for (const tag of existing.tags) {
      if (!tag[0] || !tag[1]) continue;
      tagIndex.get(`${tag[0]}:${tag[1]}`)?.delete(id);
    }
    kindIndex.get(existing.kind)?.delete(id);

    const replaceableKey = getReplaceableKey(existing);
    if (replaceableKey && replaceableHeads.get(replaceableKey) === id) {
      replaceableHeads.delete(replaceableKey);
    }
  }

  function insert(event: StoredEvent): void {
    byId.set(event.id, event);

    const kindIds = kindIndex.get(event.kind) ?? new Set<string>();
    kindIds.add(event.id);
    kindIndex.set(event.kind, kindIds);

    for (const tag of event.tags) {
      if (!tag[0] || !tag[1]) continue;
      const key = `${tag[0]}:${tag[1]}`;
      const ids = tagIndex.get(key) ?? new Set<string>();
      ids.add(event.id);
      tagIndex.set(key, ids);
    }
  }

  return {
    applyVisible(event): void {
      if (deletionIndex.has(`${event.id}:${event.pubkey}`)) return;

      const replaceableKey = getReplaceableKey(event);
      if (replaceableKey) {
        const currentId = replaceableHeads.get(replaceableKey);
        const current = currentId ? byId.get(currentId) : null;
        if (current && current.created_at >= event.created_at) return;
        if (currentId) remove(currentId);
      }

      remove(event.id);
      insert(event);
      if (replaceableKey) replaceableHeads.set(replaceableKey, event.id);
    },
    applyDeletionIndex(id, pubkey): void {
      deletionIndex.add(`${id}:${pubkey}`);
      remove(id);
    },
    applyRelayHint(hint): void {
      const byEvent = relayHints.get(hint.eventId) ?? new Map<string, RelayHint>();
      byEvent.set(`${hint.relayUrl}:${hint.source}`, hint);
      relayHints.set(hint.eventId, byEvent);
    },
    getById(id): StoredEvent | null {
      return byId.get(id) ?? null;
    },
    getByTagValue(value, kind): StoredEvent[] {
      return [...(tagIndex.get(value) ?? [])]
        .flatMap((id) => byId.get(id) ?? [])
        .filter((event) => kind === undefined || event.kind === kind);
    },
    getByKind(kind, options = {}): StoredEvent[] {
      const direction = options.direction ?? 'asc';
      const limit = normalizeLimit(options.limit);
      if (limit === 0) return [];

      return [...(kindIndex.get(kind) ?? [])]
        .flatMap((id) => byId.get(id) ?? [])
        .filter((event) => isBeyondHotCursor(event, options.cursor, direction))
        .sort((left, right) => compareHotEvents(left, right, direction))
        .slice(0, limit);
    },
    getReplaceableHead(pubkey, kind, dTag = ''): StoredEvent | null {
      const id = replaceableHeads.get(`${pubkey}:${kind}:${dTag}`);
      return id ? (byId.get(id) ?? null) : null;
    },
    getRelayHints(eventId): RelayHint[] {
      return [...(relayHints.get(eventId)?.values() ?? [])].sort(
        (left, right) => right.lastSeenAt - left.lastSeenAt
      );
    }
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.floor(limit);
}

function isBeyondHotCursor(
  event: Pick<StoredEvent, 'created_at' | 'id'>,
  cursor: OrderedEventCursor | null | undefined,
  direction: OrderedEventTraversalDirection
): boolean {
  if (!cursor) return true;

  if (direction === 'desc') {
    if (event.created_at !== cursor.created_at) return event.created_at < cursor.created_at;
    return event.id < cursor.id;
  }

  if (event.created_at !== cursor.created_at) return event.created_at > cursor.created_at;
  return event.id > cursor.id;
}

function compareHotEvents(
  left: Pick<StoredEvent, 'created_at' | 'id'>,
  right: Pick<StoredEvent, 'created_at' | 'id'>,
  direction: OrderedEventTraversalDirection
): number {
  const createdAtDelta =
    direction === 'desc' ? right.created_at - left.created_at : left.created_at - right.created_at;
  if (createdAtDelta !== 0) return createdAtDelta;
  return direction === 'desc' ? right.id.localeCompare(left.id) : left.id.localeCompare(right.id);
}

function getReplaceableKey(event: Pick<StoredEvent, 'pubkey' | 'kind' | 'tags'>): string | null {
  if (isReplaceable(event.kind)) return `${event.pubkey}:${event.kind}:`;
  if (isParameterizedReplaceable(event.kind)) {
    return `${event.pubkey}:${event.kind}:${getDTag(event.tags)}`;
  }
  return null;
}

function isReplaceable(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind <= 19999);
}

function isParameterizedReplaceable(kind: number): boolean {
  return kind >= 30000 && kind <= 39999;
}

function getDTag(tags: readonly string[][]): string {
  return tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
}
```

- [ ] **Step 2: Run HotEventIndex tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/hot-event-index.contract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit HotEventIndex expansion**

Run:

```bash
git add packages/resonote/src/hot-event-index.ts packages/resonote/src/hot-event-index.contract.test.ts
git commit -m "feat(auftakt): expand hot event index"
```

---

### Task 5: Use HotEventIndex For Coordinator Tag And Kind Prefill

**Files:**

- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`
- Modify: `packages/resonote/src/event-coordinator.ts`

- [ ] **Step 1: Add coordinator prefill red tests**

In `packages/resonote/src/event-coordinator.contract.test.ts`, after `serves by-id reads from hot index before durable store`, add:

```ts
it('prefills tag reads from hot index while still checking durable store', async () => {
  const storeGetByTagValue = vi.fn(async () => []);
  const coordinator = createEventCoordinator({
    hotIndex: createHotEventIndex(),
    store: {
      getById: vi.fn(async () => null),
      getByTagValue: storeGetByTagValue,
      putWithReconcile: vi.fn()
    },
    relay: { verify: vi.fn(async () => []) }
  });
  coordinator.applyLocalEvent({
    id: 'hot-tagged',
    pubkey: 'p1',
    created_at: 1,
    kind: 1111,
    tags: [['e', 'root']],
    content: ''
  });

  const result = await coordinator.read({ kinds: [1111], '#e': ['root'] }, { policy: 'cacheOnly' });

  expect(result.events).toEqual([expect.objectContaining({ id: 'hot-tagged' })]);
  expect(storeGetByTagValue).toHaveBeenCalledWith('e:root', 1111);
});

it('prefills kind reads from hot index while still checking durable store', async () => {
  const storeGetAllByKind = vi.fn(async () => []);
  const coordinator = createEventCoordinator({
    hotIndex: createHotEventIndex(),
    store: {
      getById: vi.fn(async () => null),
      getAllByKind: storeGetAllByKind,
      putWithReconcile: vi.fn()
    },
    relay: { verify: vi.fn(async () => []) }
  });
  coordinator.applyLocalEvent({
    id: 'hot-kind',
    pubkey: 'p1',
    created_at: 1,
    kind: 1111,
    tags: [],
    content: ''
  });

  const result = await coordinator.read({ kinds: [1111] }, { policy: 'cacheOnly' });

  expect(result.events).toEqual([expect.objectContaining({ id: 'hot-kind' })]);
  expect(storeGetAllByKind).toHaveBeenCalledWith(1111);
});
```

- [ ] **Step 2: Run the red coordinator tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: FAIL. The new tests should return no events because tag/kind reads do not yet merge hot hits.

- [ ] **Step 3: Add a local merge helper**

In `packages/resonote/src/event-coordinator.ts`, after `readLocalVisibleEvents()`, add:

```ts
function mergeLocalCandidates(
  hotEvents: readonly StoredEvent[],
  durableEvents: readonly StoredEvent[]
): StoredEvent[] {
  const events = new Map<string, StoredEvent>();
  for (const event of hotEvents) events.set(event.id, event);
  for (const event of durableEvents) events.set(event.id, event);
  return [...events.values()];
}
```

- [ ] **Step 4: Update the tag filter local read path**

In `readLocalVisibleFilter()` in `packages/resonote/src/event-coordinator.ts`, replace the body of the `if (tagFilters.length > 0 && store.getByTagValue)` block with:

```ts
const kinds = readNumberArray(filter.kinds);
const [tagKey, tagValues] = tagFilters[0]!;
const tagName = tagKey.slice(1);
const hotEvents = readStringArray(tagValues).flatMap((tagValue) => {
  if (kinds.length === 0) return hotIndex.getByTagValue(`${tagName}:${tagValue}`);
  return kinds.flatMap((kind) => hotIndex.getByTagValue(`${tagName}:${tagValue}`, kind));
});
const durableEvents = await Promise.all(
  readStringArray(tagValues).flatMap((tagValue) => {
    if (kinds.length === 0) return [store.getByTagValue?.(`${tagName}:${tagValue}`)];
    return kinds.map((kind) => store.getByTagValue?.(`${tagName}:${tagValue}`, kind));
  })
);
return mergeLocalCandidates(
  hotEvents,
  durableEvents.flatMap((entry) => entry ?? [])
);
```

- [ ] **Step 5: Update the kind filter local read path**

In `readLocalVisibleFilter()` in `packages/resonote/src/event-coordinator.ts`, replace the body of the `if (kinds.length > 0 && store.getAllByKind)` block with:

```ts
const hotEvents = kinds.flatMap((kind) => hotIndex.getByKind(kind));
const durableEvents = await Promise.all(kinds.map((kind) => store.getAllByKind?.(kind)));
return mergeLocalCandidates(
  hotEvents,
  durableEvents.flatMap((entry) => entry ?? [])
);
```

- [ ] **Step 6: Run coordinator and hot index tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/hot-event-index.contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit coordinator hot prefill**

Run:

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "feat(auftakt): prefill coordinator reads from hot index"
```

---

### Task 6: Gate Storage Hot-Path Proof In Strict Audit

**Files:**

- Modify: `scripts/check-auftakt-strict-goal-audit.test.ts`
- Modify: `scripts/check-auftakt-strict-goal-audit.ts`
- Modify: `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`

- [ ] **Step 1: Add strict audit red test fixture evidence**

In `scripts/check-auftakt-strict-goal-audit.test.ts`, append this sentence to `validAuditText` after the plugin model API evidence sentence:

```ts
Storage hot-path hardening now proves Dexie kind-bounded traversal, projection reads, max-created lookups, and HotEventIndex kind, tag, replaceable, deletion, and relay-hint paths without broad event-table scans.
```

In `validRequiredProofFiles`, add:

```ts
(file(
  'packages/adapter-dexie/src/hot-path.contract.test.ts',
  'uses kind index for ordered traversal\nuses kind index for projection source traversal\nuses pubkey kind created_at index for author max created_at lookups\nkeeps tag and relay hint hot paths indexed'
),
  file(
    'packages/adapter-dexie/src/index.ts',
    "where('[kind+created_at]')\nwhere('[pubkey+kind+created_at]')\nlistOrderedEventsByKind"
  ),
  file(
    'packages/adapter-dexie/src/schema.ts',
    '[pubkey+kind+created_at]\nthis.version(4).stores(versionFourStores)'
  ),
  file(
    'packages/resonote/src/hot-event-index.contract.test.ts',
    'orders hot kind lookups and applies limit and cursor\nfilters hot tag lookups by kind\nkeeps hot replaceable heads\nremoves deleted events from all hot indexes\nsorts hot relay hints newest first'
  ),
  file(
    'packages/resonote/src/hot-event-index.ts',
    'getByKind(kind, options\ngetReplaceableHead(pubkey, kind, dTag\nreplaceableHeads'
  ),
  file(
    'packages/resonote/src/event-coordinator.contract.test.ts',
    'prefills tag reads from hot index while still checking durable store\nprefills kind reads from hot index while still checking durable store'
  ));
```

Add this test after `requires plugin model api implementation proof`:

```ts
it('requires storage hot-path hardening implementation proof', () => {
  const result = checkStrictGoalAudit([
    file(
      STRICT_GOAL_AUDIT_PATH,
      validAuditText.replace(
        'Storage hot-path hardening now proves Dexie kind-bounded traversal, projection reads, max-created lookups, and HotEventIndex kind, tag, replaceable, deletion, and relay-hint paths without broad event-table scans.',
        'Storage hot-path evidence removed.'
      )
    ),
    ...validRequiredProofFiles
  ]);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    `${STRICT_GOAL_AUDIT_PATH} is missing storage hot-path hardening implementation evidence`
  );
});
```

- [ ] **Step 2: Run the red strict audit checker test**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: FAIL because the checker does not yet require storage hot-path evidence.

- [ ] **Step 3: Add checker constants**

In `scripts/check-auftakt-strict-goal-audit.ts`, after `REQUIRED_PLUGIN_MODEL_API_FILES`, add:

```ts
const REQUIRED_STORAGE_HOT_PATH_AUDIT_EVIDENCE =
  'Storage hot-path hardening now proves Dexie kind-bounded traversal, projection reads, max-created lookups, and HotEventIndex kind, tag, replaceable, deletion, and relay-hint paths without broad event-table scans.';

const REQUIRED_STORAGE_HOT_PATH_FILES = [
  {
    path: 'packages/adapter-dexie/src/hot-path.contract.test.ts',
    text: 'uses kind index for ordered traversal',
    description: 'Dexie kind-bounded ordered traversal contract'
  },
  {
    path: 'packages/adapter-dexie/src/hot-path.contract.test.ts',
    text: 'uses pubkey kind created_at index for author max created_at lookups',
    description: 'Dexie author max-created hot-path contract'
  },
  {
    path: 'packages/adapter-dexie/src/index.ts',
    text: "where('[kind+created_at]')",
    description: 'Dexie kind index traversal implementation'
  },
  {
    path: 'packages/adapter-dexie/src/index.ts',
    text: "where('[pubkey+kind+created_at]')",
    description: 'Dexie author max-created index implementation'
  },
  {
    path: 'packages/adapter-dexie/src/schema.ts',
    text: '[pubkey+kind+created_at]',
    description: 'Dexie author max-created schema index'
  },
  {
    path: 'packages/resonote/src/hot-event-index.contract.test.ts',
    text: 'removes deleted events from all hot indexes',
    description: 'HotEventIndex deletion cleanup contract'
  },
  {
    path: 'packages/resonote/src/hot-event-index.ts',
    text: 'replaceableHeads',
    description: 'HotEventIndex replaceable head implementation'
  },
  {
    path: 'packages/resonote/src/event-coordinator.contract.test.ts',
    text: 'prefills tag reads from hot index while still checking durable store',
    description: 'coordinator tag hot prefill contract'
  }
];
```

- [ ] **Step 4: Require storage evidence in checker**

In `checkStrictGoalAudit()`, after the plugin model API audit evidence check, add:

```ts
if (!strictAudit.text.includes(REQUIRED_STORAGE_HOT_PATH_AUDIT_EVIDENCE)) {
  errors.push(`${strictAudit.path} is missing storage hot-path hardening implementation evidence`);
}
```

After the `REQUIRED_PLUGIN_MODEL_API_FILES` proof loop, add:

```ts
for (const required of REQUIRED_STORAGE_HOT_PATH_FILES) {
  const text = findFileText(files, required.path);
  if (text === null) {
    errors.push(`${required.path} is missing for strict storage hot-path audit`);
    continue;
  }
  if (!text.includes(required.text)) {
    errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
  }
}
```

In `collectFiles()`, add these paths after `packages/resonote/src/runtime.ts`:

```ts
    'packages/adapter-dexie/src/hot-path.contract.test.ts',
    'packages/adapter-dexie/src/schema.ts',
    'packages/resonote/src/hot-event-index.ts',
    'packages/resonote/src/hot-event-index.contract.test.ts',
    'packages/resonote/src/event-coordinator.contract.test.ts',
```

- [ ] **Step 5: Update the strict gap audit document**

In `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`, replace follow-up candidate 6:

```md
6. Storage hot-path hardening. `Implemented in this slice; keep storage hot-path regression gates active.`
```

In the `## Verification` list, after the plugin model API bullet, add:

```md
- Storage hot-path hardening now proves Dexie kind-bounded traversal, projection reads, max-created lookups, and HotEventIndex kind, tag, replaceable, deletion, and relay-hint paths without broad event-table scans.
```

- [ ] **Step 6: Run strict audit tests and command**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
pnpm run check:auftakt:strict-goal-audit
```

Expected: both PASS.

- [ ] **Step 7: Commit strict audit storage gate**

Run:

```bash
git add scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts docs/auftakt/2026-04-26-strict-goal-gap-audit.md
git commit -m "test(auftakt): gate storage hot path proof"
```

---

### Task 7: Full Verification

**Files:**

- No source changes.

- [ ] **Step 1: Run focused verification**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/hot-path.contract.test.ts packages/adapter-dexie/src/schema.contract.test.ts packages/resonote/src/hot-event-index.contract.test.ts packages/resonote/src/event-coordinator.contract.test.ts scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run storage package verification**

Run:

```bash
pnpm run test:auftakt:storage
```

Expected: PASS.

- [ ] **Step 3: Run Resonote package verification**

Run:

```bash
pnpm run test:auftakt:resonote
```

Expected: PASS.

- [ ] **Step 4: Run strict audit gates**

Run:

```bash
pnpm run check:auftakt:strict-goal-audit
pnpm run check:auftakt:strict-closure
```

Expected: both PASS.

- [ ] **Step 5: Run migration proof**

Run:

```bash
pnpm run check:auftakt-migration -- --proof
```

Expected: `Status: COMPLETE`, `Unauthorized importers: 0`, `Consumer leak count: 0`, and exit 0.

- [ ] **Step 6: Run all package tests**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 7: Inspect final branch state**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: only pre-existing unrelated dirty/untracked files remain outside this slice, and the latest commits include the storage hot-path implementation and audit gate.
