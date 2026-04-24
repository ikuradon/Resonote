# Auftakt Coordinator Local-First Pipeline Design

## Status

Approved design sections from brainstorming on 2026-04-24.

This spec defines the first sub-project for the full Auftakt redesign. It does
not implement the complete NIP matrix, all feature plugins, or advanced relay
optimizer work. Those are follow-up specs.

## Problem

Auftakt currently has useful pieces in place: request keys, request planning,
relay session replay, reconcile vocabulary, an IndexedDB adapter, a Resonote
coordinator, and plugin registration. However, event ingress and egress are
still split across `@auftakt/resonote`, `src/shared/nostr/query.ts`,
`src/shared/nostr/client.ts`, and the storage adapter.

The target architecture is stricter:

- App, facade, and plugins do not talk directly to relays or durable storage.
- Relay events are never returned to consumers before coordinator-owned
  materialization.
- Local-first reads use durable local data and memory indexes before relay
  repair.
- kind:5 deletion handling suppresses both existing and late-arriving target
  events.
- Performance does not depend on every hot read hitting IndexedDB.

## Scope

This spec covers:

- Current-state audit outcome for the local-first pipeline.
- Full event-store rewrite direction.
- Dexie-based durable adapter direction.
- Coordinator-owned relay, cache, materializer, and storage pipeline.
- strfry-aligned deletion index semantics for kind:5.
- API boundary, performance policy, failure handling, and verification gates.

This spec excludes:

- Complete NIP implementation work.
- Full feature plugin migration.
- Advanced relay capability optimizer.
- UI refactors.
- Final storage compaction policy beyond required deletion visibility.

## Current-State Audit

`docs/auftakt/status-verification.md` marks the high-level goals as mostly
satisfied, but the implementation still has mixed ownership. `createResonoteCoordinator`
exists, while `src/shared/nostr/query.ts` and `src/shared/nostr/client.ts` still
own relay fetch flows and perform cache writes directly.

The current `@auftakt/adapter-indexeddb` adapter stores events, handles
replaceable winners, stores kind:5 events, deletes existing targets, and
suppresses late targets by checking deletion events. That behavior is close to
the required deletion semantics, but it is implemented inside a narrow adapter
instead of a coordinator-owned materialization pipeline.

The current `idb` implementation is sufficient as a thin IndexedDB wrapper, but
the full redesign needs a richer durable query/materialization layer. Dexie is
the preferred new adapter foundation because it has first-class compound
indexes, multi-entry indexes, bulk operations, transactions, and reactive query
support.

## Architecture

The redesign uses **Full Event Store Rewrite with Dexie**.

`EventCoordinator` is the only owner of event truth. App/facade/plugin code
passes intent to the coordinator. The coordinator owns four internal layers:

- `RelayGateway`: real relay REQ, EVENT, EOSE, OK, negentropy, reconnect, and
  publish transport.
- `HotEventIndex`: memory indexes for hot reads and subscription matching.
- `Materializer`: validation, reconcile, deletion, replaceable handling,
  projection updates, and durable write scheduling.
- `DexieEventStore`: canonical durable store and query adapter.

The coordinator is the only truth manager. Dexie is the durable source of truth,
`HotEventIndex` is the short-term hot path, and `Materializer` owns visibility
rules.

## API Boundary

External runtime APIs become coordinator operations:

```ts
coordinator.read(filter, policy)
coordinator.subscribe(filter, policy, handlers)
coordinator.publish(event, policy)
coordinator.repair(filter, relayPolicy)
coordinator.registerPlugin(plugin)
```

Read policy values:

- `cacheOnly`: use hot index and Dexie only.
- `localFirst`: return local data immediately and repair missing data from
  relays.
- `relayConfirmed`: wait for relay EOSE or timeout while still materializing
  before emit.
- `repair`: use replay, backfill, or negentropy repair behavior.

`src/shared/nostr/client.ts` and `src/shared/nostr/query.ts` become
compatibility wrappers. They must not own relay access in the final state.

Package responsibilities:

- `@auftakt/core`: request planning, crypto, NIP primitives, filter matching,
  reconcile vocabulary, and shared contracts.
- `@auftakt/resonote`: coordinator, policy API, plugin runtime, and
  feature-facing flows.
- `@auftakt/adapter-dexie`: durable event store implementation.

## Event Flow

Read flow:

1. `read()` normalizes filters and creates a canonical request key.
2. `HotEventIndex` returns matching visible events when it has coverage.
3. Dexie fills local gaps.
4. RelayGateway issues the missing equivalent query when policy requires relay
   repair.
5. Relay events enter `Materializer.apply(event)`.
6. The materializer updates hot indexes, deletion visibility, replaceable heads,
   projections, and durable write queues.
7. Only materialized visible results are emitted to read waiters and
   subscribers.

Subscription flow:

1. Emit a local snapshot from `HotEventIndex` and Dexie.
2. Backfill missing windows from relays.
3. Subscribe to live relay streams.
4. Materialize every live event before emission.
5. Reconnect replay regenerates active request descriptors and relies on
   idempotent materialization for duplicate suppression.

Publish flow:

1. Locally signed events enter the coordinator.
2. The event is materialized into hot indexes immediately.
3. Durable write and pending publish state are high priority.
4. Relay publish success updates settlement.
5. Offline failure leaves a durable pending publish entry.

## Performance

Dexie is not the hot read path. The coordinator keeps memory indexes:

- `byId`
- `replaceableHead`: `pubkey + kind + d`
- `latestByPubkeyKind`
- `tagIndex`: `tagName:value -> ids`
- `timelineWindows`
- `deletionIndex`: `target_id + pubkey`
- `pendingWrites`

Normal relay events update `HotEventIndex` synchronously and enter a batched
Dexie write queue. High-priority writes bypass normal batching:

- kind:5 deletion events
- deletion index rows
- locally published events
- pending publish queue changes

Large timeline reads use bounded windows. Normal tag queries use indexed
`tag_values`. Full scans are not allowed in normal app-facing hot paths.

## Dexie Store

The new durable adapter is `@auftakt/adapter-dexie`. Proposed tables:

- `events`
  - primary key: `id`
  - indexes: `[pubkey+kind]`, `[pubkey+kind+d_tag]`, `[kind+created_at]`,
    `[created_at+id]`, `*tag_values`
- `deletion_index`
  - primary key: `[target_id+pubkey]`
  - indexes: `deletion_id`, `created_at`, `target_id`, `pubkey`
- `replaceable_heads`
  - primary key: `[pubkey+kind+d_tag]`
  - indexes: `event_id`, `created_at`
- `projections`
  - primary key: `[projection+key]`
  - indexes: `[projection+sort_key]`
- `sync_cursors`
  - primary key: `[relay+request_key]`
  - indexes: `relay`, `request_key`, `updated_at`
- `pending_publishes`
  - primary key: `id`
  - indexes: `created_at`, `status`

The adapter exposes an `EventStoreAdapter` interface so implementation can be
tested and replaced without changing coordinator consumers.

## kind:5 / Deletion Semantics

Deletion handling follows strfry's model: the deletion event is stored, and a
deletion index keyed by target id plus author pubkey suppresses existing and
future target events.

Rules:

1. A kind:5 event is validated and stored in `events`.
2. Each `e` tag creates or confirms a `deletion_index` row keyed by
   `[target_id+deletion.pubkey]`.
3. If the target event already exists and `target.pubkey === deletion.pubkey`,
   it is removed from the visible set.
4. If the target event is absent, the deletion index row remains and suppresses
   late arrival.
5. A late event whose `[id+pubkey]` matches `deletion_index` is not emitted as
   visible.
6. Duplicate kind:5 events are ignored by event id.
7. Unauthorized deletion does not hide an already-known target. The deletion
   event itself can still be stored.
8. Physical payload deletion is optional compaction work. Visibility suppression
   is mandatory.

This differs from a plain `target_id` tombstone. The key must include pubkey so
NIP-09 authorization stays in the hot lookup path.

## strfry Reference

strfry stores data in LMDB and uses a Nostr-specific query engine. Its writer is
single-threaded because LMDB has one write lock and batching amortizes fsync
cost. The writer adds events, performs NIP-09 deletion, and deletes replaceable
events. It stores kind:5 events and uses an event deletion index so a later
target event with the same id and pubkey is rejected.

Relevant references:

- https://github.com/hoytech/strfry
- https://github.com/hoytech/strfry/blob/master/docs/architecture.md
- https://github.com/hoytech/strfry/blob/master/src/events.cpp

## Error Handling

Relay failure does not automatically fail a read:

- local hit before relay settlement returns partial settlement.
- timeout or EOSE resolves relay settlement.
- relay errors update relay observation and read settlement.

Dexie write failure is severity-based:

- normal relay event: keep hot result and mark durability degraded.
- kind:5/deletion index: keep hot visibility suppression and enqueue
  high-priority retry.
- local publish/pending publish: do not report publish success until durable
  state is written.

Materializer failure never leaks a raw relay event to consumers. Failed events
are quarantined/logged and excluded from API results.

Migration failure must not silently destroy the old IndexedDB data. The app must
either keep using the old adapter in compatibility mode or fail startup with a
clear degraded storage state.

## Verification

Core tests:

- request key canonicalization
- filter normalization
- deletion authorization vocabulary
- replaceable and parameterized replaceable ordering

Adapter tests:

- Dexie schema migration
- bulk materialization
- deletion index `[target_id+pubkey]`
- late target suppression
- replaceable head update
- projection query

Coordinator tests:

- read policy behavior
- relay event materializes before emit
- subscription backfill plus live flow
- reconnect replay idempotency
- offline pending publish durability

App regression tests:

- `cachedFetchById`
- `useCachedLatest`
- comments
- notifications
- profile metadata
- relay settings

E2E tests:

- mocked relays only
- deletion/reaction/reply flow
- offline then reconnect
- late kind:5 and late target event ordering

Completion gate:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run test:auftakt:app-regression
pnpm run test:auftakt:e2e
pnpm run check:auftakt-migration -- --proof
pnpm run check
pnpm run build
```

## Follow-Up Specs

1. REQ optimizer and relay repair expansion.
2. Feature plugin migration.
3. Scoped NIP compliance matrix and implementation roadmap.
4. Storage compaction and retention policy.
