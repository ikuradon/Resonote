# Auftakt Dexie Store Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Dexie-backed event store package with tables needed by the strict coordinator pipeline, without cutting app reads over yet.

**Architecture:** Create `@auftakt/adapter-dexie` beside the current `@auftakt/adapter-indexeddb`. The new adapter exposes focused APIs for events, tags, quarantine, migration state, and basic query operations.

**Tech Stack:** TypeScript, Vitest, Dexie, fake-indexeddb, pnpm workspace

---

## File Structure

- Create: `packages/adapter-dexie/package.json`
- Create: `packages/adapter-dexie/tsconfig.json`
- Create: `packages/adapter-dexie/AGENTS.md`
- Create: `packages/adapter-dexie/src/schema.ts`
- Create: `packages/adapter-dexie/src/index.ts`
- Create: `packages/adapter-dexie/src/schema.contract.test.ts`
- Modify: `package.json`
  - Adds workspace dependency and `dexie`.
- Modify: `pnpm-lock.yaml`
  - Updated by `pnpm install`.

### Task 1: Create Package Skeleton

**Files:**

- Create: `packages/adapter-dexie/package.json`
- Create: `packages/adapter-dexie/tsconfig.json`
- Create: `packages/adapter-dexie/AGENTS.md`
- Create: `packages/adapter-dexie/src/index.ts`

- [ ] **Step 1: Add package metadata**

```json
{
  "name": "@auftakt/adapter-dexie",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@auftakt/core": "workspace:*",
    "dexie": "^4.2.1",
    "nostr-typedef": "^0.13.0"
  }
}
```

- [ ] **Step 2: Add TypeScript config**

```json
{
  "extends": "../../tsconfig.json",
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Add local package guide**

```md
# @auftakt/adapter-dexie

Dexie-backed durable event store for the strict Auftakt coordinator pipeline.

- Owns Dexie schema, migrations, durable query APIs, and maintenance APIs.
- Uses vocabulary from `@auftakt/core`.
- Does not own relay transport, UI state, or feature-specific read models.
```

- [ ] **Step 4: Add initial export with real version constant**

```ts
export const AUFTAKT_DEXIE_ADAPTER_VERSION = 1;
```

- [ ] **Step 5: Install dependency**

Run: `pnpm install`  
Expected: lockfile includes `dexie`.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml packages/adapter-dexie/package.json packages/adapter-dexie/tsconfig.json packages/adapter-dexie/AGENTS.md packages/adapter-dexie/src/index.ts
git commit -m "feat: add auftakt dexie adapter package"
```

### Task 2: Define Dexie Schema and Open API

**Files:**

- Create: `packages/adapter-dexie/src/schema.ts`
- Modify: `packages/adapter-dexie/src/index.ts`
- Create: `packages/adapter-dexie/src/schema.contract.test.ts`

- [ ] **Step 1: Write failing schema test**

```ts
import 'fake-indexeddb/auto';
import { createDexieEventStore } from './index.js';

describe('DexieEventStore schema', () => {
  it('opens all strict coordinator tables', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-schema-test' });

    expect(store.tableNames().sort()).toEqual([
      'deletion_index',
      'event_relay_hints',
      'event_tags',
      'events',
      'pending_publishes',
      'projections',
      'quarantine',
      'replaceable_heads',
      'sync_cursors'
    ]);
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/adapter-dexie/src/schema.contract.test.ts`  
Expected: FAIL because the schema is missing.

- [ ] **Step 3: Implement schema**

```ts
import Dexie, { type Table } from 'dexie';
import type { Event as NostrEvent } from 'nostr-typedef';

export interface DexieEventRecord extends NostrEvent {
  readonly d_tag: string;
  readonly tag_values: string[];
  readonly deleted?: boolean;
}

export interface DexieQuarantineRecord {
  readonly key: string;
  readonly event_id: string | null;
  readonly relay_url: string;
  readonly reason: string;
  readonly created_at: number;
  readonly raw_event: unknown;
}

export class AuftaktDexieDatabase extends Dexie {
  events!: Table<DexieEventRecord, string>;
  event_tags!: Table<{ key: string; event_id: string; tag: string; value: string }, string>;
  deletion_index!: Table<
    { key: string; target_id: string; pubkey: string; deletion_id: string; created_at: number },
    string
  >;
  replaceable_heads!: Table<
    {
      key: string;
      event_id: string;
      pubkey: string;
      kind: number;
      d_tag: string;
      created_at: number;
    },
    string
  >;
  event_relay_hints!: Table<
    { key: string; event_id: string; relay_url: string; source: string; last_seen_at: number },
    string
  >;
  sync_cursors!: Table<
    { key: string; relay: string; request_key: string; updated_at: number },
    string
  >;
  pending_publishes!: Table<
    { id: string; status: string; created_at: number; event: NostrEvent },
    string
  >;
  projections!: Table<
    { key: string; projection: string; sort_key: string; value: unknown },
    string
  >;
  quarantine!: Table<DexieQuarantineRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      events: 'id,[pubkey+kind],[pubkey+kind+d_tag],[kind+created_at],[created_at+id],*tag_values',
      event_tags: 'key,event_id,[tag+value]',
      deletion_index: 'key,deletion_id,created_at,target_id,pubkey',
      replaceable_heads: 'key,event_id,created_at',
      event_relay_hints: 'key,event_id,relay_url,[event_id+source],last_seen_at',
      sync_cursors: 'key,relay,request_key,updated_at',
      pending_publishes: 'id,created_at,status',
      projections: 'key,[projection+sort_key]',
      quarantine: 'key,event_id,relay_url,reason,created_at'
    });
  }
}
```

- [ ] **Step 4: Implement store factory**

```ts
import { AuftaktDexieDatabase } from './schema.js';

export interface CreateDexieEventStoreOptions {
  readonly dbName: string;
}

export class DexieEventStore {
  constructor(readonly db: AuftaktDexieDatabase) {}

  tableNames(): string[] {
    return this.db.tables.map((table) => table.name);
  }
}

export async function createDexieEventStore(
  options: CreateDexieEventStoreOptions
): Promise<DexieEventStore> {
  const db = new AuftaktDexieDatabase(options.dbName);
  await db.open();
  return new DexieEventStore(db);
}

export * from './schema.js';
```

- [ ] **Step 5: Run schema test**

Run: `pnpm exec vitest run packages/adapter-dexie/src/schema.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-dexie/src/schema.ts packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/schema.contract.test.ts
git commit -m "feat: add dexie event store schema"
```

### Task 3: Add Event Put/Get and Quarantine APIs

**Files:**

- Modify: `packages/adapter-dexie/src/index.ts`
- Modify: `packages/adapter-dexie/src/schema.contract.test.ts`

- [ ] **Step 1: Add failing event and quarantine tests**

```ts
it('stores events with tag rows and reads by id', async () => {
  const store = await createDexieEventStore({ dbName: 'auftakt-dexie-event-test' });
  await store.putEvent({
    id: 'e1',
    pubkey: 'p1',
    created_at: 1,
    kind: 1,
    tags: [['e', 'parent']],
    content: 'hello',
    sig: 's1'
  });

  await expect(store.getById('e1')).resolves.toMatchObject({ id: 'e1' });
  await expect(store.getByTagValue('e:parent')).resolves.toHaveLength(1);
});

it('stores quarantine diagnostics without creating visible events', async () => {
  const store = await createDexieEventStore({ dbName: 'auftakt-dexie-quarantine-test' });
  await store.putQuarantine({
    relayUrl: 'wss://relay.example',
    eventId: 'bad',
    reason: 'invalid-signature',
    rawEvent: { id: 'bad' }
  });

  await expect(store.getById('bad')).resolves.toBeNull();
  await expect(store.listQuarantine()).resolves.toHaveLength(1);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm exec vitest run packages/adapter-dexie/src/schema.contract.test.ts`  
Expected: FAIL because methods do not exist.

- [ ] **Step 3: Implement helper methods**

```ts
function dTag(tags: string[][]): string {
  return tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
}

function tagValues(tags: string[][]): string[] {
  return tags.flatMap((tag) => (tag[0] && tag[1] ? [`${tag[0]}:${tag[1]}`] : []));
}

async putEvent(event: NostrEvent): Promise<void> {
  const record = { ...event, d_tag: dTag(event.tags), tag_values: tagValues(event.tags) };
  await this.db.transaction('rw', this.db.events, this.db.event_tags, async () => {
    await this.db.events.put(record);
    await this.db.event_tags.where('event_id').equals(event.id).delete();
    await this.db.event_tags.bulkPut(
      record.tag_values.map((value) => {
        const [tag, ...rest] = value.split(':');
        return { key: `${event.id}:${value}`, event_id: event.id, tag, value: rest.join(':') };
      })
    );
  });
}

async getById(id: string): Promise<NostrEvent | null> {
  const record = await this.db.events.get(id);
  return record ?? null;
}

async getByTagValue(tagValue: string): Promise<NostrEvent[]> {
  const rows = await this.db.event_tags.where('[tag+value]').equals(tagValue.split(':', 2) as [string, string]).toArray();
  const events = await this.db.events.bulkGet(rows.map((row) => row.event_id));
  return events.filter((event): event is NostrEvent => Boolean(event));
}

async putQuarantine(record: { relayUrl: string; eventId: string | null; reason: string; rawEvent: unknown }): Promise<void> {
  const created_at = Math.floor(Date.now() / 1000);
  await this.db.quarantine.put({
    key: `${record.eventId ?? 'unknown'}:${record.relayUrl}:${record.reason}:${created_at}`,
    event_id: record.eventId,
    relay_url: record.relayUrl,
    reason: record.reason,
    created_at,
    raw_event: record.rawEvent
  });
}

async listQuarantine(): Promise<DexieQuarantineRecord[]> {
  return this.db.quarantine.toArray();
}
```

- [ ] **Step 4: Run adapter tests**

Run: `pnpm exec vitest run packages/adapter-dexie/src/schema.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/schema.contract.test.ts
git commit -m "feat: add dexie event and quarantine APIs"
```
