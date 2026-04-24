# @auftakt/adapter-indexeddb

## OVERVIEW

Storage/materializer adapter for IndexedDB-backed event persistence and reconcile application.

## WHERE TO LOOK

- `src/index.ts` — storage API + reconcile materialization
- `src/reconcile.contract.test.ts` — storage-side reconcile expectations

## CONVENTIONS

- Owns IndexedDB shape and apply/remove mechanics.
- Reconcile vocabulary comes from `@auftakt/core`; this package materializes outcomes.
- Keep persistence deterministic and side-effect scope narrow.

## ANTI-PATTERNS

- No relay transport retry policy here.
- No UI-visible state derivation.
- No direct feature slice knowledge beyond generic event semantics.
