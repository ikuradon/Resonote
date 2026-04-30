# Auftakt Relay Selection And Outbox Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable relay selection and outbox routing so Auftakt can run `default-only`, `conservative-outbox`, or `strict-outbox` policy across read, subscription, repair, publish, reply, reaction, and mention flows.

**Architecture:** Put generic NIP-65 parsing and pure relay selection planning in `@auftakt/core`. Put Resonote-specific input collection in `@auftakt/resonote`: read local relay-list events, durable event relay hints, explicit tag hints, and operation subjects, then adapt the core plan into existing relay session read/write options. Keep raw relay sessions, raw Dexie rows, and mutable routing indexes behind the coordinator boundary.

**Tech Stack:** TypeScript, Vitest, RxJS, `@auftakt/core`, `@auftakt/resonote`, `@auftakt/adapter-dexie`, SvelteKit shared facade.

---

## Scope Check

This plan implements only the approved relay selection and outbox routing design:

- core NIP-65 parser and pure planner
- strategy presets and budgets
- Resonote read/subscription/repair input collection
- Resonote publish/reply/reaction/mention audience collection
- facade interop and closure verification

This plan does not implement entity handles, relay settings UI, NIP inventory automation, or capability/lifecycle rewrites.

## File Structure

- Create `packages/core/src/relay-selection.ts`
  - Owns NIP-65 relay-list parsing, relay URL normalization, strategy defaults, candidate sorting, clipping, and `buildRelaySelectionPlan()`.
- Create `packages/core/src/relay-selection.contract.test.ts`
  - Locks parser behavior, invalid URL rejection, strategy presets, clipping, strict fan-out, temporary hint isolation, and deterministic output.
- Modify `packages/core/src/index.ts`
  - Exports relay selection types and helpers through the package root.
- Modify `packages/core/src/public-api.contract.test.ts`
  - Locks new package-root helper availability without adding raw runtime leaks.
- Create `packages/resonote/src/relay-selection-runtime.ts`
  - Collects default relays, local NIP-65 relay-list events, durable relay hints, explicit tag hints, and audience pubkeys, then adapts core plans to read overlays and publish send options.
- Create `packages/resonote/src/relay-selection-runtime.contract.test.ts`
  - Tests read overlay collection, author write relay collection, reply/reaction/mention audience collection, and default conservative policy.
- Modify `packages/resonote/src/runtime.ts`
  - Adds optional default-relay and relay-hint read methods to runtime interfaces, routes read paths through selection when no explicit overlay is supplied, routes publish paths through selection, and makes subscription registry resolve selection before transport use.
- Create `packages/resonote/src/relay-routing-publish.contract.test.ts`
  - Proves coordinator publish calls pass selected write/audience relays to the publish transport.
- Modify `packages/resonote/src/public-api.contract.test.ts`
  - Keeps strategy support internal/configuration-safe and proves no raw routing handles leak.
- Modify `src/shared/nostr/client.ts`
  - Lets the shared client expose current default relay URLs and pass relay selection options through `castSigned()`.
- Modify `src/shared/auftakt/resonote.ts`
  - Wires `getDefaultRelays()` and publish transport options into the coordinator runtime without changing existing facade callers.

---

### Task 1: Add Core NIP-65 Relay Selection Vocabulary

**Files:**

- Create: `packages/core/src/relay-selection.contract.test.ts`
- Create: `packages/core/src/relay-selection.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/public-api.contract.test.ts`

- [ ] **Step 1: Write failing NIP-65 parser and public API tests**

Create `packages/core/src/relay-selection.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  normalizeRelaySelectionPolicy,
  parseNip65RelayListTags,
  relayListEntriesToSelectionCandidates,
  type RelaySelectionPolicyOptions
} from './index.js';

describe('relay selection NIP-65 parsing', () => {
  it('parses NIP-65 r tags into read and write relay entries', () => {
    expect(
      parseNip65RelayListTags([
        ['r', 'wss://read.example', 'read'],
        ['r', 'wss://write.example', 'write'],
        ['r', 'wss://both.example'],
        ['r', 'wss://ignored.example', 'invalid-marker'],
        ['p', 'not-a-relay']
      ])
    ).toEqual([
      { relay: 'wss://read.example/', read: true, write: false },
      { relay: 'wss://write.example/', read: false, write: true },
      { relay: 'wss://both.example/', read: true, write: true },
      { relay: 'wss://ignored.example/', read: true, write: true }
    ]);
  });

  it('ignores malformed, non-websocket, and duplicate relay entries', () => {
    expect(
      parseNip65RelayListTags([
        ['r'],
        ['r', 'https://relay.example'],
        ['r', 'notaurl'],
        ['r', 'wss://relay.example', 'read'],
        ['r', 'wss://relay.example/', 'write']
      ])
    ).toEqual([{ relay: 'wss://relay.example/', read: true, write: true }]);
  });

  it('turns relay-list entries into read and write selection candidates', () => {
    const candidates = relayListEntriesToSelectionCandidates(
      parseNip65RelayListTags([
        ['r', 'wss://read.example', 'read'],
        ['r', 'wss://write.example', 'write'],
        ['r', 'wss://both.example']
      ])
    );

    expect(candidates).toEqual([
      { relay: 'wss://read.example/', source: 'nip65-read', role: 'read' },
      { relay: 'wss://write.example/', source: 'nip65-write', role: 'write' },
      { relay: 'wss://both.example/', source: 'nip65-read', role: 'read' },
      { relay: 'wss://both.example/', source: 'nip65-write', role: 'write' }
    ]);
  });

  it('normalizes preset option defaults', () => {
    const defaultOnly = normalizeRelaySelectionPolicy({ strategy: 'default-only' });
    const conservative = normalizeRelaySelectionPolicy({ strategy: 'conservative-outbox' });
    const strict = normalizeRelaySelectionPolicy({ strategy: 'strict-outbox' });
    const overridden = normalizeRelaySelectionPolicy({
      strategy: 'default-only',
      allowTemporaryHints: true
    } satisfies RelaySelectionPolicyOptions);

    expect(defaultOnly).toMatchObject({
      strategy: 'default-only',
      includeDefaultFallback: true,
      allowTemporaryHints: false,
      includeDurableHints: false,
      includeAudienceRelays: false
    });
    expect(conservative).toMatchObject({
      strategy: 'conservative-outbox',
      includeDefaultFallback: true,
      allowTemporaryHints: true,
      includeDurableHints: true,
      includeAudienceRelays: true
    });
    expect(strict).toMatchObject({
      strategy: 'strict-outbox',
      includeDefaultFallback: true,
      allowTemporaryHints: true,
      includeDurableHints: true,
      includeAudienceRelays: true
    });
    expect(overridden.allowTemporaryHints).toBe(true);
  });
});
```

Modify `packages/core/src/public-api.contract.test.ts` inside the `exposes the expected package-root names explicitly` assertion:

```ts
expect(mod).toEqual(
  expect.objectContaining({
    buildRelaySelectionPlan: expect.any(Function),
    buildRequestExecutionPlan: expect.any(Function),
    calculateRelayReconnectDelay: expect.any(Function),
    createRuntimeRequestKey: expect.any(Function),
    createRelaySession: expect.any(Function),
    filterNegentropyEventRefs: expect.any(Function),
    normalizeRelayLifecycleOptions: expect.any(Function),
    normalizeRelaySelectionPolicy: expect.any(Function),
    parseNip65RelayListTags: expect.any(Function),
    reconcileReplayRepairSubjects: expect.any(Function),
    reduceReadSettlement: expect.any(Function),
    validateRelayEvent: expect.any(Function)
  })
);
```

- [ ] **Step 2: Run the focused core relay selection tests and confirm failure**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-selection.contract.test.ts packages/core/src/public-api.contract.test.ts
```

Expected: FAIL because `relay-selection.ts` exports do not exist.

- [ ] **Step 3: Add core relay selection vocabulary and parser**

Create `packages/core/src/relay-selection.ts`:

```ts
export type RelaySelectionStrategy = 'default-only' | 'conservative-outbox' | 'strict-outbox';

export type RelaySelectionIntent =
  | 'read'
  | 'subscribe'
  | 'repair'
  | 'publish'
  | 'reply'
  | 'reaction'
  | 'mention';

export type RelayCandidateSource =
  | 'default'
  | 'nip65-read'
  | 'nip65-write'
  | 'temporary-hint'
  | 'durable-hint'
  | 'audience';

export type RelaySelectionRole = 'read' | 'write' | 'temporary';

export interface RelaySelectionPolicyOptions {
  readonly strategy: RelaySelectionStrategy;
  readonly maxReadRelays?: number;
  readonly maxWriteRelays?: number;
  readonly maxTemporaryRelays?: number;
  readonly maxAudienceRelays?: number;
  readonly includeDefaultFallback?: boolean;
  readonly allowTemporaryHints?: boolean;
  readonly includeDurableHints?: boolean;
  readonly includeAudienceRelays?: boolean;
}

export interface NormalizedRelaySelectionPolicy {
  readonly strategy: RelaySelectionStrategy;
  readonly maxReadRelays: number;
  readonly maxWriteRelays: number;
  readonly maxTemporaryRelays: number;
  readonly maxAudienceRelays: number;
  readonly includeDefaultFallback: boolean;
  readonly allowTemporaryHints: boolean;
  readonly includeDurableHints: boolean;
  readonly includeAudienceRelays: boolean;
}

export interface Nip65RelayListEntry {
  readonly relay: string;
  readonly read: boolean;
  readonly write: boolean;
}

export interface RelaySelectionCandidate {
  readonly relay: string;
  readonly source: RelayCandidateSource;
  readonly role: RelaySelectionRole;
}

export interface RelaySelectionDiagnostic {
  readonly relay: string;
  readonly source: RelayCandidateSource;
  readonly role: RelaySelectionRole;
  readonly selected: boolean;
  readonly clipped: boolean;
  readonly reason: string;
}

export interface RelaySelectionPlan {
  readonly readRelays: readonly string[];
  readonly writeRelays: readonly string[];
  readonly temporaryRelays: readonly string[];
  readonly diagnostics: readonly RelaySelectionDiagnostic[];
}

export interface RelaySelectionPlanInput {
  readonly intent: RelaySelectionIntent;
  readonly policy: RelaySelectionPolicyOptions;
  readonly candidates: readonly RelaySelectionCandidate[];
}

const CONSERVATIVE_DEFAULT_LIMIT = 4;
const STRICT_DEFAULT_LIMIT = Number.POSITIVE_INFINITY;

export function normalizeRelaySelectionPolicy(
  options: RelaySelectionPolicyOptions
): NormalizedRelaySelectionPolicy {
  const outbox = options.strategy !== 'default-only';
  const strict = options.strategy === 'strict-outbox';
  const defaultLimit = strict ? STRICT_DEFAULT_LIMIT : CONSERVATIVE_DEFAULT_LIMIT;

  return {
    strategy: options.strategy,
    maxReadRelays: normalizeLimit(options.maxReadRelays, defaultLimit),
    maxWriteRelays: normalizeLimit(options.maxWriteRelays, defaultLimit),
    maxTemporaryRelays: normalizeLimit(options.maxTemporaryRelays, defaultLimit),
    maxAudienceRelays: normalizeLimit(options.maxAudienceRelays, defaultLimit),
    includeDefaultFallback: options.includeDefaultFallback ?? true,
    allowTemporaryHints: options.allowTemporaryHints ?? outbox,
    includeDurableHints: options.includeDurableHints ?? outbox,
    includeAudienceRelays: options.includeAudienceRelays ?? outbox
  };
}

export function parseNip65RelayListTags(
  tags: readonly (readonly string[])[]
): Nip65RelayListEntry[] {
  const byRelay = new Map<string, Nip65RelayListEntry>();

  for (const tag of tags) {
    if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue;
    const relay = normalizeRelayUrl(tag[1]);
    if (!relay) continue;

    const marker = tag[2];
    const next: Nip65RelayListEntry =
      marker === 'read'
        ? { relay, read: true, write: false }
        : marker === 'write'
          ? { relay, read: false, write: true }
          : { relay, read: true, write: true };
    const existing = byRelay.get(relay);
    byRelay.set(relay, {
      relay,
      read: Boolean(existing?.read || next.read),
      write: Boolean(existing?.write || next.write)
    });
  }

  return [...byRelay.values()].sort((left, right) => left.relay.localeCompare(right.relay));
}

export function relayListEntriesToSelectionCandidates(
  entries: readonly Nip65RelayListEntry[]
): RelaySelectionCandidate[] {
  const candidates: RelaySelectionCandidate[] = [];
  for (const entry of entries) {
    if (entry.read) {
      candidates.push({ relay: entry.relay, source: 'nip65-read', role: 'read' });
    }
    if (entry.write) {
      candidates.push({ relay: entry.relay, source: 'nip65-write', role: 'write' });
    }
  }
  return candidates;
}

export function normalizeRelayUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null;
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return STRICT_DEFAULT_LIMIT;
  return Math.max(0, Math.floor(value));
}

export function buildRelaySelectionPlan(input: RelaySelectionPlanInput): RelaySelectionPlan {
  const policy = normalizeRelaySelectionPolicy(input.policy);
  const allowed = normalizeAndFilterCandidates(input.candidates, policy);

  return {
    readRelays: selectRelays(allowed, policy, 'read'),
    writeRelays: selectRelays(allowed, policy, 'write'),
    temporaryRelays: selectRelays(allowed, policy, 'temporary'),
    diagnostics: buildDiagnostics(allowed, policy)
  };
}

function normalizeAndFilterCandidates(
  candidates: readonly RelaySelectionCandidate[],
  policy: NormalizedRelaySelectionPolicy
): RelaySelectionCandidate[] {
  return candidates.flatMap((candidate) => {
    const relay = normalizeRelayUrl(candidate.relay);
    if (!relay) return [];
    if (candidate.source === 'temporary-hint' && !policy.allowTemporaryHints) return [];
    if (candidate.source === 'durable-hint' && !policy.includeDurableHints) return [];
    if (candidate.source === 'audience' && !policy.includeAudienceRelays) return [];
    if (candidate.source === 'default' && !policy.includeDefaultFallback) return [];
    return [{ ...candidate, relay }];
  });
}

function selectRelays(
  candidates: readonly RelaySelectionCandidate[],
  policy: NormalizedRelaySelectionPolicy,
  role: RelaySelectionRole
): string[] {
  const byRelay = new Map<string, RelaySelectionCandidate>();
  for (const candidate of sortCandidates(candidates, policy)) {
    if (candidate.role !== role) continue;
    if (!byRelay.has(candidate.relay)) byRelay.set(candidate.relay, candidate);
  }

  return [...byRelay.keys()].slice(0, limitForRole(policy, role));
}

function buildDiagnostics(
  candidates: readonly RelaySelectionCandidate[],
  policy: NormalizedRelaySelectionPolicy
): RelaySelectionDiagnostic[] {
  const selectedByRole = new Map<RelaySelectionRole, Set<string>>([
    ['read', new Set(selectRelays(candidates, policy, 'read'))],
    ['write', new Set(selectRelays(candidates, policy, 'write'))],
    ['temporary', new Set(selectRelays(candidates, policy, 'temporary'))]
  ]);

  return sortCandidates(candidates, policy).map((candidate) => {
    const selected = selectedByRole.get(candidate.role)?.has(candidate.relay) ?? false;
    return {
      relay: candidate.relay,
      source: candidate.source,
      role: candidate.role,
      selected,
      clipped: !selected,
      reason: selected ? 'selected' : 'clipped-by-policy'
    };
  });
}

function sortCandidates(
  candidates: readonly RelaySelectionCandidate[],
  policy: NormalizedRelaySelectionPolicy
): RelaySelectionCandidate[] {
  return [...candidates].sort((left, right) => {
    const priority = sourcePriority(policy, right.source) - sourcePriority(policy, left.source);
    if (priority !== 0) return priority;
    return left.relay.localeCompare(right.relay);
  });
}

function sourcePriority(
  policy: NormalizedRelaySelectionPolicy,
  source: RelayCandidateSource
): number {
  if (policy.strategy === 'strict-outbox') {
    return {
      'temporary-hint': 60,
      'nip65-read': 50,
      'nip65-write': 50,
      'durable-hint': 40,
      audience: 30,
      default: 10
    }[source];
  }

  return {
    'temporary-hint': 60,
    default: 50,
    'durable-hint': 40,
    'nip65-read': 30,
    'nip65-write': 30,
    audience: 20
  }[source];
}

function limitForRole(policy: NormalizedRelaySelectionPolicy, role: RelaySelectionRole): number {
  if (role === 'read') return policy.maxReadRelays;
  if (role === 'write') return policy.maxWriteRelays;
  return policy.maxTemporaryRelays;
}
```

Modify `packages/core/src/index.ts`:

```ts
export type {
  Nip65RelayListEntry,
  NormalizedRelaySelectionPolicy,
  RelayCandidateSource,
  RelaySelectionCandidate,
  RelaySelectionDiagnostic,
  RelaySelectionIntent,
  RelaySelectionPlan,
  RelaySelectionPlanInput,
  RelaySelectionPolicyOptions,
  RelaySelectionRole,
  RelaySelectionStrategy
} from './relay-selection.js';
export {
  buildRelaySelectionPlan,
  normalizeRelaySelectionPolicy,
  normalizeRelayUrl,
  parseNip65RelayListTags,
  relayListEntriesToSelectionCandidates
} from './relay-selection.js';
```

- [ ] **Step 4: Run focused tests and confirm they pass**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-selection.contract.test.ts packages/core/src/public-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit core parser and vocabulary**

```bash
git add packages/core/src/relay-selection.ts packages/core/src/relay-selection.contract.test.ts packages/core/src/index.ts packages/core/src/public-api.contract.test.ts
git commit -m "feat(auftakt): add relay selection vocabulary"
```

---

### Task 2: Lock Core Strategy Planning

**Files:**

- Modify: `packages/core/src/relay-selection.contract.test.ts`
- Modify: `packages/core/src/relay-selection.ts`

- [ ] **Step 1: Add failing strategy planner contract tests**

Append to `packages/core/src/relay-selection.contract.test.ts`:

```ts
import { buildRelaySelectionPlan } from './index.js';

describe('relay selection strategy planning', () => {
  it('uses only defaults for default-only unless temporary hints are explicitly allowed', () => {
    const plan = buildRelaySelectionPlan({
      intent: 'read',
      policy: { strategy: 'default-only' },
      candidates: [
        { relay: 'wss://default.example', source: 'default', role: 'read' },
        { relay: 'wss://hint.example', source: 'temporary-hint', role: 'temporary' },
        { relay: 'wss://nip65.example', source: 'nip65-read', role: 'read' }
      ]
    });

    const optInPlan = buildRelaySelectionPlan({
      intent: 'read',
      policy: { strategy: 'default-only', allowTemporaryHints: true },
      candidates: [
        { relay: 'wss://default.example', source: 'default', role: 'read' },
        { relay: 'wss://hint.example', source: 'temporary-hint', role: 'temporary' }
      ]
    });

    expect(plan).toMatchObject({
      readRelays: ['wss://default.example/'],
      temporaryRelays: []
    });
    expect(optInPlan.temporaryRelays).toEqual(['wss://hint.example/']);
  });

  it('clips conservative outbox plans through explicit budgets', () => {
    const plan = buildRelaySelectionPlan({
      intent: 'read',
      policy: {
        strategy: 'conservative-outbox',
        maxReadRelays: 2,
        maxTemporaryRelays: 1
      },
      candidates: [
        { relay: 'wss://default-a.example', source: 'default', role: 'read' },
        { relay: 'wss://default-b.example', source: 'default', role: 'read' },
        { relay: 'wss://durable.example', source: 'durable-hint', role: 'read' },
        { relay: 'wss://temporary-a.example', source: 'temporary-hint', role: 'temporary' },
        { relay: 'wss://temporary-b.example', source: 'temporary-hint', role: 'temporary' }
      ]
    });

    expect(plan.readRelays).toEqual(['wss://default-a.example/', 'wss://default-b.example/']);
    expect(plan.temporaryRelays).toEqual(['wss://temporary-a.example/']);
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        relay: 'wss://durable.example/',
        clipped: true,
        reason: 'clipped-by-policy'
      })
    );
  });

  it('strict outbox keeps full fan-out unless hard budgets are configured', () => {
    const candidates = [
      { relay: 'wss://author-a.example', source: 'nip65-write' as const, role: 'write' as const },
      { relay: 'wss://author-b.example', source: 'nip65-write' as const, role: 'write' as const },
      { relay: 'wss://audience-a.example', source: 'audience' as const, role: 'write' as const },
      { relay: 'wss://audience-b.example', source: 'audience' as const, role: 'write' as const }
    ];

    const full = buildRelaySelectionPlan({
      intent: 'reply',
      policy: { strategy: 'strict-outbox' },
      candidates
    });
    const clipped = buildRelaySelectionPlan({
      intent: 'reply',
      policy: { strategy: 'strict-outbox', maxWriteRelays: 2 },
      candidates
    });

    expect(full.writeRelays).toEqual([
      'wss://author-a.example/',
      'wss://author-b.example/',
      'wss://audience-a.example/',
      'wss://audience-b.example/'
    ]);
    expect(clipped.writeRelays).toEqual(['wss://author-a.example/', 'wss://author-b.example/']);
  });

  it('produces deterministic plans independent of input order', () => {
    const left = buildRelaySelectionPlan({
      intent: 'read',
      policy: { strategy: 'conservative-outbox', maxReadRelays: 3 },
      candidates: [
        { relay: 'wss://z.example', source: 'durable-hint', role: 'read' },
        { relay: 'wss://a.example', source: 'default', role: 'read' },
        { relay: 'wss://m.example', source: 'default', role: 'read' }
      ]
    });
    const right = buildRelaySelectionPlan({
      intent: 'read',
      policy: { strategy: 'conservative-outbox', maxReadRelays: 3 },
      candidates: [
        { relay: 'wss://m.example', source: 'default', role: 'read' },
        { relay: 'wss://z.example', source: 'durable-hint', role: 'read' },
        { relay: 'wss://a.example', source: 'default', role: 'read' }
      ]
    });

    expect(right.readRelays).toEqual(left.readRelays);
    expect(right.diagnostics).toEqual(left.diagnostics);
  });
});
```

- [ ] **Step 2: Run strategy tests and confirm failure for strict fallback behavior**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-selection.contract.test.ts
```

Expected: FAIL until the planner keeps strict fan-out and deterministic diagnostics exactly as tested.

- [ ] **Step 3: Adjust planner if needed to satisfy strict and deterministic contracts**

If the implementation from Task 1 already matches these tests, keep it unchanged. If strict plans clip because default limits were normalized incorrectly, update `normalizeRelaySelectionPolicy()` in `packages/core/src/relay-selection.ts`:

```ts
const STRICT_DEFAULT_LIMIT = Number.POSITIVE_INFINITY;

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return STRICT_DEFAULT_LIMIT;
  return Math.max(0, Math.floor(value));
}
```

If deterministic diagnostics vary by insertion order, update `sortCandidates()`:

```ts
function sortCandidates(
  candidates: readonly RelaySelectionCandidate[],
  policy: NormalizedRelaySelectionPolicy
): RelaySelectionCandidate[] {
  return [...candidates].sort((left, right) => {
    const priority = sourcePriority(policy, right.source) - sourcePriority(policy, left.source);
    if (priority !== 0) return priority;
    const roleOrder = rolePriority(left.role) - rolePriority(right.role);
    if (roleOrder !== 0) return roleOrder;
    return left.relay.localeCompare(right.relay);
  });
}

function rolePriority(role: RelaySelectionRole): number {
  if (role === 'read') return 0;
  if (role === 'write') return 1;
  return 2;
}
```

- [ ] **Step 4: Run all core relay selection tests**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-selection.contract.test.ts packages/core/src/public-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit core strategy planning**

```bash
git add packages/core/src/relay-selection.ts packages/core/src/relay-selection.contract.test.ts
git commit -m "feat(auftakt): plan relay routing strategies"
```

---

### Task 3: Add Resonote Relay Selection Input Collection

**Files:**

- Create: `packages/resonote/src/relay-selection-runtime.ts`
- Create: `packages/resonote/src/relay-selection-runtime.contract.test.ts`
- Modify: `packages/resonote/src/runtime.ts`

- [ ] **Step 1: Write failing Resonote selection runtime tests**

Create `packages/resonote/src/relay-selection-runtime.contract.test.ts`:

```ts
import type { RelaySelectionPolicyOptions, StoredEvent } from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import {
  buildPublishRelaySendOptions,
  buildReadRelayOverlay,
  RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
} from './relay-selection-runtime.js';

const policy: RelaySelectionPolicyOptions = {
  ...RESONOTE_DEFAULT_RELAY_SELECTION_POLICY,
  maxReadRelays: 4,
  maxWriteRelays: 4,
  maxTemporaryRelays: 2,
  maxAudienceRelays: 2
};

function event(overrides: Partial<StoredEvent>): StoredEvent {
  return {
    id: overrides.id ?? 'event-id',
    pubkey: overrides.pubkey ?? 'author',
    created_at: overrides.created_at ?? 1,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? ''
  };
}

function createRuntimeFixture() {
  const getRelayHints = vi.fn(async (eventId: string) =>
    eventId === 'target'
      ? [
          {
            eventId: 'target',
            relayUrl: 'wss://durable.example',
            source: 'seen' as const,
            lastSeenAt: 1
          }
        ]
      : []
  );
  const getByPubkeyAndKind = vi.fn(async (pubkey: string, kind: number) =>
    kind === 10002 && pubkey === 'alice'
      ? event({
          pubkey,
          kind,
          tags: [
            ['r', 'wss://alice-read.example', 'read'],
            ['r', 'wss://alice-write.example', 'write']
          ]
        })
      : null
  );

  return {
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        getRelayHints,
        getByPubkeyAndKind
      };
    },
    getRelayHints,
    getByPubkeyAndKind
  };
}

describe('resonote relay selection runtime', () => {
  it('builds read overlays from defaults, temporary hints, durable hints, and author relay lists', async () => {
    const runtime = createRuntimeFixture();

    const overlay = await buildReadRelayOverlay(runtime, {
      intent: 'read',
      filters: [{ ids: ['target'], authors: ['alice'] }],
      temporaryRelays: ['wss://temporary.example'],
      policy
    });

    expect(runtime.getRelayHints).toHaveBeenCalledWith('target');
    expect(runtime.getByPubkeyAndKind).toHaveBeenCalledWith('alice', 10002);
    expect(overlay).toEqual({
      relays: [
        'wss://temporary.example/',
        'wss://default.example/',
        'wss://durable.example/',
        'wss://alice-write.example/'
      ],
      includeDefaultReadRelays: false
    });
  });

  it('builds publish options from author write relays and audience hints', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: event({
        id: 'reply',
        pubkey: 'alice',
        kind: 1111,
        tags: [
          ['e', 'target', 'wss://explicit-target.example'],
          ['p', 'alice']
        ]
      }),
      policy
    });

    expect(options).toEqual({
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://durable.example/',
          'wss://explicit-target.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('uses conservative outbox as the Resonote default policy', () => {
    expect(RESONOTE_DEFAULT_RELAY_SELECTION_POLICY).toMatchObject({
      strategy: 'conservative-outbox',
      maxReadRelays: 4,
      maxWriteRelays: 4,
      maxTemporaryRelays: 2,
      maxAudienceRelays: 2
    });
  });
});
```

- [ ] **Step 2: Run Resonote selection runtime tests and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts
```

Expected: FAIL because `relay-selection-runtime.ts` does not exist.

- [ ] **Step 3: Add Resonote selection runtime helper**

Create `packages/resonote/src/relay-selection-runtime.ts`:

```ts
import {
  buildRelaySelectionPlan,
  parseNip65RelayListTags,
  relayListEntriesToSelectionCandidates,
  type RelaySelectionCandidate,
  type RelaySelectionIntent,
  type RelaySelectionPolicyOptions,
  type RelaySelectionRole,
  type StoredEvent
} from '@auftakt/core';

export const RELAY_LIST_KIND = 10002;

export const RESONOTE_DEFAULT_RELAY_SELECTION_POLICY: RelaySelectionPolicyOptions = {
  strategy: 'conservative-outbox',
  maxReadRelays: 4,
  maxWriteRelays: 4,
  maxTemporaryRelays: 2,
  maxAudienceRelays: 2
};

export interface RelaySelectionRuntime {
  getDefaultRelays?(): Promise<readonly string[]> | readonly string[];
  getEventsDB(): Promise<{
    getByPubkeyAndKind?(pubkey: string, kind: number): Promise<StoredEvent | null>;
    getRelayHints?(eventId: string): Promise<
      Array<{
        readonly eventId: string;
        readonly relayUrl: string;
        readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
        readonly lastSeenAt: number;
      }>
    >;
  }>;
}

export interface ReadRelayOverlay {
  readonly relays: readonly string[];
  readonly includeDefaultReadRelays?: boolean;
}

export interface PublishRelaySendOptions {
  readonly on?: {
    readonly relays?: readonly string[];
    readonly defaultWriteRelays?: boolean;
  };
}

export async function buildReadRelayOverlay(
  runtime: RelaySelectionRuntime,
  input: {
    readonly intent: Extract<RelaySelectionIntent, 'read' | 'subscribe' | 'repair'>;
    readonly filters: readonly Record<string, unknown>[];
    readonly temporaryRelays?: readonly string[];
    readonly policy?: RelaySelectionPolicyOptions;
  }
): Promise<ReadRelayOverlay | undefined> {
  const policy = input.policy ?? RESONOTE_DEFAULT_RELAY_SELECTION_POLICY;
  const candidates: RelaySelectionCandidate[] = [];
  candidates.push(...(await defaultCandidates(runtime, 'read')));
  candidates.push(...temporaryCandidates(input.temporaryRelays ?? []));

  const db = await runtime.getEventsDB();
  const eventIds = collectFilterStrings(input.filters, 'ids');
  for (const eventId of eventIds) {
    candidates.push(...(await durableHintCandidates(db, eventId, 'read')));
  }

  const authors = collectFilterStrings(input.filters, 'authors');
  for (const pubkey of authors) {
    candidates.push(...(await relayListCandidates(db, pubkey, 'read')));
  }

  const plan = buildRelaySelectionPlan({
    intent: input.intent,
    policy,
    candidates
  });
  const relays = [...plan.temporaryRelays, ...plan.readRelays];
  if (relays.length === 0) return undefined;

  return {
    relays,
    includeDefaultReadRelays: false
  };
}

export async function buildPublishRelaySendOptions(
  runtime: RelaySelectionRuntime,
  input: {
    readonly event: Pick<StoredEvent, 'id' | 'pubkey' | 'kind' | 'tags'>;
    readonly policy?: RelaySelectionPolicyOptions;
  }
): Promise<PublishRelaySendOptions | undefined> {
  const policy = input.policy ?? RESONOTE_DEFAULT_RELAY_SELECTION_POLICY;
  const db = await runtime.getEventsDB();
  const candidates: RelaySelectionCandidate[] = [];

  candidates.push(...(await defaultCandidates(runtime, 'write')));
  candidates.push(...(await relayListCandidates(db, input.event.pubkey, 'write')));

  for (const eventId of collectTagValues(input.event.tags, new Set(['e', 'q']))) {
    candidates.push(...(await durableHintCandidates(db, eventId, 'write')));
  }
  for (const relay of collectExplicitRelayHints(input.event.tags)) {
    candidates.push({ relay, source: 'audience', role: 'write' });
  }
  for (const pubkey of collectTagValues(input.event.tags, new Set(['p']))) {
    candidates.push(...(await relayListCandidates(db, pubkey, 'write')));
  }

  const plan = buildRelaySelectionPlan({
    intent: publishIntentForKind(input.event.kind, input.event.tags),
    policy,
    candidates
  });
  const relays = [...plan.writeRelays, ...plan.temporaryRelays];
  if (relays.length === 0) return undefined;

  return {
    on: {
      relays,
      defaultWriteRelays: false
    }
  };
}

async function defaultCandidates(
  runtime: RelaySelectionRuntime,
  role: RelaySelectionRole
): Promise<RelaySelectionCandidate[]> {
  const defaults = runtime.getDefaultRelays ? await runtime.getDefaultRelays() : [];
  return [...defaults].map((relay) => ({ relay, source: 'default' as const, role }));
}

function temporaryCandidates(relays: readonly string[]): RelaySelectionCandidate[] {
  return relays.map((relay) => ({ relay, source: 'temporary-hint' as const, role: 'temporary' }));
}

async function durableHintCandidates(
  db: Awaited<ReturnType<RelaySelectionRuntime['getEventsDB']>>,
  eventId: string,
  role: RelaySelectionRole
): Promise<RelaySelectionCandidate[]> {
  const hints = (await db.getRelayHints?.(eventId)) ?? [];
  return hints.map((hint) => ({ relay: hint.relayUrl, source: 'durable-hint' as const, role }));
}

async function relayListCandidates(
  db: Awaited<ReturnType<RelaySelectionRuntime['getEventsDB']>>,
  pubkey: string,
  role: Extract<RelaySelectionRole, 'read' | 'write'>
): Promise<RelaySelectionCandidate[]> {
  const relayList = await db.getByPubkeyAndKind?.(pubkey, RELAY_LIST_KIND);
  const entries = relayList ? parseNip65RelayListTags(relayList.tags) : [];
  const candidates = relayListEntriesToSelectionCandidates(entries);
  return candidates.filter((candidate) => candidate.role === role);
}

function collectFilterStrings(filters: readonly Record<string, unknown>[], key: string): string[] {
  const values = new Set<string>();
  for (const filter of filters) {
    const raw = filter[key];
    if (!Array.isArray(raw)) continue;
    for (const value of raw) {
      if (typeof value === 'string') values.add(value);
    }
  }
  return [...values].sort();
}

function collectTagValues(tags: readonly (readonly string[])[], names: Set<string>): string[] {
  const values = new Set<string>();
  for (const tag of tags) {
    if (!names.has(tag[0] ?? '') || typeof tag[1] !== 'string') continue;
    values.add(tag[1]);
  }
  return [...values].sort();
}

function collectExplicitRelayHints(tags: readonly (readonly string[])[]): string[] {
  const values = new Set<string>();
  for (const tag of tags) {
    if ((tag[0] === 'e' || tag[0] === 'q' || tag[0] === 'p') && typeof tag[2] === 'string') {
      values.add(tag[2]);
    }
  }
  return [...values].sort();
}

function publishIntentForKind(
  kind: number,
  tags: readonly (readonly string[])[]
): Extract<RelaySelectionIntent, 'publish' | 'reply' | 'reaction' | 'mention'> {
  if (kind === 7) return 'reaction';
  if (tags.some((tag) => tag[0] === 'e' || tag[0] === 'q')) return 'reply';
  if (tags.some((tag) => tag[0] === 'p')) return 'mention';
  return 'publish';
}
```

- [ ] **Step 4: Extend runtime type surfaces for default relays and durable hints**

Modify `CoordinatorReadRuntime.getEventsDB()` and `ResonoteRuntime.getEventsDB()` in `packages/resonote/src/runtime.ts` to include:

```ts
getRelayHints?(eventId: string): Promise<
  Array<{
    readonly eventId: string;
    readonly relayUrl: string;
    readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
    readonly lastSeenAt: number;
  }>
>;
```

Modify `CoordinatorReadRuntime` and `ResonoteRuntime` in the same file to include:

```ts
getDefaultRelays?(): Promise<readonly string[]> | readonly string[];
```

- [ ] **Step 5: Run the Resonote selection runtime test**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Resonote selection input collection**

```bash
git add packages/resonote/src/relay-selection-runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/runtime.ts
git commit -m "feat(auftakt): collect relay selection inputs"
```

---

### Task 4: Route Reads And Subscriptions Through Selection Plans

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/relay-selection-runtime.contract.test.ts`
- Modify: `packages/resonote/src/subscription-visibility.contract.test.ts`

- [ ] **Step 1: Add failing read routing contract test**

Append to `packages/resonote/src/relay-selection-runtime.contract.test.ts`:

```ts
import { createResonoteCoordinator } from './runtime.js';

describe('coordinator read relay selection integration', () => {
  it('routes by-id reads through selected relays when no explicit overlay is supplied', async () => {
    const createdRequests: Array<{ options: unknown; emitted: unknown[] }> = [];
    const runtime = {
      async fetchLatestEvent() {
        return null;
      },
      async getDefaultRelays() {
        return ['wss://default.example'];
      },
      async getEventsDB() {
        return {
          getByPubkeyAndKind: async () => null,
          getManyByPubkeysAndKind: async () => [],
          getByReplaceKey: async () => null,
          getByTagValue: async () => [],
          getById: async () => null,
          getAllByKind: async () => [],
          listNegentropyEventRefs: async () => [],
          getRelayHints: async () => [
            {
              eventId: 'target',
              relayUrl: 'wss://durable.example',
              source: 'seen' as const,
              lastSeenAt: 1
            }
          ],
          deleteByIds: async () => {},
          clearAll: async () => {},
          put: async () => true,
          putWithReconcile: async () => ({ stored: true, emissions: [] })
        };
      },
      async getRelaySession() {
        return {
          use(req: { emit(input: unknown): void }, options: unknown) {
            const entry = { options, emitted: [] as unknown[] };
            createdRequests.push(entry);
            return {
              subscribe(observer: { complete?: () => void }) {
                queueMicrotask(() => observer.complete?.());
                return { unsubscribe() {} };
              }
            };
          }
        };
      },
      createBackwardReq() {
        return {
          emit(input: unknown) {
            createdRequests.at(-1)?.emitted.push(input);
          },
          over() {}
        };
      },
      createForwardReq() {
        return { emit() {}, over() {} };
      },
      uniq: () => ({}) as unknown,
      merge: () => ({}) as unknown,
      getRelayConnectionState: async () => null,
      observeRelayConnectionStates: async () => ({ unsubscribe() {} })
    };

    const coordinator = createResonoteCoordinator({
      runtime,
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned: async () => {} },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.fetchNostrEventById('target', []);

    expect(createdRequests[0]?.options).toEqual({
      on: {
        relays: ['wss://default.example/', 'wss://durable.example/'],
        defaultReadRelays: false
      }
    });
  });
});
```

- [ ] **Step 2: Run the focused read routing test and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts
```

Expected: FAIL because `fetchBackwardEventsFromReadRuntime()` does not yet resolve selection overlays.

- [ ] **Step 3: Resolve selection overlays before coordinator reads**

Modify imports in `packages/resonote/src/runtime.ts`:

```ts
import {
  buildPublishRelaySendOptions,
  buildReadRelayOverlay,
  RESONOTE_DEFAULT_RELAY_SELECTION_POLICY,
  type PublishRelaySendOptions
} from './relay-selection-runtime.js';
```

Modify `fetchBackwardEventsFromReadRuntime()`:

```ts
async function fetchBackwardEventsFromReadRuntime<TEvent>(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent[]> {
  const resolvedOptions = await resolveReadOptions(runtime, filters, options, 'read');
  const coordinator = createRuntimeEventCoordinator(runtime, resolvedOptions);
  const result = await coordinator.read([...filters], { policy: 'localFirst' });

  if (resolvedOptions?.rejectOnError && result.settlement.phase !== 'settled') {
    throw new Error('Relay read did not settle');
  }

  return result.events as TEvent[];
}
```

Add this helper near `fetchBackwardEventsFromReadRuntime()`:

```ts
async function resolveReadOptions(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options: FetchBackwardOptions | undefined,
  intent: 'read' | 'subscribe' | 'repair'
): Promise<FetchBackwardOptions | undefined> {
  if (options?.overlay) return options;

  const overlay = await buildReadRelayOverlay(runtime, {
    intent,
    filters,
    policy: RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
  });

  if (!overlay) return options;
  return {
    ...options,
    overlay
  };
}
```

- [ ] **Step 4: Route subscription registry entries through selection before transport use**

In `CoordinatorSubscriptionRegistry.ensureEntryStarted()` in `packages/resonote/src/runtime.ts`, replace the direct transport subscription setup with:

```ts
void this.getRawSession().then(async (session) => {
  if (!this.entries.has(entry.entryKey) || entry.consumerCount === 0) {
    return;
  }

  const resolvedUseOptions =
    entry.useOptions ??
    (await buildReadRelayOverlay(this.runtime as unknown as CoordinatorReadRuntime, {
      intent: 'subscribe',
      filters: entry.filters,
      policy: RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
    }).then((overlay) =>
      overlay
        ? {
            on: {
              relays: overlay.relays,
              defaultReadRelays: overlay.includeDefaultReadRelays ?? false
            }
          }
        : undefined
    ));

  entry.transportSubscription = session.use(entry.transportRequest, resolvedUseOptions).subscribe({
    next: (packet) => {
      for (const consumer of entry.consumers) {
        consumer.observer.next?.(packet);
      }
    },
    error: (error) => {
      for (const consumer of entry.consumers) {
        consumer.entryKey = null;
        consumer.observer.error?.(error);
      }
      this.finishEntry(entry.entryKey);
    },
    complete: () => {
      for (const consumer of entry.consumers) {
        consumer.entryKey = null;
        consumer.observer.complete?.();
      }
      this.finishEntry(entry.entryKey);
    }
  });

  for (const filter of entry.filters) {
    entry.transportRequest.emit(filter);
  }
  if (entry.mode === 'backward') {
    entry.transportRequest.over();
  }
});
```

- [ ] **Step 5: Run read and subscription tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/subscription-visibility.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit read and subscription routing**

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/subscription-visibility.contract.test.ts
git commit -m "feat(auftakt): route reads through relay selection"
```

---

### Task 5: Route Publish, Reply, Reaction, And Mention Through Selection

**Files:**

- Create: `packages/resonote/src/relay-routing-publish.contract.test.ts`
- Modify: `packages/resonote/src/runtime.ts`
- Modify: `src/shared/nostr/client.ts`
- Modify: `src/shared/auftakt/resonote.ts`

- [ ] **Step 1: Write failing coordinator publish routing test**

Create `packages/resonote/src/relay-routing-publish.contract.test.ts`:

```ts
import type { EventParameters, Event as NostrEvent } from 'nostr-typedef';
import { describe, expect, it, vi } from 'vitest';

import { createResonoteCoordinator } from './runtime.js';

function createRuntime() {
  return {
    async fetchLatestEvent() {
      return null;
    },
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        getByPubkeyAndKind: async (pubkey: string, kind: number) =>
          pubkey === 'alice' && kind === 10002
            ? {
                id: 'relay-list',
                pubkey,
                created_at: 1,
                kind,
                tags: [['r', 'wss://alice-write.example', 'write']],
                content: ''
              }
            : null,
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async () => null,
        getByTagValue: async () => [],
        getById: async () => null,
        getAllByKind: async () => [],
        listNegentropyEventRefs: async () => [],
        getRelayHints: async (eventId: string) =>
          eventId === 'target'
            ? [
                {
                  eventId,
                  relayUrl: 'wss://target-seen.example',
                  source: 'seen' as const,
                  lastSeenAt: 1
                }
              ]
            : [],
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async () => ({ stored: true, emissions: [] })
      };
    },
    async getRelaySession() {
      return { use: () => ({ subscribe: () => ({ unsubscribe() {} }) }) };
    },
    createBackwardReq: () => ({ emit() {}, over() {} }),
    createForwardReq: () => ({ emit() {}, over() {} }),
    uniq: () => ({}) as unknown,
    merge: () => ({}) as unknown,
    getRelayConnectionState: async () => null,
    observeRelayConnectionStates: async () => ({ unsubscribe() {} })
  };
}

describe('coordinator publish relay routing', () => {
  it('passes selected author and audience relays to publish transport', async () => {
    const castSigned = vi.fn(async () => {});
    const event = {
      id: 'reply',
      pubkey: 'alice',
      created_at: 10,
      kind: 1111,
      tags: [['e', 'target', 'wss://explicit-target.example']],
      content: 'reply',
      sig: 'sig'
    } satisfies NostrEvent;

    const coordinator = createResonoteCoordinator({
      runtime: createRuntime(),
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.publishSignedEvent(event as EventParameters);

    expect(castSigned).toHaveBeenCalledWith(event, {
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://target-seen.example/',
          'wss://explicit-target.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });
});
```

- [ ] **Step 2: Run publish routing test and confirm failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-routing-publish.contract.test.ts
```

Expected: FAIL because `castSigned()` does not accept or receive relay routing options.

- [ ] **Step 3: Add publish transport relay option types and helper routing**

Modify `packages/resonote/src/runtime.ts` near `PublishRuntime`:

```ts
export type PublishTransportOptions = PublishRelaySendOptions;

export interface PublishRuntime {
  castSigned(params: EventParameters, options?: PublishTransportOptions): Promise<void>;
  observePublishAcks?(
    event: RetryableSignedEvent,
    onAck: (packet: PublishAckPacket) => Promise<void> | void
  ): Promise<void>;
  retryPendingPublishes(): Promise<void>;
  publishSignedEvent(params: EventParameters): Promise<void>;
  publishSignedEvents(params: EventParameters[]): Promise<void>;
}
```

Modify `publishSignedEventWithOfflineFallback()`:

```ts
export async function publishSignedEventWithOfflineFallback(
  runtime: Pick<PublishRuntime, 'castSigned' | 'observePublishAcks'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'addPendingPublish'>,
  event: EventParameters | RetryableSignedEvent,
  hints?: PublishHintRecorder,
  options?: PublishTransportOptions
): Promise<void> {
  try {
    await runtime.castSigned(event, options);
  } catch (error) {
    const pending = toRetryableSignedEvent(event);
    if (pending) await queueRuntime.addPendingPublish(pending);
    throw error;
  }

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
}
```

Modify `publishSignedEventsWithOfflineFallback()`:

```ts
export async function publishSignedEventsWithOfflineFallback(
  runtime: Pick<PublishRuntime, 'castSigned' | 'observePublishAcks'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'addPendingPublish'>,
  events: Array<EventParameters | RetryableSignedEvent>,
  hints?: PublishHintRecorder,
  buildOptions?: (
    event: EventParameters | RetryableSignedEvent
  ) => Promise<PublishTransportOptions | undefined>
): Promise<void> {
  if (events.length === 0) return;

  await Promise.allSettled(
    events.map(async (event) =>
      publishSignedEventWithOfflineFallback(
        runtime,
        queueRuntime,
        event,
        hints,
        buildOptions ? await buildOptions(event) : undefined
      )
    )
  );
}
```

- [ ] **Step 4: Route coordinator publish methods through `buildPublishRelaySendOptions()`**

In `createResonoteCoordinator()` return object in `packages/resonote/src/runtime.ts`, replace `publishSignedEvent` and `publishSignedEvents` with:

```ts
publishSignedEvent: async (params) =>
  publishSignedEventWithOfflineFallback(
    publishTransportRuntime,
    pendingPublishQueueRuntime,
    params,
    publishHintRecorder,
    await buildPublishRelaySendOptions(runtime, {
      event: params as StoredEvent,
      policy: RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
    })
  ),
publishSignedEvents: (params) =>
  publishSignedEventsWithOfflineFallback(
    publishTransportRuntime,
    pendingPublishQueueRuntime,
    params,
    publishHintRecorder,
    async (event) =>
      buildPublishRelaySendOptions(runtime, {
        event: event as StoredEvent,
        policy: RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
      })
  ),
```

- [ ] **Step 5: Pass relay options through shared client publish transport**

Modify `src/shared/nostr/client.ts`:

```ts
interface RelayPublishOptions {
  readonly on?: {
    readonly relays?: readonly string[];
    readonly defaultWriteRelays?: boolean;
  };
}

export async function getDefaultRelayUrls(): Promise<string[]> {
  const instance = await getRelaySession();
  return Object.keys(instance.getDefaultRelays());
}

export async function castSigned(
  params: EventParameters,
  options?: { successThreshold?: number } & RelayPublishOptions
): Promise<void> {
  const threshold = options?.successThreshold ?? 0.5;
  const instance = await getRelaySession();
  const relayCount = Object.keys(instance.getDefaultRelays()).length;
  const targetRelayCount = options?.on?.relays?.length ?? relayCount;
  const needed = Math.max(1, Math.ceil(targetRelayCount * threshold));

  return new Promise<void>((resolve, reject) => {
    let okCount = 0;
    let resolved = false;

    const sub = instance
      .send(params, {
        signer: nip07Signer(),
        on: options?.on
          ? {
              relays: options.on.relays ? [...options.on.relays] : undefined,
              defaultWriteRelays: options.on.defaultWriteRelays
            }
          : undefined
      })
      .subscribe({
        next: (packet) => {
          const history = publishAckHistory.get(packet.eventId) ?? [];
          history.push({ eventId: packet.eventId, relayUrl: packet.from, ok: packet.ok });
          publishAckHistory.set(packet.eventId, history);
          if (packet.ok) okCount++;
          if (!resolved && okCount >= needed) {
            resolved = true;
            sub.unsubscribe();
            resolve();
          }
        },
        error: (err) => {
          if (!resolved) {
            resolved = true;
            sub.unsubscribe();
            reject(err);
          }
        },
        complete: () => {
          if (!resolved) {
            resolved = true;
            sub.unsubscribe();
            if (okCount > 0) resolve();
            else reject(new Error('All relays rejected the event'));
          }
        }
      });
  });
}
```

Modify `src/shared/auftakt/resonote.ts` imports:

```ts
import {
  castSigned as castSignedImpl,
  fetchLatestEvent as fetchLatestEventImpl,
  getDefaultRelayUrls,
  getRelayConnectionState as getRelayConnectionStateImpl,
  getRelaySession,
  observePublishAcks as observePublishAcksImpl,
  observeRelayConnectionStates as observeRelayConnectionStatesImpl,
  setDefaultRelays as setDefaultRelaysImpl
} from '$shared/nostr/client.js';
```

Modify the `runtime` object:

```ts
getDefaultRelays: () => getDefaultRelayUrls(),
```

Modify the `publishTransportRuntime` object:

```ts
const publishTransportRuntime = {
  castSigned: (params: EventParameters, options?: Parameters<typeof castSignedImpl>[1]) =>
    castSignedImpl(params, options),
  observePublishAcks: observePublishAcksImpl
};
```

- [ ] **Step 6: Run publish routing and shared client tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-routing-publish.contract.test.ts src/shared/nostr/client.test.ts src/features/relays/application/relay-actions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit publish routing**

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/relay-routing-publish.contract.test.ts src/shared/nostr/client.ts src/shared/auftakt/resonote.ts
git commit -m "feat(auftakt): route publishes through relay selection"
```

---

### Task 6: Close Public Surface And Verification Gaps

**Files:**

- Modify: `packages/resonote/src/public-api.contract.test.ts`
- Modify: `packages/resonote/src/plugin-isolation.contract.test.ts`
- Modify: `packages/resonote/src/plugin-api.contract.test.ts`
- Modify: `docs/auftakt/status-verification.md`

- [ ] **Step 1: Add public surface assertions for routing closure**

Modify `packages/resonote/src/public-api.contract.test.ts` by extending the forbidden list in `does not expose raw request-style runtime API names`:

```ts
const forbidden = [
  /^createBackwardReq$/,
  /^createForwardReq$/,
  /^getRelaySession$/,
  /^useReq/i,
  /^rawRequest/i,
  /^relayRequest/i,
  /^getRelayHints$/,
  /^recordRelayHint$/,
  /^buildReadRelayOverlay$/,
  /^buildPublishRelaySendOptions$/
];
```

Add this assertion to the same test:

```ts
expect(exportNames).not.toContain('RESONOTE_DEFAULT_RELAY_SELECTION_POLICY');
```

- [ ] **Step 2: Keep plugin APIs free of routing handles**

Modify expected plugin API keys in `packages/resonote/src/plugin-isolation.contract.test.ts` and `packages/resonote/src/plugin-api.contract.test.ts` only if the implementation accidentally adds routing keys. The expected keys must remain:

```ts
expect(observedKeys[0]).toEqual([
  'apiVersion',
  'registerFlow',
  'registerProjection',
  'registerReadModel'
]);
```

If a test fixture needs new runtime stubs because `getDefaultRelays` is required in a local helper, keep it optional or add:

```ts
getDefaultRelays: async () => ['wss://default.contract.test'],
```

- [ ] **Step 3: Update NIP-65 proof notes**

Modify the NIP-65 note in `docs/auftakt/status-verification.md` to include the new core and Resonote routing proofs:

```md
- **NIP-65** は `packages/core/src/relay-selection.contract.test.ts` を
  parser / strategy proof、`packages/resonote/src/relay-selection-runtime.contract.test.ts`
  を coordinator input proof、`src/features/relays/application/relay-actions.test.ts`
  を write proof、`src/shared/browser/relays-fetch.test.ts` を read proof
  として分離し、kind:3 fallback は `kind:10002` に relay entry がない場合に限る
  bounded behavior として扱う。
```

- [ ] **Step 4: Run focused package and facade tests**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-selection.contract.test.ts packages/core/src/public-api.contract.test.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/plugin-api.contract.test.ts src/shared/nostr/client.test.ts src/features/relays/application/relay-actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full Auftakt gates**

Run:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: all commands PASS.

- [ ] **Step 6: Commit closure and docs**

```bash
git add packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/plugin-api.contract.test.ts docs/auftakt/status-verification.md
git commit -m "test(auftakt): lock relay routing closure"
```

---

## Self-Review

Spec coverage:

- Core NIP-65 ownership is covered by Tasks 1 and 2.
- Strategy presets, budgets, default-only, conservative, and strict fan-out are covered by Task 2.
- Resonote input collection is covered by Task 3.
- Read, subscription, and repair-interoperable overlays are covered by Task 4.
- Publish, reply, reaction, and mention audience routing are covered by Task 5.
- Public surface and plugin closure are covered by Task 6.
- Existing capability queue and lifecycle behavior remain untouched except for using selected relays as existing session options.

Red-flag wording scan:

- No task uses unfinished-work markers, unspecified edge handling, or generic
  test instructions without concrete test code.

Type consistency:

- Core public names are `RelaySelectionPolicyOptions`, `RelaySelectionCandidate`, `buildRelaySelectionPlan()`, `parseNip65RelayListTags()`, and `relayListEntriesToSelectionCandidates()`.
- Resonote integration names are `buildReadRelayOverlay()`, `buildPublishRelaySendOptions()`, and `RESONOTE_DEFAULT_RELAY_SELECTION_POLICY`.
- Publish routing uses `PublishRelaySendOptions` through `PublishTransportOptions` and passes the existing relay session `on.relays` / `defaultWriteRelays` shape.
