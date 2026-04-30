# Packages Refactor Design

## Context

Auftakt currently uses five private workspace packages:

- `@auftakt/core`
- `@auftakt/timeline`
- `@auftakt/resonote`
- `@auftakt/adapter-relay`
- `@auftakt/adapter-indexeddb`

The current package split came from the migration architecture, but the package names now imply stronger replaceability than the implementation actually has. `@auftakt/adapter-indexeddb` is a real backend adapter boundary because storage backends can change. `@auftakt/adapter-relay` is different: it is the one relay transport/session implementation for Auftakt and is tightly coupled to request keys, replay, relay observation, and request planning. Likewise, `@auftakt/timeline` mostly contains pure request, settlement, and reconcile logic that belongs with the core Auftakt runtime model rather than in an independently replaceable package.

The refactor will align package boundaries with real ownership and substitution points while preserving the app-facing facade at `src/shared/auftakt/resonote.ts`.

## Goals

- Reduce `packages/` to three meaningful package boundaries.
- Move `@auftakt/timeline` logic into `@auftakt/core`.
- Move `@auftakt/adapter-relay` logic into `@auftakt/core`.
- Keep `@auftakt/adapter-indexeddb` as the storage backend adapter package.
- Keep `@auftakt/resonote` focused on Resonote-specific coordinator, plugin, and feature-facing runtime behavior.
- Update Resonote application imports, tests, documentation, and migration proof scripts so `@auftakt/timeline` and `@auftakt/adapter-relay` disappear completely.
- Reorganize package tests by responsibility instead of by obsolete package history.

## Non-Goals

- No public compatibility shim packages for `@auftakt/timeline` or `@auftakt/adapter-relay`.
- No new storage backend implementation.
- No change to app-facing feature imports that already correctly use `$shared/auftakt/resonote.ts`.
- No broad rewrite of feature business logic.
- No exposure of raw transport details from `@auftakt/resonote`.

## Target Package Architecture

### `@auftakt/core`

`@auftakt/core` becomes the core Auftakt runtime foundation. It owns shared vocabulary, pure runtime logic, request planning, relay observation normalization, and the generic relay session primitives.

Internal module shape:

- `src/vocabulary.ts`
- `src/crypto.ts`
- `src/request-planning.ts`
- `src/settlement.ts`
- `src/reconcile.ts`
- `src/relay-observation.ts`
- `src/relay-request.ts`
- `src/relay-session.ts`
- `src/negentropy.ts`
- `src/index.ts`

`src/index.ts` exports the stable primitives currently consumed by `src/`, `packages/resonote`, and `packages/adapter-indexeddb`, including request planning, settlement reduction, reconcile helpers, relay session creation, relay request creation, signing helpers, and verification helpers.

Raw transport details remain internal. In particular, `subId`, `NEG-*` literals, protocol packet internals, replay registry internals, and socket implementation details are not exposed as high-level app or Resonote package API.

### `@auftakt/resonote`

`@auftakt/resonote` remains the Resonote-specific runtime package. It owns:

- coordinator construction
- plugin API and built-in plugin registration
- comments, notifications, profile, relay-list, content-resolution helpers
- subscription registry behavior
- publish queue behavior
- relay repair orchestration
- package-level public API guards

It depends on `@auftakt/core` for shared vocabulary, request planning, relay session primitives, settlement, and reconcile helpers. It does not depend on `@auftakt/timeline` or `@auftakt/adapter-relay` after the cutover.

### `@auftakt/adapter-indexeddb`

`@auftakt/adapter-indexeddb` remains a separate package because it represents a real backend adapter boundary. It owns:

- IndexedDB event store implementation
- reconcile materialization
- projection source listing
- deterministic ordering and cursor handling
- local persistence behavior

After the refactor it depends on `@auftakt/core` only.

## Removed Packages

The following packages are removed from the workspace:

- `packages/timeline`
- `packages/adapter-relay`

Their `package.json`, `AGENTS.md`, source files, tests, and references in root dependencies are removed or migrated.

No temporary workspace package aliases are kept. These are private workspace packages, so a one-shot internal cutover is preferable to maintaining compatibility layers that would prolong ambiguity.

## Resonote App Import Cutover

The refactor updates both packages and the Resonote application source. The goal is that `@auftakt/timeline` and `@auftakt/adapter-relay` no longer appear in `src/`, `packages/`, `docs/`, `scripts/`, or tests except in historical design documents if explicitly archived.

Known app/runtime-adjacent import updates include:

- `src/shared/auftakt/resonote.ts`
  - move `createRxBackwardReq`, `createRxForwardReq`, `uniq`, and `verifier` imports from `@auftakt/adapter-relay` to `@auftakt/core`
- `src/shared/nostr/client.ts`
  - move `createRxNostrSession`, `nip07Signer`, and `RxNostr` from `@auftakt/adapter-relay` to `@auftakt/core`
- `src/shared/nostr/query.ts`
  - replace dynamic import of `@auftakt/adapter-relay` with `@auftakt/core`
- `src/shared/nostr/relays-config.ts`
  - replace dynamic import of `@auftakt/adapter-relay` with `@auftakt/core`
- `src/shared/nostr/cached-query.svelte.ts`
  - move `createRxBackwardReq` to `@auftakt/core`
- `src/features/*` and `src/shared/*`
  - move `@auftakt/timeline` helper imports to `@auftakt/core`
- tests using `vi.mock('@auftakt/adapter-relay')`
  - move mocks to `@auftakt/core` or split mock helpers where an existing `@auftakt/core` mock would collide

The app-facing rule remains unchanged: feature code should prefer `$shared/auftakt/resonote.ts`. Direct `@auftakt/core` imports are allowed only for shared vocabulary, crypto/NIP helpers, and runtime-adjacent bridges that already sit below the facade boundary.

## Test Plan Reorganization

Package tests should follow behavior ownership, not historical package names.

### Core Contract Tests

Move or rename tests under `packages/core/src/`:

- `public-api.contract.test.ts`
- `request-key.contract.test.ts`
- `request-planning.contract.test.ts`
- `read-settlement.contract.test.ts`
- `reconcile.contract.test.ts`
- `relay-session.contract.test.ts`
- `relay-observation.contract.test.ts`
- `negentropy-transport.contract.test.ts`

Current `packages/timeline/src/request-optimizer.contract.test.ts` becomes core request-planning coverage. Current `packages/timeline/src/negentropy-repair.contract.test.ts` becomes core negentropy/request repair planning coverage. Current `packages/adapter-relay/src/request-replay.contract.test.ts` is split into relay session, relay observation, and negentropy transport contracts.

### Storage Contract Tests

Keep storage tests under `packages/adapter-indexeddb/src/`, but rename around storage responsibilities:

- `event-store.contract.test.ts`
- `reconcile-materialization.contract.test.ts`
- `projection-source.contract.test.ts`

The existing storage reconcile coverage can be split only where it improves clarity; behavior should remain unchanged.

### Resonote Contract Tests

Keep Resonote-specific tests under `packages/resonote/src/`:

- `public-api.contract.test.ts`
- `plugin-api.contract.test.ts`
- `plugin-isolation.contract.test.ts`
- `built-in-plugins.contract.test.ts`
- `subscription-registry.contract.test.ts`
- `publish-queue.contract.test.ts`
- `relay-repair.contract.test.ts`

These tests should import lower-level primitives from `@auftakt/core` after the cutover.

### Script-Level Test Commands

Break the large `check:auftakt-semantic` command into responsibility-oriented scripts:

- `test:auftakt:core`
- `test:auftakt:storage`
- `test:auftakt:resonote`
- `test:auftakt:app-regression`
- `test:auftakt:e2e`

Then rebuild `check:auftakt-semantic` from those scripts. `check:auftakt-complete` remains the full completion gate.

## Documentation and Proof Updates

Update `docs/auftakt/spec.md` so it describes boundary semantics instead of preserving obsolete package count as canonical. The new summary should be:

- `core` = vocabulary, pure runtime logic, request planning, settlement, reconcile, relay session primitives
- `resonote` = Resonote coordinator and app-facing runtime package
- `adapter-indexeddb` = storage backend adapter
- `src/shared/auftakt/resonote.ts` = Resonote app import facade

Update `docs/auftakt/status-verification.md` so NIP-01 and NIP-11 point to core relay session tests instead of `packages/adapter-relay`.

Update `scripts/check-auftakt-migration.mjs`:

- raw negentropy allowlist moves from `packages/adapter-relay/src/index.ts` and its test to the new core relay/negentropy files
- proof anchors point at the new test paths
- residual import checks fail on any active `@auftakt/timeline` or `@auftakt/adapter-relay` import

Update `packages/AGENTS.md` and child package guides to match the three-package structure.

## Data Flow After Refactor

Feature code continues to call the facade:

`Feature -> src/shared/auftakt/resonote.ts -> @auftakt/resonote`

Reads and subscriptions use:

`@auftakt/resonote -> @auftakt/core request planning / relay session -> @auftakt/adapter-indexeddb`

Storage materialization uses:

`@auftakt/adapter-indexeddb -> @auftakt/core reconcile vocabulary and helpers`

The important behavioral boundary is not package count. It is that app code does not see relay transport packets, storage implementation details, or replay internals.

## Error Handling and Risk Management

The primary risk is import cutover churn rather than behavior change. The implementation should preserve existing behavior and move code in small, verifiable steps:

1. Move timeline exports into core and update imports.
2. Verify package and app tests that depend on request planning, settlement, and reconcile.
3. Move relay exports into core and update imports.
4. Split relay tests after behavior is passing.
5. Remove obsolete packages and update proof scripts.
6. Run full Auftakt gates.

Mock collisions are expected where tests already mock `@auftakt/core` and also mocked `@auftakt/adapter-relay`. Those tests should use narrower mock factories or import real core exports through `importOriginal` where possible.

## Acceptance Criteria

- `packages/timeline` is removed.
- `packages/adapter-relay` is removed.
- Root `package.json` no longer depends on `@auftakt/timeline` or `@auftakt/adapter-relay`.
- `@auftakt/resonote` depends on `@auftakt/core` only among Auftakt runtime packages.
- `@auftakt/adapter-indexeddb` depends on `@auftakt/core` only among Auftakt runtime packages.
- No active source, package, script, or test imports `@auftakt/timeline` or `@auftakt/adapter-relay`.
- `docs/auftakt/spec.md` and `docs/auftakt/status-verification.md` reflect the new package architecture.
- `scripts/check-auftakt-migration.mjs` proof and leak guards reflect the new paths.
- Package contract tests are reorganized by responsibility.
- `pnpm run test:packages` passes.
- `pnpm run check:auftakt-migration -- --proof` passes.
- `pnpm run check:auftakt-migration -- --report consumers` passes.
- `pnpm run check:auftakt-semantic` passes.
- `pnpm run check:auftakt-complete` passes before considering the refactor complete.
