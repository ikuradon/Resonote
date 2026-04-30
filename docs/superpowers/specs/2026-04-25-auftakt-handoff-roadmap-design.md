# Auftakt Handoff Roadmap Design

Date: 2026-04-25
Branch: `feat/auftakt`

## Summary

This design turns the remaining handoff work from
`2026-04-25-auftakt-strict-coordinator-surface-design.md` into an ordered
roadmap.

The relay capability queue handoff is already covered by
`2026-04-25-auftakt-relay-capability-queue-design.md` and its implementation
plans. This roadmap treats that work as a prerequisite and focuses on the
remaining waves:

1. Relay lifecycle policy.
2. Relay selection and outbox routing.
3. NDK-like entity handles.
4. NIP inventory refresh automation.

The goal is sequencing and boundary clarity, not file-level implementation
planning. Each wave should get its own focused design and implementation plan
before code changes begin.

## Current Context

The strict coordinator surface work makes the coordinator the app-facing event
IO boundary. Reads, subscriptions, publish, repair, and materialization are
expected to pass through coordinator-owned validation, durable storage, hot
indexes, and visibility filtering.

The relay capability queue work adds the next transport prerequisite:

- NIP-11 success and failure caching.
- Learned relay safety bounds.
- Effective `max_filters` and `max_subscriptions` execution limits.
- Queue state and active subscription observation.
- Normalized app-facing capability snapshots.

After those pieces, the remaining handoff work should not re-open raw relay
sessions or raw storage as public concepts. It should build policy and
ergonomic APIs on top of the strict coordinator surface.

## Goals

- Record the implementation order for the remaining handoff waves.
- Keep each wave small enough for its own later spec and plan.
- Preserve strict coordinator boundaries across lifecycle, routing, handles,
  and documentation automation.
- Avoid duplicate planning for relay capability queue work that already has a
  separate design.
- Make dependencies explicit so later specs do not build on unstable policy.

## Non-Goals

- No code-level implementation plan in this document.
- No redesign of relay capability queue behavior.
- No UI redesign for relay settings, profiles, or timelines.
- No new public raw relay session, Dexie handle, materializer queue, or raw
  NIP-11 document surface.
- No automatic support-status promotion for NIPs.

## Roadmap Order

The recommended order is:

1. Relay capability queue.
2. Relay lifecycle policy.
3. Relay selection and outbox routing.
4. Entity handles.
5. NIP inventory refresh automation.

Relay capability queue is already designed and planned, so this roadmap starts
with the four waves after it.

Lifecycle comes before routing because routing needs stable execution semantics:
when selected relays connect, how temporary relays are retired, and how failed
relays re-enter service.

Routing comes before entity handles because handles should expose stable
coordinator-backed behavior. If handles are introduced before relay selection
policy is settled, they may accidentally encode the wrong routing assumptions
into app-facing API.

NIP inventory automation can be done in parallel, but it should not block the
runtime policy waves. It is placed last because it benefits from settled owner,
status, and proof boundaries.

## Wave 1: Relay Lifecycle Policy

Relay lifecycle policy defines how the coordinator-owned runtime opens, keeps,
closes, and reconnects relay transport connections.

The intended policy is:

- default read and write relays use lazy-keep behavior
- temporary hint relays use lazy connection plus idle disconnect
- failed relay reconnects are bounded with backoff
- adaptive reconnect state is internal runtime policy, not an app-facing
  transport contract
- lifecycle state is exposed only through normalized relay status or capability
  observation surfaces

This wave depends on relay capability queue state for active subscription and
queue pressure, but it should not expose capability internals as lifecycle API.

Completion criteria:

- default relays connect lazily and remain available while useful
- temporary hint relays disconnect after an idle timeout
- reconnect/backoff behavior is deterministic and bounded in tests
- lifecycle failures do not leak raw transport errors into normal UI paths
- relay status and capability observations remain normalized

## Wave 2: Relay Selection And Outbox Routing

Relay selection policy decides which relays are used for read, repair,
subscription, and publish intents.

Relay candidates are composed from:

- bootstrap/default relays
- `kind:10002` user relay lists
- temporary hints from `nevent`, `naddr`, `nprofile`, and similar inputs
- durable relay hints recorded from seen and published events
- audience relays for replies, reactions, mentions, and related publish flows

The policy should remain coordinator-owned. Feature code should provide intent,
subjects, and optional overrides; it should not assemble raw relay request
plans itself.

Temporary hint relays must not be merged into durable defaults. Durable relay
hints may inform routing, but plugin and feature code must not mutate routing
indexes directly.

Completion criteria:

- missing, empty, invalid, or stale `kind:10002` records fall back to bootstrap
  or default relays
- temporary hint relays are isolated to the request or subscription that needs
  them
- read, repair, publish, reply, reaction, and audience routing have explicit
  policy tests
- relay hint usage is read-only outside coordinator/materializer ownership
- existing local-first read behavior is preserved when relay candidates are
  weak or unavailable

## Wave 3: Entity Handles

Entity handles provide an ergonomic NDK-like app-facing API without weakening
the strict coordinator surface.

Candidate handles include:

- `event(id)`
- `profile(pubkey)`
- `addressable(coord)`
- `relaySet(subject)`
- `relayHints(eventId)`

Handles are thin API objects. They delegate to coordinator reads,
subscriptions, publishes, repairs, and read models. They must not expose raw
relay packets, raw Dexie rows, raw sessions, materializer queues, or plugin
registry internals.

Handles should be additive at first. Existing facade function names remain
available unless a later focused cleanup proves a function is internal-only and
unused by production app consumers.

Completion criteria:

- handle methods express deleted, missing, local, partial, repaired, and
  relay-confirmed states through high-level settlement data
- handles use relay selection policy rather than caller-built relay fan-out
- existing facade interop tests still pass
- plugin APIs remain limited to read models, projections, and flows
- strict closure guards prove handles cannot leak raw transport or storage
  internals

## Wave 4: NIP Inventory Refresh Automation

NIP inventory automation keeps the local NIP matrix and documentation aligned
with the official NIP inventory and project proof commands.

The automation should:

- detect official inventory drift
- detect local matrix entries with missing owner, support boundary, or proof
  command
- keep README/status documentation in sync with the canonical matrix
- fail checks on unknown or unclassified NIPs
- require human review for support-status changes

Official fetch failure must not rewrite local docs. It should report a check
failure or use an explicit fixture mode for deterministic tests.

Completion criteria:

- matrix drift is detected by CI-friendly checks
- owner and proof gaps fail deterministically
- docs sync checks identify stale README/status rows
- fixture tests cover official inventory changes without network access
- automation never promotes NIP support status without review

## Error Handling

Relay lifecycle errors are normalized into status, capability, or lifecycle
state. A failed connection, rate limit, or reconnect attempt should not expose
raw transport packet shapes to app consumers.

Relay selection errors degrade toward local-first and bootstrap/default relay
fallback. Broken relay-list events, absent hints, or failed temporary relays do
not poison durable default relay state.

Entity handles translate storage misses, relay misses, deletion visibility, and
partial settlement into handle-level state. Consumers should not need to inspect
Dexie rows, relay packets, or materializer internals.

NIP inventory automation treats network or official fetch failure as a check
problem, not as permission to rewrite the local matrix.

## Verification Strategy

Every wave should keep the standard strict verification gate:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Wave-specific verification should add:

- lifecycle contract tests for connection mode, idle disconnect,
  reconnect/backoff, and status observation
- selection tests for relay candidate composition, temporary hint isolation,
  publish audience routing, fallback, and relay hint read-only behavior
- handle tests for raw surface closure, facade interop, settlement state,
  deletion state, and partial results
- NIP automation tests for official inventory fixtures, matrix drift,
  owner/proof gaps, and README/status sync

## Acceptance Criteria

- Relay capability queue remains referenced as an existing prerequisite, not
  redesigned in this roadmap.
- Remaining handoff work is split into four ordered waves with clear
  dependencies.
- Later entity handles are explicitly blocked on settled relay selection
  policy.
- Strict coordinator mediation remains mandatory for every wave.
- No wave introduces public raw relay session, raw storage, raw materializer, or
  raw NIP-11 document access.
- Each wave has clear acceptance criteria suitable for a later focused design
  and implementation plan.
