# Auftakt Strict Redesign Integration Closure Design

## Status

Approved design from brainstorming on 2026-04-25.

This is a closure spec for the strict Auftakt redesign work started in the
2026-04-24 specs and plans. It does not redefine the strict target. It records
the remaining production integration work needed before that target can be
called complete.

## Relationship to Previous Specs

This spec supersedes the storage-boundary assumption in
`2026-04-24-packages-refactor-design.md`, which kept
`@auftakt/adapter-indexeddb` as the storage adapter after the package collapse.
The current decision is stricter: `@auftakt/adapter-indexeddb` is discarded, and
`@auftakt/adapter-dexie` becomes the only storage adapter package.

The final Auftakt workspace package set is:

- `@auftakt/core`
- `@auftakt/resonote`
- `@auftakt/adapter-dexie`

The 2026-04-24 strict redesign specs remain valid for architecture and
semantics. This spec narrows the unfinished work to production integration and
legacy adapter removal.

## Problem

The strict redesign implementation has landed many package-level pieces:

- `@auftakt/adapter-dexie`
- relay event validation and ingress helpers
- `EventCoordinator`
- `HotEventIndex`
- `MaterializerQueue`
- `RelayGateway`
- durable relay hints, pending publish APIs, and compaction helpers
- NIP matrix checks
- core module cleanup

The remaining gap is production wiring. Several strict components exist and
pass package contract tests, but the app still has runtime paths that bypass
them:

- `src/shared/nostr/event-db.ts` still opens `@auftakt/adapter-indexeddb`.
- Some read helpers still return or inspect raw `packet.event` values directly.
- `MaterializerQueue` and `RelayGateway` are not the standard production path.
- Invalid relay events are sometimes passed to `ingestRelayEvent()` with a
  no-op quarantine writer.
- Pending publishes still use a standalone IndexedDB database.
- Published relay hints are not durably recorded from relay `OK` packets.

This means the earlier strict specs are partially implemented but not complete.
The closure work makes the strict architecture the only production architecture.

## Goals

- Make `@auftakt/adapter-dexie` the only durable event store.
- Delete `@auftakt/adapter-indexeddb` and all active imports of it.
- Avoid old IndexedDB migration because Resonote is not released yet.
- Ensure no public app, package facade, plugin, or feature callback receives raw
  relay events before validation and materialization.
- Connect `MaterializerQueue` to coordinator-owned writes.
- Connect `RelayGateway` to remote verification and repair.
- Persist invalid relay diagnostics through Dexie quarantine.
- Move pending publishes into Dexie `pending_publishes`.
- Persist relay hints for both seen relay events and successful publishes.
- Update proof guards, docs, and completion commands so this closure can be
  verified automatically.

## Non-Goals

- No migration from the old `resonote-events` or `resonote-pending-publishes`
  databases.
- No compatibility shim for `@auftakt/adapter-indexeddb`.
- No UI redesign.
- No new Nostr feature read model.
- No expansion of the NIP matrix beyond keeping existing checks accurate.
- No Web Worker split for crypto, filter matching, or materialization.

## Target Architecture

The production runtime has three layers:

1. App facade: `src/shared/auftakt/resonote.ts`
2. Coordinator runtime: `@auftakt/resonote`
3. Durable store: `@auftakt/adapter-dexie`

`src/shared/auftakt/resonote.ts` remains the single app-facing import point. It
creates or imports a Dexie-backed event store bridge and passes that store to
`createResonoteCoordinator()`.

`@auftakt/resonote` owns the strict runtime behavior:

- `EventCoordinator` controls read policy, visible event flow, relay repair, and
  settlement state.
- `MaterializerQueue` serializes materialization and prioritizes critical work.
- `RelayGateway` executes remote verification and repair work.
- Plugin APIs expose only coordinator-safe registration and read model handles.

`@auftakt/adapter-dexie` owns durable storage:

- event records
- tag rows
- deletion index
- replaceable heads
- relay hints
- sync cursors
- pending publishes
- projections
- migration state for future schema versions
- quarantine records

`@auftakt/adapter-indexeddb` is removed from the workspace. Existing tests that
only proved old adapter behavior are either deleted or rewritten against Dexie.

## Store Cutover

The app creates a Dexie store with a fresh database name. The old database names
are not read or migrated.

The Dexie bridge must provide the methods still required by app code while
moving behavior into package-owned APIs where practical:

- `getById`
- `getByPubkeyAndKind`
- `getManyByPubkeysAndKind`
- `getByReplaceKey`
- `getByTagValue`
- `getAllByKind`
- `listNegentropyEventRefs`
- `deleteByIds`
- `clearAll`
- `put`
- `putWithReconcile`
- `putQuarantine`
- `recordRelayHint`
- `putPendingPublish`
- pending publish drain/update helpers

The bridge is compatibility glue, not a new ownership layer. New behavior belongs
in `@auftakt/adapter-dexie` or `@auftakt/resonote`.

## Relay Event Visibility

Raw relay transport may still produce `EventPacket` values inside
`@auftakt/core`, but those packets are internal transport data. Production app
paths must not expose them directly.

Every relay event that can affect app state follows this sequence:

1. `RelayGateway` or relay session receives a packet.
2. `ingestRelayEvent()` validates event shape, id, and signature.
3. Invalid input is written to Dexie quarantine and dropped.
4. Valid input is enqueued in `MaterializerQueue`.
5. The queue calls coordinator materialization.
6. Dexie `putWithReconcile()` applies deletion, replaceable, and visibility
   semantics.
7. The coordinator updates `HotEventIndex` and relay hints.
8. Only accepted visible events are emitted to consumers.

Public consumers include package facade methods, feature callbacks,
notifications, comments, profile reads, relay-list reads, and plugin flows.

## Coordinator Reads

`cacheOnly` is the only normal policy that suppresses remote verification.

For other reads:

1. Coordinator checks `HotEventIndex`.
2. Coordinator checks Dexie.
3. Coordinator returns local visible data and settlement state.
4. Coordinator schedules `RelayGateway.verify()`.
5. Relay results enter ingress and materialization before any public emission.

`fetchBackwardEvents()` compatibility wrappers must use the same coordinator
path. They may keep their public function names until later cleanup, but they
cannot return raw relay packets.

## Materializer Queue

`MaterializerQueue` becomes a production dependency of `EventCoordinator`.

Priority classes:

- `critical`: kind:5 deletion events, quarantine writes, pending publish writes
- `high`: locally authored events, publish OK hint writes, repair events
- `normal`: ordinary relay fill events
- `background`: projections and rebuildable derived rows

The queue serializes durable writes so deletion visibility, replaceable head
updates, pending publish state, and relay hints are ordered consistently.

If Dexie is unavailable, coordinator returns degraded settlement and does not
claim durable local acceptance.

## Relay Gateway

`RelayGateway` becomes the standard remote verification and repair executor.

The gateway:

- accepts intent-level filters and relay options
- selects negentropy-first verification when available
- caches unsupported negentropy capability per relay
- falls back to ordinary REQ when negentropy is unsupported or failed
- fetches only remote-missing ids after successful negentropy comparison
- returns fetched candidates to the coordinator, not to app consumers

Gateway output is always routed through ingress and materialization.

## Pending Publishes

Pending publishes move from `src/shared/nostr/pending-publishes.ts` standalone
IndexedDB storage into Dexie `pending_publishes`.

Publish flow:

1. Signed event is durably recorded in Dexie before local durable settlement is
   reported.
2. The event is sent to selected write relays.
3. Successful relay `OK` packets record `event_relay_hints` with
   `source: "published"`.
4. Confirmed or rejected pending rows are removed or marked settled.
5. Retryable failures remain in Dexie and are drained by retry logic.

If the pending publish write fails, the publish API reports degraded storage or
throws. It must not claim a durable local success.

## Relay Hints

Relay hint writes have two production sources:

- `source: "seen"` when a relay event materializes successfully
- `source: "published"` when a relay returns a successful publish `OK`

Hints are written to Dexie and mirrored in `HotEventIndex` when available. Plugin
and feature code can read hint-derived models, but cannot mutate routing indexes
directly.

## Quarantine

Quarantine records are durable diagnostics for invalid relay input. They are not
events and must not appear in event reads, projections, timelines, comments, or
plugins.

Every production `ingestRelayEvent()` call must pass a real quarantine writer.
A no-op writer is allowed only in focused tests that explicitly assert no
quarantine is needed.

If quarantine writing fails, the invalid event is still blocked from visibility.
The failure is logged as a diagnostic weakness, not treated as acceptance.

## Package And Documentation Cleanup

The closure removes:

- `packages/adapter-indexeddb`
- root dependency on `@auftakt/adapter-indexeddb`
- package tests dedicated only to the old adapter
- docs that describe `adapter-indexeddb` as the storage boundary
- migration proof allowlists that permit active `adapter-indexeddb` imports

Docs must state that `adapter-dexie` is the storage adapter boundary.

## Error Handling

Dexie unavailable:

- reads can return hot memory hits with degraded settlement
- durable settlement is not claimed
- publish local acceptance fails or reports degraded storage

Relay unavailable:

- local reads still return local visible events
- settlement records remote verification as pending, failed, or degraded
- retry and repair can be scheduled later

Invalid relay event:

- write quarantine when possible
- block visibility regardless of quarantine write success

Unsupported negentropy:

- cache unsupported capability per relay
- use ordinary REQ fallback

## Verification

Contract tests:

- Dexie covers all app-required event store methods.
- Dexie pending publish drain/update replaces standalone pending publish DB.
- Coordinator uses `MaterializerQueue` for relay, deletion, publish, and repair
  writes.
- Coordinator uses `RelayGateway` for non-`cacheOnly` remote verification.
- `fetchBackwardEvents()` does not return raw unmaterialized relay events.
- invalid relay events are durably quarantined.
- publish `OK` records `source: "published"` relay hints.
- plugin APIs cannot access Dexie handles, relay sessions, or materializer queue
  internals.

Guard tests and scripts:

- no active import of `@auftakt/adapter-indexeddb`
- `packages/adapter-indexeddb` does not exist
- no production `quarantine: async () => {}` in ingress calls
- no production direct `events.push(packet.event)` or equivalent public relay
  emission outside core transport internals
- `createMaterializerQueue` is referenced by production coordinator code
- `createRelayGateway` is referenced by production coordinator/runtime code
- no standalone pending publish `idb` database remains

App regression:

```bash
pnpm run test:packages
pnpm run test:auftakt:app-regression
pnpm run test:auftakt:e2e
pnpm run check:auftakt:nips
pnpm run check:auftakt-migration -- --proof
pnpm run check
pnpm run build
```

Completion criteria:

- `@auftakt/adapter-indexeddb` is gone.
- Dexie is the only durable event, relay hint, quarantine, and pending publish
  store.
- Public app flows never receive raw relay events before ingress and
  materialization.
- Queue and gateway are production dependencies, not test-only artifacts.
- Strict redesign status can be documented as complete for the scoped
  architecture.
