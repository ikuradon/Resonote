# @auftakt/adapter-relay

## OVERVIEW

Relay/session adapter: transport requests, replay registry, requestKey↔subId mapping, per-relay connection state.

## WHERE TO LOOK

- `src/index.ts` — relay adapter implementation
- `src/request-replay.contract.test.ts` — replay correctness guard

## CONVENTIONS

- Transport-only IDs stay here; logical request identity comes from planner/runtime.
- Connection-state packets may be rich, but app-facing simplification happens above this package.
- Keep retry/reconnect behavior deterministic and test-driven.

## ANTI-PATTERNS

- No feature semantics, no content/provider rules.
- No IndexedDB/storage decisions.
- No public leaking of raw transport internals beyond the adapter contract.
