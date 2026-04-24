# Auftakt Feature Plugin and Read Models Design

## Status

Approved follow-up design spec 3 of 5 for the Auftakt full redesign.

Depends on:

- `2026-04-24-1-of-5-auftakt-coordinator-local-first-pipeline-design.md`
- `2026-04-24-2-of-5-auftakt-req-optimizer-relay-repair-design.md`

## Problem

Auftakt has a plugin registry, built-in plugin registration, and some
feature-facing flows. The gap is that feature read models are still mixed with
legacy query helpers, facade convenience functions, and direct browser storage
reads.

The target is an NDK-like ergonomic API without leaking relay, storage, or
transport details. Generic Nostr read models become coordinator plugins.
Resonote-only flows stay in `@auftakt/resonote`, and relay intelligence that
affects routing or publish hints stays in coordinator/storage infrastructure.

## Scope

This spec covers:

- Plugin API shape.
- Projection and read-model registration.
- Built-in feature plugin ownership.
- Separation between generic plugins, Resonote-only flows, and coordinator
  storage concerns.
- Feature-facing coordinator APIs.
- Migration away from legacy helper surfaces.
- Isolation and test contracts.

This spec excludes:

- Coordinator event pipeline internals from Spec 1.
- Advanced request planner internals from Spec 2.
- NIP compliance claims from Spec 4.
- Storage compaction from Spec 5.

## Plugin API

Plugins register capabilities through a versioned API:

```ts
api.registerProjection(definition)
api.registerReadModel(name, readModel)
api.registerFlow(name, flow)
api.registerCommand(name, command)
```

Plugins receive only coordinator-safe handles:

- `read(policy, filters)`
- `subscribe(policy, filters, handlers)`
- `publish(event, policy)`
- `getProjection(name)`
- `observeSettlement(requestKey)`

Plugins do not receive raw relay sessions, raw Dexie handles, or transport sub
IDs.

## Built-In Plugins

Generic built-in plugin ownership:

- `timeline`
  - timeline windows, pagination cursors, sort projections, replay repair hooks
- `emojiCatalog`
  - kind:10030 and kind:30030 source resolution, shortcode indexing
- `commentThreadModel`
  - generic comment/reply graph, thread projection, kind:1111 backfill/live
    subscriptions, deletion visibility
- `notificationsFlow`
  - mention/follow comment streams, batching, local-first notification preview
- `relayListFlow`
  - kind:10002 and kind:3 fallback semantics
- `nostrEntityResolution`
  - NIP-19, nevent/naddr relay hints, author/kind lookup, entity fetch policy
- `wotFlow`
  - follow graph traversal and bounded repair
- `socialGraphSafety`
  - mute users, words, threads, kinds, reports, blocks, imposter/spam ranking
- `listsCollections`
  - NIP-51 list read/write helpers for mute lists, pins, bookmarks, custom
    lists, and followed hashtags
- `searchDiscovery`
  - NIP-50 search, hashtag feeds, explore feeds, popular relay/feed discovery
- `engagementPayments`
  - reactions, reposts, zap receipts, wallet/NWC-facing runtime hooks
- `mediaAttachments`
  - media metadata, upload provider integration, galleries, content-warning
    visibility
- `accountIdentity`
  - multi-account/read-only session policy, signer capability, NIP-05/NIP-07/
    NIP-46 identity surfaces

Optional generic built-ins:

- `longformLiveSpecialKinds`
  - long-form articles, polls, live streams, calendar, marketplace,
    communities, and channels

Each built-in plugin owns its feature read model and exposes one high-level
operation surface to `@auftakt/resonote`.

Resonote-only flows:

- `resonoteCommentsFlow`
  - Resonote content-page comment filters, content id mapping, and UI-specific
    merged comment streams
- `resonoteContentResolution`
  - podcast episode GUID lookup, external URL bookmark d-tag resolution, and
    Resonote content provider normalization
- Resonote-specific timeline/content projections

These flows live in `@auftakt/resonote`. They can compose generic read models,
but they are not generic Auftakt plugin contracts.

Coordinator/storage concerns, not plugins:

- `relayHintIndex`
- `eventRelayPresence`
- `authorRelayAffinity`

These are maintained by the coordinator/materializer and durable store from Spec
1. They are used as inputs for reply/repost/reaction relay hints,
nevent/naddr resolution, outbox/inbox routing, relay repair, and relay quality
scoring. UI can read them through an optional read model, but plugin code does
not own their writes.

## Projections

Projection definitions declare:

- name
- source kinds
- source tags
- materialized row key
- sort keys
- invalidation rules
- deletion behavior

Projection updates are triggered by the Materializer from Spec 1. A projection
must not pull raw relay data itself.

Projection rows live in Dexie `projections`, while hot projection windows can be
cached in `HotEventIndex`.

## Read Models

Read models are queryable views over coordinator state:

- local-first snapshots
- subscription handles
- settlement metadata
- cursor pagination
- repair status

Read models must be deterministic from materialized events and projection rows.
They can keep memory caches, but cache misses must go through coordinator
`read()` or `subscribe()`.

## Facade Cleanup

The app-facing facade keeps ergonomic names, but each export delegates to a
registered plugin/read model.

Legacy helper surfaces are removed or allowlisted with a sunset note:

- direct comment cache helpers
- direct follow graph DB reads
- direct parse/emoji utilities if they are not runtime-owned
- raw storage maintenance helpers

The public facade must not expose plugin registry internals beyond versioned
registration.

## Isolation

Plugin isolation rules:

- duplicate registration fails deterministically
- plugin setup is transactional
- failed plugin setup leaves registries unchanged
- plugins cannot override built-in names unless explicitly configured
- plugin APIs are versioned and package-root exported

## Verification

Contract tests:

- plugin API export shape
- version mismatch rejection
- duplicate name rejection
- setup rollback
- no raw relay/storage leakage
- built-in plugin registration

Feature tests:

- timeline projection cursor behavior
- emoji source local-first fetch
- comments backfill/live/delete merge
- notification preview local-first fallback
- relay-list kind:10002 over kind:3 fallback
- content bookmark lookup through coordinator
- relay hint index is read-only from plugin APIs
- Resonote-only flows compose generic read models without leaking into generic
  plugin contracts

App regression:

```bash
pnpm run test:auftakt:resonote
pnpm run test:auftakt:app-regression
pnpm run test:auftakt:e2e
pnpm run check:auftakt-migration -- --proof
```
