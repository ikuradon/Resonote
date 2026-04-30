# Auftakt Strict Closure Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the strict Auftakt redesign false positive by ensuring gateway and repair relay results pass ingress/materialization before becoming public visible events, then update guards and docs.

**Architecture:** Rename gateway output from visible events to internal relay candidates. Make `EventCoordinator` accept candidates only through an ingress dependency, route repair candidates through the same validation/materialization path, and strengthen the strict closure guard so the old bypass cannot reappear.

**Tech Stack:** TypeScript, Vitest, SvelteKit workspace scripts, `@auftakt/core`, `@auftakt/resonote`, `@auftakt/adapter-dexie`.

---

## File Structure

- `packages/resonote/src/relay-gateway.ts`
  - Change gateway output from `events` to `candidates`.
- `packages/resonote/src/relay-gateway.contract.test.ts`
  - Update contract assertions for candidate output.
- `packages/resonote/src/event-coordinator.ts`
  - Add candidate ingress dependency and stop direct gateway result merges.
- `packages/resonote/src/event-coordinator.contract.test.ts`
  - Add regression coverage proving gateway candidates are not public until accepted.
- `packages/resonote/src/runtime.ts`
  - Wire production candidate ingress through `ingestRelayEvent()`, quarantine, and Dexie materialization. Split repair relay fetches into raw candidate fetch plus accepted materialization.
- `packages/resonote/src/relay-repair.contract.test.ts`
  - Add repair regression coverage for invalid remote candidates.
- `scripts/check-auftakt-strict-closure.ts`
  - Detect raw packet conversion and stale active package references.
- `scripts/check-auftakt-strict-closure.test.ts`
  - Lock the new guard behavior.
- `README.md`
  - Sync NIP matrix and tech stack with the current package architecture.
- `CLAUDE.md`
  - Sync Nostr runtime package wording.
- `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md`
  - Update strict redesign verdict after hardening.

---

### Task 1: Lock Gateway Candidate Semantics

**Files:**

- Modify: `packages/resonote/src/relay-gateway.contract.test.ts`
- Modify: `packages/resonote/src/relay-gateway.ts`

- [ ] **Step 1: Write failing gateway candidate tests**

Replace the assertions in `packages/resonote/src/relay-gateway.contract.test.ts` so the gateway returns `candidates` instead of public `events`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { createRelayGateway } from './relay-gateway.js';

describe('RelayGateway verification planner', () => {
  it('wraps ordinary REQ fallback results as internal relay candidates', async () => {
    const reqFetch = vi.fn(async () => [
      { id: 'remote', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
    ]);
    const gateway = createRelayGateway({
      requestNegentropySync: vi.fn(async () => ({
        capability: 'unsupported',
        reason: 'relay-error'
      })),
      fetchByReq: reqFetch,
      listLocalRefs: vi.fn(async () => [])
    });

    const result = await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });

    expect(reqFetch).toHaveBeenCalledWith([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });
    expect(result.strategy).toBe('fallback-req');
    expect(result).not.toHaveProperty('events');
    expect(result.candidates).toEqual([
      {
        relayUrl: 'wss://relay.example',
        event: {
          id: 'remote',
          pubkey: 'p1',
          created_at: 1,
          kind: 1,
          tags: [],
          content: '',
          sig: 'sig'
        }
      }
    ]);
  });

  it('wraps missing ids found by negentropy as internal relay candidates', async () => {
    const fetchByReq = vi.fn(async () => [
      { id: 'missing', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
    ]);
    const gateway = createRelayGateway({
      requestNegentropySync: vi.fn(async () => ({
        capability: 'supported',
        messageHex: JSON.stringify({ remoteOnlyIds: ['missing'] })
      })),
      fetchByReq,
      listLocalRefs: vi.fn(async () => [])
    });

    const result = await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });

    expect(fetchByReq).toHaveBeenCalledWith([{ ids: ['missing'] }], {
      relayUrl: 'wss://relay.example'
    });
    expect(result).not.toHaveProperty('events');
    expect(result.candidates).toEqual([
      {
        relayUrl: 'wss://relay.example',
        event: {
          id: 'missing',
          pubkey: 'p1',
          created_at: 1,
          kind: 1,
          tags: [],
          content: '',
          sig: 'sig'
        }
      }
    ]);
  });
});
```

- [ ] **Step 2: Run gateway tests and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-gateway.contract.test.ts
```

Expected: FAIL because `RelayGateway.verify()` still returns `events`.

- [ ] **Step 3: Change gateway result type and wrapping**

In `packages/resonote/src/relay-gateway.ts`, replace `RelayGatewayEvent` with candidate/result types and wrap fetched values:

```ts
export type RelayGatewayStrategy = 'negentropy' | 'fallback-req';

export interface RelayGatewayNegentropyResult {
  readonly capability: 'supported' | 'unsupported' | 'failed';
  readonly messageHex?: string;
  readonly reason?: string;
}

export interface RelayGatewayCandidate {
  readonly event: unknown;
  readonly relayUrl: string;
}

export interface RelayGatewayResult {
  readonly strategy: RelayGatewayStrategy;
  readonly candidates: readonly RelayGatewayCandidate[];
}

export function createRelayGateway(deps: {
  requestNegentropySync(input: {
    readonly relayUrl: string;
    readonly filter: Record<string, unknown>;
    readonly initialMessageHex: string;
  }): Promise<RelayGatewayNegentropyResult>;
  fetchByReq(
    filters: readonly Record<string, unknown>[],
    options: { readonly relayUrl: string }
  ): Promise<readonly unknown[]>;
  listLocalRefs(
    filters: readonly Record<string, unknown>[]
  ): Promise<readonly { readonly id: string; readonly created_at: number }[]>;
}) {
  return {
    async verify(
      filters: readonly Record<string, unknown>[],
      options: { readonly relayUrl: string }
    ): Promise<RelayGatewayResult> {
      const localRefs = await deps.listLocalRefs(filters);
      const negentropy = await deps.requestNegentropySync({
        relayUrl: options.relayUrl,
        filter: filters[0] ?? {},
        initialMessageHex: JSON.stringify(localRefs)
      });

      if (negentropy.capability !== 'supported') {
        const events = await deps.fetchByReq(filters, options);
        return { strategy: 'fallback-req', candidates: toCandidates(events, options.relayUrl) };
      }

      const remoteOnlyIds = parseRemoteOnlyIds(negentropy.messageHex);
      if (remoteOnlyIds.length > 0) {
        const events = await deps.fetchByReq([{ ids: remoteOnlyIds }], options);
        return { strategy: 'negentropy', candidates: toCandidates(events, options.relayUrl) };
      }

      return { strategy: 'negentropy', candidates: [] };
    }
  };
}

function toCandidates(
  events: readonly unknown[],
  relayUrl: string
): readonly RelayGatewayCandidate[] {
  return events.map((event) => ({ event, relayUrl }));
}
```

Keep the existing `parseRemoteOnlyIds()` implementation below this block.

- [ ] **Step 4: Run gateway tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-gateway.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/resonote/src/relay-gateway.ts packages/resonote/src/relay-gateway.contract.test.ts
git commit -m "refactor(auftakt): make relay gateway return candidates"
```

Expected: commit succeeds with only gateway files staged.

---

### Task 2: Route Coordinator Gateway Candidates Through Ingress

**Files:**

- Modify: `packages/resonote/src/event-coordinator.contract.test.ts`
- Modify: `packages/resonote/src/event-coordinator.ts`

- [ ] **Step 1: Add failing coordinator ingress tests**

Append these tests to `packages/resonote/src/event-coordinator.contract.test.ts` inside the existing `describe('EventCoordinator read policy', () => { ... })` block:

```ts
it('returns gateway candidates only after ingress accepts them', async () => {
  const accepted = {
    id: 'accepted',
    pubkey: 'p1',
    created_at: 1,
    kind: 1,
    tags: [],
    content: ''
  };
  const ingestRelayCandidate = vi.fn(async () => ({ ok: true as const, event: accepted }));
  const coordinator = createEventCoordinator({
    relayGateway: {
      verify: vi.fn(async () => ({
        strategy: 'fallback-req' as const,
        candidates: [{ relayUrl: 'wss://relay.example', event: { raw: true } }]
      }))
    },
    ingestRelayCandidate,
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => ({ stored: true }))
    },
    relay: { verify: vi.fn(async () => []) }
  });

  const result = await coordinator.read({ ids: ['accepted'] }, { policy: 'localFirst' });

  expect(ingestRelayCandidate).toHaveBeenCalledWith({
    relayUrl: 'wss://relay.example',
    event: { raw: true }
  });
  expect(result.events).toEqual([accepted]);
  expect(result.settlement.provenance).toBe('relay');
});

it('drops gateway candidates rejected by ingress', async () => {
  const coordinator = createEventCoordinator({
    relayGateway: {
      verify: vi.fn(async () => ({
        strategy: 'fallback-req' as const,
        candidates: [{ relayUrl: 'wss://relay.example', event: { malformed: true } }]
      }))
    },
    ingestRelayCandidate: vi.fn(async () => ({ ok: false as const })),
    store: {
      getById: vi.fn(async () => null),
      putWithReconcile: vi.fn(async () => ({ stored: true }))
    },
    relay: { verify: vi.fn(async () => []) }
  });

  const result = await coordinator.read({ ids: ['bad'] }, { policy: 'localFirst' });

  expect(result.events).toEqual([]);
  expect(result.settlement.relayRequired).toBe(true);
});
```

Update the existing `uses relay gateway for non-cacheOnly reads` test in the same file so its gateway returns `candidates` and the coordinator receives `ingestRelayCandidate`.

- [ ] **Step 2: Run coordinator tests and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: FAIL because `createEventCoordinator()` does not accept `ingestRelayCandidate` and still expects gateway `events`.

- [ ] **Step 3: Add candidate ingress types**

In `packages/resonote/src/event-coordinator.ts`, add these interfaces near the existing gateway interfaces:

```ts
export interface EventCoordinatorRelayCandidate {
  readonly event: unknown;
  readonly relayUrl: string;
}

export type EventCoordinatorIngressResult =
  | { readonly ok: true; readonly event: StoredEvent }
  | { readonly ok: false };
```

Change `EventCoordinatorRelayGateway` to return candidates:

```ts
export interface EventCoordinatorRelayGateway {
  verify(
    filters: readonly Record<string, unknown>[],
    options: { readonly reason: ReadPolicy }
  ): Promise<{
    readonly strategy?: string;
    readonly candidates: readonly EventCoordinatorRelayCandidate[];
  }>;
}
```

Add the optional ingress dependency to `createEventCoordinator()`:

```ts
export function createEventCoordinator(deps: {
  readonly hotIndex?: HotEventIndex;
  readonly materializerQueue?: EventCoordinatorMaterializerQueue;
  readonly relayGateway?: EventCoordinatorRelayGateway;
  readonly ingestRelayCandidate?: (
    candidate: EventCoordinatorRelayCandidate
  ) => Promise<EventCoordinatorIngressResult>;
  readonly store: EventCoordinatorStore;
  readonly relay: EventCoordinatorRelay;
}) {
```

- [ ] **Step 4: Process gateway candidates through ingress**

Replace the `if (deps.relayGateway)` branch inside `read()` with:

```ts
if (deps.relayGateway) {
  const result = await deps.relayGateway.verify(filters, { reason: options.policy });
  const acceptedEvents: StoredEvent[] = [];

  if (deps.ingestRelayCandidate) {
    for (const candidate of result.candidates) {
      const accepted = await deps.ingestRelayCandidate(candidate);
      if (accepted.ok) {
        acceptedEvents.push(accepted.event);
      }
    }
  }

  relayEvents = acceptedEvents;
  relaySettled = true;
  for (const event of relayEvents) {
    hotIndex.applyVisible(event);
  }
} else {
  void deps.relay.verify(filters, { reason: options.policy });
}
```

This intentionally drops gateway candidates when no ingress dependency exists.
That is safer than returning raw relay data.

- [ ] **Step 5: Run coordinator tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/resonote/src/event-coordinator.ts packages/resonote/src/event-coordinator.contract.test.ts
git commit -m "fix(auftakt): gate coordinator relay candidates through ingress"
```

Expected: commit succeeds with only coordinator files staged.

---

### Task 3: Wire Production Candidate Ingress

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Test: `packages/resonote/src/event-ingress.contract.test.ts`
- Test: `packages/resonote/src/event-coordinator.contract.test.ts`

- [ ] **Step 1: Add a production helper for relay candidates**

In `packages/resonote/src/runtime.ts`, add this helper near `quarantineRelayEvent()`:

```ts
async function ingestRelayCandidateForRuntime(
  runtime: EventMaterializationRuntime,
  candidate: { readonly event: unknown; readonly relayUrl: string }
): Promise<{ readonly ok: true; readonly event: StoredEvent } | { readonly ok: false }> {
  const result = await ingestRelayEvent({
    relayUrl: candidate.relayUrl,
    event: candidate.event,
    materialize: (incoming) => materializeIncomingEvent(runtime, incoming),
    quarantine: (record) => quarantineRelayEvent(runtime, record)
  });

  if (!result.ok || !result.stored) {
    return { ok: false };
  }

  return { ok: true, event: result.event };
}
```

- [ ] **Step 2: Change by-id gateway fetch to return raw candidates**

In `coordinatorFetchById()`, change the gateway `fetchByReq` dependency to call the raw candidate fetch from Task 4. The dependency should return unknown raw events, not already accepted events:

```ts
    fetchByReq: async (filters, options) =>
      fetchRelayCandidateEventsFromRelay(
        runtime as ResonoteRuntime,
        filters,
        options.relayUrl,
        5_000,
        'coordinator:gateway'
      ),
```

Add the production ingress dependency to the `createEventCoordinator()` call:

```ts
    ingestRelayCandidate: (candidate) => ingestRelayCandidateForRuntime(runtime, candidate),
```

The configured coordinator block should include `relayGateway`, `ingestRelayCandidate`, `store`, and `relay`.

- [ ] **Step 3: Update gateway result handling**

In the same `relayGateway.verify` adapter inside `coordinatorFetchById()`, change result flattening from `result.events` to `result.candidates`:

```ts
const results = await Promise.all(relays.map((relayUrl) => gateway.verify(filters, { relayUrl })));
return { candidates: results.flatMap((result) => result.candidates) };
```

For the no-relay fallback, return candidates built from raw fetched values:

```ts
if (relays.length === 0) {
  const events = await verifyByIdFilters(runtime, state, filters);
  return {
    candidates: events.map((event) => ({ event, relayUrl: '' }))
  };
}
```

- [ ] **Step 4: Run package runtime tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/event-ingress.contract.test.ts packages/resonote/src/event-coordinator.contract.test.ts packages/resonote/src/relay-gateway.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/resonote/src/runtime.ts
git commit -m "fix(auftakt): wire production relay candidate ingress"
```

Expected: commit succeeds with only runtime wiring staged.

---

### Task 4: Remove Repair Raw Event Return Path

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/relay-repair.contract.test.ts`

- [ ] **Step 1: Add failing repair rejection test**

Append this test to `packages/resonote/src/relay-repair.contract.test.ts`. Use the existing test helpers in that file for runtime setup; if helpers are not named exactly as below, keep the assertion shape and adapt only helper names:

```ts
it('does not count malformed relay repair candidates as repaired', async () => {
  const runtime = createRepairRuntime({
    relayEvents: [{ malformed: true }],
    putWithReconcile: vi.fn(async () => ({ stored: true, emissions: [] })),
    putQuarantine: vi.fn(async () => {})
  });

  const result = await repairEventsFromRelay(runtime, {
    relayUrl: 'wss://relay.example',
    filters: [{ ids: ['bad'] }],
    timeoutMs: 10
  });

  expect(result.repairedIds).toEqual([]);
  expect(runtime.getEventsDBResult.putWithReconcile).not.toHaveBeenCalled();
  expect(runtime.getEventsDBResult.putQuarantine).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'malformed' })
  );
});
```

Expected helper shape after adaptation:

- relay emits `{ malformed: true }` as `packet.event`
- store `putWithReconcile` is observable
- store `putQuarantine` is observable
- repaired ids stay empty

- [ ] **Step 2: Run repair tests and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-repair.contract.test.ts
```

Expected: FAIL because the repair fetch path still converts `packet.event` with `toStoredEvent()` and does not quarantine malformed candidates.

- [ ] **Step 3: Rename raw relay fetch helper**

In `packages/resonote/src/runtime.ts`, rename `fetchRepairEventsFromRelay()` to `fetchRelayCandidateEventsFromRelay()` and change its return type:

```ts
async function fetchRelayCandidateEventsFromRelay(
  runtime: ResonoteRuntime,
  filters: readonly RuntimeFilter[],
  relayUrl: string,
  timeoutMs: number | undefined,
  scope: string
): Promise<unknown[]> {
```

Inside the function, replace the map with a raw array:

```ts
const events: unknown[] = [];
```

Replace the subscription `next` handler with:

```ts
        next: (packet) => {
          events.push(packet.event);
        },
```

Replace the promise type and resolver with `Promise<unknown[]>` and
`resolve(events)`.

- [ ] **Step 4: Add repair candidate materialization helper**

Add this helper after `fetchRelayCandidateEventsFromRelay()`:

```ts
async function materializeRepairCandidates(
  runtime: ResonoteRuntime,
  relayUrl: string,
  candidates: readonly unknown[]
): Promise<{ repairedIds: string[]; materializationEmissions: ReconcileEmission[] }> {
  const repairedIds: string[] = [];
  const materializationEmissions: ReconcileEmission[] = [];

  for (const candidate of candidates) {
    const result = await ingestRelayEvent({
      relayUrl,
      event: candidate,
      materialize: async (event) => {
        const eventsDB = await runtime.getEventsDB();
        const materialized = await eventsDB.putWithReconcile(event);
        materializationEmissions.push(...materialized.emissions);
        return materialized.stored;
      },
      quarantine: (record) => quarantineRelayEvent(runtime, record)
    });

    if (result.ok && result.stored) {
      repairedIds.push(result.event.id);
    }
  }

  return { repairedIds, materializationEmissions };
}
```

Delete the old `materializeRepairEvents()` helper after all callers are moved.

- [ ] **Step 5: Update fallback and negentropy repair callers**

In `fallbackRepairEventsFromRelay()`, replace:

```ts
const fallbackEvents = await fetchRepairEventsFromRelay(
  runtime,
  options.filters,
  options.relayUrl,
  options.timeoutMs,
  'timeline:repair:fallback'
);
const materialized = await materializeRepairEvents(runtime, fallbackEvents);
```

with:

```ts
const fallbackCandidates = await fetchRelayCandidateEventsFromRelay(
  runtime,
  options.filters,
  options.relayUrl,
  options.timeoutMs,
  'timeline:repair:fallback'
);
const materialized = await materializeRepairCandidates(
  runtime,
  options.relayUrl,
  fallbackCandidates
);
```

In `repairEventsFromRelay()`, replace the negentropy fetch block with:

```ts
const repairCandidates = await fetchRelayCandidateEventsFromRelay(
  runtime,
  chunkIds([...missingIds]),
  options.relayUrl,
  options.timeoutMs,
  'timeline:repair:negentropy:fetch'
);
const materialized = await materializeRepairCandidates(runtime, options.relayUrl, repairCandidates);
```

- [ ] **Step 6: Run repair tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-repair.contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/relay-repair.contract.test.ts
git commit -m "fix(auftakt): materialize repair relay candidates through ingress"
```

Expected: commit succeeds with runtime and repair test changes staged.

---

### Task 5: Strengthen Strict Closure Guard

**Files:**

- Modify: `scripts/check-auftakt-strict-closure.test.ts`
- Modify: `scripts/check-auftakt-strict-closure.ts`

- [ ] **Step 1: Add failing guard tests**

Append these tests to `scripts/check-auftakt-strict-closure.test.ts`:

```ts
it('flags packet.event conversion into StoredEvent-like public results', () => {
  const result = checkStrictClosure([
    file(
      'packages/resonote/src/runtime.ts',
      'const event = toStoredEvent(packet.event); if (event) events.set(event.id, event);'
    ),
    file(
      'packages/resonote/src/materializer-queue.ts',
      'export function createMaterializerQueue() {}'
    ),
    file(
      'packages/resonote/src/runtime-gateway.ts',
      'createMaterializerQueue(); createRelayGateway();'
    )
  ]);

  expect(result.errors).toContain(
    'packages/resonote/src/runtime.ts converts raw packet.event without ingress'
  );
});

it('flags relay gateway public event result naming', () => {
  const result = checkStrictClosure([
    file(
      'packages/resonote/src/relay-gateway.ts',
      'return { strategy: "fallback-req" as const, events };'
    ),
    file(
      'packages/resonote/src/materializer-queue.ts',
      'export function createMaterializerQueue() {}'
    ),
    file('packages/resonote/src/runtime.ts', 'createMaterializerQueue(); createRelayGateway();')
  ]);

  expect(result.errors).toContain(
    'packages/resonote/src/relay-gateway.ts returns relay gateway events instead of candidates'
  );
});

it('flags active docs that still name removed Auftakt packages', () => {
  const result = checkStrictClosure([
    file('README.md', '@auftakt/adapter-relay packages/adapter-indexeddb'),
    file(
      'packages/resonote/src/materializer-queue.ts',
      'export function createMaterializerQueue() {}'
    ),
    file('packages/resonote/src/runtime.ts', 'createMaterializerQueue(); createRelayGateway();')
  ]);

  expect(result.errors).toContain('README.md mentions removed Auftakt package boundary');
});
```

- [ ] **Step 2: Run guard tests and confirm failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-closure.test.ts
```

Expected: FAIL because the guard does not detect these patterns yet.

- [ ] **Step 3: Add guard patterns**

In `scripts/check-auftakt-strict-closure.ts`, add constants near the existing legacy adapter constants:

```ts
const REMOVED_PACKAGE_PATTERNS = [
  '@auftakt/adapter-relay',
  '@auftakt/adapter-indexeddb',
  'packages/adapter-relay',
  'packages/adapter-indexeddb'
];
const ACTIVE_DOC_PATHS = new Set(['README.md', 'CLAUDE.md']);
```

Inside the main `for (const file of files)` loop, add:

```ts
if (
  isProductionResonoteSource(file.path) &&
  /toStoredEvent\(\s*packet\.event\s*\)/.test(file.text)
) {
  errors.push(`${file.path} converts raw packet.event without ingress`);
}
if (
  file.path === 'packages/resonote/src/relay-gateway.ts' &&
  /\breturn\s+\{[^}]*\bevents\b/.test(file.text)
) {
  errors.push(`${file.path} returns relay gateway events instead of candidates`);
}
if (
  ACTIVE_DOC_PATHS.has(file.path) &&
  REMOVED_PACKAGE_PATTERNS.some((pattern) => file.text.includes(pattern))
) {
  errors.push(`${file.path} mentions removed Auftakt package boundary`);
}
```

Do not scan `docs/superpowers/**`; those are historical plan/spec artifacts and
are already ignored.

- [ ] **Step 4: Run guard tests**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-closure.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run strict closure guard**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: FAIL until Task 6 updates active docs and all raw bypasses are gone. If it still fails on `runtime.ts`, finish Tasks 3 and 4 before continuing.

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/check-auftakt-strict-closure.ts scripts/check-auftakt-strict-closure.test.ts
git commit -m "test(auftakt): guard strict closure raw relay bypasses"
```

Expected: commit succeeds with only guard files staged.

---

### Task 6: Sync Active Documentation

**Files:**

- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md`

- [ ] **Step 1: Update README NIP matrix owners**

In `README.md`, update these rows exactly:

```md
| NIP-01 | public | implemented (runtime-owned REQ/replay + EOSE/OK) | `packages/core/src/relay-session.ts` | `packages/core/src/relay-session.contract.test.ts` | Contract tests cover REQ routing/replay, backward EOSE completion, and publish OK acknowledgements. Runtime-governing internals as coordinator behavior only. |
| NIP-09 | public | implemented | `packages/adapter-dexie/src/index.ts` | `packages/core/src/reconcile.contract.test.ts`<br>`packages/adapter-dexie/src/materialization.contract.test.ts` | package-owned tombstone verification と late-event suppression |
| NIP-11 | internal | implemented (runtime-only bounded support) | `packages/core/src/relay-session.ts` | `packages/core/src/relay-session.contract.test.ts` | runtime-only relay request-limit policy shapes shard queueing and reconnect replay. No public relay metadata surface and no broader NIP-11 discovery claim. |
```

- [ ] **Step 2: Update README tech stack**

Replace the README Nostr runtime bullet with:

```md
- **Nostr ランタイム**: Auftakt runtime (`@auftakt/core` + `@auftakt/resonote` + `@auftakt/adapter-dexie`) — compat gateway 退役済み
```

- [ ] **Step 3: Update CLAUDE tech stack**

Replace the CLAUDE Nostr bullet with:

```md
- **Nostr**: Auftakt runtime (`@auftakt/core` + `@auftakt/resonote` + `@auftakt/adapter-dexie`) (verifier/signer/storage)
```

- [ ] **Step 4: Update strict audit verdict**

In `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md`, update the overall verdict to:

```md
## Overall Verdict

The scoped strict closure is implemented after the 2026-04-25 hardening pass.

The active package set is `@auftakt/core`, `@auftakt/resonote`, and
`@auftakt/adapter-dexie`. Public app-facing reads and repair paths route remote
relay candidates through ingress validation, quarantine, and materialization
before those candidates can become visible events.

Remaining follow-up is outbox intelligence: durable relay hints exist, but broad
reply/reaction/nevent/naddr routing policy can still be expanded in a later
feature plan.
```

Replace stale Fail entries in the first findings table with post-hardening
wording:

```md
| Single coordinator truth | Satisfied | `src/shared/auftakt/resonote.ts` remains the facade, while package runtime reads route remote candidates through coordinator-owned ingress/materialization before visibility. | Keep low-level facade glue bounded to shared runtime assembly. |
| Relay event materialization | Satisfied | Gateway and repair relay results are candidates until `ingestRelayEvent()` validates, quarantines, and materializes them. | Guard covers direct `packet.event` conversion regressions. |
| Signature verification gate | Satisfied | Relay candidates pass `validateRelayEvent()` through `ingestRelayEvent()` before storage or public result emission. | Core transport packets remain internal-only data. |
| Local-first + mandatory remote verification | Satisfied | `cacheOnly` is the only policy that suppresses remote verification; non-cacheOnly remote hits require accepted ingress before becoming visible. | Local hits can still be returned early with settlement state. |
| Plugin boundary | Satisfied | Plugin APIs expose registration and read-model/flow handles only, not raw Dexie, relay sessions, or materializer queue internals. | Resonote-only flows remain package-owned facade flows. |
| NIP compliance | Satisfied | `check:auftakt:nips` validates the local matrix against the inventory. | Official inventory refresh remains a maintenance task. |
```

Keep any historically useful external-source sections below the table.

- [ ] **Step 5: Run docs and guard searches**

Run:

```bash
rg "@auftakt/adapter-relay|@auftakt/adapter-indexeddb|packages/adapter-relay|packages/adapter-indexeddb" README.md CLAUDE.md docs/auftakt packages src scripts
```

Expected: no output except historical references in files intentionally outside this command. If this command prints README, CLAUDE, active docs, package, source, or script references, update them before continuing.

- [ ] **Step 6: Run strict closure guard**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add README.md CLAUDE.md docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md
git commit -m "docs(auftakt): sync strict closure status"
```

Expected: commit succeeds with only docs staged.

---

### Task 7: Final Verification

**Files:**

- No source changes expected.
- Inspect: `git status --short`

- [ ] **Step 1: Run package tests**

Run:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
```

Expected: all commands PASS.

- [ ] **Step 2: Run app regression and proof gates**

Run:

```bash
pnpm run test:auftakt:app-regression
pnpm run check:auftakt:nips
pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt:strict-closure
```

Expected: all commands PASS.

- [ ] **Step 3: Run Svelte check and build**

Run:

```bash
pnpm run check
pnpm run build
```

Expected: both commands PASS. Existing build warnings from third-party `@konemono/nostr-login` direct eval or large chunks may remain warnings, not failures.

- [ ] **Step 4: Run final complete gate**

Run:

```bash
pnpm run check:auftakt-complete
```

Expected: PASS. If this fails because `test:auftakt:e2e` fails, capture the failing Playwright test names and command output before making any further code changes.

- [ ] **Step 5: Inspect final status**

Run:

```bash
git status --short
```

Expected: only intentional changes remain. Do not remove unrelated user-owned files such as `.codex` if they were already present before this work.

- [ ] **Step 6: Commit final corrections if needed**

If verification required small corrections, run:

```bash
git add packages/resonote/src scripts README.md CLAUDE.md docs/auftakt
git commit -m "fix(auftakt): complete strict closure hardening"
```

Expected: either commit succeeds with final corrections, or there are no remaining changes to commit.

---

## Self-Review Notes

- Spec coverage: Tasks 1-4 cover candidate semantics, ingress, read flow, and repair flow. Task 5 covers guard hardening. Task 6 covers active documentation. Task 7 covers completion gates.
- Placeholder scan: no placeholder markers or unspecified test commands are used.
- Type consistency: `RelayGatewayCandidate`, `EventCoordinatorRelayCandidate`, and `ingestRelayCandidate` all use `{ event: unknown; relayUrl: string }` as the candidate shape. Public visible results remain `StoredEvent`.
