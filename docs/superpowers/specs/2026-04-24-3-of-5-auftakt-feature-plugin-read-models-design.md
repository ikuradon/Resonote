# Auftakt Feature Plugin and Read Models Design

## Status

Draft follow-up design spec 3 of 5 for the Auftakt full redesign. Pending
brainstorming approval.

Depends on:

- `2026-04-24-1-of-5-auftakt-coordinator-local-first-pipeline-design.md`
- `2026-04-24-2-of-5-auftakt-req-optimizer-relay-repair-design.md`

## Problem

Auftakt has a plugin registry, built-in plugin registration, and some
feature-facing flows. The gap is that feature read models are still mixed with
legacy query helpers, facade convenience functions, and direct browser storage
reads.

The target is an NDK-like ergonomic API without leaking relay, storage, or
transport details. Timeline, emoji, comments, notifications, relay-list, and
Resonote-specific flows should be plugins over coordinator primitives.

## Scope

This spec covers:

- Plugin API shape.
- Projection and read-model registration.
- Built-in feature plugin ownership.
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

Built-in plugin ownership:

- `timeline`
  - timeline windows, pagination cursors, sort projections, replay repair hooks
- `emojiCatalog`
  - kind:10030 and kind:30030 source resolution, shortcode indexing
- `commentsFlow`
  - kind:1111 backfill/live subscriptions, deletion reconcile, merge of extra
    tag filters
- `notificationsFlow`
  - mention/follow comment streams, batching, local-first notification preview
- `relayListFlow`
  - kind:10002 and kind:3 fallback semantics
- `contentResolutionFlow`
  - bookmark and external content event lookup
- `wotFlow`
  - follow graph traversal and bounded repair

Each built-in plugin owns its feature read model and exposes one high-level
operation surface to `@auftakt/resonote`.

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

App regression:

```bash
pnpm run test:auftakt:resonote
pnpm run test:auftakt:app-regression
pnpm run test:auftakt:e2e
pnpm run check:auftakt-migration -- --proof
```
