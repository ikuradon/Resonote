# Auftakt Entity Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NDK-like, coordinator-safe Entity Handles to `@auftakt/resonote`
with settlement-first result shapes and no raw relay/storage/materializer
leakage.

**Architecture:** Create a focused `packages/resonote/src/entity-handles.ts`
module that owns handle types, input validation, state derivation, profile
parsing, relay hint normalization, and handle factories. `runtime.ts` wires
those factories into `createResonoteCoordinator()` by passing internal
coordinator read and relay selection dependencies. Package root exports handle
types through `index.ts` while keeping factory functions only on
`ResonoteCoordinator`.

**Tech Stack:** TypeScript, Vitest, `@auftakt/core` vocabulary, existing
`@auftakt/resonote` coordinator runtime, Prettier, Auftakt strict closure checks.

---

## Scope Check

This plan implements only the approved Entity Handles design in
`docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md`.

It does not add mutation helpers such as `react`, `zap`, `publish`, or user
profile publish. It does not add package-level `event()` / `profile()` factory
exports. It does not expose raw relay sessions, raw WebSocket packets, raw Dexie
handles, raw Dexie rows, materializer queues, plugin registry internals, mutable
routing indexes, or transport subscription ids.

## File Structure

- Create: `packages/resonote/src/entity-handles.ts`
  - Owns public handle input/result types.
  - Owns pure input validation and `deriveEntityHandleState()`.
  - Owns `createEntityHandleFactories()` used by the coordinator.
  - Owns normalized read-only relay hint and relay set snapshot shapes.
- Create: `packages/resonote/src/entity-handles.contract.test.ts`
  - Focused contracts for handle ergonomics, settlement states, relay hints,
    relay set snapshots, deletion state mapping, and closure-safe results.
- Modify: `packages/resonote/src/runtime.ts`
  - Imports handle types and `createEntityHandleFactories()`.
  - Extends `ResonoteCoordinator` with handle factory methods.
  - Wires handle factories into `createResonoteCoordinator()` using internal
    coordinator read and relay selection helpers.
  - Adds optional `isDeleted` to the internal `ResonoteRuntime.getEventsDB()`
    shape.
- Modify: `packages/resonote/src/index.ts`
  - Exports handle types, not package-level handle factory functions.
- Modify: `packages/resonote/src/public-api.contract.test.ts`
  - Locks handle type exports and forbids package-level factory exports.
- Modify: `packages/resonote/src/plugin-isolation.contract.test.ts`
  - Confirms plugin API remains unchanged after handles are added.

---

### Task 1: Add Handle Public API Contract

**Files:**

- Create: `packages/resonote/src/entity-handles.contract.test.ts`
- Create: `packages/resonote/src/entity-handles.ts`
- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/index.ts`
- Modify: `packages/resonote/src/public-api.contract.test.ts`

- [ ] **Step 1: Write the failing coordinator API contract**

Create `packages/resonote/src/entity-handles.contract.test.ts` with this
initial content:

```ts
import { reduceReadSettlement, type ReadSettlement, type StoredEvent } from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import { createResonoteCoordinator, type EntityHandleState } from './runtime.js';

const LOCAL_SETTLEMENT = reduceReadSettlement({
  localSettled: true,
  relaySettled: true,
  relayRequired: false,
  localHitProvenance: 'store'
});

function makeEvent(id: string, overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id,
    pubkey: 'pubkey'.padEnd(64, '0'),
    created_at: 1,
    kind: 1,
    tags: [],
    content: '',
    ...overrides
  };
}

function createCoordinatorFixture(
  options: {
    readonly read?: (
      filters: readonly Record<string, unknown>[],
      options: { readonly cacheOnly?: boolean; readonly timeoutMs?: number },
      temporaryRelays: readonly string[]
    ) => Promise<{ readonly events: readonly StoredEvent[]; readonly settlement: ReadSettlement }>;
    readonly relayHints?: Array<{
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }>;
  } = {}
) {
  const getEventsDB = vi.fn(async () => ({
    getByPubkeyAndKind: vi.fn(async () => null),
    getManyByPubkeysAndKind: vi.fn(async () => []),
    getByReplaceKey: vi.fn(async () => null),
    getByTagValue: vi.fn(async () => []),
    getById: vi.fn(async () => null),
    getAllByKind: vi.fn(async () => []),
    listNegentropyEventRefs: vi.fn(async () => []),
    deleteByIds: vi.fn(async () => {}),
    clearAll: vi.fn(async () => {}),
    put: vi.fn(async () => true),
    putWithReconcile: vi.fn(async () => ({ stored: true, emissions: [] })),
    getRelayHints: vi.fn(async () => options.relayHints ?? [])
  }));
  const read =
    options.read ??
    vi.fn(async () => ({
      events: [],
      settlement: reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: true
      })
    }));

  const coordinator = createResonoteCoordinator({
    runtime: {
      fetchLatestEvent: async () => null,
      getEventsDB,
      getRxNostr: async () => ({ use: () => ({ subscribe: () => ({ unsubscribe() {} }) }) }),
      getDefaultRelays: () => ['wss://default.example/'],
      createRxBackwardReq: () => ({ emit() {}, over() {} }),
      createRxForwardReq: () => ({ emit() {}, over() {} }),
      uniq: () => ({}),
      merge: () => ({}),
      getRelayConnectionState: async () => null,
      observeRelayConnectionStates: async () => ({ unsubscribe() {} })
    },
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: {
      useCachedLatest: () => null
    },
    publishTransportRuntime: {
      castSigned: async () => {}
    },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    },
    entityHandleRuntime: {
      read,
      snapshotRelaySet: async () => ({
        subject: { type: 'event', id: 'event'.padEnd(64, '0') },
        readRelays: ['wss://default.example/'],
        writeRelays: [],
        temporaryRelays: [],
        diagnostics: []
      })
    }
  });

  return { coordinator, read, getEventsDB };
}

describe('@auftakt/resonote entity handles', () => {
  it('creates NDK-like coordinator handles without executing reads during construction', async () => {
    const { coordinator, read } = createCoordinatorFixture();

    const event = coordinator.getEvent({ id: 'a'.repeat(64) });
    const user = coordinator.getUser({ pubkey: 'b'.repeat(64) });
    const addressable = coordinator.getAddressable({
      kind: 30023,
      pubkey: 'c'.repeat(64),
      d: 'note'
    });
    const relaySet = coordinator.getRelaySet({ type: 'event', id: 'd'.repeat(64) });
    const relayHints = coordinator.getRelayHints('e'.repeat(64));

    expect(event.id).toBe('a'.repeat(64));
    expect(user.pubkey).toBe('b'.repeat(64));
    expect(addressable.d).toBe('note');
    expect(relaySet.subject).toEqual({ type: 'event', id: 'd'.repeat(64) });
    expect(relayHints.eventId).toBe('e'.repeat(64));
    expect(read).not.toHaveBeenCalled();
  });

  it('exports the handle state type through runtime type exports', () => {
    const state: EntityHandleState = 'relay-confirmed';
    expect(state).toBe('relay-confirmed');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts
```

Expected: FAIL because `EntityHandleState`, `entityHandleRuntime`, and
coordinator methods do not exist.

- [ ] **Step 3: Add the entity handle module with public types and factories**

Create `packages/resonote/src/entity-handles.ts`:

```ts
import {
  buildRelaySelectionPlan,
  normalizeRelayUrl,
  type ReadSettlement,
  type RelaySelectionCandidate,
  type RelaySelectionDiagnostic,
  type RelaySelectionPolicyOptions,
  type StoredEvent
} from '@auftakt/core';

export type EntityHandleState =
  | 'missing'
  | 'local'
  | 'partial'
  | 'relay-confirmed'
  | 'deleted'
  | 'repaired';

export interface EntityFetchOptions {
  readonly cacheOnly?: boolean;
  readonly timeoutMs?: number;
  readonly rejectOnError?: boolean;
}

export interface EventHandleInput {
  readonly id: string;
  readonly relayHints?: readonly string[];
}

export interface UserHandleInput {
  readonly pubkey: string;
}

export interface AddressableHandleInput {
  readonly kind: number;
  readonly pubkey: string;
  readonly d: string;
}

export type RelaySetSubject =
  | { readonly type: 'event'; readonly id: string; readonly relayHints?: readonly string[] }
  | { readonly type: 'user'; readonly pubkey: string }
  | {
      readonly type: 'addressable';
      readonly kind: number;
      readonly pubkey: string;
      readonly d: string;
    };

export interface EntityReadResult<TValue> {
  readonly value: TValue | null;
  readonly sourceEvent: StoredEvent | null;
  readonly settlement: ReadSettlement;
  readonly state: EntityHandleState;
}

export interface UserProfileReadResult extends EntityReadResult<Record<string, unknown>> {
  readonly profile: Record<string, unknown> | null;
}

export interface NormalizedRelayHint {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
  readonly lastSeenAt: number;
}

export interface RelayHintsReadResult {
  readonly eventId: string;
  readonly hints: readonly NormalizedRelayHint[];
}

export interface RelaySetSnapshot {
  readonly subject: RelaySetSubject;
  readonly readRelays: readonly string[];
  readonly writeRelays: readonly string[];
  readonly temporaryRelays: readonly string[];
  readonly diagnostics: readonly RelaySelectionDiagnostic[];
}

export interface EventHandle {
  readonly id: string;
  fetch(options?: EntityFetchOptions): Promise<EntityReadResult<StoredEvent>>;
}

export interface UserHandle {
  readonly pubkey: string;
  fetchProfile(options?: EntityFetchOptions): Promise<UserProfileReadResult>;
}

export interface AddressableHandle {
  readonly kind: number;
  readonly pubkey: string;
  readonly d: string;
  fetch(options?: EntityFetchOptions): Promise<EntityReadResult<StoredEvent>>;
}

export interface RelaySetHandle {
  readonly subject: RelaySetSubject;
  snapshot(): Promise<RelaySetSnapshot>;
}

export interface RelayHintsHandle {
  readonly eventId: string;
  fetch(): Promise<RelayHintsReadResult>;
}

export interface EntityHandleReadRuntime {
  read(
    filters: readonly Record<string, unknown>[],
    options: EntityFetchOptions,
    temporaryRelays: readonly string[]
  ): Promise<{ readonly events: readonly StoredEvent[]; readonly settlement: ReadSettlement }>;
  isDeleted?(id: string, pubkey: string): Promise<boolean>;
}

export interface EntityHandleStoreRuntime {
  getRelayHints?(eventId: string): Promise<readonly NormalizedRelayHint[]>;
  getByPubkeyAndKind?(pubkey: string, kind: number): Promise<StoredEvent | null>;
}

export interface EntityHandleRuntime {
  readonly read: EntityHandleReadRuntime['read'];
  readonly isDeleted?: EntityHandleReadRuntime['isDeleted'];
  readonly openStore: () => Promise<EntityHandleStoreRuntime>;
  readonly snapshotRelaySet: (subject: RelaySetSubject) => Promise<RelaySetSnapshot>;
}

export interface EntityHandleFactories {
  getEvent(input: EventHandleInput): EventHandle;
  getUser(input: UserHandleInput): UserHandle;
  getAddressable(input: AddressableHandleInput): AddressableHandle;
  getRelaySet(subject: RelaySetSubject): RelaySetHandle;
  getRelayHints(eventId: string): RelayHintsHandle;
}

export function createEntityHandleFactories(runtime: EntityHandleRuntime): EntityHandleFactories {
  return {
    getEvent(input) {
      const id = normalizeHexId(input.id, 'event id');
      const relayHints = normalizeRelayHints(input.relayHints ?? []);
      return {
        id,
        async fetch(options = {}) {
          const result = await runtime.read([{ ids: [id] }], options, relayHints);
          return entityReadResult(result.events[0] ?? null, result.settlement, false);
        }
      };
    },
    getUser(input) {
      const pubkey = normalizeHexId(input.pubkey, 'pubkey');
      return {
        pubkey,
        async fetchProfile(options = {}) {
          const result = await runtime.read(
            [{ kinds: [0], authors: [pubkey], limit: 1 }],
            options,
            []
          );
          const event = result.events[0] ?? null;
          const profile = parseProfile(event);
          const readResult = entityReadResult(profile, result.settlement, false, event);
          return { ...readResult, profile };
        }
      };
    },
    getAddressable(input) {
      const kind = normalizeKind(input.kind);
      const pubkey = normalizeHexId(input.pubkey, 'pubkey');
      const d = normalizeDTag(input.d);
      return {
        kind,
        pubkey,
        d,
        async fetch(options = {}) {
          const result = await runtime.read(
            [{ kinds: [kind], authors: [pubkey], '#d': [d], limit: 1 }],
            options,
            []
          );
          const event = result.events[0] ?? null;
          const deleted = event ? await runtime.isDeleted?.(event.id, event.pubkey) : false;
          return entityReadResult(event, result.settlement, deleted === true);
        }
      };
    },
    getRelaySet(subject) {
      const normalized = normalizeRelaySetSubject(subject);
      return {
        subject: normalized,
        snapshot: () => runtime.snapshotRelaySet(normalized)
      };
    },
    getRelayHints(eventId) {
      const id = normalizeHexId(eventId, 'event id');
      return {
        eventId: id,
        async fetch() {
          const store = await runtime.openStore();
          const hints = normalizeRelayHintRecords(await store.getRelayHints?.(id));
          return { eventId: id, hints };
        }
      };
    }
  };
}

export function deriveEntityHandleState(input: {
  readonly value: unknown;
  readonly settlement: ReadSettlement;
  readonly deleted?: boolean;
}): EntityHandleState {
  if (input.deleted === true) return 'deleted';
  if (input.settlement.reason === 'relay-repair') return 'repaired';
  if (input.settlement.reason === 'replay-restore') return 'repaired';
  if (input.settlement.reason === 'negentropy-repair') return 'repaired';
  if (input.settlement.phase === 'partial') return 'partial';
  if (input.value === null || input.value === undefined) return 'missing';
  if (input.settlement.provenance === 'relay' || input.settlement.provenance === 'mixed') {
    return 'relay-confirmed';
  }
  return 'local';
}

export function buildRelaySetSnapshot(input: {
  readonly subject: RelaySetSubject;
  readonly policy: RelaySelectionPolicyOptions;
  readonly candidates: readonly RelaySelectionCandidate[];
}): RelaySetSnapshot {
  const plan = buildRelaySelectionPlan({
    intent: 'read',
    policy: input.policy,
    candidates: input.candidates
  });
  return {
    subject: input.subject,
    readRelays: plan.readRelays,
    writeRelays: plan.writeRelays,
    temporaryRelays: plan.temporaryRelays,
    diagnostics: plan.diagnostics
  };
}

function entityReadResult<TValue>(
  value: TValue | null,
  settlement: ReadSettlement,
  deleted: boolean,
  sourceEvent: StoredEvent | null = isStoredEvent(value) ? value : null
): EntityReadResult<TValue> {
  return {
    value: deleted ? null : value,
    sourceEvent: deleted ? null : sourceEvent,
    settlement,
    state: deriveEntityHandleState({ value, settlement, deleted })
  };
}

function parseProfile(event: StoredEvent | null): Record<string, unknown> | null {
  if (!event) return null;
  try {
    const parsed = JSON.parse(event.content) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeHexId(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new TypeError(`Invalid ${label}: expected 64 hex characters`);
  }
  return value.toLowerCase();
}

function normalizeKind(kind: number): number {
  if (!Number.isInteger(kind) || kind < 0) {
    throw new TypeError('Invalid addressable kind: expected a non-negative integer');
  }
  return kind;
}

function normalizeDTag(d: string): string {
  if (d.length === 0) {
    throw new TypeError('Invalid addressable d tag: expected a non-empty string');
  }
  return d;
}

function normalizeRelaySetSubject(subject: RelaySetSubject): RelaySetSubject {
  if (subject.type === 'event') {
    return {
      type: 'event',
      id: normalizeHexId(subject.id, 'event id'),
      relayHints: normalizeRelayHints(subject.relayHints ?? [])
    };
  }
  if (subject.type === 'user') {
    return { type: 'user', pubkey: normalizeHexId(subject.pubkey, 'pubkey') };
  }
  return {
    type: 'addressable',
    kind: normalizeKind(subject.kind),
    pubkey: normalizeHexId(subject.pubkey, 'pubkey'),
    d: normalizeDTag(subject.d)
  };
}

function normalizeRelayHints(relays: readonly string[]): string[] {
  return [...new Set(relays.flatMap((relay) => normalizeRelayUrl(relay) ?? []))].sort();
}

function normalizeRelayHintRecords(
  records: readonly NormalizedRelayHint[] | undefined
): NormalizedRelayHint[] {
  return [...(records ?? [])]
    .flatMap((record) => {
      const relayUrl = normalizeRelayUrl(record.relayUrl);
      if (!relayUrl) return [];
      return [{ ...record, relayUrl }];
    })
    .sort(
      (left, right) =>
        right.lastSeenAt - left.lastSeenAt || left.relayUrl.localeCompare(right.relayUrl)
    );
}

function isStoredEvent(value: unknown): value is StoredEvent {
  return typeof value === 'object' && value !== null && 'id' in value && 'pubkey' in value;
}
```

- [ ] **Step 4: Extend coordinator types and package exports**

In `packages/resonote/src/runtime.ts`, import the new types near the other local
imports:

```ts
import {
  buildRelaySetSnapshot,
  createEntityHandleFactories,
  type AddressableHandle,
  type AddressableHandleInput,
  type EntityHandleFactories,
  type EntityHandleRuntime,
  type EventHandle,
  type EventHandleInput,
  type RelayHintsHandle,
  type RelaySetHandle,
  type RelaySetSubject,
  type UserHandle,
  type UserHandleInput
} from './entity-handles.js';
```

Add optional `entityHandleRuntime` to `CreateResonoteCoordinatorOptions`:

```ts
readonly entityHandleRuntime?: Pick<EntityHandleRuntime, 'read' | 'snapshotRelaySet' | 'isDeleted'>;
```

Add methods to `ResonoteCoordinator`:

```ts
getEvent(input: EventHandleInput): EventHandle;
getUser(input: UserHandleInput): UserHandle;
getAddressable(input: AddressableHandleInput): AddressableHandle;
getRelaySet(subject: RelaySetSubject): RelaySetHandle;
getRelayHints(eventId: string): RelayHintsHandle;
```

In `packages/resonote/src/index.ts`, export handle types from `runtime.js` by
adding these names to the existing `export type` block:

```ts
AddressableHandle,
AddressableHandleInput,
EntityFetchOptions,
EntityHandleState,
EntityReadResult,
EventHandle,
EventHandleInput,
NormalizedRelayHint,
RelayHintsHandle,
RelayHintsReadResult,
RelaySetHandle,
RelaySetSnapshot,
RelaySetSubject,
UserHandle,
UserHandleInput,
UserProfileReadResult,
```

Also re-export those types from `runtime.ts`:

```ts
export type {
  AddressableHandle,
  AddressableHandleInput,
  EntityFetchOptions,
  EntityHandleState,
  EntityReadResult,
  EventHandle,
  EventHandleInput,
  NormalizedRelayHint,
  RelayHintsHandle,
  RelayHintsReadResult,
  RelaySetHandle,
  RelaySetSnapshot,
  RelaySetSubject,
  UserHandle,
  UserHandleInput,
  UserProfileReadResult
} from './entity-handles.js';
```

- [ ] **Step 5: Wire minimal factories into `createResonoteCoordinator()`**

In `createResonoteCoordinator()`, after `publishHintRecorder`, create
`entityHandles`:

```ts
const entityHandles = createEntityHandleFactories({
  read:
    entityHandleRuntime?.read ??
    (async (filters, options, temporaryRelays) => {
      const resolvedOptions = await resolveReadOptions(
        coordinatorReadRuntime,
        filters,
        {
          timeoutMs: options.timeoutMs,
          rejectOnError: options.rejectOnError
        },
        'read',
        relaySelectionPolicy,
        temporaryRelays
      );
      const coordinator = createRuntimeEventCoordinator(coordinatorReadRuntime, resolvedOptions);
      return coordinator.read(filters, {
        policy: options.cacheOnly === true ? 'cacheOnly' : 'localFirst'
      });
    }),
  isDeleted:
    entityHandleRuntime?.isDeleted ??
    (async (id, pubkey) => {
      const db = await runtime.getEventsDB();
      return (await db.isDeleted?.(id, pubkey)) === true;
    }),
  openStore: () => runtime.getEventsDB(),
  snapshotRelaySet:
    entityHandleRuntime?.snapshotRelaySet ??
    (async (subject) => {
      const candidates = await buildRelaySetCandidates(runtime, subject);
      return buildRelaySetSnapshot({
        subject,
        policy: relaySelectionPolicy,
        candidates
      });
    })
});
```

Add these methods to the returned coordinator object:

```ts
getEvent: entityHandles.getEvent,
getUser: entityHandles.getUser,
getAddressable: entityHandles.getAddressable,
getRelaySet: entityHandles.getRelaySet,
getRelayHints: entityHandles.getRelayHints,
```

At the end of `runtime.ts`, add `buildRelaySetCandidates()`:

```ts
async function buildRelaySetCandidates(
  runtime: ResonoteRuntime,
  subject: RelaySetSubject
): Promise<RelaySelectionCandidate[]> {
  const candidates: RelaySelectionCandidate[] = [];
  const defaults = runtime.getDefaultRelays ? await runtime.getDefaultRelays() : [];
  candidates.push(
    ...[...defaults].map((relay) => ({ relay, source: 'default' as const, role: 'read' as const }))
  );

  const db = await runtime.getEventsDB();
  if (subject.type === 'event') {
    candidates.push(
      ...(subject.relayHints ?? []).map((relay) => ({
        relay,
        source: 'temporary-hint' as const,
        role: 'temporary' as const
      }))
    );
    const hints = (await db.getRelayHints?.(subject.id)) ?? [];
    candidates.push(
      ...hints.map((hint) => ({
        relay: hint.relayUrl,
        source: 'durable-hint' as const,
        role: 'read' as const
      }))
    );
  } else if (subject.type === 'user') {
    const relayList = await db.getByPubkeyAndKind(subject.pubkey, RELAY_LIST_KIND);
    const entries = relayList ? parseNip65RelayListTags(relayList.tags) : [];
    candidates.push(
      ...entries.flatMap((entry) =>
        entry.write
          ? [{ relay: entry.relay, source: 'nip65-write' as const, role: 'read' as const }]
          : []
      )
    );
  } else {
    const relayList = await db.getByPubkeyAndKind(subject.pubkey, RELAY_LIST_KIND);
    const entries = relayList ? parseNip65RelayListTags(relayList.tags) : [];
    candidates.push(
      ...entries.flatMap((entry) =>
        entry.write
          ? [{ relay: entry.relay, source: 'nip65-write' as const, role: 'read' as const }]
          : []
      )
    );
  }

  return candidates;
}
```

Import `RelaySelectionCandidate` and `parseNip65RelayListTags` at the top of
`runtime.ts` if they are not already imported.

- [ ] **Step 6: Run the focused test and confirm pass**

Run:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts
```

Expected: PASS for the initial coordinator API tests.

- [ ] **Step 7: Commit the public API skeleton**

Run:

```bash
git add packages/resonote/src/entity-handles.ts packages/resonote/src/entity-handles.contract.test.ts packages/resonote/src/runtime.ts packages/resonote/src/index.ts
git commit -m "feat(auftakt): add entity handle surface"
```

Expected: a focused commit with the new handle module and coordinator factory
surface.

---

### Task 2: Lock Settlement State Derivation

**Files:**

- Modify: `packages/resonote/src/entity-handles.contract.test.ts`
- Modify: `packages/resonote/src/entity-handles.ts`

- [ ] **Step 1: Add failing state derivation tests**

Append this test block to `packages/resonote/src/entity-handles.contract.test.ts`:

```ts
import { deriveEntityHandleState } from './entity-handles.js';

describe('entity handle settlement state derivation', () => {
  it.each([
    [
      'missing',
      null,
      reduceReadSettlement({ localSettled: true, relaySettled: true, relayRequired: true }),
      false
    ],
    [
      'local',
      makeEvent('1'.repeat(64)),
      reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: false,
        localHitProvenance: 'store'
      }),
      false
    ],
    [
      'partial',
      makeEvent('2'.repeat(64)),
      reduceReadSettlement({
        localSettled: true,
        relaySettled: false,
        relayRequired: true,
        localHitProvenance: 'store'
      }),
      false
    ],
    [
      'relay-confirmed',
      makeEvent('3'.repeat(64)),
      reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: true,
        relayHit: true
      }),
      false
    ],
    [
      'repaired',
      makeEvent('4'.repeat(64)),
      { phase: 'settled', provenance: 'relay', reason: 'negentropy-repair' },
      false
    ],
    [
      'deleted',
      makeEvent('5'.repeat(64)),
      reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: false,
        localHitProvenance: 'store'
      }),
      true
    ]
  ] satisfies Array<[EntityHandleState, StoredEvent | null, ReadSettlement, boolean]>)(
    'maps %s state',
    (expected, value, settlement, deleted) => {
      expect(deriveEntityHandleState({ value, settlement, deleted })).toBe(expected);
    }
  );
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts
```

Expected: PASS if Task 1 already implemented `deriveEntityHandleState()`. If it
fails, make the implementation match the mapping from the test.

- [ ] **Step 3: Commit state derivation coverage**

Run:

```bash
git add packages/resonote/src/entity-handles.ts packages/resonote/src/entity-handles.contract.test.ts
git commit -m "test(auftakt): lock entity handle states"
```

Expected: focused test commit. If no implementation changed, the commit still
records state coverage.

---

### Task 3: Implement EventHandle Fetch

**Files:**

- Modify: `packages/resonote/src/entity-handles.contract.test.ts`
- Modify: `packages/resonote/src/entity-handles.ts`

- [ ] **Step 1: Add event fetch behavior tests**

Append this test block:

```ts
describe('EventHandle.fetch', () => {
  it('delegates by-id reads with temporary relay hints and returns settlement state', async () => {
    const event = makeEvent('6'.repeat(64), { content: 'from relay' });
    const read = vi.fn(async () => ({
      events: [event],
      settlement: reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: true,
        relayHit: true
      })
    }));
    const { coordinator } = createCoordinatorFixture({ read });

    const result = await coordinator
      .getEvent({ id: '6'.repeat(64), relayHints: ['wss://temporary.example/', 'not a relay'] })
      .fetch({ timeoutMs: 1234 });

    expect(read).toHaveBeenCalledWith([{ ids: ['6'.repeat(64)] }], { timeoutMs: 1234 }, [
      'wss://temporary.example/'
    ]);
    expect(result).toMatchObject({
      value: event,
      sourceEvent: event,
      state: 'relay-confirmed',
      settlement: { phase: 'settled', provenance: 'relay', reason: 'relay-repair' }
    });
  });

  it('returns missing state for settled misses', async () => {
    const { coordinator } = createCoordinatorFixture({
      read: vi.fn(async () => ({
        events: [],
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: true,
          relayRequired: true
        })
      }))
    });

    const result = await coordinator.getEvent({ id: '7'.repeat(64) }).fetch();

    expect(result.value).toBeNull();
    expect(result.sourceEvent).toBeNull();
    expect(result.state).toBe('missing');
  });
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts
```

Expected: PASS. If the hint normalization assertion fails, update
`normalizeRelayHints()` to use `normalizeRelayUrl()` and drop invalid relays.

- [ ] **Step 3: Commit EventHandle fetch behavior**

Run:

```bash
git add packages/resonote/src/entity-handles.ts packages/resonote/src/entity-handles.contract.test.ts
git commit -m "feat(auftakt): fetch events through entity handles"
```

Expected: focused commit for EventHandle fetch behavior.

---

### Task 4: Implement UserHandle Profile Fetch

**Files:**

- Modify: `packages/resonote/src/entity-handles.contract.test.ts`
- Modify: `packages/resonote/src/entity-handles.ts`

- [ ] **Step 1: Add profile fetch tests**

Append this test block:

```ts
describe('UserHandle.fetchProfile', () => {
  it('fetches kind 0 profile events and returns parsed profile plus settlement', async () => {
    const profileEvent = makeEvent('8'.repeat(64), {
      pubkey: '9'.repeat(64),
      kind: 0,
      content: JSON.stringify({ name: 'Alice', picture: 'https://example.com/a.png' })
    });
    const read = vi.fn(async () => ({
      events: [profileEvent],
      settlement: LOCAL_SETTLEMENT
    }));
    const { coordinator } = createCoordinatorFixture({ read });

    const result = await coordinator.getUser({ pubkey: '9'.repeat(64) }).fetchProfile();

    expect(read).toHaveBeenCalledWith(
      [{ kinds: [0], authors: ['9'.repeat(64)], limit: 1 }],
      {},
      []
    );
    expect(result.profile).toEqual({ name: 'Alice', picture: 'https://example.com/a.png' });
    expect(result.sourceEvent).toBe(profileEvent);
    expect(result.state).toBe('local');
  });

  it('keeps source event and settlement when profile JSON is malformed', async () => {
    const profileEvent = makeEvent('a'.repeat(64), {
      pubkey: 'b'.repeat(64),
      kind: 0,
      content: '{not-json'
    });
    const { coordinator } = createCoordinatorFixture({
      read: vi.fn(async () => ({ events: [profileEvent], settlement: LOCAL_SETTLEMENT }))
    });

    const result = await coordinator.getUser({ pubkey: 'b'.repeat(64) }).fetchProfile();

    expect(result.profile).toBeNull();
    expect(result.sourceEvent).toBe(profileEvent);
    expect(result.settlement).toBe(LOCAL_SETTLEMENT);
    expect(result.state).toBe('local');
  });
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit UserHandle behavior**

Run:

```bash
git add packages/resonote/src/entity-handles.ts packages/resonote/src/entity-handles.contract.test.ts
git commit -m "feat(auftakt): fetch profiles through user handles"
```

Expected: focused commit for UserHandle profile behavior.

---

### Task 5: Implement AddressableHandle Fetch And Deletion State

**Files:**

- Modify: `packages/resonote/src/entity-handles.contract.test.ts`
- Modify: `packages/resonote/src/entity-handles.ts`
- Modify: `packages/resonote/src/runtime.ts`

- [ ] **Step 1: Add addressable fetch and deletion tests**

First, update the `createCoordinatorFixture()` options type in
`packages/resonote/src/entity-handles.contract.test.ts`:

```ts
readonly isDeleted?: (id: string, pubkey: string) => Promise<boolean>;
```

Then pass it into `entityHandleRuntime`:

```ts
entityHandleRuntime: {
  read,
  isDeleted: options.isDeleted,
  snapshotRelaySet: async () => ({
    subject: { type: 'event', id: 'event'.padEnd(64, '0') },
    readRelays: ['wss://default.example/'],
    writeRelays: [],
    temporaryRelays: [],
    diagnostics: []
  })
}
```

Append this final test block:

```ts
describe('AddressableHandle.fetch', () => {
  it('fetches parameterized replaceable events by kind author and d tag', async () => {
    const event = makeEvent('c'.repeat(64), {
      pubkey: 'd'.repeat(64),
      kind: 30023,
      tags: [['d', 'article']]
    });
    const read = vi.fn(async () => ({ events: [event], settlement: LOCAL_SETTLEMENT }));
    const { coordinator } = createCoordinatorFixture({ read });

    const result = await coordinator
      .getAddressable({ kind: 30023, pubkey: 'd'.repeat(64), d: 'article' })
      .fetch();

    expect(read).toHaveBeenCalledWith(
      [{ kinds: [30023], authors: ['d'.repeat(64)], '#d': ['article'], limit: 1 }],
      {},
      []
    );
    expect(result.value).toBe(event);
    expect(result.state).toBe('local');
  });

  it('maps proven deletion visibility to deleted state without returning the event value', async () => {
    const event = makeEvent('e'.repeat(64), {
      pubkey: 'f'.repeat(64),
      kind: 30023,
      tags: [['d', 'deleted']]
    });
    const isDeleted = vi.fn(async () => true);
    const { coordinator } = createCoordinatorFixture({
      read: vi.fn(async () => ({ events: [event], settlement: LOCAL_SETTLEMENT })),
      isDeleted
    });

    const result = await coordinator
      .getAddressable({ kind: 30023, pubkey: 'f'.repeat(64), d: 'deleted' })
      .fetch({ cacheOnly: true });

    expect(isDeleted).toHaveBeenCalledWith('e'.repeat(64), 'f'.repeat(64));
    expect(result.value).toBeNull();
    expect(result.sourceEvent).toBeNull();
    expect(result.state).toBe('deleted');
  });
});
```

- [ ] **Step 2: Update coordinator option typing for deletion checks**

In `packages/resonote/src/runtime.ts`, make sure
`CreateResonoteCoordinatorOptions.entityHandleRuntime` includes `isDeleted`:

```ts
readonly entityHandleRuntime?: Pick<EntityHandleRuntime, 'read' | 'snapshotRelaySet' | 'isDeleted'>;
```

- [ ] **Step 3: Run the focused test**

Run:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit AddressableHandle behavior**

Run:

```bash
git add packages/resonote/src/entity-handles.ts packages/resonote/src/entity-handles.contract.test.ts packages/resonote/src/runtime.ts
git commit -m "feat(auftakt): fetch addressable entity handles"
```

Expected: focused commit for addressable fetch and deletion state mapping.

---

### Task 6: Implement RelayHintsHandle Read-Only Results

**Files:**

- Modify: `packages/resonote/src/entity-handles.contract.test.ts`
- Modify: `packages/resonote/src/entity-handles.ts`

- [ ] **Step 1: Add relay hints read-only tests**

Append this test block:

```ts
describe('RelayHintsHandle.fetch', () => {
  it('returns normalized read-only durable relay hints sorted by recency', async () => {
    const eventId = '1'.repeat(64);
    const { coordinator } = createCoordinatorFixture({
      relayHints: [
        {
          eventId,
          relayUrl: 'wss://older.example',
          source: 'seen',
          lastSeenAt: 1
        },
        {
          eventId,
          relayUrl: 'not a relay',
          source: 'hinted',
          lastSeenAt: 3
        },
        {
          eventId,
          relayUrl: 'wss://newer.example/',
          source: 'published',
          lastSeenAt: 5
        }
      ]
    });

    const result = await coordinator.getRelayHints(eventId).fetch();

    expect(result).toEqual({
      eventId,
      hints: [
        { eventId, relayUrl: 'wss://newer.example/', source: 'published', lastSeenAt: 5 },
        { eventId, relayUrl: 'wss://older.example/', source: 'seen', lastSeenAt: 1 }
      ]
    });
    expect('recordRelayHint' in result).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit RelayHintsHandle behavior**

Run:

```bash
git add packages/resonote/src/entity-handles.ts packages/resonote/src/entity-handles.contract.test.ts
git commit -m "feat(auftakt): expose read-only relay hint handles"
```

Expected: focused commit for read-only relay hint handles.

---

### Task 7: Implement RelaySetHandle Snapshot

**Files:**

- Modify: `packages/resonote/src/entity-handles.contract.test.ts`
- Modify: `packages/resonote/src/entity-handles.ts`
- Modify: `packages/resonote/src/runtime.ts`

- [ ] **Step 1: Add relay set snapshot tests**

Append this test block:

```ts
describe('RelaySetHandle.snapshot', () => {
  it('returns high-level relay selection snapshots without raw transport objects', async () => {
    const subject = {
      type: 'event' as const,
      id: '2'.repeat(64),
      relayHints: ['wss://hint.example/']
    };
    const { coordinator } = createCoordinatorFixture();

    const result = await coordinator.getRelaySet(subject).snapshot();

    expect(result).toMatchObject({
      subject,
      readRelays: ['wss://default.example/'],
      writeRelays: [],
      temporaryRelays: [],
      diagnostics: []
    });
    expect('session' in result).toBe(false);
    expect('transportSubscription' in result).toBe(false);
    expect('routingIndex' in result).toBe(false);
  });
});
```

- [ ] **Step 2: Add policy-backed relay set planning coverage**

Update the entity-handle helper import near the top of
`packages/resonote/src/entity-handles.contract.test.ts`:

```ts
import { buildRelaySetSnapshot, deriveEntityHandleState } from './entity-handles.js';
```

Append this test to the same describe block:

```ts
it('builds relay set snapshots through the core relay selection planner', () => {
  const eventId = '3'.repeat(64);
  const snapshot = buildRelaySetSnapshot({
    subject: { type: 'event', id: eventId, relayHints: ['wss://temporary.example/'] },
    policy: {
      strategy: 'conservative-outbox',
      maxReadRelays: 1,
      maxTemporaryRelays: 1
    },
    candidates: [
      { relay: 'wss://default.example/', source: 'default', role: 'read' },
      { relay: 'wss://durable.example/', source: 'durable-hint', role: 'read' },
      { relay: 'wss://temporary.example/', source: 'temporary-hint', role: 'temporary' }
    ]
  });

  expect(snapshot.readRelays).toEqual(['wss://default.example/']);
  expect(snapshot.temporaryRelays).toEqual(['wss://temporary.example/']);
  expect(snapshot.diagnostics.some((diagnostic) => diagnostic.clipped)).toBe(true);
});
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts packages/resonote/src/relay-selection-runtime.contract.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit RelaySetHandle behavior**

Run:

```bash
git add packages/resonote/src/entity-handles.ts packages/resonote/src/entity-handles.contract.test.ts packages/resonote/src/runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts
git commit -m "feat(auftakt): snapshot entity relay sets"
```

Expected: focused commit for RelaySetHandle snapshots.

---

### Task 8: Lock Public Closure And Plugin Isolation

**Files:**

- Modify: `packages/resonote/src/public-api.contract.test.ts`
- Modify: `packages/resonote/src/plugin-isolation.contract.test.ts`
- Modify: `packages/resonote/src/index.ts`

- [ ] **Step 1: Add package-root closure assertions**

In `packages/resonote/src/public-api.contract.test.ts`, update the
`does not expose raw request-style runtime API names` test by adding these
allowed handle type expectations:

```ts
expect(source).toMatch(/\bEventHandle\b/);
expect(source).toMatch(/\bUserHandle\b/);
expect(source).toMatch(/\bAddressableHandle\b/);
expect(source).toMatch(/\bRelaySetHandle\b/);
expect(source).toMatch(/\bRelayHintsHandle\b/);
```

Add these forbidden package-level factory assertions:

```ts
expect(exportNames).not.toContain('getEvent');
expect(exportNames).not.toContain('getUser');
expect(exportNames).not.toContain('getAddressable');
expect(exportNames).not.toContain('getRelaySet');
expect(exportNames).not.toContain('getRelayHints');
expect(exportNames).not.toContain('createEntityHandleFactories');
expect(exportNames).not.toContain('buildRelaySetSnapshot');
```

- [ ] **Step 2: Add plugin isolation assertion**

In `packages/resonote/src/plugin-isolation.contract.test.ts`, update the first
test with:

```ts
expect(observedKeys[0]).not.toContain('getEvent');
expect(observedKeys[0]).not.toContain('getUser');
expect(observedKeys[0]).not.toContain('getAddressable');
expect(observedKeys[0]).not.toContain('getRelaySet');
expect(observedKeys[0]).not.toContain('getRelayHints');
expect(observedKeys[0]).not.toContain('openEventsDb');
```

- [ ] **Step 3: Run closure tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/plugin-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit closure coverage**

Run:

```bash
git add packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/index.ts
git commit -m "test(auftakt): lock entity handle closure"
```

Expected: focused commit for public closure and plugin isolation.

---

### Task 9: Run Full Entity Handles Verification

**Files:**

- Verify: `packages/resonote/src/entity-handles.ts`
- Verify: `packages/resonote/src/entity-handles.contract.test.ts`
- Verify: `packages/resonote/src/runtime.ts`
- Verify: `packages/resonote/src/index.ts`
- Verify: `packages/resonote/src/public-api.contract.test.ts`
- Verify: `packages/resonote/src/plugin-isolation.contract.test.ts`

- [ ] **Step 1: Run focused entity handle contracts**

Run:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run package gates**

Run:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
```

Expected: PASS for all three commands.

- [ ] **Step 3: Run strict closure and migration proof**

Run:

```bash
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: PASS for both commands.

- [ ] **Step 4: Run root check**

Run:

```bash
pnpm run check
```

Expected: PASS with zero Svelte diagnostics.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --stat HEAD
git diff --cached --name-status
```

Expected: no staged files. Unstaged output should be empty for entity handle
files if every task committed successfully.

---

## Self-Review

Spec coverage:

- Coordinator methods: Task 1.
- NDK-like `getUser(...).fetchProfile()` ergonomics: Task 4.
- Settlement-first result model: Tasks 2, 3, 4, and 5.
- Deleted / missing / partial / repaired states: Tasks 2, 3, and 5.
- Relay selection backed relay sets: Task 7.
- Read-only relay hints: Task 6.
- Package-root closure and plugin isolation: Task 8.
- Verification gates: Task 9.

No implementation task introduces mutation helpers, package-level handle
factories, raw relay sessions, raw WebSocket packets, raw Dexie handles, raw
Dexie rows, materializer queues, plugin registry internals, mutable routing
indexes, or transport subscription ids.
