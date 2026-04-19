# @auftakt/timeline

## OVERVIEW

Planner/reducer package: canonical request descriptors, settlement reduction, reconcile decisions, stream orchestration helpers.

## WHERE TO LOOK

- `src/index.ts` — requestKey + reconcile + settlement logic
- `src/public-api.contract.test.ts` — public API lock

## CONVENTIONS

- Owns canonicalization and reducer logic, not transport or persistence.
- Safe place for mapping tables (`ReconcileReasonCode -> ConsumerVisibleState`) and decision emitters.
- Keep APIs high-level enough for app/runtime facades to consume directly.

## ANTI-PATTERNS

- No direct relay sockets, no IndexedDB access.
- No UI-specific state guesses.
- No duplicating vocabulary that belongs in `@auftakt/core`.
