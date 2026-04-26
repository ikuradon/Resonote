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

| Area                                         | Verdict            | Evidence                                                                                                                                                                                                                                                                                    | Strict Gap                                                                                                                                                                                                                                                                               | First Implementation Phase Decision                                                                 |
| -------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| rx-nostr-like reconnect and REQ optimization | `Scoped-Satisfied` | `packages/core/src/relay-session.ts`, `packages/core/src/request-planning.ts`, and core contract tests prove reconnect replay, request coalescing, shard planning, and queueing.                                                                                                            | Ordinary reads are not uniformly defined as negentropy-first repair with REQ fallback, and adaptive reconnect/read policy is not a strict target proof.                                                                                                                                  | Audit and classify transport policy gaps; keep transport behavior unchanged in this phase.          |
| NDK-like API convenience                     | `Scoped-Satisfied` | `src/shared/auftakt/resonote.ts`, `ResonoteCoordinator`, entity handles, relay hints, and package public API tests provide high-level access.                                                                                                                                               | The API is ergonomic for current Resonote flows, not a broad NDK-style model system. Some convenience APIs are allowlisted package-owned helpers rather than plugin registry calls.                                                                                                      | Inventory public, facade, and plugin surfaces with explicit allowed reasons.                        |
| strfry-like local-first event processing     | `Partial`          | `EventCoordinator`, Dexie materialization, quarantine, hot index, deletion handling, replaceable heads, relay hints, and strict closure guards exist.                                                                                                                                       | The browser store is not a full local relay database abstraction, and raw session usage remains inside coordinator-owned runtime helpers. Allowed internal transport zones need explicit audit classification.                                                                           | Add a coordinator mediation audit that separates public leaks from internal transport dependencies. |
| NIP compliance                               | `Scoped-Satisfied` | `scripts/check-auftakt-nips.ts`, `docs/auftakt/nips-inventory.json`, and `docs/auftakt/nip-matrix.json` validate scoped matrix coverage.                                                                                                                                                    | Complete compliance must mean matrix-managed classification, not unlimited implementation of every possible NIP behavior. `unsupported-by-design` and `out-of-scope` claims must stay explicit.                                                                                          | Guard against ambiguous strict-completion wording.                                                  |
| Offline incremental and kind:5               | `Partial`          | Dexie pending publishes, deletion event storage, deletion index, target suppression, late target suppression, and repair tests exist. Sync cursor incremental repair now persists Dexie ordered cursors and bounds fallback and negentropy repair through coordinator-owned runtime repair. | Ordinary read flows are not uniformly defined as mandatory repair flows. Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof. Sync cursor incremental repair now has restart-safe fallback and negentropy proof. | Keep publish settlement and restart repair regression gates active.                                 |
| Minimal core plus plugin extensions          | `Scoped-Satisfied` | Core owns vocabulary, crypto, request planning, relay session, settlement, reconcile, and validation. Resonote runtime registers built-in read models and flows.                                                                                                                            | Core exposes protocol primitives for package composition. Strict mediation must state that production app and plugin APIs cannot use core relay IO primitives directly.                                                                                                                  | Distinguish core primitive exports from app-facing runtime APIs in the audit gate.                  |
| Single coordinator and database mediation    | `Scoped-Satisfied` | App facade and package root avoid raw request/session exports. Runtime paths materialize relay candidates before public results.                                                                                                                                                            | The phrase "all core/extension APIs" can be read as banning necessary internal transport helpers. The strict target is public/app/plugin mediation, while coordinator-owned internals may use transport primitives when raw results cannot leak.                                         | Add guard coverage for allowed internal transport zones and forbidden public leaks.                 |

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
- prioritized follow-up candidates with gates

It excludes:

- NIP-wide implementation expansion
- runtime transport redesign
- full NDK-compatible model expansion
- persistence migration to Worker, SQLite, WASM, or a real relay process
- UI behavior changes

## Follow-Up Candidates

1. Capability-aware ordinary read verification. `Implemented in this slice; keep ordinary read gateway regression gates active.`
2. Coordinator-owned publish settlement. `Implemented in this slice; keep regression gates active.`
3. Sync cursor incremental repair. `Implemented in this slice; keep restart repair regression gates active.`
4. Broader outbox routing.
5. NDK-like model expansion.
6. Storage hot-path hardening.

## Verification

- `pnpm run check:auftakt:strict-goal-audit`
- `pnpm run check:auftakt-migration -- --proof`
- `pnpm run check:auftakt:nips`
- Ordinary read capability verification now routes latest and backward coordinator reads through negentropy-first RelayGateway verification with REQ fallback.
- `pnpm run check:auftakt:strict-closure`
- `pnpm run test:auftakt:core`
- `pnpm run test:auftakt:storage`
- `pnpm run test:auftakt:resonote`
