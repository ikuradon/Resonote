# Auftakt Strict Goal Gap Audit

Date: 2026-04-26

## Strict Final Goal

The strict final goal is stronger than current scoped completion. In the strict
target, all app-facing and extension-facing APIs are mediated by a coordinator
connected to a strfry-like local database. Relays are remote verification,
repair, fill, and enrichment inputs. Relay packets are not public read,
subscription, plugin, or app-facing results until they pass validation,
quarantine-on-failure, materialization, and visibility filtering.

## Scoped Completion Baseline

The current scoped Auftakt baseline remains valid. These gates passed during the
design review:

- `pnpm run check:auftakt-migration -- --proof`
- `pnpm run check:auftakt:nips`
- `pnpm run check:auftakt:strict-closure`
- `pnpm run test:auftakt:core`
- `pnpm run test:auftakt:storage`
- `pnpm run test:auftakt:resonote`

Passing scoped proof means the current facade and package boundaries satisfy the
canonical scoped spec. It does not mean every strict final goal is fully
implemented.

## Classification Model

- `Satisfied`: strict final target is implemented, tested, and guarded.
- `Scoped-Satisfied`: scoped target is implemented and proven; strict target is
  broader.
- `Partial`: important pieces exist, but implementation, proof, or wording is
  incomplete.
- `Missing`: meaningful implementation or proof is absent.

## Seven Goal Matrix

| Area                                         | Verdict            | Evidence                                                                                                                                                                                                                                                                                               | Strict Gap                                                                                                                                                                                                                                                   | First Implementation Phase Decision                                                          |
| -------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| rx-nostr-like reconnect and REQ optimization | `Satisfied`        | `packages/core/src/relay-session.ts`, `packages/core/src/request-planning.ts`, and core contract tests prove reconnect replay, request coalescing, shard planning, capability-aware queueing, adaptive learned-limit shard requeue, and ordinary read negentropy-first verification with REQ fallback. | No remaining strict gap inside the current reconnect, replay, capability-aware request planning, and adaptive REQ optimization scope. Future relay policy experiments remain outside the strict target.                                                      | Keep relay session, request planning, and ordinary read gateway regression gates active.     |
| NDK-like API convenience                     | `Satisfied`        | `src/shared/auftakt/resonote.ts`, `ResonoteCoordinator`, plugin model handles, entity handles, relay hints, parity inventory, and package public API tests provide high-level access.                                                                                                                  | No remaining strict gap inside the current app/plugin API convenience scope. Full NDK-compatible model expansion remains outside the strict target, not a pending completion blocker.                                                                        | Keep facade, plugin model, and parity regression gates active.                               |
| strfry-like local-first event processing     | `Satisfied`        | `EventCoordinator`, Dexie materialization, quarantine, hot index, deletion handling, replaceable heads, relay hints, high-level local store helpers, and strict closure guards exist.                                                                                                                  | No remaining strict gap inside the current browser-local database scope. Persistence migration to a separate relay process, Worker, SQLite, or WASM backend remains out of scope.                                                                            | Keep local store and coordinator mediation regression gates active.                          |
| NIP compliance                               | `Scoped-Satisfied` | `scripts/check-auftakt-nips.ts`, `docs/auftakt/nips-inventory.json`, and `docs/auftakt/nip-matrix.json` validate scoped matrix coverage.                                                                                                                                                               | Complete compliance must mean matrix-managed classification, not unlimited implementation of every possible NIP behavior. `unsupported-by-design` and `out-of-scope` claims must stay explicit.                                                              | Guard against ambiguous strict-completion wording.                                           |
| Offline incremental and kind:5               | `Satisfied`        | Dexie pending publishes, deletion event storage, deletion index, target suppression, late target suppression, and repair tests exist. Sync cursor incremental repair now persists Dexie ordered cursors and bounds fallback and negentropy repair through coordinator-owned runtime repair.            | No remaining strict gap for the current coordinator-owned offline incremental and kind:5 scope. New read surfaces must keep using the ordinary-read gateway, publish settlement, and sync cursor repair gates.                                               | Keep publish settlement and restart repair regression gates active.                          |
| Minimal core plus plugin extensions          | `Satisfied`        | Core owns vocabulary, crypto, request planning, relay session, settlement, reconcile, and validation. Resonote runtime registers built-in read models and flows, while package and plugin leak guards keep production app/plugin APIs coordinator-mediated.                                            | No remaining strict gap inside the current minimal-core and plugin-extension scope. Core protocol primitives remain allowed for package composition, while production app/plugin relay IO bypass stays forbidden.                                            | Keep core module-boundary, package public API, and plugin isolation regression gates active. |
| Single coordinator and database mediation    | `Satisfied`        | App facade and package root avoid raw request/session/storage exports. Runtime paths materialize relay candidates before public results, and app-facing local storage helpers call coordinator-owned high-level methods instead of exposing a raw event database handle.                               | The phrase "all core/extension APIs" can be read as banning necessary internal transport helpers. The strict target is public/app/plugin mediation, while coordinator-owned internals may use transport and storage primitives when raw results cannot leak. | Keep guard coverage for allowed internal zones and forbidden public leaks active.            |

## Coordinator Mediation Audit

| Layer              | Allowed                                                                                       | Forbidden                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| app-facing facade  | high-level reads, subscriptions, publish, relay status, relay capabilities, feature helpers   | raw relay session, raw request objects, adapter storage handles                            |
| package public API | coordinator factory, coordinator types, plugin registration, data-only projection metadata    | raw negentropy, raw relay request helpers, direct storage handles                          |
| plugin API         | `registerProjection`, `registerReadModel`, `registerFlow`                                     | `getRxNostr`, `getEventsDB`, `openEventsDb`, materializer queue, raw transport packet APIs |
| runtime internals  | coordinator-owned transport adapters, registry adapters, repair adapters, materializers       | returning raw relay candidates to public results                                           |
| core primitives    | protocol primitives for package composition, crypto, validation, relay session implementation | production app relay IO through core primitives                                            |

## First Implementation Phase

The first implementation phase is `strict coordinator audit closure`.

It includes:

- strict goal gap audit artifact creation
- scoped-vs-strict wording cleanup
- raw transport usage classification by layer
- package public surface allowlist proof
- plugin API raw-handle proof
- implemented candidate closures with gates

It excludes:

- NIP-wide implementation expansion
- runtime transport redesign
- full NDK-compatible model expansion
- persistence migration to Worker, SQLite, WASM, or a real relay process
- UI behavior changes

## Implemented Candidate Closures

1. Capability-aware ordinary read verification. `Implemented in this slice; keep ordinary read gateway regression gates active.`
2. Adaptive learned-limit REQ optimization. `Implemented in this slice; keep relay session shard requeue regression gates active.`
3. Coordinator-owned publish settlement. `Implemented in this slice; keep regression gates active.`
4. Sync cursor incremental repair. `Implemented in this slice; keep restart repair regression gates active.`
5. Broader outbox routing. `Implemented in this slice; keep broader outbox routing regression gates active.`
6. NDK-like model expansion. `Implemented in this slice for plugin model convenience; keep plugin model API regression gates active.`
7. Storage hot-path hardening. `Implemented in this slice; keep storage hot-path regression gates active.`
8. Coordinator-mediated local store facade. `Implemented in this slice; keep local store API regression gates active.`

## Verification

- `pnpm run check:auftakt:strict-goal-audit`
- `pnpm run check:auftakt-migration -- --proof`
- `pnpm run check:auftakt:nips`
- Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof.
- Ordinary read capability verification now routes latest and backward coordinator reads through negentropy-first RelayGateway verification with REQ fallback.
- Adaptive REQ optimization now reapplies learned relay max_filters and max_subscriptions limits to active shard queues without dropping failed shards.
- Broader outbox routing now uses coordinator-selected author, audience, explicit addressable, and durable addressable relay candidates while default-only suppresses broader candidates.
- Plugin model API now gives extensions coordinator-mediated event, user, addressable, relay-set, and relay-hint handles without exposing raw storage or transport handles.
- Minimal core plus plugin extension proof now keeps protocol primitives in @auftakt/core while production app and plugin APIs stay coordinator-mediated.
- Storage hot-path hardening now proves Dexie kind-bounded traversal, projection reads, max-created lookups, and HotEventIndex kind, tag, replaceable, deletion, and relay-hint paths without broad event-table scans.
- App-facing local comment, follow graph, and maintenance helpers now call coordinator-owned local store methods without exposing openEventsDb or raw event database handles.
- `pnpm run check:auftakt:strict-closure`
- `pnpm run test:auftakt:core`
- `pnpm run test:auftakt:storage`
- `pnpm run test:auftakt:resonote`
