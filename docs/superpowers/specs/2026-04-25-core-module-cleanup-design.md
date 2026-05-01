# Core Module Cleanup Design

## Context

`docs/superpowers/specs/2026-04-24-packages-refactor-design.md` and
`docs/superpowers/plans/2026-04-24-packages-refactor.md` defined the target
`@auftakt/core` module shape after collapsing the old timeline and relay
packages into core.

The package-level refactor has mostly landed, but four core module files are
still empty stubs:

- `packages/core/src/negentropy.ts`
- `packages/core/src/reconcile.ts`
- `packages/core/src/relay-request.ts`
- `packages/core/src/settlement.ts`

Meanwhile, `packages/core/src/request-planning.ts` still owns settlement,
reconcile, negentropy repair filtering, request-key planning, timeline helpers,
runtime query abstractions, and subscription orchestration. That makes the core
API harder to inspect and leaves `packages/core/src/index.ts` exporting empty
modules through broad `export *` statements.

## Goals

- Remove the empty core stub modules by moving existing implementations into
  responsibility-matched files.
- Keep the public package entrypoint as `@auftakt/core`.
- Preserve all currently consumed public names.
- Replace broad `export *` in `packages/core/src/index.ts` with explicit public
  exports.
- Keep raw relay/socket internals out of the package root.
- Keep this cleanup focused on module boundaries, not package architecture.

## Non-Goals

- Do not remove `@auftakt/core` public names that active consumers currently
  use.
- Do not add package subpath exports.
- Do not redesign relay session internals.
- Do not change behavior of request keys, settlement, reconcile decisions,
  negentropy repair filtering, or subscription orchestration.
- Do not revisit the older three-package wording in the historical
  packages-refactor spec beyond referencing it as background.

## Target Module Ownership

### `settlement.ts`

Owns read settlement reduction:

- `ReadSettlementReducerInput`
- `reduceReadSettlement`

It depends only on settlement vocabulary from `vocabulary.ts`.

### `reconcile.ts`

Owns event visibility and repair reconcile helpers:

- `ReconcileEmission`
- `ReplaceableCandidate`
- `DeletionEventLike`
- `DeletionReconcileResult`
- `OfflineDeliveryDecision`
- `mapReasonToConsumerState`
- `emitReconcile`
- `reconcileReplaceableCandidates`
- `reconcileDeletionSubjects`
- `extractDeletionTargetIds`
- `verifyDeletionTargets`
- `reconcileDeletionTargets`
- `reconcileReplayRepairSubjects`
- `reconcileNegentropyRepairSubjects`
- `reconcileOfflineDelivery`

It depends on `ConsumerVisibleState` and `ReconcileReasonCode` from
`vocabulary.ts`.

### `negentropy.ts`

Owns negentropy repair planning helpers, not WebSocket transport internals:

- `NegentropyEventRef`
- `sortNegentropyEventRefsAsc`
- `matchesStoredEventFilter`
- `filterNegentropyEventRefs`
- `createNegentropyRepairRequestKey`

It may import `createRuntimeRequestKey` and `Filter` from `relay-request.ts`.
The existing `NegentropyTransportResult` vocabulary remains in `vocabulary.ts`
because relay session transport also consumes it.

### `relay-request.ts`

Owns generic request descriptors, request keys, and optimizer plans:

- `Filter`
- `RelayReadOverlayOptions`
- `FetchBackwardOptions`
- `RuntimeRequestDescriptorOptions`
- `RequestExecutionPlanOptions`
- `RequestOptimizerCapabilities`
- `OptimizedRequestShard`
- `OptimizedLogicalRequestPlan`
- `REPAIR_REQUEST_COALESCING_SCOPE`
- `buildLogicalRequestDescriptor`
- `createRuntimeRequestKey`
- `buildRequestExecutionPlan`

It depends on `LogicalRequestDescriptor` and `RequestKey` from
`vocabulary.ts`.

### `request-planning.ts`

Keeps higher-level runtime helpers that compose request planning with app-like
runtime abstractions:

- timeline sorting, merging, and pagination helpers
- `LatestEventSnapshot`
- `EventStoreLike`
- `QueryRuntime`
- `RelayRequestLike`
- `SubscriptionLike`
- `ObservableLike`
- `RelaySessionLike`
- `SessionRuntime`
- `SubscriptionHandle`
- `EventSubscriptionRefs`
- `cacheEvent`
- `fetchReplaceableEventsByAuthorsAndKind`
- `fetchEventById`
- `loadEventSubscriptionDeps`
- backfill/live subscription orchestration helpers

This file may import from `relay-request.ts`, `reconcile.ts`, and
`vocabulary.ts`, but it should no longer define settlement, reconcile,
negentropy, or request-key optimizer primitives directly.

### `index.ts`

`packages/core/src/index.ts` becomes an explicit public API list. It should
export the names that current package and app consumers rely on, grouped by
module. It must not use `export *`.

The public API contract remains package-root only:

- `packages/core/package.json` keeps `exports: { ".": "./src/index.ts" }`.
- Internal module subpaths remain private.
- Raw relay internals such as `subId`, protocol packet literals, socket
  registry internals, and low-level replay queues remain unexported.

## Data Flow

Consumers continue importing from `@auftakt/core`.

Internally:

`request-planning.ts -> relay-request.ts -> vocabulary.ts`

`request-planning.ts -> reconcile.ts -> vocabulary.ts`

`negentropy.ts -> relay-request.ts -> vocabulary.ts`

`settlement.ts -> vocabulary.ts`

No new dependency from `vocabulary.ts` to higher-level modules is allowed.

## Error Handling

This refactor should be behavior-preserving. Any failing test after moving code
is treated as a refactor regression unless it reveals that `index.ts` was
previously exporting an unintended symbol.

If explicit exports miss an active consumer, add the missing public name back
only after confirming it is used by `src/`, `packages/`, or existing tests.

## Testing

Targeted checks:

```bash
pnpm exec vitest run \
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

Package-level check:

```bash
pnpm run test:packages
```

## Acceptance Criteria

- `packages/core/src/negentropy.ts` is no longer an empty stub.
- `packages/core/src/reconcile.ts` is no longer an empty stub.
- `packages/core/src/relay-request.ts` is no longer an empty stub.
- `packages/core/src/settlement.ts` is no longer an empty stub.
- `packages/core/src/request-planning.ts` no longer defines settlement reducer,
  reconcile helpers, negentropy repair helpers, or request-key optimizer
  primitives.
- `packages/core/src/index.ts` uses explicit exports instead of `export *`.
- No public package subpath exports are added.
- Existing `@auftakt/core` consumers continue to compile through the package
  root.
- `pnpm run test:packages` passes.
