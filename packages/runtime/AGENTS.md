# @auftakt/runtime

## OVERVIEW

Generic Auftakt runtime execution layer: coordinator, plugin API, entity handles, read/publish/relay/repair orchestration.

## WHERE TO LOOK

- `src/index.ts` — package export surface (generic runtime API only)
- `src/public-api.contract.test.ts` — export/contract lock

## CONVENTIONS

- Expose generic runtime operations only; hide Resonote-specific behavior.
- Import from `@auftakt/core` for pure vocabulary/protocol.
- Never import from `@auftakt/resonote` (circular dependency prevention).
- Never import from `@auftakt/adapter-dexie` (storage adapter independence).

## ANTI-PATTERNS

- No Resonote-specific plugin/flow/projection exports.
- No raw `NEG-*` protocol strings in public API.
- No Dexie/IndexedDB concrete handles.
