# @auftakt/resonote

## OVERVIEW

High-level runtime for app-facing Resonote operations: reads, subscriptions, relay status, emoji/category helpers, feature-facing filters.

## WHERE TO LOOK

- `src/runtime.ts` — main high-level runtime surface
- `src/index.ts` — package export surface
- `src/public-api.contract.test.ts` — export/contract lock

## CONVENTIONS

- Expose high-level operations only; hide transport/storage details.
- This is the package counterpart to `src/shared/auftakt/resonote.ts`.
- New helpers here should feel feature-facing, not adapter-facing.

## ANTI-PATTERNS

- No raw `subId`, packet plumbing, or IndexedDB materialization details.
- No direct Svelte/browser ownership.
- No feature-specific view-model logic.
