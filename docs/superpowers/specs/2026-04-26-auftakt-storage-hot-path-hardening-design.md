# Auftakt Storage Hot-Path Hardening Design

Date: 2026-04-26

## Goal

Harden the remaining storage hot paths so high-volume coordinator reads,
projection source reads, deletion visibility, relay hints, and local-first hot
lookups do not regress into broad event-table scans.

This slice targets the final open strict follow-up candidate in
`docs/auftakt/2026-04-26-strict-goal-gap-audit.md`: storage hot-path hardening.
It keeps the current Dexie adapter and browser runtime. It does not move storage
to a Worker, SQLite, WASM, or a real relay process.

## Current Context

`@auftakt/adapter-dexie` already owns durable tables and indexes for events,
tags, deletion tombstones, replaceable heads, relay hints, sync cursors,
pending publishes, quarantine, and relay capabilities.

The remaining weak points are concentrated in traversal-style APIs:

- `DexieEventStore.listOrderedEvents()` currently orders all events and filters
  by kind in memory.
- `DexieEventStore.listProjectionSourceEvents()` delegates to
  `listOrderedEvents()`, so projection source reads inherit that broad scan.
- `DexieEventStore.getMaxCreatedAt(kind, pubkey?)` loads candidate rows and then
  computes `Math.max()` in memory.
- `HotEventIndex` currently covers by-id, tag, deletion pairs, and relay hints,
  but not kind-local ordering or replaceable heads.

Deletion index, replaceable head, tag index, and relay hint tables already use
indexed tables. This slice should preserve those paths and add regression proof
that they remain index-backed.

## Design

### Dexie Index-First Traversal

`DexieEventStore.listOrderedEvents()` will become index-first for every bounded
shape it already accepts.

For `options.kinds`:

- one kind uses the existing `[kind+created_at]` index directly
- multiple kinds run one indexed traversal per kind and merge the bounded
  results in memory
- no kind filter keeps the existing `[created_at+id]` ordering path

The merge is allowed to sort only the bounded result set returned from indexed
queries. It must not load all events and then filter by kind. Cursor handling
remains based on `(created_at, id)` so repair and projection traversal continue
to be deterministic.

`DexieEventStore.listProjectionSourceEvents()` keeps its current public API but
pushes `projection.sourceKinds` into the indexed traversal path. It remains the
adapter-owned implementation for `created_at` pushdown.

`DexieEventStore.getMaxCreatedAt(kind, pubkey?)` will use indexed reverse
lookups:

- with `pubkey`, read from a `[pubkey+kind+created_at]` index and return the
  newest row in that key range
- without `pubkey`, read from `[kind+created_at]` in reverse and return the first
  row

This requires a small schema bump in `packages/adapter-dexie/src/schema.ts` for
`[pubkey+kind+created_at]`. If implementation shows cursor tie handling also
needs an id suffix, add only the minimal extra compound index and prove it in
`schema.contract.test.ts`.

### HotEventIndex Expansion

`HotEventIndex` will remain an in-memory coordinator helper, not a full local
database. It should support the common hot lookups the coordinator can safely
answer or prefill:

- `getById(id)`
- `getByTagValue(tagValue, kind?)`
- `getByKind(kind, options?)`
- `getReplaceableHead(pubkey, kind, dTag?)`
- `getRelayHints(eventId)`

`applyVisible(event)` updates every index:

- by id
- tag value
- kind ordering
- replaceable head when the event kind is replaceable or parameterized
  replaceable

`applyDeletionIndex(id, pubkey)` removes the target from every visible-event
index and records the tombstone pair so late targets with the same id and
pubkey cannot become visible.

Replaceable head handling in the hot index must match Dexie semantics:

- newer `created_at` wins
- equal `created_at` keeps the already indexed head unless existing tests or
  local conventions require a deterministic id tiebreak
- older events must not replace the current head

Hot collection reads are opportunistic. Without durable coverage metadata, the
hot index cannot claim a complete result for every tag or kind query. The
coordinator may use hot hits for fast by-id reads and prefill/de-dup collection
reads, but Dexie remains responsible for complete local collection reads.

### Coordinator Read Behavior

`EventCoordinator` already uses `HotEventIndex` for by-id cache hits before
durable store access. This behavior remains mandatory.

For tag and kind reads, the coordinator can consult the hot index first, but it
must still call the durable indexed Dexie path unless a future coverage contract
proves the hot index complete for that query. Merged local results are de-duped
by id and still filtered by `eventMatchesFilter()`.

This preserves correctness while making the durable fallback itself index-first.

### Strict Audit Gate

The strict audit checker will require storage hot-path evidence:

- audit text mentions storage hot-path hardening
- Dexie tests prove indexed traversal for kind-bounded ordered reads,
  projection source reads, and max-created lookups
- HotEventIndex tests prove kind ordering, tag-kind filtering, replaceable head
  updates, deletion removal across all indexes, and relay hint ordering
- checker `collectFiles()` includes the new proof files

The gate should check for concrete implementation tokens rather than broad
claims. Good proof tokens include named tests such as
`uses kind index for ordered traversal`, `keeps hot replaceable heads`, and
`removes deleted events from all hot indexes`.

## Error Handling

Dexie unavailable behavior is unchanged. Coordinator reads may still return hot
memory hits with degraded settlement where the existing coordinator policy
allows it. Durable settlement must not be claimed when the durable path fails.

If an indexed query path cannot satisfy a filter shape, it should fall back only
to an explicit supported path with a contract test that names the limitation.
Silent full-table fallback is not acceptable for the hot paths covered by this
slice.

Deletion handling remains stricter than performance concerns. `kind:5`
tombstones must remove visible targets before late targets can become visible,
even if that means doing extra indexed cleanup work.

## Testing

Add or extend package contract tests:

- `packages/adapter-dexie/src/hot-path.contract.test.ts`
  - proves kind-bounded ordered traversal does not use a full event-table scan
  - proves projection source traversal uses the same indexed path
  - proves max-created lookups return newest events through indexed paths
  - proves tag-kind and relay hint paths remain indexed
- `packages/resonote/src/hot-event-index.contract.test.ts`
  - proves kind ordering and optional limits
  - proves tag lookups can be filtered by kind
  - proves replaceable and parameterized replaceable heads
  - proves deletion removes an event from id, tag, kind, and replaceable indexes
  - proves relay hints are newest-first
- `scripts/check-auftakt-strict-goal-audit.test.ts`
  - proves the strict audit fails when storage hot-path evidence is missing

Verification commands for the implementation plan should include:

- `pnpm exec vitest run packages/adapter-dexie/src/hot-path.contract.test.ts packages/resonote/src/hot-event-index.contract.test.ts scripts/check-auftakt-strict-goal-audit.test.ts`
- `pnpm run test:auftakt:storage`
- `pnpm run test:auftakt:resonote`
- `pnpm run check:auftakt:strict-goal-audit`
- `pnpm run check:auftakt:strict-closure`
- `pnpm run check:auftakt-migration -- --proof`
- `pnpm run test:packages`

## Out Of Scope

- changing the public package root values
- replacing Dexie with another backend
- adding Worker storage execution
- adding a real local relay process
- making `HotEventIndex` a complete query engine
- changing UI behavior

## Acceptance Criteria

- High-volume kind-bounded traversal no longer reads all events before filtering.
- Projection source traversal uses adapter-owned indexed pushdown for
  `created_at`.
- HotEventIndex maintains consistent id, tag, kind, replaceable, deletion, and
  relay hint indexes.
- The strict audit marks storage hot-path hardening as implemented for this
  slice and guards the proof files.
- Existing Auftakt migration, strict closure, storage, resonote, and package
  tests continue to pass.
