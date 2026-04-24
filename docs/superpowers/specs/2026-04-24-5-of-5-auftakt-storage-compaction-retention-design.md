# Auftakt Storage Compaction and Retention Design

## Status

Follow-up design spec 5 of 5 for the Auftakt full redesign.

Depends on:

- `2026-04-24-1-of-5-auftakt-coordinator-local-first-pipeline-design.md`
- `2026-04-24-2-of-5-auftakt-req-optimizer-relay-repair-design.md`
- `2026-04-24-3-of-5-auftakt-feature-plugin-read-models-design.md`
- `2026-04-24-4-of-5-auftakt-nip-compliance-design.md`

## Problem

Spec 1 makes Dexie the durable store and keeps deletion visibility separate from
physical payload removal. That is correct for semantics, but long-lived clients
need quota handling, migration, compaction, and retention rules. These policies
must not weaken kind:5 suppression, replaceable heads, sync cursors, or NIP
claims.

## Scope

This spec covers:

- Migration from the current `idb` adapter to Dexie.
- Storage quota handling.
- Payload compaction.
- Retention policy.
- Degraded storage mode.
- Maintenance scheduling.
- User data safety.

This spec excludes:

- Changing deletion semantics from Spec 1.
- Changing request planner behavior from Spec 2.
- Changing plugin read-model semantics from Spec 3.
- Changing NIP claims from Spec 4.

## Migration

Migration is additive and reversible during rollout:

1. Detect existing `resonote-events` IndexedDB.
2. Create new Dexie database with versioned schema.
3. Copy events in bounded batches.
4. Materialize deletion index, replaceable heads, tag values, projections, and
   sync cursors.
5. Verify counts and critical indexes.
6. Mark Dexie store active.
7. Keep old database until the next successful startup.

Failed migration must not delete the old database. The app starts in degraded
storage mode or continues with the old adapter when compatibility mode is still
available.

## Quota Handling

The storage layer reports quota state:

- `ok`
- `warning`
- `critical`
- `blocked`

Coordinator behavior:

- `ok`: normal batching
- `warning`: reduce background repair and avoid broad prefetch
- `critical`: stop non-essential durable writes and schedule compaction
- `blocked`: keep hot index only, preserve pending publishes if possible, and
  report degraded settlement

Pending publishes and deletion index rows have highest retention priority.

## Retention Priority

Retention classes from highest to lowest:

1. pending publishes
2. deletion index and kind:5 events
3. locally-authored events
4. replaceable heads for current user and follows
5. active timeline/comment windows
6. relay-list and profile metadata
7. projection rows that can be rebuilt
8. old raw payloads outside active windows
9. failed/quarantined relay events

Compaction cannot remove deletion index rows unless the corresponding kind:5
event is also intentionally removed by an explicit user action or future policy.

## Payload Compaction

Compaction options:

- remove raw payload for tombstoned target events
- keep minimal indexed metadata for query suppression
- rebuild projections after large compaction
- remove expired ephemeral events
- trim old inactive timeline windows
- delete quarantined invalid events after diagnostic window

Compaction must be idempotent. It must run in bounded chunks and yield to
foreground coordinator work.

## Maintenance Scheduler

Maintenance jobs:

- migration resume
- write queue drain
- projection rebuild
- quota check
- compaction
- retention trim
- sync cursor cleanup

Scheduling rules:

- foreground reads and publishes first
- kind:5/deletion writes before ordinary writes
- maintenance only when app is idle or quota critical
- bounded job duration
- resumable cursors for long jobs

## Degraded Storage Mode

When Dexie is unavailable:

- coordinator continues with `HotEventIndex` when possible
- `cacheOnly` reads can return memory results only
- `localFirst` settlement marks durability degraded
- relay repair may run but durable write failures are surfaced
- publishing requires durable pending state unless the caller explicitly accepts
  volatile publish

No API should silently claim durable settlement when storage is unavailable.

## Verification

Adapter tests:

- migration from current `adapter-indexeddb` shape
- deletion index preservation
- replaceable head rebuild
- tag index rebuild
- projection rebuild
- quota critical compaction order

Coordinator tests:

- degraded storage settlement
- high-priority deletion write retry
- pending publish retention
- compaction does not resurrect tombstoned events

E2E tests:

- upgrade from old DB to Dexie
- simulated quota failure
- offline publish during storage warning
- deletion survives restart and compaction

Completion gate:

```bash
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run test:auftakt:e2e
pnpm run check:auftakt-migration -- --proof
pnpm run check
pnpm run build
```
