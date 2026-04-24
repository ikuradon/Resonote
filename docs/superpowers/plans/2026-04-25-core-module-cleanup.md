# Core Module Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the remaining oversized `@auftakt/core` request-planning module into focused responsibility modules and make the package root export list explicit.

**Architecture:** Keep `@auftakt/core` as the only public entrypoint and preserve all currently consumed public names. Move existing implementation without behavior changes from `request-planning.ts` into `settlement.ts`, `reconcile.ts`, `relay-request.ts`, and `negentropy.ts`, then replace `index.ts` broad re-exports with explicit named exports.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, `@auftakt/core` package-root exports.

---

## File Structure

- `packages/core/src/module-boundary.contract.test.ts`
  - New contract test that proves the cleanup landed: no core module is an empty `export {};` stub, `request-planning.ts` no longer owns lower-level primitives, and `index.ts` no longer uses `export *`.
- `packages/core/src/settlement.ts`
  - Owns `ReadSettlementReducerInput` and `reduceReadSettlement`.
- `packages/core/src/reconcile.ts`
  - Owns reconcile emission types and reconcile helper functions.
- `packages/core/src/relay-request.ts`
  - Owns generic relay request filter/request-key/optimizer plan types and functions.
- `packages/core/src/negentropy.ts`
  - Owns negentropy repair reference filtering and negentropy repair request-key helper.
- `packages/core/src/request-planning.ts`
  - Keeps timeline helpers, brownfield runtime abstractions, cache/fetch helpers, and subscription orchestration. Imports lower-level primitives from the focused modules.
- `packages/core/src/index.ts`
  - Explicit public export list grouped by module. No `export *`.

---

### Task 1: Add Module Boundary Contract

**Files:**
- Create: `packages/core/src/module-boundary.contract.test.ts`
- Test: `packages/core/src/module-boundary.contract.test.ts`

- [ ] **Step 1: Write the failing boundary test**

Create `packages/core/src/module-boundary.contract.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));

function readCoreFile(name: string): string {
  return readFileSync(resolve(currentDir, name), 'utf8');
}

function stripCommentsAndWhitespace(source: string): string {
  return source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, '');
}

describe('@auftakt/core module boundaries', () => {
  it('does not leave focused core modules as empty export stubs', () => {
    for (const filename of ['negentropy.ts', 'reconcile.ts', 'relay-request.ts', 'settlement.ts']) {
      expect(stripCommentsAndWhitespace(readCoreFile(filename))).not.toBe('export{};');
    }
  });

  it('keeps request-planning focused on higher-level runtime composition', () => {
    const source = readCoreFile('request-planning.ts');

    expect(source).not.toMatch(/export interface ReadSettlementReducerInput/);
    expect(source).not.toMatch(/export function reduceReadSettlement/);
    expect(source).not.toMatch(/export interface ReconcileEmission/);
    expect(source).not.toMatch(/export function reconcileReplaceableCandidates/);
    expect(source).not.toMatch(/export type NegentropyEventRef/);
    expect(source).not.toMatch(/export function createNegentropyRepairRequestKey/);
    expect(source).not.toMatch(/export function buildRequestExecutionPlan/);
  });

  it('uses explicit package-root exports instead of wildcard re-exports', () => {
    const source = readCoreFile('index.ts');

    expect(source).not.toMatch(/export\s+\*\s+from/);
    expect(source).toContain("from './settlement.js'");
    expect(source).toContain("from './reconcile.js'");
    expect(source).toContain("from './relay-request.js'");
    expect(source).toContain("from './negentropy.js'");
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
pnpm exec vitest run packages/core/src/module-boundary.contract.test.ts
```

Expected: FAIL. The first failure should report that at least one of the focused files is still `export {};`, and the wildcard export assertion should fail while `index.ts` still uses `export *`.

- [ ] **Step 3: Commit the failing contract**

Run:

```bash
git add packages/core/src/module-boundary.contract.test.ts
git commit -m "test(core): lock module boundary cleanup"
```

Expected: commit succeeds with only the new contract test staged.

---

### Task 2: Move Settlement and Reconcile Helpers

**Files:**
- Modify: `packages/core/src/settlement.ts`
- Modify: `packages/core/src/reconcile.ts`
- Modify: `packages/core/src/request-planning.ts`
- Test: `packages/core/src/read-settlement.contract.test.ts`
- Test: `packages/core/src/reconcile.contract.test.ts`
- Test: `packages/core/src/module-boundary.contract.test.ts`

- [ ] **Step 1: Move settlement implementation into `settlement.ts`**

Copy the existing `ReadSettlementReducerInput` interface and `reduceReadSettlement` function from `packages/core/src/request-planning.ts` into `packages/core/src/settlement.ts`.

`packages/core/src/settlement.ts` should start with:

```ts
import type {
  ReadSettlement,
  ReadSettlementLocalProvenance
} from './vocabulary.js';

export interface ReadSettlementReducerInput {
  readonly localSettled: boolean;
  readonly relaySettled: boolean;
  readonly relayRequired?: boolean;
  readonly localHitProvenance?: ReadSettlementLocalProvenance | null;
  readonly relayHit?: boolean;
  readonly nullTtlHit?: boolean;
  readonly invalidatedDuringFetch?: boolean;
}

export function reduceReadSettlement(input: ReadSettlementReducerInput): ReadSettlement {
  if (input.invalidatedDuringFetch === true) {
    return {
      phase: 'settled',
      provenance: 'none',
      reason: 'invalidated-during-fetch'
    };
  }

  if (input.nullTtlHit === true) {
    return {
      phase: 'settled',
      provenance: 'none',
      reason: 'null-ttl-hit'
    };
  }

  const relayRequired = input.relayRequired ?? true;
  const relaySettled = relayRequired ? input.relaySettled : true;

  const phase: ReadSettlement['phase'] =
    input.localSettled === false && relaySettled === false
      ? 'pending'
      : relaySettled === false
        ? 'partial'
        : 'settled';

  const localHitProvenance = input.localHitProvenance ?? null;
  const relayHit = input.relayHit ?? false;
  const localHit = localHitProvenance !== null;

  const provenance: ReadSettlement['provenance'] = relayHit
    ? localHit
      ? 'mixed'
      : 'relay'
    : localHit
      ? localHitProvenance
      : 'none';

  const reason: ReadSettlement['reason'] = relayHit
    ? 'relay-repair'
    : localHit
      ? 'cache-hit'
      : phase === 'settled'
        ? 'settled-miss'
        : 'cache-miss';

  return {
    phase,
    provenance,
    reason
  };
}
```

- [ ] **Step 2: Move reconcile implementation into `reconcile.ts`**

Copy the existing reconcile types and functions from `packages/core/src/request-planning.ts` into `packages/core/src/reconcile.ts`.

`packages/core/src/reconcile.ts` should contain these public declarations:

```ts
import type { ConsumerVisibleState, ReconcileReasonCode } from './vocabulary.js';

export interface ReconcileEmission {
  readonly subjectId: string;
  readonly reason: ReconcileReasonCode;
  readonly state: ConsumerVisibleState;
}

export interface ReplaceableCandidate {
  readonly id: string;
  readonly created_at: number;
}

export interface DeletionEventLike {
  readonly pubkey: string;
  readonly tags: string[][];
}

export interface DeletionReconcileResult {
  readonly verifiedTargetIds: string[];
  readonly emissions: ReconcileEmission[];
}

export type OfflineDeliveryDecision = 'confirmed' | 'retrying' | 'rejected';
```

Move the existing bodies for:

```ts
export function mapReasonToConsumerState(reason: ReconcileReasonCode): ConsumerVisibleState;
export function emitReconcile(subjectId: string, reason: ReconcileReasonCode): ReconcileEmission;
export function reconcileReplaceableCandidates(
  existing: ReplaceableCandidate | null,
  incoming: ReplaceableCandidate
): ReconcileEmission[];
export function reconcileDeletionSubjects(subjectIds: readonly string[]): ReconcileEmission[];
export function extractDeletionTargetIds(event: Pick<DeletionEventLike, 'tags'>): string[];
export function verifyDeletionTargets(
  event: DeletionEventLike,
  eventPubkeys: ReadonlyMap<string, string>
): string[];
export function reconcileDeletionTargets(
  event: DeletionEventLike,
  eventPubkeys: ReadonlyMap<string, string>
): DeletionReconcileResult;
export function reconcileReplayRepairSubjects(
  subjectIds: readonly string[],
  reason?: Extract<
    ReconcileReasonCode,
    'repaired-replay' | 'repaired-negentropy' | 'restored-replay'
  >
): ReconcileEmission[];
export function reconcileNegentropyRepairSubjects(subjectIds: readonly string[]): ReconcileEmission[];
export function reconcileOfflineDelivery(
  subjectId: string,
  decision: OfflineDeliveryDecision
): ReconcileEmission;
```

- [ ] **Step 3: Remove moved settlement/reconcile definitions from `request-planning.ts`**

Delete these exported declarations from `packages/core/src/request-planning.ts`:

```ts
ReadSettlementReducerInput
reduceReadSettlement
ReconcileEmission
ReplaceableCandidate
DeletionEventLike
DeletionReconcileResult
OfflineDeliveryDecision
mapReasonToConsumerState
emitReconcile
reconcileReplaceableCandidates
reconcileDeletionSubjects
extractDeletionTargetIds
verifyDeletionTargets
reconcileDeletionTargets
reconcileReplayRepairSubjects
reconcileNegentropyRepairSubjects
reconcileOfflineDelivery
```

Also remove now-unused imports of these vocabulary types from the top of `request-planning.ts`:

```ts
ConsumerVisibleState
ReadSettlement
ReadSettlementLocalProvenance
ReconcileReasonCode
```

- [ ] **Step 4: Run settlement and reconcile tests**

Run:

```bash
pnpm exec vitest run \
  packages/core/src/read-settlement.contract.test.ts \
  packages/core/src/reconcile.contract.test.ts \
  packages/core/src/module-boundary.contract.test.ts
```

Expected: `read-settlement.contract.test.ts` and `reconcile.contract.test.ts` PASS. `module-boundary.contract.test.ts` may still FAIL because `negentropy.ts`, `relay-request.ts`, and `index.ts` are not done yet.

- [ ] **Step 5: Commit settlement and reconcile split**

Run:

```bash
git add packages/core/src/settlement.ts packages/core/src/reconcile.ts packages/core/src/request-planning.ts
git commit -m "refactor(core): split settlement and reconcile modules"
```

Expected: commit succeeds with the two focused modules populated.

---

### Task 3: Move Relay Request and Negentropy Helpers

**Files:**
- Modify: `packages/core/src/relay-request.ts`
- Modify: `packages/core/src/negentropy.ts`
- Modify: `packages/core/src/request-planning.ts`
- Test: `packages/core/src/request-key.contract.test.ts`
- Test: `packages/core/src/request-planning.contract.test.ts`
- Test: `packages/core/src/negentropy-repair.contract.test.ts`
- Test: `packages/core/src/module-boundary.contract.test.ts`

- [ ] **Step 1: Move request-key and optimizer primitives into `relay-request.ts`**

Copy these existing declarations and helper functions from `packages/core/src/request-planning.ts` into `packages/core/src/relay-request.ts`:

```ts
import type { LogicalRequestDescriptor, RequestKey } from './vocabulary.js';

export type Filter = Record<string, unknown>;

export interface RelayReadOverlayOptions {
  readonly relays: readonly string[];
  readonly includeDefaultReadRelays?: boolean;
}

export interface FetchBackwardOptions {
  readonly overlay?: RelayReadOverlayOptions;
  readonly timeoutMs?: number;
  readonly rejectOnError?: boolean;
}

export interface RuntimeRequestDescriptorOptions {
  readonly mode: 'backward' | 'forward';
  readonly filters: readonly Filter[];
  readonly overlay?: RelayReadOverlayOptions;
  readonly scope?: string;
}

export interface RequestExecutionPlanOptions extends RuntimeRequestDescriptorOptions {
  readonly requestKey?: RequestKey;
  readonly coalescingScope?: string;
}

export interface RequestOptimizerCapabilities {
  readonly maxFiltersPerShard?: number | null;
  readonly maxSubscriptions?: number | null;
}

export interface OptimizedRequestShard {
  readonly shardIndex: number;
  readonly shardKey: string;
  readonly filters: readonly Filter[];
}

export interface OptimizedLogicalRequestPlan {
  readonly descriptor: LogicalRequestDescriptor;
  readonly requestKey: RequestKey;
  readonly logicalKey: string;
  readonly shards: readonly OptimizedRequestShard[];
  readonly capabilities: RequestOptimizerCapabilities;
}

export const REPAIR_REQUEST_COALESCING_SCOPE = 'timeline:repair';
```

Move the existing bodies for these non-exported helpers as well:

```ts
stableSortStrings
normalizePrimitiveArray
normalizeObjectEntries
normalizeValue
splitSelectorAndWindow
toStableJson
hashRequestDescriptor
normalizeTransportFilters
stableSortFilters
resolveMaxFiltersPerShard
```

Move the existing public functions:

```ts
export function buildLogicalRequestDescriptor(
  options: RuntimeRequestDescriptorOptions
): LogicalRequestDescriptor;

export function createRuntimeRequestKey(options: RuntimeRequestDescriptorOptions): RequestKey;

export function buildRequestExecutionPlan(
  options: RequestExecutionPlanOptions,
  capabilities?: RequestOptimizerCapabilities
): OptimizedLogicalRequestPlan;
```

- [ ] **Step 2: Move negentropy repair helpers into `negentropy.ts`**

Copy the existing negentropy ref type, filter helpers, and repair request-key helper from `packages/core/src/request-planning.ts` into `packages/core/src/negentropy.ts`.

`packages/core/src/negentropy.ts` should start with:

```ts
import type { StoredEvent } from './vocabulary.js';
import { createRuntimeRequestKey, type Filter } from './relay-request.js';
import type { RequestKey } from './vocabulary.js';

export type NegentropyEventRef = Pick<
  StoredEvent,
  'id' | 'pubkey' | 'created_at' | 'kind' | 'tags'
>;
```

Move the existing bodies for:

```ts
function sortNegentropyEventRefsDesc<TEvent extends NegentropyEventRef>(
  events: readonly TEvent[]
): TEvent[];

export function sortNegentropyEventRefsAsc<TEvent extends NegentropyEventRef>(
  events: readonly TEvent[]
): TEvent[];

function hasMatchingTag(
  event: Pick<StoredEvent, 'tags'>,
  tagName: string,
  values: readonly string[]
): boolean;

export function matchesStoredEventFilter<TEvent extends NegentropyEventRef>(
  event: TEvent,
  filter: Filter
): boolean;

function selectFilterMatches<TEvent extends NegentropyEventRef>(
  events: readonly TEvent[],
  filter: Filter
): TEvent[];

export function filterNegentropyEventRefs<TEvent extends NegentropyEventRef>(
  events: readonly TEvent[],
  filters: readonly Filter[]
): TEvent[];

export function createNegentropyRepairRequestKey(options: {
  readonly filters: readonly Filter[];
  readonly relayUrl: string;
  readonly scope?: string;
}): RequestKey;
```

- [ ] **Step 3: Import moved primitives in `request-planning.ts`**

At the top of `packages/core/src/request-planning.ts`, import the moved request primitives:

```ts
import {
  createRuntimeRequestKey,
  type FetchBackwardOptions,
  type Filter,
  type RelayReadOverlayOptions,
  type RelayRequestLike
} from './relay-request.js';
```

If `RelayRequestLike` still lives in `request-planning.ts`, do not import it. The final expected import after Task 3 is:

```ts
import {
  createRuntimeRequestKey,
  type FetchBackwardOptions,
  type Filter,
  type RelayReadOverlayOptions
} from './relay-request.js';
```

Keep `RelayRequestLike`, `SubscriptionLike`, `ObservableLike`, `RelaySessionLike`, and `SessionRuntime` in `request-planning.ts`.

- [ ] **Step 4: Remove moved request/negentropy definitions from `request-planning.ts`**

Delete these declarations from `packages/core/src/request-planning.ts`:

```ts
Filter
RelayReadOverlayOptions
FetchBackwardOptions
RuntimeRequestDescriptorOptions
RequestExecutionPlanOptions
RequestOptimizerCapabilities
OptimizedRequestShard
OptimizedLogicalRequestPlan
REPAIR_REQUEST_COALESCING_SCOPE
NegentropyEventRef
sortNegentropyEventRefsAsc
matchesStoredEventFilter
filterNegentropyEventRefs
buildLogicalRequestDescriptor
createRuntimeRequestKey
buildRequestExecutionPlan
createNegentropyRepairRequestKey
```

Also delete private helper functions used only by those moved declarations.

- [ ] **Step 5: Run request and negentropy tests**

Run:

```bash
pnpm exec vitest run \
  packages/core/src/request-key.contract.test.ts \
  packages/core/src/request-planning.contract.test.ts \
  packages/core/src/negentropy-repair.contract.test.ts \
  packages/core/src/reconcile.contract.test.ts \
  packages/core/src/module-boundary.contract.test.ts
```

Expected: request-key, request-planning, negentropy-repair, and reconcile tests PASS. `module-boundary.contract.test.ts` may still FAIL only on `index.ts` wildcard exports.

- [ ] **Step 6: Commit relay request and negentropy split**

Run:

```bash
git add packages/core/src/relay-request.ts packages/core/src/negentropy.ts packages/core/src/request-planning.ts
git commit -m "refactor(core): split relay request and negentropy modules"
```

Expected: commit succeeds with `relay-request.ts` and `negentropy.ts` populated.

---

### Task 4: Replace Core Wildcard Exports With Explicit Exports

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/public-api.contract.test.ts`
- Test: `packages/core/src/public-api.contract.test.ts`
- Test: `packages/core/src/module-boundary.contract.test.ts`

- [ ] **Step 1: Replace `index.ts` wildcard exports**

Replace the full contents of `packages/core/src/index.ts` with an explicit grouped export list:

```ts
export {
  decodeNip19,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  hexToBytes,
  neventEncode,
  nip07Signer,
  noteEncode,
  nprofileEncode,
  npubEncode,
  verifier
} from './crypto.js';
export type { Nip19Decoded, SignedNostrEvent, UnsignedNostrEvent } from './vocabulary.js';

export {
  validateRelayEvent
} from './event-validation.js';
export type {
  RelayEventValidationFailureReason,
  RelayEventValidationResult
} from './event-validation.js';

export {
  filterNegentropyEventRefs,
  createNegentropyRepairRequestKey,
  matchesStoredEventFilter,
  sortNegentropyEventRefsAsc
} from './negentropy.js';
export type { NegentropyEventRef } from './negentropy.js';

export {
  buildLogicalRequestDescriptor,
  buildRequestExecutionPlan,
  createRuntimeRequestKey,
  REPAIR_REQUEST_COALESCING_SCOPE
} from './relay-request.js';
export type {
  FetchBackwardOptions,
  Filter,
  OptimizedLogicalRequestPlan,
  OptimizedRequestShard,
  RelayReadOverlayOptions,
  RequestExecutionPlanOptions,
  RequestOptimizerCapabilities,
  RuntimeRequestDescriptorOptions
} from './relay-request.js';

export {
  emitReconcile,
  extractDeletionTargetIds,
  mapReasonToConsumerState,
  reconcileDeletionSubjects,
  reconcileDeletionTargets,
  reconcileNegentropyRepairSubjects,
  reconcileOfflineDelivery,
  reconcileReplayRepairSubjects,
  reconcileReplaceableCandidates,
  verifyDeletionTargets
} from './reconcile.js';
export type {
  DeletionEventLike,
  DeletionReconcileResult,
  OfflineDeliveryDecision,
  ReconcileEmission,
  ReplaceableCandidate
} from './reconcile.js';

export {
  normalizeRelayObservation,
  normalizeRelayObservationPacket,
  normalizeRelayObservationSnapshot
} from './relay-observation.js';

export {
  createBackwardReq,
  createForwardReq,
  createRelaySession,
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostrSession,
  uniq
} from './relay-session.js';
export type {
  ConnectionStatePacket,
  CreateRelayRequestOptions,
  CreateRelaySessionOptions,
  CreateRxNostrSessionOptions,
  DefaultRelayConfig,
  EventPacket,
  EventSigner,
  OkPacketAgainstEvent,
  RelayRequest,
  RelayRequestOptimizerOptions,
  RelaySelectionOptions,
  RelaySendOptions,
  RelayStatus,
  RelayUseOptions,
  RxNostr,
  SignedEventShape,
  UnsignedEvent
} from './relay-session.js';

export { reduceReadSettlement } from './settlement.js';
export type { ReadSettlementReducerInput } from './settlement.js';

export {
  cacheEvent,
  fetchEventById,
  fetchFollowGraph,
  fetchReplaceableEventsByAuthorsAndKind,
  loadEventSubscriptionDeps,
  mergeTimelineEvents,
  paginateTimelineWindow,
  sortTimelineByCreatedAtDesc,
  startBackfillAndLiveSubscription,
  startDeletionReconcile,
  startMergedLiveSubscription
} from './request-planning.js';
export type {
  EventStoreLike,
  EventSubscriptionRefs,
  LatestEventSnapshot,
  ObservableLike,
  QueryRuntime,
  RelayRequestLike,
  RelaySessionLike,
  SessionRuntime,
  SubscriptionHandle,
  SubscriptionLike,
  TimelineWindow
} from './request-planning.js';

export {
  createNamedRegistrationRegistry,
  createProjectionRegistry,
  defineProjection,
  getProjectionSortCapability,
  toOrderedEventCursor
} from './vocabulary.js';
export type {
  AggregateSessionReason,
  AggregateSessionState,
  ConsumerVisibleState,
  LogicalRequestDescriptor,
  NamedRegistration,
  NamedRegistrationRegistry,
  NegentropyCapability,
  NegentropyTransportResult,
  OrderedEventCursor,
  OrderedEventTraversalDirection,
  OrderedEventTraversalOptions,
  ProjectionDefinition,
  ProjectionRegistry,
  ProjectionSortCapability,
  ProjectionTraversalOptions,
  QueryDescriptor,
  ReadSettlement,
  ReadSettlementLocalProvenance,
  ReadSettlementPhase,
  ReadSettlementProvenance,
  ReadSettlementReason,
  ReconcileReasonCode,
  RelayConnectionState,
  RelayObservation,
  RelayObservationPacket,
  RelayObservationReason,
  RelayObservationRuntime,
  RelayObservationSnapshot,
  RelayOverlay,
  RelayOverlayPolicy,
  RequestKey,
  SessionObservation,
  StoredEvent
} from './vocabulary.js';
```

If TypeScript reports that an exported name does not exist, inspect the actual module and remove only that nonexistent name. If an active consumer fails because a public name is missing, add that name to the explicit export list from its owning module.

- [ ] **Step 2: Strengthen the public API contract**

Append this test to `packages/core/src/public-api.contract.test.ts`:

```ts
  it('exposes the expected package-root names explicitly', async () => {
    const mod = await import('@auftakt/core');

    expect(mod).toEqual(
      expect.objectContaining({
        buildRequestExecutionPlan: expect.any(Function),
        createRuntimeRequestKey: expect.any(Function),
        reduceReadSettlement: expect.any(Function),
        reconcileReplayRepairSubjects: expect.any(Function),
        filterNegentropyEventRefs: expect.any(Function),
        createRxNostrSession: expect.any(Function),
        validateRelayEvent: expect.any(Function)
      })
    );
  });
```

- [ ] **Step 3: Run core public and boundary tests**

Run:

```bash
pnpm exec vitest run \
  packages/core/src/public-api.contract.test.ts \
  packages/core/src/module-boundary.contract.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run package tests**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 5: Commit explicit exports**

Run:

```bash
git add packages/core/src/index.ts packages/core/src/public-api.contract.test.ts
git commit -m "refactor(core): make package exports explicit"
```

Expected: commit succeeds and `module-boundary.contract.test.ts` passes.

---

### Task 5: Final Verification

**Files:**
- Review all changed files.

- [ ] **Step 1: Verify no empty core stubs remain**

Run:

```bash
rg '^export \\{\\};$' packages/core/src
```

Expected: no output.

- [ ] **Step 2: Verify request-planning no longer owns moved primitives**

Run:

```bash
rg 'export (interface ReadSettlementReducerInput|function reduceReadSettlement|interface ReconcileEmission|function reconcileReplaceableCandidates|type NegentropyEventRef|function createNegentropyRepairRequestKey|function buildRequestExecutionPlan)' packages/core/src/request-planning.ts
```

Expected: no output.

- [ ] **Step 3: Run targeted cleanup checks**

Run:

```bash
pnpm exec vitest run \
  packages/core/src/module-boundary.contract.test.ts \
  packages/core/src/public-api.contract.test.ts \
  packages/core/src/request-key.contract.test.ts \
  packages/core/src/request-planning.contract.test.ts \
  packages/core/src/read-settlement.contract.test.ts \
  packages/core/src/reconcile.contract.test.ts \
  packages/core/src/negentropy-repair.contract.test.ts \
  packages/core/src/relay-session.contract.test.ts \
  packages/resonote/src/relay-repair.contract.test.ts \
  packages/resonote/src/subscription-registry.contract.test.ts \
  packages/adapter-indexeddb/src/reconcile.contract.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run package test suite**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 5: Inspect final git status**

Run:

```bash
git status --short
```

Expected: no tracked changes. Untracked local `.codex` may remain and should not be committed.
