# Auftakt Strict Redesign Integration Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the strict Auftakt redesign the only production runtime by cutting storage to Dexie, removing `@auftakt/adapter-indexeddb`, and routing relay events, pending publishes, quarantine, queueing, and repair through coordinator-owned paths.

**Architecture:** Add fail-fast guards first, then extend `@auftakt/adapter-dexie` to cover every app-required store method. Cut the shared app bridge to Dexie, move pending publishes into the Dexie store, wire `MaterializerQueue` and `RelayGateway` into `EventCoordinator`, remove raw relay event public bypasses, and delete the legacy adapter package after all consumers are gone.

**Tech Stack:** TypeScript, SvelteKit, Vitest, Playwright, Dexie, fake-indexeddb, pnpm workspaces, `@auftakt/core`, `@auftakt/resonote`, `@auftakt/adapter-dexie`.

---

## File Structure

- Create: `scripts/check-auftakt-strict-closure.ts`
  - Static guard for closure-only invariants: no active `adapter-indexeddb`, no production no-op quarantine, no public raw `packet.event` return, queue/gateway are production-referenced, no standalone pending publish `idb`.
- Create: `scripts/check-auftakt-strict-closure.test.ts`
  - Unit tests for the guard helper so future guard edits are cheap and deterministic.
- Modify: `package.json`
  - Add `check:auftakt:strict-closure`.
  - Point `test:auftakt:storage` at `packages/adapter-dexie/src/`.
  - Add the closure guard to `check:auftakt-complete`.
- Modify: `packages/adapter-dexie/src/index.ts`
  - Add app-required query, delete, clear, negentropy-ref, quarantine, relay hint, and pending publish drain helpers.
- Modify: `packages/adapter-dexie/src/schema.ts`
  - Keep the current table set and update exported record types used by new helper methods.
- Create: `packages/adapter-dexie/src/app-bridge.contract.test.ts`
  - Contract coverage for the app bridge method set.
- Create: `packages/adapter-dexie/src/pending-publishes.contract.test.ts`
  - Contract coverage for pending publish add/drain/expiry/update behavior.
- Modify: `src/shared/nostr/event-db.ts`
  - Replace `@auftakt/adapter-indexeddb` with Dexie-backed store creation.
- Modify: `src/shared/nostr/pending-publishes.ts`
  - Replace standalone `idb` database with Dexie pending publish helpers.
- Modify: `src/shared/nostr/query.ts`
  - Pass the Dexie event DB bridge into package interop fetch helpers.
- Modify: `packages/resonote/src/event-coordinator.ts`
  - Accept `materializerQueue`, `relayGateway`, and real quarantine dependencies.
  - Route materialization through the queue.
- Modify: `packages/resonote/src/runtime.ts`
  - Remove public raw relay event returns.
  - Connect `RelayGateway` for remote verification.
  - Pass real quarantine and relay hint writers.
- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`
  - Prove queue/gateway production behavior.
- Modify: `packages/resonote/src/event-ingress.contract.test.ts`
  - Prove production ingress writes quarantine.
- Modify: `packages/resonote/src/relay-hints.contract.test.ts`
  - Prove publish OK records `source: "published"`.
- Delete: `packages/adapter-indexeddb/`
  - Remove the legacy adapter package after all active imports are gone.
- Modify: `packages/AGENTS.md`, `packages/core/AGENTS.md`, `docs/auftakt/spec.md`, `docs/auftakt/status-verification.md`
  - Replace storage-boundary references with `@auftakt/adapter-dexie`.
- Modify: `scripts/check-auftakt-migration.mjs`
  - Remove allowlists or ownership entries that permit `@auftakt/adapter-indexeddb`.
- Modify: `pnpm-lock.yaml`
  - Refresh after package removal.

---

### Task 1: Add Strict Closure Guard

**Files:**

- Create: `scripts/check-auftakt-strict-closure.ts`
- Create: `scripts/check-auftakt-strict-closure.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing guard tests**

Create `scripts/check-auftakt-strict-closure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { checkStrictClosure, type StrictClosureFile } from './check-auftakt-strict-closure.ts';

function file(path: string, text: string): StrictClosureFile {
  return { path, text };
}

describe('checkStrictClosure', () => {
  it('flags active adapter-indexeddb imports and package folders', () => {
    const result = checkStrictClosure([
      file('src/shared/nostr/event-db.ts', "import { x } from '@auftakt/adapter-indexeddb';"),
      file('packages/adapter-indexeddb/src/index.ts', 'export {};')
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'src/shared/nostr/event-db.ts imports @auftakt/adapter-indexeddb'
    );
    expect(result.errors).toContain('packages/adapter-indexeddb exists');
  });

  it('flags no-op production quarantine writers', () => {
    const result = checkStrictClosure([
      file(
        'packages/resonote/src/runtime.ts',
        'void ingestRelayEvent({ event, relayUrl, materialize, quarantine: async () => {} });'
      )
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'packages/resonote/src/runtime.ts contains production no-op quarantine writer'
    );
  });

  it('flags raw relay packet event returns in production helpers', () => {
    const result = checkStrictClosure([
      file('packages/resonote/src/runtime.ts', 'events.push(packet.event as TEvent);')
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'packages/resonote/src/runtime.ts exposes raw packet.event to public results'
    );
  });

  it('requires queue and gateway production references', () => {
    const result = checkStrictClosure([
      file(
        'packages/resonote/src/event-coordinator.ts',
        'export function createEventCoordinator() {}'
      ),
      file('packages/resonote/src/runtime.ts', 'export const runtime = {};')
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('createMaterializerQueue is not referenced by production code');
    expect(result.errors).toContain('createRelayGateway is not referenced by production code');
  });

  it('passes when strict closure invariants are satisfied', () => {
    const result = checkStrictClosure([
      file(
        'packages/resonote/src/event-coordinator.ts',
        'import { createMaterializerQueue } from "./materializer-queue.js";'
      ),
      file(
        'packages/resonote/src/runtime.ts',
        'import { createRelayGateway } from "./relay-gateway.js"; const quarantine = writeQuarantine;'
      ),
      file('src/shared/nostr/pending-publishes.ts', 'import { getEventsDB } from "./event-db.js";')
    ]);

    expect(result).toEqual({ ok: true, errors: [] });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-closure.test.ts
```

Expected: FAIL because `scripts/check-auftakt-strict-closure.ts` does not exist.

- [ ] **Step 3: Implement guard helper and CLI**

Create `scripts/check-auftakt-strict-closure.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface StrictClosureFile {
  readonly path: string;
  readonly text: string;
}

export interface StrictClosureResult {
  readonly ok: boolean;
  readonly errors: string[];
}

const ACTIVE_EXTENSIONS = /\.(ts|svelte|json|md|mjs)$/;
const IGNORED_PATH_PARTS = [
  'docs/superpowers/',
  '.svelte-kit/',
  '.wrangler/',
  'build/',
  'dist-extension/',
  'node_modules/'
];

export function checkStrictClosure(files: readonly StrictClosureFile[]): StrictClosureResult {
  const errors: string[] = [];

  for (const file of files) {
    if (file.path.startsWith('packages/adapter-indexeddb/')) {
      errors.push('packages/adapter-indexeddb exists');
      continue;
    }
    if (file.text.includes('@auftakt/adapter-indexeddb')) {
      errors.push(`${file.path} imports @auftakt/adapter-indexeddb`);
    }
    if (
      file.path.startsWith('packages/resonote/src/') &&
      /quarantine:\s*async\s*\(\)\s*=>\s*\{\}/.test(file.text)
    ) {
      errors.push(`${file.path} contains production no-op quarantine writer`);
    }
    if (
      file.path.startsWith('packages/resonote/src/') &&
      /events\.push\(\s*packet\.event/.test(file.text)
    ) {
      errors.push(`${file.path} exposes raw packet.event to public results`);
    }
    if (file.path === 'src/shared/nostr/pending-publishes.ts' && file.text.includes("from 'idb'")) {
      errors.push('src/shared/nostr/pending-publishes.ts still uses standalone idb storage');
    }
  }

  const productionText = files
    .filter((file) => file.path.startsWith('packages/resonote/src/'))
    .map((file) => file.text)
    .join('\n');
  if (!productionText.includes('createMaterializerQueue')) {
    errors.push('createMaterializerQueue is not referenced by production code');
  }
  if (!productionText.includes('createRelayGateway')) {
    errors.push('createRelayGateway is not referenced by production code');
  }

  return { ok: errors.length === 0, errors };
}

function collectFiles(root = process.cwd()): StrictClosureFile[] {
  const input = readFileSync(0, 'utf8').trim();
  const paths = input.length > 0 ? input.split(/\r?\n/) : [];
  return paths
    .filter((path) => ACTIVE_EXTENSIONS.test(path))
    .filter((path) => !IGNORED_PATH_PARTS.some((part) => path.includes(part)))
    .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = collectFiles();
  if (existsSync('packages/adapter-indexeddb')) {
    files.push({ path: 'packages/adapter-indexeddb/src/index.ts', text: '' });
  }
  const result = checkStrictClosure(files);
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
}
```

- [ ] **Step 4: Add package script**

Modify `package.json` scripts:

```json
{
  "check:auftakt:strict-closure": "git ls-files -co --exclude-standard | node --experimental-strip-types scripts/check-auftakt-strict-closure.ts"
}
```

Also update `check:auftakt-complete` to include the closure check before `check`:

```json
{
  "check:auftakt-complete": "pnpm run check:auftakt-migration -- --proof && pnpm run check:auftakt-migration -- --report consumers && pnpm run test:packages && pnpm run check:auftakt-semantic && pnpm run check:auftakt:strict-closure && pnpm run check && pnpm run build"
}
```

- [ ] **Step 5: Run guard tests**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-closure.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run guard and confirm it fails on current code**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: FAIL with current `adapter-indexeddb`, no-op quarantine, raw `packet.event`, and unreferenced queue/gateway errors.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json scripts/check-auftakt-strict-closure.ts scripts/check-auftakt-strict-closure.test.ts
git commit -m "test: guard strict auftakt closure"
```

Expected: commit succeeds.

---

### Task 2: Extend Dexie Store to Cover App Runtime Methods

**Files:**

- Modify: `packages/adapter-dexie/src/index.ts`
- Modify: `packages/adapter-dexie/src/schema.ts`
- Create: `packages/adapter-dexie/src/app-bridge.contract.test.ts`
- Create: `packages/adapter-dexie/src/pending-publishes.contract.test.ts`

- [ ] **Step 1: Write failing app bridge tests**

Create `packages/adapter-dexie/src/app-bridge.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createDexieEventStore } from './index.js';

const event = (
  id: string,
  overrides: Partial<
    Parameters<Awaited<ReturnType<typeof createDexieEventStore>>['putEvent']>[0]
  > = {}
) => ({
  id,
  pubkey: overrides.pubkey ?? 'alice',
  created_at: overrides.created_at ?? 1,
  kind: overrides.kind ?? 1,
  tags: overrides.tags ?? [],
  content: overrides.content ?? '',
  sig: overrides.sig ?? 'sig'
});

describe('Dexie app bridge contract', () => {
  it('supports profile, replaceable, tag, kind, and bulk reads', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-app-bridge-${Date.now()}` });
    await store.putEvent(event('profile', { kind: 0, created_at: 5 }));
    await store.putEvent(event('bookmark', { kind: 39701, tags: [['d', 'https://example.com']] }));
    await store.putEvent(event('tagged', { kind: 1111, tags: [['e', 'root']] }));
    await store.putEvent(event('bob-profile', { pubkey: 'bob', kind: 0, created_at: 6 }));

    await expect(store.getByPubkeyAndKind('alice', 0)).resolves.toMatchObject({ id: 'profile' });
    await expect(store.getManyByPubkeysAndKind(['alice', 'bob'], 0)).resolves.toHaveLength(2);
    await expect(
      store.getByReplaceKey('alice', 39701, 'https://example.com')
    ).resolves.toMatchObject({
      id: 'bookmark'
    });
    await expect(store.getByTagValue('e:root', 1111)).resolves.toEqual([
      expect.objectContaining({ id: 'tagged' })
    ]);
    await expect(store.getAllByKind(0)).resolves.toHaveLength(2);
  });

  it('supports delete, clear, and negentropy refs', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-app-maintenance-${Date.now()}` });
    await store.putEvent(event('a', { created_at: 1 }));
    await store.putEvent(event('b', { created_at: 2 }));

    await expect(store.listNegentropyEventRefs()).resolves.toEqual([
      { id: 'a', created_at: 1 },
      { id: 'b', created_at: 2 }
    ]);

    await store.deleteByIds(['a']);
    await expect(store.getById('a')).resolves.toBeNull();
    await expect(store.getById('b')).resolves.toMatchObject({ id: 'b' });

    await store.clearAll();
    await expect(store.getAllByKind(1)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Write failing pending publish tests**

Create `packages/adapter-dexie/src/pending-publishes.contract.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { createDexieEventStore } from './index.js';

const pendingEvent = {
  id: 'pending',
  pubkey: 'alice',
  created_at: 10,
  kind: 1,
  tags: [],
  content: 'queued',
  sig: 'sig'
};

describe('Dexie pending publishes', () => {
  it('adds, drains, and removes confirmed pending publishes', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-pending-${Date.now()}` });
    await store.putPendingPublish({
      id: pendingEvent.id,
      status: 'retrying',
      created_at: 10,
      event: pendingEvent
    });

    const deliver = vi.fn(async () => 'confirmed' as const);
    const result = await store.drainPendingPublishes(deliver);

    expect(deliver).toHaveBeenCalledWith(pendingEvent);
    expect(result).toMatchObject({ settledCount: 1, retryingCount: 0 });
    expect(result.emissions).toEqual([
      expect.objectContaining({ subjectId: pendingEvent.id, state: 'confirmed' })
    ]);
    await expect(store.getPendingPublishes()).resolves.toEqual([]);
  });

  it('keeps retrying pending publishes in Dexie', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-pending-retry-${Date.now()}` });
    await store.putPendingPublish({
      id: pendingEvent.id,
      status: 'retrying',
      created_at: 10,
      event: pendingEvent
    });

    const result = await store.drainPendingPublishes(async () => 'retrying' as const);

    expect(result).toMatchObject({ settledCount: 0, retryingCount: 1 });
    await expect(store.getPendingPublishes()).resolves.toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/app-bridge.contract.test.ts packages/adapter-dexie/src/pending-publishes.contract.test.ts
```

Expected: FAIL because bridge methods and `drainPendingPublishes()` are incomplete.

- [ ] **Step 4: Implement app bridge methods**

In `packages/adapter-dexie/src/index.ts`, extend `DexieEventStore`:

```ts
  async getByPubkeyAndKind(pubkey: string, kind: number): Promise<NostrEvent | null> {
    const rows = await this.db.events
      .where('[pubkey+kind]')
      .equals([pubkey, kind])
      .reverse()
      .sortBy('created_at');
    const record = rows.at(0) ?? null;
    return record ? toNostrEvent(record) : null;
  }

  async getManyByPubkeysAndKind(pubkeys: readonly string[], kind: number): Promise<NostrEvent[]> {
    const events = await Promise.all(pubkeys.map((pubkey) => this.getByPubkeyAndKind(pubkey, kind)));
    return events.filter((event): event is NostrEvent => event !== null);
  }

  async getByReplaceKey(pubkey: string, kind: number, dTag: string): Promise<NostrEvent | null> {
    const head = await this.getReplaceableHead(pubkey, kind, dTag);
    if (head) return head;
    const record = await this.db.events.where('[pubkey+kind+d_tag]').equals([pubkey, kind, dTag]).last();
    return record ? toNostrEvent(record) : null;
  }

  async getByTagValue(tagValue: string, kind?: number): Promise<NostrEvent[]> {
    const parsed = parseTagValue(tagValue);
    const rows = await this.db.event_tags
      .where('[tag+value]')
      .equals([parsed.tag, parsed.value])
      .toArray();
    const events = await this.db.events.bulkGet(rows.map((row) => row.event_id));
    return events
      .filter((event): event is DexieEventRecord => Boolean(event))
      .filter((event) => kind === undefined || event.kind === kind)
      .map(toNostrEvent);
  }

  async getAllByKind(kind: number): Promise<NostrEvent[]> {
    const records = await this.db.events.where('[kind+created_at]').between([kind, Dexie.minKey], [kind, Dexie.maxKey]).toArray();
    return records.map(toNostrEvent);
  }

  async listNegentropyEventRefs(): Promise<Array<{ id: string; created_at: number }>> {
    const records = await this.db.events.orderBy('[created_at+id]').toArray();
    return records.map((event) => ({ id: event.id, created_at: event.created_at }));
  }

  async deleteByIds(ids: readonly string[]): Promise<void> {
    await this.db.transaction('rw', this.db.events, this.db.event_tags, async () => {
      await this.db.events.bulkDelete([...ids]);
      await Promise.all(ids.map((id) => this.db.event_tags.where('event_id').equals(id).delete()));
    });
  }

  async clearAll(): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.events,
      this.db.event_tags,
      this.db.deletion_index,
      this.db.replaceable_heads,
      this.db.event_relay_hints,
      this.db.sync_cursors,
      this.db.pending_publishes,
      this.db.projections,
      this.db.quarantine,
      async () => {
        await Promise.all(this.db.tables.map((table) => table.clear()));
      }
    );
  }
```

Add `Dexie` to the existing import:

```ts
import Dexie from 'dexie';
```

- [ ] **Step 5: Implement pending publish drain**

In `packages/adapter-dexie/src/index.ts`, import reconcile vocabulary:

```ts
import { type OfflineDeliveryDecision, reconcileOfflineDelivery } from '@auftakt/core';
```

Add methods to `DexieEventStore`:

```ts
  async removePendingPublish(id: string): Promise<void> {
    await this.db.pending_publishes.delete(id);
  }

  async drainPendingPublishes(
    deliver: (event: NostrEvent) => Promise<OfflineDeliveryDecision>
  ): Promise<{ emissions: Array<{ subjectId: string; state: string; reason: string }>; settledCount: number; retryingCount: number }> {
    const pending = await this.getPendingPublishes();
    const emissions: Array<{ subjectId: string; state: string; reason: string }> = [];
    let settledCount = 0;
    let retryingCount = 0;

    for (const record of pending) {
      let decision: OfflineDeliveryDecision;
      try {
        decision = await deliver(record.event);
      } catch {
        decision = 'retrying';
      }

      emissions.push(reconcileOfflineDelivery(record.id, decision));

      if (decision === 'confirmed' || decision === 'rejected') {
        await this.removePendingPublish(record.id);
        settledCount += 1;
        continue;
      }

      retryingCount += 1;
    }

    return { emissions, settledCount, retryingCount };
  }
```

- [ ] **Step 6: Run adapter tests**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/schema.ts packages/adapter-dexie/src/app-bridge.contract.test.ts packages/adapter-dexie/src/pending-publishes.contract.test.ts
git commit -m "feat: complete dexie app store bridge"
```

Expected: commit succeeds.

---

### Task 3: Cut Shared Event DB and Pending Publishes to Dexie

**Files:**

- Modify: `src/shared/nostr/event-db.ts`
- Modify: `src/shared/nostr/pending-publishes.ts`
- Modify: `src/shared/nostr/cached-query.svelte.ts`
- Test: `src/shared/nostr/cached-query.test.ts`

- [ ] **Step 1: Write failing bridge import assertion**

Append this test to `src/shared/nostr/cached-query.test.ts`:

```ts
it('uses a Dexie-backed event db bridge', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./event-db.ts', import.meta.url), 'utf8')
  );

  expect(source).toContain('@auftakt/adapter-dexie');
  expect(source).not.toContain('@auftakt/adapter-indexeddb');
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
pnpm exec vitest run src/shared/nostr/cached-query.test.ts
```

Expected: FAIL because `event-db.ts` still imports `@auftakt/adapter-indexeddb`.

- [ ] **Step 3: Replace event DB bridge**

Replace `src/shared/nostr/event-db.ts` with:

```ts
import {
  createDexieEventStore,
  DexieEventStore,
  type DexieEventRecord
} from '@auftakt/adapter-dexie';
import type { Event as NostrEvent } from 'nostr-typedef';

const DEFAULT_DB_NAME = 'resonote-dexie-events';

let instancePromise: Promise<DexieEventStore> | undefined;

export { type NostrEvent, type DexieEventRecord as StoredEvent };
export { DexieEventStore as EventsDB };

export async function getEventsDB(): Promise<DexieEventStore> {
  instancePromise ??= createDexieEventStore({ dbName: DEFAULT_DB_NAME });
  return instancePromise;
}

export function resetEventsDB(): void {
  instancePromise = undefined;
}
```

- [ ] **Step 4: Pass the event DB into query interop helpers**

Modify `src/shared/nostr/query.ts`:

```ts
import { createBackwardReq } from '@auftakt/core';

import { fetchBackwardEvents as fetchBackwardEventsHelper } from '../../../packages/resonote/src/runtime.js';
import { getRelaySession } from './client.js';
import { getEventsDB } from './event-db.js';
```

Change the helper call in `fetchBackwardEvents()`:

```ts
return fetchBackwardEventsHelper<TEvent>(
  { getRelaySession, createBackwardReq, getEventsDB },
  filters,
  options
);
```

- [ ] **Step 5: Replace pending publish bridge**

Replace the storage internals in `src/shared/nostr/pending-publishes.ts` while keeping exports stable:

```ts
import type { OfflineDeliveryDecision } from '@auftakt/core';
import type { Event as NostrEvent } from 'nostr-typedef';

import { getEventsDB, resetEventsDB } from './event-db.js';

export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingEvent extends NostrEvent {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface PendingDrainResult {
  readonly emissions: Array<{
    readonly subjectId: string;
    readonly state: string;
    readonly reason: string;
  }>;
  readonly settledCount: number;
  readonly retryingCount: number;
}

export async function addPendingPublish(event: PendingEvent): Promise<void> {
  const db = await getEventsDB();
  await db.putPendingPublish({
    id: event.id,
    status: 'retrying',
    created_at: event.created_at,
    event
  });
}

export async function getPendingPublishes(): Promise<PendingEvent[]> {
  const db = await getEventsDB();
  return (await db.getPendingPublishes()).map((record) => record.event as PendingEvent);
}

export async function removePendingPublish(id: string): Promise<void> {
  const db = await getEventsDB();
  await db.removePendingPublish(id);
}

export async function cleanExpired(): Promise<PendingDrainResult['emissions']> {
  const db = await getEventsDB();
  const cutoffSec = (Date.now() - PENDING_TTL_MS) / 1000;
  const pending = await db.getPendingPublishes();
  const expired = pending.filter((record) => record.created_at < cutoffSec);
  await Promise.all(expired.map((record) => db.removePendingPublish(record.id)));
  return expired.map((record) => ({
    subjectId: record.id,
    state: 'rejected',
    reason: 'expired'
  }));
}

export async function drainPendingPublishes(
  deliver: (event: PendingEvent) => Promise<OfflineDeliveryDecision>
): Promise<PendingDrainResult> {
  const expiredEmissions = await cleanExpired();
  const db = await getEventsDB();
  const result = await db.drainPendingPublishes((event) => deliver(event as PendingEvent));
  return {
    emissions: [...expiredEmissions, ...result.emissions],
    settledCount: expiredEmissions.length + result.settledCount,
    retryingCount: result.retryingCount
  };
}

export function resetPendingDB(): void {
  resetEventsDB();
}
```

- [ ] **Step 6: Run shared Nostr tests**

Run:

```bash
pnpm exec vitest run src/shared/nostr/cached-query.test.ts src/shared/nostr/client.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run closure guard and confirm reduced failures**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: still FAIL because queue/gateway and raw event paths remain, but no longer fail for `src/shared/nostr/event-db.ts` or standalone pending publish `idb`.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/shared/nostr/event-db.ts src/shared/nostr/pending-publishes.ts src/shared/nostr/query.ts src/shared/nostr/cached-query.test.ts
git commit -m "feat: cut app event storage to dexie"
```

Expected: commit succeeds.

---

### Task 4: Wire MaterializerQueue and RelayGateway Into Coordinator

**Files:**

- Modify: `packages/resonote/src/event-coordinator.ts`
- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`
- Modify: `packages/resonote/src/runtime.ts`

- [ ] **Step 1: Add failing coordinator queue and gateway tests**

Append to `packages/resonote/src/event-coordinator.contract.test.ts`:

```ts
it('queues relay materialization before writing to the store', async () => {
  const writes: string[] = [];
  const queue = {
    enqueue: vi.fn((task: { run(): Promise<void> }) => {
      writes.push('queued');
      void task.run();
    }),
    drain: vi.fn(async () => {}),
    size: vi.fn(() => 0)
  };
  const coordinator = createEventCoordinator({
    materializerQueue: queue,
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => {
        writes.push('stored');
        return { stored: true };
      })
    },
    relay: { verify: vi.fn(async () => []) }
  });

  await coordinator.materializeFromRelay(
    { id: 'queued', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' },
    'wss://relay.example'
  );

  expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ priority: 'normal' }));
  expect(writes).toEqual(['queued', 'stored']);
});

it('uses relay gateway for non-cacheOnly reads', async () => {
  const relayGateway = {
    verify: vi.fn(async () => ({
      strategy: 'fallback-req' as const,
      events: [
        { id: 'remote', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
      ]
    }))
  };
  const coordinator = createEventCoordinator({
    relayGateway,
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => ({ stored: true }))
    },
    relay: { verify: vi.fn(async () => []) }
  });

  await coordinator.read({ ids: ['remote'] }, { policy: 'localFirst' });

  expect(relayGateway.verify).toHaveBeenCalledWith([{ ids: ['remote'] }], {
    reason: 'localFirst'
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: FAIL because `createEventCoordinator()` does not accept `materializerQueue` or `relayGateway`.

- [ ] **Step 3: Extend coordinator dependency types**

Modify `packages/resonote/src/event-coordinator.ts`:

```ts
import { createHotEventIndex, type HotEventIndex } from './hot-event-index.js';
import { createMaterializerQueue, type MaterializerTask } from './materializer-queue.js';

export interface EventCoordinatorMaterializerQueue {
  enqueue(task: MaterializerTask): void;
  drain(): Promise<void>;
  size(): number;
}

export interface EventCoordinatorRelayGateway {
  verify(
    filters: readonly Record<string, unknown>[],
    options: { readonly reason: ReadPolicy }
  ): Promise<{ readonly events: readonly StoredEvent[] }>;
}
```

Change the factory signature:

```ts
export function createEventCoordinator(deps: {
  readonly hotIndex?: HotEventIndex;
  readonly materializerQueue?: EventCoordinatorMaterializerQueue;
  readonly relayGateway?: EventCoordinatorRelayGateway;
  readonly store: EventCoordinatorStore;
  readonly relay: EventCoordinatorRelay;
}) {
  const hotIndex = deps.hotIndex ?? createHotEventIndex();
  const materializerQueue = deps.materializerQueue ?? createMaterializerQueue();
```

- [ ] **Step 4: Queue materialization**

In `materializeFromRelay()`, replace direct store write with queued work:

```ts
    async materializeFromRelay(
      event: StoredEvent,
      relayUrl: string
    ): Promise<EventCoordinatorMaterializeResult> {
      let materializeResult: EventCoordinatorMaterializeResult = {
        stored: false,
        durability: 'durable'
      };

      materializerQueue.enqueue({
        priority: event.kind === 5 ? 'critical' : 'normal',
        async run() {
          let result: unknown;
          try {
            result = await deps.store.putWithReconcile(event);
          } catch {
            hotIndex.applyVisible(event);
            hotIndex.applyRelayHint(buildSeenHint(event.id, relayUrl));
            materializeResult = { stored: false, durability: 'degraded' };
            return;
          }

          const stored = (result as { stored?: boolean } | undefined)?.stored !== false;
          if (!stored) {
            materializeResult = { stored: false, durability: 'durable' };
            return;
          }

          hotIndex.applyVisible(event);
          const hint = buildSeenHint(event.id, relayUrl);
          hotIndex.applyRelayHint(hint);
          await deps.store.recordRelayHint?.(hint);
          materializeResult = { stored: true, durability: 'durable' };
        }
      });

      await materializerQueue.drain();
      return materializeResult;
    }
```

- [ ] **Step 5: Use relay gateway for reads**

In `read()`, replace `deps.relay.verify()` call with:

```ts
if (options.policy !== 'cacheOnly') {
  if (deps.relayGateway) {
    void deps.relayGateway.verify(filters, { reason: options.policy });
  } else {
    void deps.relay.verify(filters, { reason: options.policy });
  }
}
```

- [ ] **Step 6: Connect production runtime imports**

In `packages/resonote/src/runtime.ts`, import:

```ts
import { createMaterializerQueue } from './materializer-queue.js';
import { createRelayGateway } from './relay-gateway.js';
```

Inside `coordinatorFetchById()`, pass production dependencies:

```ts
const gateway = createRelayGateway({
  requestNegentropySync: async ({ relayUrl, filter, initialMessageHex }) => {
    const session = (await runtime.getRelaySession()) as Partial<NegentropySessionRuntime>;
    if (typeof session.requestNegentropySync !== 'function') {
      return { capability: 'unsupported' as const, reason: 'missing-negentropy' };
    }
    return session.requestNegentropySync({ relayUrl, filter, initialMessageHex });
  },
  fetchByReq: async (filters, options) =>
    fetchRepairEventsFromRelay(
      runtime as ResonoteRuntime,
      filters,
      options.relayUrl,
      5_000,
      'coordinator:gateway'
    ),
  listLocalRefs: async (filters) => {
    const db = await runtime.getEventsDB();
    return filterNegentropyEventRefs(await db.listNegentropyEventRefs(), filters);
  }
});

const coordinator = createEventCoordinator({
  materializerQueue: createMaterializerQueue(),
  relayGateway: {
    verify: async (filters, _options) => {
      const session = (await runtime.getRelaySession()) as Partial<{
        getDefaultRelays(): Record<string, { read: boolean }>;
      }>;
      const relays = Object.entries(session.getDefaultRelays?.() ?? {})
        .filter(([, config]) => config.read)
        .map(([relayUrl]) => relayUrl);
      const results = await Promise.all(
        relays.map((relayUrl) => gateway.verify(filters, { relayUrl }))
      );
      return { events: results.flatMap((result) => result.events as StoredEvent[]) };
    }
  },
  store: {
    getById: async (id) => {
      const cached = readCachedById(state, id);
      if (cached.hit) return cached.event;
      const db = await runtime.getEventsDB();
      return db.getById(id);
    },
    putWithReconcile: async (event) => materializeIncomingEvent(runtime, event)
  },
  relay: {
    verify: async (filters) => verifyByIdFilters(runtime, state, filters)
  }
});
```

- [ ] **Step 7: Run coordinator tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/relay-gateway.contract.test.ts packages/resonote/src/materializer-queue.contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run closure guard and confirm queue/gateway failures are gone**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: still FAIL for raw event and no-op quarantine paths, but no longer fail for unreferenced `createMaterializerQueue` or `createRelayGateway`.

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/runtime.ts
git commit -m "feat: wire coordinator queue and relay gateway"
```

Expected: commit succeeds.

---

### Task 5: Remove Raw Relay Event Public Bypasses and Persist Quarantine

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/event-ingress.contract.test.ts`
- Modify: `src/shared/nostr/query.ts`
- Modify: `src/shared/nostr/client.ts`
- Modify: `src/shared/nostr/relays-config.ts`

- [ ] **Step 1: Add failing runtime raw-event regression test**

Append to `packages/resonote/src/event-ingress.contract.test.ts`:

```ts
it('runtime source does not expose raw packet events from interop fetches', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./runtime.ts', import.meta.url), 'utf8')
  );

  expect(source).not.toMatch(/events\.push\(\s*packet\.event/);
  expect(source).not.toMatch(/quarantine:\s*async\s*\(\)\s*=>\s*\{\}/);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-ingress.contract.test.ts
```

Expected: FAIL because runtime still contains raw `packet.event` push or no-op quarantine.

- [ ] **Step 3: Add reusable quarantine writer**

In `packages/resonote/src/runtime.ts`, add:

```ts
async function quarantineRelayEvent(
  runtime: Pick<CoordinatorReadRuntime, 'getEventsDB'>,
  record: {
    readonly relayUrl: string;
    readonly eventId: string | null;
    readonly reason: string;
    readonly rawEvent: unknown;
  }
): Promise<void> {
  try {
    const db = await runtime.getEventsDB();
    if ('putQuarantine' in db && typeof db.putQuarantine === 'function') {
      await db.putQuarantine(record);
    }
  } catch {
    // Invalid input remains blocked even if diagnostics cannot be persisted.
  }
}
```

Extend `CoordinatorReadRuntime.getEventsDB()` return type with:

```ts
    putQuarantine?(record: {
      readonly relayUrl: string;
      readonly eventId: string | null;
      readonly reason: string;
      readonly rawEvent: unknown;
    }): Promise<void>;
```

- [ ] **Step 4: Replace no-op quarantine calls**

In `createLatestReadDriver()` and `fetchAndCacheByIdFromRelay()`, replace:

```ts
quarantine: async () => {};
```

with:

```ts
quarantine: (record) => quarantineRelayEvent(runtime, record);
```

- [ ] **Step 5: Materialize interop backward fetches**

In `packages/resonote/src/runtime.ts`, change `BackwardFetchRuntime` so interop fetches always have a durable store:

```ts
interface BackwardFetchRuntime extends Pick<CoordinatorReadRuntime, 'getEventsDB'> {
  getRelaySession(): Promise<NegentropySessionRuntime>;
  createBackwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): {
    emit(input: unknown): void;
    over(): void;
  };
}
```

In `fetchBackwardEventsFromReadRuntime()`, replace the subscriber `next` body:

```ts
      next: (packet) => {
        events.push(packet.event as TEvent);
      },
```

with:

```ts
      next: (packet) => {
        const task = (async () => {
          const result = await ingestRelayEvent({
            relayUrl: typeof packet.from === 'string' ? packet.from : '',
            event: packet.event,
            materialize: (incoming) => materializeIncomingEvent(runtime, incoming),
            quarantine: (record) => quarantineRelayEvent(runtime, record)
          });
          if (result.ok && result.stored) {
            events.push(result.event as TEvent);
          }
        })();
        pendingMaterializations.add(task);
        void task.finally(() => pendingMaterializations.delete(task));
      },
```

At the top of the Promise callback, add:

```ts
const pendingMaterializations = new Set<Promise<void>>();
```

In `settleResolve()` and `settleReject()`, wait for pending materialization:

```ts
void Promise.allSettled([...pendingMaterializations]).then(() => resolve(events));
```

and:

```ts
void Promise.allSettled([...pendingMaterializations]).then(() => reject(error));
```

- [ ] **Step 6: Cut direct latest relay reads through materialized query helper**

In `src/shared/nostr/client.ts`, replace `fetchLatestEvent()` implementation with a thin call to the materialized query helper:

```ts
export async function fetchLatestEvent(
  pubkey: string,
  kind: number
): Promise<{ tags: string[][]; content: string; created_at: number } | null> {
  const { fetchBackwardFirst } = await import('$shared/nostr/query.js');
  const event = await fetchBackwardFirst<{ tags: string[][]; content: string; created_at: number }>(
    [{ kinds: [kind], authors: [pubkey], limit: 1 }],
    { timeoutMs: 10_000 }
  );
  return event ? { tags: event.tags, content: event.content, created_at: event.created_at } : null;
}
```

- [ ] **Step 7: Cut relay config fetch through materialized latest helper**

In `src/shared/nostr/relays-config.ts`, replace direct `relaySession.use(req)` fetching with:

```ts
const { fetchLatestEvent, setDefaultRelays } = await import('$shared/nostr/client.js');
const latest = await fetchLatestEvent(pubkey, RELAY_LIST_KIND);
const relayTags = latest?.tags ?? [];
```

Remove the now-unused imports and local variables for `createRuntimeRequestKey`,
`createBackwardReq`, `getRelaySession`, `relaySession`, and `req`. Keep the existing
fallback/default relay behavior after `relayTags` is computed.

- [ ] **Step 8: Run targeted tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-ingress.contract.test.ts src/shared/nostr/client.test.ts src/shared/browser/relays.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run closure guard**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: no raw event or no-op quarantine failures remain. Any remaining failure should be the legacy adapter package until Task 7.

- [ ] **Step 10: Commit**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/event-ingress.contract.test.ts src/shared/nostr/client.ts src/shared/nostr/relays-config.ts
git commit -m "fix: block raw relay event visibility"
```

Expected: commit succeeds.

---

### Task 6: Record Publish Relay Hints Through Dexie

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/relay-hints.contract.test.ts`

- [ ] **Step 1: Add failing publish hint test**

Append to `packages/resonote/src/relay-hints.contract.test.ts`:

```ts
import { publishSignedEventWithOfflineFallback } from './runtime.js';

it('records published relay hints after successful publish OK packets', async () => {
  const recordRelayHint = vi.fn(async () => {});
  const event = {
    id: 'published',
    pubkey: 'alice',
    created_at: 1,
    kind: 1,
    tags: [],
    content: 'hello',
    sig: 'sig'
  };

  await publishSignedEventWithOfflineFallback(
    {
      castSigned: async () => {},
      observePublishAcks: async (published, onAck) => {
        await onAck({ eventId: published.id, relayUrl: 'wss://relay.example', ok: true });
      }
    },
    { addPendingPublish: vi.fn(async () => {}) },
    event,
    { recordRelayHint }
  );

  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'published',
    relayUrl: 'wss://relay.example',
    source: 'published',
    lastSeenAt: expect.any(Number)
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-hints.contract.test.ts
```

Expected: FAIL because publish helpers do not accept relay hint recording dependencies.

- [ ] **Step 3: Extend publish helper types**

In `packages/resonote/src/runtime.ts`, add:

```ts
export interface PublishAckPacket {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly ok: boolean;
}

export interface PublishHintRecorder {
  recordRelayHint(hint: {
    readonly eventId: string;
    readonly relayUrl: string;
    readonly source: 'published';
    readonly lastSeenAt: number;
  }): Promise<void>;
}
```

Extend `PublishRuntime`:

```ts
  observePublishAcks?(
    event: RetryableSignedEvent,
    onAck: (packet: PublishAckPacket) => Promise<void> | void
  ): Promise<void>;
```

- [ ] **Step 4: Record publish hints after successful ACKs**

Change `publishSignedEventWithOfflineFallback()` signature:

```ts
export async function publishSignedEventWithOfflineFallback(
  runtime: Pick<PublishRuntime, 'castSigned' | 'observePublishAcks'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'addPendingPublish'>,
  event: EventParameters | RetryableSignedEvent,
  hints?: PublishHintRecorder
): Promise<void> {
```

After successful `castSigned(event)`, add:

```ts
const pending = toRetryableSignedEvent(event);
if (pending && runtime.observePublishAcks && hints) {
  await runtime.observePublishAcks(pending, async (packet) => {
    if (!packet.ok || packet.eventId !== pending.id) return;
    await hints.recordRelayHint({
      eventId: pending.id,
      relayUrl: packet.relayUrl,
      source: 'published',
      lastSeenAt: Math.floor(Date.now() / 1000)
    });
  });
}
```

Keep the existing offline fallback in the `catch` branch.

- [ ] **Step 5: Pass Dexie hint recorder from coordinator**

In `createResonoteCoordinator()`, change publish calls:

```ts
    publishSignedEvents: (params) =>
      publishSignedEventsWithOfflineFallback(
        publishTransportRuntime,
        pendingPublishQueueRuntime,
        params,
        {
          recordRelayHint: async (hint) => {
            const db = await runtime.getEventsDB();
            await db.recordRelayHint?.(hint);
          }
        }
      ),
```

Update `publishSignedEventsWithOfflineFallback()` to pass `hints` through to each single-event helper.

- [ ] **Step 6: Run relay hint tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-hints.contract.test.ts packages/resonote/src/publish-queue.contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/relay-hints.contract.test.ts
git commit -m "feat: record publish relay hints"
```

Expected: commit succeeds.

---

### Task 7: Delete adapter-indexeddb and Update Package References

**Files:**

- Delete: `packages/adapter-indexeddb/`
- Modify: `package.json`
- Modify: `packages/AGENTS.md`
- Modify: `packages/core/AGENTS.md`
- Modify: `docs/auftakt/spec.md`
- Modify: `docs/auftakt/status-verification.md`
- Modify: `scripts/check-auftakt-migration.mjs`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Verify no active imports remain before deletion**

Run:

```bash
rg "@auftakt/adapter-indexeddb" src packages scripts docs --glob '!docs/superpowers/**'
```

Expected: output only in files that will be edited in this task. No production import should remain.

- [ ] **Step 2: Remove package dependency and scripts**

Edit `package.json`:

```json
{
  "scripts": {
    "test:auftakt:storage": "vitest run packages/adapter-dexie/src/"
  },
  "dependencies": {
    "@auftakt/adapter-dexie": "workspace:*"
  }
}
```

Remove the dependency entry:

```json
"@auftakt/adapter-indexeddb": "workspace:*"
```

- [ ] **Step 3: Delete the legacy package**

Run:

```bash
git rm -r packages/adapter-indexeddb
```

Expected: package files are staged for deletion.

- [ ] **Step 4: Update package docs**

In `packages/AGENTS.md`, replace the storage row with:

```md
| `adapter-dexie/` | storage/materializer adapter | Dexie schema, durable queries, pending publishes, quarantine, relay hints |
```

In `packages/core/AGENTS.md`, replace the storage line with:

```md
- Storage implementation remains in `@auftakt/adapter-dexie`.
```

- [ ] **Step 5: Update Auftakt docs**

In `docs/auftakt/spec.md` and `docs/auftakt/status-verification.md`, replace active storage boundary references from `@auftakt/adapter-indexeddb` to `@auftakt/adapter-dexie`.

Also replace package architecture text so the package set is:

```md
- `@auftakt/core`
- `@auftakt/resonote`
- `@auftakt/adapter-dexie`
```

- [ ] **Step 6: Update migration guard ownership**

In `scripts/check-auftakt-migration.mjs`, remove active ownership entries for `packages/adapter-indexeddb`. Add or update entries for:

```js
{
  path: 'packages/adapter-dexie/src/index.ts',
  classification: 'adapter-specific',
  owner: '@auftakt/adapter-dexie'
}
```

Keep existing `@auftakt/(timeline|adapter-relay)` residual import checks unchanged.

- [ ] **Step 7: Refresh lockfile**

Run:

```bash
pnpm install --lockfile-only
```

Expected: `pnpm-lock.yaml` no longer lists `@auftakt/adapter-indexeddb` as a root importer dependency.

- [ ] **Step 8: Run closure guard**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: PASS.

- [ ] **Step 9: Run storage tests**

Run:

```bash
pnpm run test:auftakt:storage
```

Expected: PASS and runs `packages/adapter-dexie/src/`.

- [ ] **Step 10: Commit**

Run:

```bash
git add package.json pnpm-lock.yaml packages docs/auftakt scripts/check-auftakt-migration.mjs
git commit -m "refactor: remove indexeddb adapter"
```

Expected: commit succeeds.

---

### Task 8: Final Strict Closure Verification

**Files:**

- Review all changed files.

- [ ] **Step 1: Verify no legacy adapter references remain**

Run:

```bash
rg "@auftakt/adapter-indexeddb|packages/adapter-indexeddb" src packages scripts docs package.json pnpm-lock.yaml --glob '!docs/superpowers/**'
```

Expected: no output.

- [ ] **Step 2: Verify raw event guard passes**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: PASS.

- [ ] **Step 3: Run package tests**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 4: Run app regression tests**

Run:

```bash
pnpm run test:auftakt:app-regression
```

Expected: PASS.

- [ ] **Step 5: Run NIP and migration proof gates**

Run:

```bash
pnpm run check:auftakt:nips
pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt-migration -- --report consumers
```

Expected: all commands PASS.

- [ ] **Step 6: Run Svelte check and build**

Run:

```bash
pnpm run check
pnpm run build
```

Expected: both commands PASS.

- [ ] **Step 7: Run targeted E2E gate**

Run:

```bash
pnpm run test:auftakt:e2e
```

Expected: PASS. If Wrangler fails inside the sandbox with log or network-interface errors, rerun the same command with escalated permissions and record that the first failure was environment-related.

- [ ] **Step 8: Run complete gate**

Run:

```bash
pnpm run check:auftakt-complete
```

Expected: PASS.

- [ ] **Step 9: Update strict redesign status docs**

In `docs/auftakt/status-verification.md`, change strict redesign closure status to complete only if every previous step passed. Add a short dated note:

```md
2026-04-25 strict integration closure: complete. Production storage is Dexie-only, raw relay events are ingress/materialization-gated, and `@auftakt/adapter-indexeddb` has been removed.
```

- [ ] **Step 10: Commit final status update**

Run:

```bash
git add docs/auftakt/status-verification.md
git commit -m "docs: mark strict auftakt integration complete"
```

Expected: commit succeeds, or there are no final docs changes if the status was updated in Task 7.

- [ ] **Step 11: Inspect final status**

Run:

```bash
git status --short
```

Expected: no tracked changes. Untracked local `.codex` may remain and should not be committed.

---

## Self-Review Notes

- Spec coverage: the plan covers Dexie-only storage, legacy adapter deletion, no old DB migration, raw relay visibility, materializer queue wiring, relay gateway wiring, durable quarantine, Dexie pending publishes, publish relay hints, docs, guards, and final verification gates.
- Placeholder scan: no open-ended task steps are left; each code-changing step names files, commands, expected results, and concrete code.
- Type consistency: `recordRelayHint`, `putQuarantine`, `putPendingPublish`, `drainPendingPublishes`, `createMaterializerQueue`, and `createRelayGateway` names match current package code and are introduced before later tasks depend on them.
