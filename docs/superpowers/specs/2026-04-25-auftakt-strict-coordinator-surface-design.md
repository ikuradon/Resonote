# Auftakt Strict Coordinator Surface Rewrite Design

Date: 2026-04-25
Branch: `feat/auftakt`

## Summary

This design narrows the next Auftakt implementation wave to strict coordinator
mediation. The goal is to make `@auftakt/resonote` expose and use a
coordinator-owned surface where local storage is the source of truth, relays are
repair and verification inputs, and raw relay packets never become public API
results.

The broader goals for relay-session-like request optimization, NDK-like entity APIs,
and expanded outbox intelligence remain valid, but they are handoff work after
this surface rewrite.

## Current Context

The current codebase already has major strict-runtime pieces:

- `@auftakt/core` owns vocabulary, request planning, relay session primitives,
  validation, settlement, and reconcile vocabulary.
- `@auftakt/adapter-dexie` owns the durable event store, quarantine,
  `deletion_index`, `replaceable_heads`, `event_relay_hints`,
  `sync_cursors`, projections, and pending publishes.
- `@auftakt/resonote` owns `EventCoordinator`, event ingress, materializer queue,
  hot event index, relay gateway, and plugin registration.
- `pnpm run test:auftakt:core`, `pnpm run test:auftakt:storage`,
  `pnpm run test:auftakt:resonote`, `pnpm run check:auftakt:nips`,
  `pnpm run check:auftakt:strict-closure`, and
  `pnpm run check:auftakt-migration -- --proof` pass at design time.

The remaining architectural gap is that some runtime and bridge paths still use
raw session-style operations internally. The rewrite should remove those bypass
paths as public or app-facing concepts and make them coordinator implementation
details.

## Goals

- All app-facing reads and subscriptions are mediated by a coordinator surface.
- Relay candidates pass through validation, quarantine-on-failure,
  materialization, and visibility filtering before consumer emission.
- Local Dexie storage plus hot indexes are the read source of truth.
- `cacheOnly` is the only normal policy that suppresses remote verification.
- `kind:5` handling remains critical-priority materialization work.
- Existing app-facing facade functions stay source-interoperable unless a function
  is proven to be internal-only and unused by production consumers.
- Tests and guards prove that raw relay events cannot escape to public read or
  subscription results.

## Non-Goals

- NIP-11 capability cache and max-subscription-aware relay queueing.
- New NDK-style entity/model API.
- Broad outbox relay routing beyond existing relay hints.
- Official NIP inventory auto-refresh.
- UI refactors unrelated to the coordinator boundary.

## Coordinator Surface

`@auftakt/resonote` should promote `EventCoordinator` from a narrow read helper
into the runtime-owned boundary for event IO.

The intended internal surface is:

- `read(filters, policy)` reads local visible events first, then verifies and
  repairs from relays for non-`cacheOnly` policies.
- `subscribe(filters, policy, handlers)` subscribes to relay transport
  internally but only emits materialized visible events to handlers.
- `publish(event, policy)` centralizes signing or pre-signed event handling,
  relay OK tracking, pending publish durability, and published relay hints.
- `repair(filters, relays)` owns negentropy-first repair with REQ fallback and
  returns repair/materialization settlement, not raw relay packets.
- `materialize(candidate, relayUrl)` is the only relay-candidate ingress path.

The raw transport session remains available only behind coordinator internals.
It should not be exposed by package root exports, app facade exports, plugin
APIs, or app-facing runtime types.

## Data Flow

### Reads

`cachedFetchById`, `useCachedLatest`, `fetchBackwardEvents`,
`fetchBackwardFirst`, `fetchNostrEventById`, profile metadata reads, emoji
source reads, bookmark reads, and relay-list reads should call coordinator read
APIs.

The read order is:

1. Check hot index and durable Dexie visibility.
2. Return local results with `ReadSettlement` provenance.
3. For non-`cacheOnly`, ask the coordinator relay gateway to verify or repair.
4. Validate and materialize accepted relay candidates.
5. Merge visible local and materialized events by event id.
6. Return settlement that distinguishes partial local hits, relay hits, and
   settled misses.

### Subscriptions

Comment, notification, deletion reconcile, and merged live subscriptions should
be coordinator subscriptions. The shared subscription registry can remain as an
internal transport optimizer, but handlers receive only visible events:

```ts
type VisibleSubscriptionPacket<TEvent> = {
  event: TEvent;
  relayHint?: string;
};
```

Raw `{ from, event }` packets stay inside coordinator internals. Incoming relay
events are processed through ingress validation and materialization before any
consumer callback runs.

### Publish

Publishing moves under the coordinator path:

1. Accept a signed event or sign through the configured signer.
2. Persist retryable pending publish state before reporting durable local
   pending settlement when delivery fails.
3. Send to write relays through the transport.
4. Record successful relay OK packets as `event_relay_hints` with source
   `published`.
5. Drain retries from Dexie pending publishes through the same publish path.

### Deletion And Visibility

`kind:5` events use critical materializer priority. The materializer stores the
deletion event, updates `deletion_index`, suppresses matching existing targets,
and rejects late matching targets from visible reads. Consumers observe deleted
or missing visibility through coordinator results rather than raw storage rows.

## Boundary Cleanup

- Replace `src/shared/nostr/query.ts` package-runtime direct calls with facade
  or coordinator-backed helpers.
- Replace `src/shared/nostr/cached-query.svelte.ts` direct runtime helper use
  with the same coordinator-backed facade path.
- Reduce `ResonoteRuntime` dependencies on `getRelaySession`,
  `createBackwardReq`, and `createForwardReq` to an internal transport
  implementation dependency, not a public runtime contract.
- Keep `src/shared/auftakt/resonote.ts` as the single app-facing import point.
- Keep plugin APIs limited to projections, read models, and flows. Plugins do
  not receive raw relay sessions, Dexie handles, or materializer queues.

## Error Handling

- Malformed, invalid-id, and invalid-signature relay candidates are quarantined
  and not emitted.
- Dexie materialization failures return degraded durability and may use the hot
  index for temporary visibility when the existing coordinator policy permits
  it.
- Relay failures during non-`cacheOnly` reads do not leak raw transport errors
  to normal UI paths. Results are expressed through settlement state.
- Subscription errors are reported through high-level handlers without exposing
  transport packet shapes.
- Pending publish failures are durable when the event is retryable; non-retryable
  unsigned failures remain regular publish errors.

## Tests And Guards

Implementation should add or strengthen these proofs:

- `EventCoordinator` contract tests for `read`, `subscribe`, `publish`,
  `repair`, and `materialize` as the only relay-candidate path.
- Subscription contract tests proving handlers receive visible events, never raw
  relay packets.
- Facade regression tests proving `cachedFetchById`, `useCachedLatest`, and
  backward fetch flows are coordinator-mediated.
- Storage contract tests proving coordinator-driven `kind:5`, replaceable,
  relay hint, and pending publish writes update Dexie tables correctly.
- Strict closure guard extensions for production `packages/resonote/src` and
  `src/shared/nostr` raw event emission regressions.
- Completion verification with:
  - `pnpm run test:auftakt:core`
  - `pnpm run test:auftakt:storage`
  - `pnpm run test:auftakt:resonote`
  - `pnpm run check:auftakt-migration -- --proof`
  - `pnpm run check:auftakt:strict-closure`

## Handoff Work

These items remain intentionally outside this implementation wave:

- NIP-11 metadata fetch, durable capability cache, and
  max-filters/max-subscriptions-aware command queues.
- Lazy relay connection, idle disconnect, and adaptive reconnect policies.
- NDK-like entity handles for events, profiles, relay sets, relay hints, and
  addressable coordinates.
- Broader outbox relay routing for replies, reactions, `nevent`, and `naddr`.
- Official NIPs inventory refresh automation.

## Acceptance Criteria

- App-facing read and subscription APIs cannot return relay data unless it has
  passed coordinator ingress and materialized visibility.
- Package root and facade surfaces do not expose raw request/session APIs.
- Existing facade function names remain available to production app consumers.
- Deletion, replaceable, relay hint, quarantine, and pending publish behavior
  continue to pass package contract tests.
- Strict closure and migration proof scripts pass after the rewrite.
