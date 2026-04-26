# Auftakt Strict Goal Gap Audit Design

Date: 2026-04-26
Branch: `feat/auftakt`

## Purpose

This design defines an audit specification, not an implementation patch. Its
job is to separate two truths that currently overlap in the documentation:

- the current scoped Auftakt completion, which is backed by existing guards and
  package contract tests
- the stricter final goal described by the user, where all core and extension
  APIs are mediated by a coordinator connected to a strfry-like local database,
  and relays only verify, repair, fill, and enrich local truth

The output of the audit will be a gap matrix plus a first implementation phase.
It must preserve proof that already passes while making the stricter target
visible enough to plan and implement safely.

## Strict Goal Definition

The strict final goal is decomposed into seven auditable areas:

1. rx-nostr-like reconnect resilience and automatic REQ optimization, including
   coalescing, batching, sharding, relay capability awareness, queueing, and
   replay.
2. NDK-like API convenience, including ergonomic app-facing read, publish,
   entity, relay hint, and addressable access.
3. strfry-inspired local-first seamless event processing, where local storage is
   the source of truth and relay data is an ingress candidate until validated
   and materialized.
4. NIP compliance through an explicit current matrix with owners, proof anchors,
   and clear `implemented`, `internal`, `compat`, `unsupported-by-design`, and
   `out-of-scope` classifications.
5. Offline incremental processing, including pending publish durability,
   restart/recovery behavior, sync cursor semantics, and `kind:5` tombstone
   handling.
6. Minimal core APIs plus plugin-based higher features, where `@auftakt/core`
   owns reusable primitives and higher client behavior lives in extension
   packages, read models, or flows.
7. Single coordinator and database mediation, where app-facing APIs, package
   public APIs, and plugin APIs cannot exchange raw relay packets or raw storage
   handles.

## Classification Model

The audit will classify each requirement with one of four verdicts:

- `Satisfied`: the strict final goal is implemented, tested, and guarded.
- `Scoped-Satisfied`: the current canonical scoped goal is implemented and
  proven, but the strict final goal is broader or more demanding.
- `Partial`: key pieces exist, but implementation, proof, or boundary policy is
  incomplete for either the scoped or strict target.
- `Missing`: there is no meaningful implementation or proof for the target.

The audit must not downgrade passing scoped proof into failure language. It
should instead name the scoped proof and the strict gap separately.

## Current Evidence Baseline

The following commands passed during design exploration on 2026-04-26:

- `pnpm run check:auftakt-migration -- --proof`
- `pnpm run check:auftakt:nips`
- `pnpm run check:auftakt:strict-closure`
- `pnpm run test:auftakt:core`
- `pnpm run test:auftakt:storage`
- `pnpm run test:auftakt:resonote`

Important current code evidence:

- `packages/core/src/request-planning.ts` owns canonical request descriptors,
  request keys, logical grouping, and shard planning.
- `packages/core/src/relay-session.ts` owns relay transport, reconnect,
  request grouping, shard queueing, capability observations, EOSE/OK handling,
  and forward replay.
- `packages/resonote/src/event-coordinator.ts` owns local-first read,
  candidate materialization, subscription visibility, publish hint recording,
  and materializer priority for `kind:5`.
- `packages/resonote/src/runtime.ts` owns the high-level coordinator facade,
  built-in plugin registration, read models, flows, entity handles, relay
  capability registry, and runtime bridge logic.
- `packages/adapter-dexie/src/index.ts` owns durable event storage, tag
  indexing, replaceable heads, deletion index, relay hints, quarantine, pending
  publishes, and compaction helpers.
- `src/shared/auftakt/resonote.ts` is the app-facing import point.

## Seven Goal Matrix

| Area                                         | Current Verdict    | Evidence                                                                                                                                                                                          | Strict Gap                                                                                                                                                                                                                                                         | First Phase                                                                                         |
| -------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| rx-nostr-like reconnect and REQ optimization | `Scoped-Satisfied` | Core contract tests cover reconnect replay, coalescing, deterministic sharding, max filter and max subscription queueing, capability observation, and OK/EOSE handling.                           | Ordinary reads are not yet uniformly defined as negentropy-first repair with REQ fallback, and adaptive policy is not audited as a strict target.                                                                                                                  | Audit and classify transport policy gaps; do not rework transport in the first phase.               |
| NDK-like API convenience                     | `Scoped-Satisfied` | App facade, `ResonoteCoordinator`, entity handles, relay hints, and high-level helper flows exist. Package root leak guards pass.                                                                 | The API is ergonomic for current Resonote use, not a broad NDK-style model system. Some convenience surfaces are allowlisted rather than plugin-registry backed.                                                                                                   | Inventory public, facade, and plugin surfaces with explicit allowed reasons.                        |
| strfry-like local-first event processing     | `Partial`          | EventCoordinator, Dexie materialization, quarantine, hot index, deletion handling, replaceable heads, and relay hints exist.                                                                      | The browser store is not yet a full local relay database abstraction, and some raw session usage remains inside runtime transport helpers. The strict audit must classify which internal raw usage is allowed.                                                     | Add a coordinator mediation audit that separates public leaks from internal transport dependencies. |
| NIP compliance                               | `Scoped-Satisfied` | `check:auftakt:nips` validates inventory and matrix files, and status docs define scoped claims.                                                                                                  | "Complete compliance" must be defined as matrix-managed coverage, not unlimited implementation of every possible NIP behavior. Unsupported and out-of-scope entries must be explicit.                                                                              | Add strict wording and matrix checks that prevent ambiguous complete-compliance claims.             |
| Offline incremental and `kind:5`             | `Partial`          | Dexie pending publishes, deletion event storage, deletion index, target suppression, late target suppression, and repair tests exist.                                                             | Sync cursor and restart/incremental repair semantics are not yet first-class strict proof for all read flows. Publish settlement is durable but not modeled as a full coordinator read/write settlement API.                                                       | Classify missing incremental proof and publish settlement gaps for later phases.                    |
| Minimal core plus plugin extensions          | `Scoped-Satisfied` | Core contains vocabulary, crypto, request planning, relay session, settlement, reconcile, and validation. Resonote runtime registers built-in read models and flows. Plugin isolation tests pass. | Core still exposes protocol primitives by design. Strict mediation must clarify that app and plugin APIs cannot use those primitives for relay IO directly.                                                                                                        | Extend the audit to distinguish core primitive exports from app-facing runtime APIs.                |
| Single coordinator and database mediation    | `Scoped-Satisfied` | App facade and package root avoid raw request/session exports. Runtime paths materialize relay candidates before public results. Strict closure guards pass.                                      | The strict phrase "all core/extension APIs" can be read as forbidding even internal raw session helpers. The audit must settle this by layer: public surfaces are strict; internal coordinator transport helpers are allowed only if they cannot emit raw results. | Implement guard/docs/tests for allowed internal transport zones and forbidden public leaks.         |

## Coordinator Mediation Audit

The audit will split mediation into five layers:

1. App-facing facade: `src/shared/auftakt/resonote.ts` is the only normal app
   import point for reads, subscriptions, publishes, relay status, relay
   capabilities, and feature-facing helpers.
2. Package public API: `@auftakt/resonote` exports coordinator factory, types,
   plugin registration, and data-only metadata. It must not export raw relay
   request/session helpers, raw negentropy operations, or storage handles.
3. Plugin API: plugins may register projections, read models, and flows. They
   must not receive raw relay sessions, Dexie handles, materializer queues, or
   transport packet APIs.
4. Runtime internals: raw session access is allowed only inside coordinator-owned
   transport adapters, registry adapters, repair adapters, and subscription
   materialization wrappers. Any raw relay candidate from these zones must pass
   validation, quarantine-on-failure, and materialization before public
   visibility.
5. Core primitives: `@auftakt/core` may expose protocol primitives, crypto, and
   relay session implementation for package composition. App production code
   must not use core relay IO primitives directly.

This mediation model avoids a false choice between banning necessary internal
transport code and allowing public bypasses.

## First Implementation Phase

The first implementation phase will be named `strict coordinator audit closure`.
It should be small enough to complete before deeper runtime rewrites.

Included work:

- create a strict goal gap audit artifact under `docs/auftakt/`
- update strict wording so scoped completion and strict final goals are not
  conflated
- add or extend a guard that classifies raw session usage in production code as
  either allowed internal transport or forbidden public/app/plugin exposure
- strengthen facade and package inventory so allowlisted convenience surfaces
  have explicit reasons
- add proof that plugin APIs do not expose raw session, storage, or materializer
  handles
- record follow-up implementation candidates with priority and verification
  gates

Excluded work:

- implementing every NIP immediately
- replacing the runtime transport design
- adding full NDK-compatible models
- moving persistence to Web Worker, SQLite, WASM, or a real relay process
- changing UI behavior
- building a relay server

## Follow-Up Candidate Phases

The audit should produce follow-up candidates in priority order:

1. Capability-aware ordinary read verification: make non-cache-only ordinary
   reads use negentropy-first verification where local coverage exists, with
   REQ fallback and clear settlement.
2. Coordinator-owned publish settlement: model local pending, relay accepted,
   relay rejected, retrying, and exhausted states through coordinator vocabulary.
3. Sync cursor incremental repair: define and prove restart-safe incremental
   fetch and repair using durable cursors.
4. Broader outbox routing: extend relay selection for replies, reactions,
   `nevent`, `naddr`, addressable events, and audience relays.
5. NDK-like model expansion: add higher-level handles only where Resonote
   workflows need them.
6. Storage hot-path hardening: prove no broad scans in high-volume read,
   deletion, relay hint, and projection paths.

## Error Handling Requirements

The audit must require strict paths to preserve these behaviors:

- invalid relay candidates are quarantined and not emitted
- materialization failures produce degraded internal durability only where
  current coordinator policy allows hot-index fallback
- `kind:5` writes are critical priority and update deletion visibility before
  late targets can become visible
- non-cache-only relay failures are represented through settlement or high-level
  error callbacks, not raw packet exposure
- pending publish failures are durable when the event is retryable

## Verification Design

Existing verification remains part of the baseline:

- `pnpm run check:auftakt-migration -- --proof`
- `pnpm run check:auftakt-migration -- --report consumers`
- `pnpm run check:auftakt:nips`
- `pnpm run check:auftakt:strict-closure`
- `pnpm run test:auftakt:core`
- `pnpm run test:auftakt:storage`
- `pnpm run test:auftakt:resonote`
- `pnpm run test:packages`

The first implementation phase should add one new focused gate or extend an
existing one so it can prove:

- raw relay session usage is classified by layer
- app, package public, and plugin APIs do not expose raw relay or storage
  handles
- docs do not claim strict final completion where only scoped completion is
  proven
- NIP matrix wording distinguishes implemented, internal, compat,
  unsupported-by-design, and out-of-scope states

## Acceptance Criteria

The audit/spec phase is complete when:

- the strict goal gap artifact exists and covers all seven target areas
- each row has evidence, verdict, strict gap, first-phase decision, and gate
- scoped completion claims remain backed by current passing commands
- strict final goal gaps are explicit and prioritized
- the first implementation phase can be turned into a concrete implementation
  plan without re-asking what "complete" means
