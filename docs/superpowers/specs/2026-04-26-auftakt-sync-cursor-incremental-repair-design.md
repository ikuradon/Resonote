# Auftakt Sync Cursor Incremental Repair Design

Date: 2026-04-26
Branch: feat/auftakt

## Goal

Close the strict-gap follow-up for sync cursor incremental repair while keeping
the existing repair API compatible.

The current repair path can materialize missing relay events and correctly
handles late kind:5 deletion events, but it does not persist a restart-safe
cursor for a relay/request pair. This slice makes repair incremental across
runtime restarts:

- Dexie stores an ordered event cursor for each relay/request key.
- `repairEventsFromRelay()` reads the cursor before relay repair.
- Successful repair materialization advances the cursor to the newest repaired
  ordered event.
- If cursor storage is unavailable, repair keeps the current behavior.
- kind:5 remains part of repair and continues through existing reconcile and
  deletion index handling.

## Non-Goals

- Persist a full negentropy session state.
- Change the public `repairEventsFromRelay(runtime, options)` signature.
- Add app-facing UI or settings for repair cursors.
- Redesign relay selection, outbox routing, or request coalescing.
- Treat every ordinary read as mandatory incremental repair in this slice.

## Data Model

Extend `DexieSyncCursorRecord` from a timestamp-only record to an ordered cursor
record:

- `key`: stable storage key, derived from relay URL and request key.
- `relay`: normalized relay URL used for repair.
- `request_key`: coordinator request key for the logical repair query.
- `cursor_created_at`: last durable ordered event timestamp.
- `cursor_id`: last durable ordered event id.
- `updated_at`: wall-clock update time for diagnostics and maintenance.

The Dexie schema moves to version 3 and keeps the existing
`sync_cursors` primary key and adds queryable cursor fields:

```ts
sync_cursors: 'key,relay,request_key,[relay+request_key],updated_at,[cursor_created_at+cursor_id]';
```

Existing cursor rows without ordered cursor fields are tolerated as empty
cursors. They do not block repair.

## Architecture

Add a small optional storage capability to the runtime store shape:

```ts
getSyncCursor(key: string): Promise<OrderedEventCursor | null>
putSyncCursor(record: {
  key: string;
  relay: string;
  requestKey: string;
  cursor: OrderedEventCursor;
  updatedAt: number;
}): Promise<void>
```

This stays adapter-owned. `@auftakt/core` already owns
`OrderedEventCursor` and `toOrderedEventCursor`, so this slice does not add new
core vocabulary.

`repairEventsFromRelay()` becomes cursor-aware internally:

1. Build the same repair request key it already uses for fallback or negentropy
   fetches.
2. Derive a stable sync cursor key from the relay URL and request key.
3. Ask the store for the cursor if `getSyncCursor()` exists.
4. Apply the cursor to repair filters by adding a lower bound for
   `created_at`. The first implementation uses `since: cursor.created_at`.
5. Materialize relay candidates through the existing ingress and reconcile path.
6. Ignore repaired candidates at or below the loaded ordered cursor before
   computing the next cursor.
7. Compute the max ordered cursor from successfully materialized events.
8. Persist the cursor with `putSyncCursor()` if the store supports it.

Cursor filtering deliberately uses `since` as a coarse relay filter and keeps
local ordered comparison in the materialization result. This avoids assuming
all relays support an id tie-breaker while still preserving deterministic local
cursor advancement.

## Data Flow

Fallback repair:

1. Build fallback request key for the filter set and relay overlay.
2. Load cursor for `relay + requestKey`.
3. Fetch relay candidates using cursor-augmented filters.
4. Validate and materialize candidates.
5. Advance cursor to the newest repaired event.

Negentropy repair:

1. Load the cursor before selecting local refs.
2. Select local refs with the same effective cursor window.
3. Request negentropy sync.
4. Fetch missing ids discovered by negentropy.
5. Materialize and advance cursor using repaired events.

Restart behavior:

1. First repair run persists cursor after materialization.
2. A new runtime using the same Dexie database reads the cursor.
3. The next repair run emits relay filters bounded by the saved cursor.
4. Events at or below the saved ordered cursor are not counted as repaired
   again.

## kind:5 Handling

kind:5 events are included in cursor-aware repair filters when the caller asks
for them. A late deletion event repaired after restart must still:

- pass through `ingestRelayEvent()`
- be materialized through `putWithReconcile()`
- update the deletion index
- suppress or remove the target event according to the existing Dexie reconcile
  behavior

The cursor only scopes what is fetched. It does not bypass deletion or
replaceable reconciliation.

## Error Handling

Cursor read failures are treated as no cursor. Repair still runs with existing
behavior.

Cursor write failures do not fail repair. The repair result still reports
repaired ids and emissions; a subsequent restart may repeat work because the
cursor was not persisted.

Malformed relay events are quarantined and do not advance the cursor.

Events suppressed by reconcile, such as tombstoned late originals, do not
advance the cursor unless they are durably stored as repair events. This keeps
the cursor tied to successful local materialization, not raw relay arrival.

## Tests

Add focused contract coverage:

- `packages/adapter-dexie/src/sync-cursors.contract.test.ts` proves cursor
  put/get, restart persistence, and ordered cursor fields.
- `packages/resonote/src/relay-repair.contract.test.ts` proves fallback repair
  reads a saved cursor and emits cursor-bounded filters after runtime
  recreation.
- `packages/resonote/src/relay-repair.contract.test.ts` proves cursor repair
  advances after materialization and does not advance for malformed candidates.
- `packages/resonote/src/relay-repair.contract.test.ts` proves late kind:5
  repaired after cursor restart tombstones the target through existing
  reconcile behavior.
- strict audit coverage records sync cursor incremental repair as implemented
  for this slice and requires the adapter/runtime evidence.

## Compatibility

The app-facing repair API remains unchanged. Runtime fixtures and non-Dexie
stores that do not implement cursor methods keep existing repair behavior.

Dexie schema migration is additive. Existing data remains readable. Existing
`sync_cursors` rows are interpreted as having no ordered cursor until the next
successful repair writes `cursor_created_at` and `cursor_id`.

## Completion Criteria

- Dexie can persist and restore ordered sync cursors by relay/request key.
- Repair uses cursor state when the store supports it.
- Cursor state advances only after successful repair materialization.
- Restart tests prove the same repair query resumes from the saved cursor.
- kind:5 cursor repair still updates deletion handling through reconcile.
- Strict audit text and gate recognize sync cursor incremental repair proof.
- Package tests and strict Auftakt gates pass.
