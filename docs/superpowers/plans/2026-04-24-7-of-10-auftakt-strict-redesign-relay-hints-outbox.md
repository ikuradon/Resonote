# Auftakt Relay Hints and Outbox Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store relay provenance as coordinator/storage infrastructure and use it for reply, repost, reaction, nevent/naddr, repair, and outbox routing.

**Architecture:** Add durable `event_relay_hints` APIs in the Dexie adapter and memory relay hint indexes in `HotEventIndex`. Coordinator materialization records relay presence; plugins can read hints but cannot write them directly.

**Tech Stack:** TypeScript, Vitest, Dexie, `@auftakt/core`, `@auftakt/resonote`

---

## File Structure

- Modify: `packages/adapter-dexie/src/index.ts`
- Create: `packages/adapter-dexie/src/relay-hints.contract.test.ts`
- Modify: `packages/resonote/src/hot-event-index.ts`
- Modify: `packages/resonote/src/event-coordinator.ts`
- Create: `packages/resonote/src/relay-hints.contract.test.ts`

### Task 1: Add Durable Relay Hint APIs

**Files:**

- Modify: `packages/adapter-dexie/src/index.ts`
- Create: `packages/adapter-dexie/src/relay-hints.contract.test.ts`

- [ ] **Step 1: Write failing relay hint test**

```ts
import 'fake-indexeddb/auto';
import { createDexieEventStore } from './index.js';

describe('Dexie event relay hints', () => {
  it('records and reads event relay hints by source', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-relay-hints' });
    await store.recordRelayHint({
      eventId: 'e1',
      relayUrl: 'wss://relay.example',
      source: 'seen',
      lastSeenAt: 1
    });

    await expect(store.getRelayHints('e1')).resolves.toEqual([
      { eventId: 'e1', relayUrl: 'wss://relay.example', source: 'seen', lastSeenAt: 1 }
    ]);
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/adapter-dexie/src/relay-hints.contract.test.ts`  
Expected: FAIL because relay hint APIs are missing.

- [ ] **Step 3: Implement relay hint APIs**

```ts
export interface RelayHintInput {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
  readonly lastSeenAt: number;
}

async recordRelayHint(input: RelayHintInput): Promise<void> {
  await this.db.event_relay_hints.put({
    key: `${input.eventId}:${input.relayUrl}:${input.source}`,
    event_id: input.eventId,
    relay_url: input.relayUrl,
    source: input.source,
    last_seen_at: input.lastSeenAt
  });
}

async getRelayHints(eventId: string): Promise<RelayHintInput[]> {
  const rows = await this.db.event_relay_hints.where('event_id').equals(eventId).toArray();
  return rows.map((row) => ({
    eventId: row.event_id,
    relayUrl: row.relay_url,
    source: row.source as RelayHintInput['source'],
    lastSeenAt: row.last_seen_at
  }));
}
```

- [ ] **Step 4: Run adapter test**

Run: `pnpm exec vitest run packages/adapter-dexie/src/relay-hints.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/relay-hints.contract.test.ts
git commit -m "feat: store event relay hints in dexie"
```

### Task 2: Add Hot Relay Hint Index

**Files:**

- Modify: `packages/resonote/src/hot-event-index.ts`
- Create: `packages/resonote/src/relay-hints.contract.test.ts`

- [ ] **Step 1: Write failing hot relay hint test**

```ts
import { createHotEventIndex } from './hot-event-index.js';

it('keeps hot relay hints by event id', () => {
  const index = createHotEventIndex();
  index.applyRelayHint({
    eventId: 'e1',
    relayUrl: 'wss://relay.example',
    source: 'seen',
    lastSeenAt: 1
  });

  expect(index.getRelayHints('e1')).toEqual([
    { eventId: 'e1', relayUrl: 'wss://relay.example', source: 'seen', lastSeenAt: 1 }
  ]);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/resonote/src/relay-hints.contract.test.ts`  
Expected: FAIL because hot relay hint APIs are missing.

- [ ] **Step 3: Implement hot hint methods**

```ts
type RelayHint = { eventId: string; relayUrl: string; source: string; lastSeenAt: number };
const relayHints = new Map<string, Map<string, RelayHint>>();

applyRelayHint(hint: RelayHint): void {
  const byEvent = relayHints.get(hint.eventId) ?? new Map<string, RelayHint>();
  byEvent.set(`${hint.relayUrl}:${hint.source}`, hint);
  relayHints.set(hint.eventId, byEvent);
}

getRelayHints(eventId: string): RelayHint[] {
  return [...(relayHints.get(eventId)?.values() ?? [])].sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run packages/resonote/src/hot-event-index.contract.test.ts packages/resonote/src/relay-hints.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/hot-event-index.ts packages/resonote/src/relay-hints.contract.test.ts
git commit -m "feat: add hot relay hint index"
```

### Task 3: Record Hints During Materialization and Publish OK

**Files:**

- Modify: `packages/resonote/src/event-coordinator.ts`
- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Add coordinator hint test**

```ts
it('records relay hint when a relay event materializes', async () => {
  const recordRelayHint = vi.fn(async () => {});
  const coordinator = createEventCoordinator({
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => ({ stored: true })),
      recordRelayHint
    },
    relay: { verify: vi.fn(async () => []) }
  });

  await coordinator.materializeFromRelay(
    { id: 'e1', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' },
    'wss://relay.example'
  );

  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'e1',
    relayUrl: 'wss://relay.example',
    source: 'seen',
    lastSeenAt: expect.any(Number)
  });
});
```

- [ ] **Step 2: Implement `materializeFromRelay()` hint write**

```ts
async function materializeFromRelay(event: StoredEvent, relayUrl: string): Promise<boolean> {
  const result = await deps.store.putWithReconcile(event);
  if ((result as { stored?: boolean }).stored !== false && 'recordRelayHint' in deps.store) {
    await deps.store.recordRelayHint({
      eventId: event.id,
      relayUrl,
      source: 'seen',
      lastSeenAt: Math.floor(Date.now() / 1000)
    });
  }
  hotIndex.applyRelayHint({
    eventId: event.id,
    relayUrl,
    source: 'seen',
    lastSeenAt: Math.floor(Date.now() / 1000)
  });
  return (result as { stored?: boolean }).stored !== false;
}
```

- [ ] **Step 3: Add publish OK hint mapping**

For successful publish acknowledgements, record:

```ts
{ eventId: event.id, relayUrl: packet.from, source: 'published', lastSeenAt: now }
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/relay-hints.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "feat: record relay hints during materialization"
```
