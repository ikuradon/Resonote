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
- `Materializer`: signature-verified validation, reconcile, deletion,
  replaceable handling, projection updates, quarantine decisions, and durable
  write scheduling.
- `DexieEventStore`: canonical durable store and query adapter.

The coordinator is the only truth manager. Dexie is the durable source of truth,
`HotEventIndex` is the short-term hot path, and `Materializer` owns visibility
rules.

## API Boundary

External runtime APIs become coordinator operations:

```ts
coordinator.read(filter, policy);
coordinator.subscribe(filter, policy, handlers);
coordinator.publish(event, policy);
coordinator.repair(filter, relayPolicy);
coordinator.registerPlugin(plugin);
```

Read policy values:

- `cacheOnly`: use hot index and Dexie only.
- `localFirst`: return local data immediately and repair missing data from
  relays.
- `relayConfirmed`: wait for relay EOSE or timeout while still materializing
  before emit.
- `repair`: use replay, backfill, or negentropy repair behavior.

`src/shared/nostr/client.ts` and `src/shared/nostr/query.ts` become
interop wrappers. They must not own relay access in the final state.

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
5. Relay events enter the coordinator ingress verification gate.
6. Events that fail shape validation, id recomputation, or signature
   verification are quarantined and never emitted.
7. Verified relay events enter `Materializer.apply(event)`.
8. The materializer updates hot indexes, deletion visibility, replaceable heads,
   projections, and durable write queues.
9. Only materialized visible results are emitted to read waiters and
   subscribers.

Subscription flow:

1. Emit a local snapshot from `HotEventIndex` and Dexie.
2. Backfill missing windows from relays.
3. Subscribe to live relay streams.
4. Verify and materialize every live event before emission.
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
- `relayHintsByEventId`
- `eventsByRelay`
- `authorRelayAffinity`
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
- `event_relay_hints`
  - primary key: `[event_id+relay_url+source]`
  - indexes: `event_id`, `relay_url`, `[event_id+source]`, `last_seen_at`
- `pending_publishes`
  - primary key: `id`
  - indexes: `created_at`, `status`
- `quarantine`
  - primary key: `[event_id+relay_url+reason]`
  - indexes: `event_id`, `relay_url`, `reason`, `created_at`

The adapter exposes an `EventStoreAdapter` interface so implementation can be
tested and replaced without changing coordinator consumers.

The `quarantine` table stores invalid relay input diagnostics only. Quarantined
events are not visible events, do not update projections, and do not contribute
to local negentropy refs.

`event_relay_hints` is coordinator/storage infrastructure, not a feature plugin.
It records where an event was seen, hinted, repaired, or successfully published.
Reply, repost, reaction, nevent/naddr resolution, outbox routing, and relay
repair can use it as relay selection input.

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

Ingress verification failure is not best-effort. A relay EVENT must pass:

- NIP-01 event shape validation
- event id recomputation
- Schnorr signature verification
- policy checks for protected or expiration-sensitive events when enabled

Only after these checks can the materializer update `HotEventIndex`, Dexie, or
subscriber state. A temporary verifier failure reports degraded relay/security
settlement instead of emitting the raw event.

Migration failure must not silently destroy the old IndexedDB data. The app must
either keep using the old adapter in interop mode or fail startup with a
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
- quarantine table writes for invalid relay events
- deletion index `[target_id+pubkey]`
- late target suppression
- replaceable head update
- projection query

Coordinator tests:

- read policy behavior
- relay event materializes before emit
- invalid signature never reaches any public read/subscription API
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

## Spec Sequence

The full redesign is split into five ordered specs. The filename prefix is part
of the contract so implementation plans can preserve order.

1. `2026-04-24-1-of-5-auftakt-coordinator-local-first-pipeline-design.md`
   - Owns the coordinator, hot index, materializer, Dexie store, API boundary,
     and kind:5 deletion index.
   - This spec must land first because the remaining specs depend on a single
     event ingress and egress path.
2. `2026-04-24-2-of-5-auftakt-req-optimizer-relay-repair-design.md`
   - Extends request planning with relay capability awareness, adaptive
     batching, shard sizing, duplicate query coalescing, reconnect replay, and
     negentropy repair.
   - Depends on Spec 1 so optimized relay results always enter through the
     materializer.
3. `2026-04-24-3-of-5-auftakt-feature-plugin-read-models-design.md`
   - Moves timeline, emoji catalog, comments, notifications, relay-list, and
     Resonote flow construction onto coordinator plugins and projection/read
     model contracts.
   - Depends on Spec 1 for durable projection storage and Spec 2 for efficient
     backfill/live subscriptions.
4. `2026-04-24-4-of-5-auftakt-nip-compliance-design.md`
   - Defines the scoped public/internal NIP matrix, compliance proofs, missing
     NIP work, and package ownership for each NIP.
   - Depends on Specs 1-3 so compliance claims are based on final runtime paths
     rather than transitional wrappers.
5. `2026-04-24-5-of-5-auftakt-storage-compaction-retention-design.md`
   - Defines durable storage migration, payload compaction, retention policies,
     quota handling, degraded storage mode, and long-term maintenance jobs.
   - Comes last because it must preserve the semantics and public claims from
     Specs 1-4.
