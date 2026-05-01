# @auftakt/core

## OVERVIEW

Core Auftakt runtime foundation: shared vocabulary, crypto helpers, request planning, settlement, reconcile, relay observation, and relay session primitives.

## WHERE TO LOOK

- `src/index.ts` — package export surface
- `src/vocabulary.ts` — shared types, enums, branded identifiers
- `src/request-planning.ts` — request descriptors, request keys, optimizer contracts
- `src/relay-session.ts` — relay transport/session/replay primitives
- `src/request-key.contract.test.ts` — request identity contract
- `src/read-settlement.contract.test.ts` — settlement vocabulary
- `src/reconcile.contract.test.ts` — reconcile reason/state vocabulary
- `src/relay-session.contract.test.ts` — relay session/replay contract
- `src/public-api.contract.test.ts` — export leakage guard

## CONVENTIONS

- Keep app-facing feature operations out of core; those belong in `@auftakt/resonote`.
- Storage implementation remains in `@auftakt/adapter-dexie`.
- Add new public terms here only if multiple downstream packages or runtime bridges must share them.

## ANTI-PATTERNS

- No feature/UI helpers.
- No IndexedDB materialization.
- No Resonote-specific flow or plugin behavior.
