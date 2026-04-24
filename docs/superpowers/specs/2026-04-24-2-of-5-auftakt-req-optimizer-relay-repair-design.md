# Auftakt REQ Optimizer and Relay Repair Design

## Status

Follow-up design spec 2 of 5 for the Auftakt full redesign.

Depends on:

- `2026-04-24-1-of-5-auftakt-coordinator-local-first-pipeline-design.md`

## Problem

Auftakt already has request keys, request execution plans, shard generation,
relay session replay, and negentropy repair hooks. The gap is that these pieces
are not yet a coordinator-owned adaptive planner. Existing relay requests can
still be shaped by the caller, and optimization does not consistently account
for hot-cache coverage, durable local coverage, relay capabilities, reconnect
state, or repair policy.

The target is an rx-nostr-class relay lifecycle with automatic REQ optimization:
callers describe intent, and the coordinator chooses the smallest safe set of
relay work.

## Scope

This spec covers:

- Request descriptor normalization.
- Relay capability-aware planning.
- Adaptive filter batching and shard sizing.
- Duplicate request coalescing.
- Reconnect replay.
- Negentropy and fallback repair.
- Backpressure and fairness rules.

This spec excludes:

- The coordinator/materializer implementation from Spec 1.
- Feature read-model migration from Spec 3.
- NIP compliance claims from Spec 4.
- Storage compaction from Spec 5.

## Architecture

Add a `RequestPlanner` owned by `EventCoordinator`.

Inputs:

- canonical filter group
- read policy
- known local coverage from `HotEventIndex`
- known durable coverage from `DexieEventStore`
- relay set and relay hints
- relay capability snapshot
- active request registry
- reconnect/repair reason

Outputs:

- canonical `requestKey`
- `logicalKey` for coalescing
- relay selection
- per-relay shards
- replay descriptor
- repair descriptor
- settlement expectations

`RelayGateway` executes only planner output. It must not construct ad hoc REQ
filters.

## Relay Capabilities

Capabilities are learned from:

- static defaults
- NIP-11 metadata when available
- observed `CLOSED`/error responses
- max filter count failures
- timeout and EOSE behavior
- negentropy support cache

The planner stores capabilities per relay:

- max filters per REQ
- max ids/authors per filter
- negentropy support
- recent failure/backoff state
- average EOSE latency
- duplicate delivery rate

Unknown capabilities use conservative defaults.

## Planning Rules

Request normalization:

- sort primitive arrays where order is not meaningful
- split selector fields from window fields
- preserve `since`, `until`, and `limit` semantics
- include policy and relay overlay in request identity where they change
  behavior

Local coverage:

- if `HotEventIndex` fully covers a `cacheOnly` request, no relay work is issued
- if Dexie covers the window, relay work is skipped unless policy is
  `relayConfirmed` or `repair`
- if coverage is partial, request only missing windows or missing ids

Batching:

- group authors and ids up to relay capability limits
- shard filters deterministically
- prefer fewer REQs when limits are unknown
- split on relay-specific capability failures and cache the result

Coalescing:

- identical logical requests share one relay subscription
- different app consumers keep separate settlements
- repair requests use a separate coalescing scope from foreground app reads

## Reconnect Replay

The active request registry stores replay descriptors, not transport sub IDs.
On reconnect:

1. RelayGateway reports relay recovery.
2. RequestPlanner re-evaluates active descriptors with current local coverage.
3. Already materialized events are not re-emitted unless a subscriber policy
   explicitly asks for a fresh snapshot.
4. Missing live/backfill windows are replayed.
5. Duplicate events are absorbed by the Materializer from Spec 1.

Backoff state prevents immediate repeated replay loops. Foreground reads take
priority over background repair.

## Relay Repair

Repair modes:

- `replay`: reissue REQ for active descriptors after reconnect.
- `backfill`: request missing time windows or ids.
- `negentropy`: reconcile local Dexie refs against relay refs.
- `fallback`: use normal REQ when negentropy is unsupported or fails.

Negentropy repair:

- uses local refs selected by the same filter semantics as read requests
- keeps unsupported relay capability cached
- fetches missing ids through the normal planner
- materializes all fetched events before exposing repair emissions

## Backpressure

The planner enforces fairness:

- foreground reads before background repair
- bounded concurrent relay requests per relay
- bounded shards per request
- pause/resume long backfills with cursor state
- avoid full-store repair unless user-initiated or explicitly configured

Settlement must expose degraded states instead of hiding slow relay behavior.

## Verification

Core tests:

- request descriptor normalization
- requestKey stability
- logicalKey coalescing
- shard determinism
- relay capability fallback

Resonote tests:

- no relay call on full local coverage
- partial coverage emits local data and repairs gaps
- duplicate consumers share one transport request
- reconnect replay reuses descriptors
- negentropy unsupported relay falls back to REQ
- repair events materialize before emit

E2E tests:

- relay disconnect and reconnect
- mixed fast/slow relay settlement
- large author list sharding
- offline local-first view then repair after reconnect

Completion gate:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:resonote
pnpm run test:auftakt:e2e
pnpm run check:auftakt-migration -- --proof
```
