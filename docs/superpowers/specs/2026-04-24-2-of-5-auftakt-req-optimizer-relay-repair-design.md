# Auftakt REQ Optimizer and Relay Repair Design

## Status

Approved follow-up design spec 2 of 5 for the Auftakt full redesign.

Depends on:

- `2026-04-24-1-of-5-auftakt-coordinator-local-first-pipeline-design.md`

## Problem

Auftakt already has request keys, request execution plans, shard generation,
relay session replay, and negentropy repair hooks. The gap is that these pieces
are not yet a coordinator-owned adaptive planner. Existing relay requests can
still be shaped by the caller, and optimization does not consistently account
for hot-cache coverage, durable local coverage, relay capabilities, reconnect
state, or repair policy.

The target is an rx-nostr-class relay lifecycle with automatic difference-check
optimization: callers describe intent, and the coordinator chooses the smallest
safe remote verification work. `localFirst` means local data is emitted first;
it does not mean relay verification is skipped.

## Scope

This spec covers:

- Request descriptor normalization.
- Relay capability-aware planning.
- Adaptive difference checks, filter batching, and shard sizing.
- Duplicate request coalescing.
- Reconnect replay.
- Negentropy-first verification and ordinary REQ fallback.
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
- known durable coverage and event refs from `DexieEventStore`
- relay set and relay hints
- relay capability snapshot
- active request registry
- reconnect/repair reason

Outputs:

- canonical `requestKey`
- `logicalKey` for coalescing
- relay selection
- per-relay verification strategy
- per-relay REQ shards when ordinary REQ is needed
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

Local coverage and remote verification:

- if `HotEventIndex` fully covers a `cacheOnly` request, no relay work is issued
- for `localFirst`, local coverage is emitted immediately, but remote
  verification is still scheduled
- for `relayConfirmed`, local coverage can be emitted as partial settlement, but
  final settlement waits for remote verification
- for `repair`, local coverage defines the local side of the diff
- `cacheOnly` is the only normal read policy that deliberately suppresses remote
  verification

Difference check strategy:

- prefer negentropy when the relay supports it
- use Dexie/HotEventIndex event refs selected by the same canonical filter
- fetch remote-only ids through ordinary REQ by id after negentropy identifies
  them
- fall back to ordinary REQ when negentropy is unsupported, fails, or times out
- when falling back, narrow filters with safe windows such as
  `since = localMaxCreatedAt + 1` only when the query semantics allow it
- for by-id, replaceable, deletion-sensitive, and relay-list reads, use the
  canonical filter when a simple `created_at` increment could miss corrections
- materialize every remote event before updating consumers
- emit only the delta from already-visible local results unless the consumer asks
  for a fresh snapshot

Batching:

- group authors and ids up to relay capability limits for fallback REQ and
  missing-id fetches
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
4. Remote verification is replayed with negentropy first when supported.
5. Ordinary REQ fallback is replayed when negentropy is unsupported or fails.
6. Duplicate events are absorbed by the Materializer from Spec 1.

Backoff state prevents immediate repeated replay loops. Foreground reads take
priority over background repair.

## Relay Repair

Remote verification and repair modes:

- `negentropy`: reconcile local Dexie refs against relay refs.
- `missing-id-fetch`: fetch ids found by negentropy through ordinary REQ.
- `fallback-req`: use normal REQ when negentropy is unsupported or fails.
- `replay`: re-run the descriptor after reconnect.
- `backfill`: request missing time windows or ids when a bounded gap is known.

Negentropy-first verification:

- runs for normal `localFirst` and `relayConfirmed` reads when the relay supports
  it
- uses local refs selected by the same filter semantics as read requests
- keeps unsupported relay capability cached
- fetches remote-only ids through the normal planner
- materializes all fetched events before exposing emissions
- falls back to ordinary REQ on unsupported capability, protocol failure, or
  timeout

## Backpressure

The planner enforces fairness:

- foreground reads before background repair
- bounded concurrent relay requests per relay
- bounded shards per request
- pause/resume long backfills with cursor state
- avoid full-store negentropy unless user-initiated or explicitly configured

Settlement must expose degraded states instead of hiding slow relay behavior.

## Verification

Core tests:

- request descriptor normalization
- requestKey stability
- logicalKey coalescing
- shard determinism
- relay capability fallback
- negentropy-first strategy selection

Resonote tests:

- localFirst emits local data but still schedules remote verification
- cacheOnly is the only policy that skips remote verification
- partial coverage emits local data and verifies relay delta
- duplicate consumers share one transport request
- reconnect replay reuses descriptors
- negentropy unsupported relay falls back to REQ
- negentropy-supported relay fetches only remote-only ids by ordinary REQ
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
