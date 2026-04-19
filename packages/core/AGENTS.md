# @auftakt/core

## OVERVIEW

Vocabulary package only: types, enums, branded identifiers, and contract helpers shared across runtime layers.

## WHERE TO LOOK

- `src/index.ts` — all public exports
- `src/request-key.contract.test.ts` — request identity contract
- `src/read-settlement.contract.test.ts` — settlement vocabulary
- `src/reconcile.contract.test.ts` — reconcile reason/state vocabulary
- `src/public-api.contract.test.ts` — export leakage guard

## CONVENTIONS

- Serializable/public vocabulary only.
- Keep exports runtime-light; no storage, relay, RxJS, browser, or IndexedDB concerns.
- Add new public terms here only if multiple downstream packages must share them.

## ANTI-PATTERNS

- No replay registry, retry queue, or observer implementation here.
- No feature/UI helpers.
- No adapter-specific error mapping.
