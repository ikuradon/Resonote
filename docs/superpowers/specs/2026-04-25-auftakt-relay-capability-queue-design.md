# Auftakt Relay Capability Queue Design

Date: 2026-04-25
Branch: `feat/auftakt`

## Summary

This design covers the next handoff wave after the strict coordinator surface
rewrite: NIP-11 relay capability caching, max-filter/max-subscription-aware
REQ execution, and a separate app-facing capability observation API.

The implementation should keep raw relay sessions and raw NIP-11 documents
internal. App-facing consumers receive normalized operational capability state
through `snapshotRelayCapabilities()` and `observeRelayCapabilities()`.

## Current Context

The strict coordinator surface work has moved app-facing reads and
subscriptions behind coordinator mediation. Current code already has:

- `@auftakt/core` request identity, request planning, relay session replay,
  filter sharding by configured capability, connection observation, and NIP-01
  transport primitives.
- `@auftakt/resonote` coordinator-owned read, subscription, publish, repair, and
  relay status wrappers.
- `@auftakt/adapter-dexie` durable event, quarantine, deletion, replaceable,
  relay hint, sync cursor, pending publish, projection, and migration tables.
- `$shared/auftakt/resonote.ts` as the app-facing facade boundary.

The remaining gap is that relay capability policy is still mostly runtime-local
and configured manually. The next wave should fetch, cache, learn, enforce, and
observe relay capability limits without exposing raw transport internals.

## Goals

- Prefetch NIP-11 capability metadata when default relays are set.
- Persist NIP-11 success and failure state in Dexie with explicit TTLs.
- Preserve learned safety bounds from REQ errors indefinitely.
- Use effective relay limits to batch, shard, queue, and replay REQ traffic.
- Keep unknown or failed NIP-11 relays behavior-interoperable by treating missing
  limits as unlimited unless a learned safety bound exists.
- Add `snapshotRelayCapabilities()` and `observeRelayCapabilities()` as a
  separate capability observation surface.
- Prevent duplicate event emissions caused by batch, shard, relay, or reconnect
  fan-out.

## Non-Goals

- NDK-style entity handles.
- Broad outbox routing for replies, reactions, `nevent`, or `naddr`.
- Lazy connect, idle disconnect, or adaptive reconnect policy changes beyond
  queue interop.
- UI redesign for relay settings.
- Publishing raw NIP-11 relay documents as public app API.

## Design Decisions

- Capability observation is a separate API from existing relay status
  observation.
- Public capability packets expose normalized operational fields only:
  `url`, `maxFilters`, `maxSubscriptions`, `supportedNips`, `queueDepth`,
  `activeSubscriptions`, `source`, `expiresAt`, and `stale`.
- NIP-11 success TTL is one hour.
- NIP-11 failure TTL is five minutes.
- NIP-11 failure or absence does not degrade a relay and does not remove learned
  safety bounds.
- Learned safety bounds from REQ errors are kept indefinitely.
- Effective limits are the strictest known value:
  `min(fresh NIP-11, learned safety bound, runtime override)`.
- Limits are loosened only when a fresh NIP-11 success proves the relay can
  handle the wider bound.

## Architecture

`@auftakt/core` owns execution control. It receives relay capability snapshots
and uses them to build relay-specific request execution plans, shard filters,
limit active subscriptions, queue excess shards, replay queued work after
reconnect, and emit learned-capability events when relay errors reveal stricter
limits.

`@auftakt/resonote` owns policy and public mediation. It hydrates capability
state from Dexie, prefetches expired or missing NIP-11 documents for default
relays, computes effective capabilities, passes them into the core session, and
exposes normalized capability snapshots and observations.

`@auftakt/adapter-dexie` owns durable capability state. It stores NIP-11 metadata
freshness separately from learned execution safety bounds so a later NIP-11
failure cannot erase previously learned limits.

`$shared/auftakt/resonote.ts` remains the single app-facing import point. It
adds thin facade functions for capability snapshots and observation and does not
expose raw relay sessions, Dexie handles, materializer queues, or raw NIP-11
documents.

## Components

### Core Capability Execution

Core should introduce internal capability types such as:

```ts
type RelayCapabilitySource = 'unknown' | 'nip11' | 'learned' | 'mixed' | 'override';

interface RelayExecutionCapability {
  readonly relayUrl: string;
  readonly maxFilters: number | null;
  readonly maxSubscriptions: number | null;
  readonly supportedNips: readonly number[];
  readonly source: RelayCapabilitySource;
}
```

`RelaySession` should keep per-relay execution state:

- active subscription count
- queued shard count
- pending shard queue
- relay-specific execution plan
- learned capability event callback

Filter batching follows the existing logical request model. Multiple filters in
one logical request remain one app-visible request. For each relay, core shards
that logical request by the relay's effective `maxFilters`. If sending all
shards would exceed `maxSubscriptions`, extra shards stay in a per-relay queue
until EOSE, CLOSED, unsubscribe, or reconnect replay frees slots.

### Dexie Capability Store

Dexie should add a `relay_capabilities` table keyed by relay URL. The record
stores:

- `relay_url`
- `nip11_status`: `unknown`, `ok`, or `failed`
- `nip11_checked_at`
- `nip11_expires_at`
- `supported_nips`
- `nip11_max_filters`
- `nip11_max_subscriptions`
- `learned_max_filters`
- `learned_max_subscriptions`
- `learned_at`
- `learned_reason`
- `updated_at`

NIP-11 updates may replace NIP-11 fields. They must not clear learned fields.
Learned updates may only tighten bounds unless a verified fresh source proves a
wider value is safe.

### Resonote Capability Registry

`@auftakt/resonote` should create a capability registry around the coordinator
runtime. The registry:

- loads persisted records from Dexie during coordinator/session setup
- prefetches default relay NIP-11 documents when relays are configured
- ignores fresh failure records until their five-minute TTL expires
- computes effective capability snapshots
- applies learned events from core immediately
- writes NIP-11 and learned updates back to Dexie
- publishes normalized observation packets

### App-Facing API

The package and facade should expose:

```ts
snapshotRelayCapabilities(urls: readonly string[]): Promise<RelayCapabilitySnapshot[]>;

observeRelayCapabilities(
  onPacket: (packet: RelayCapabilityPacket) => void
): Promise<{ unsubscribe(): void }>;
```

The public packet shape is normalized operational state:

```ts
interface RelayCapabilitySnapshot {
  readonly url: string;
  readonly maxFilters: number | null;
  readonly maxSubscriptions: number | null;
  readonly supportedNips: readonly number[];
  readonly queueDepth: number;
  readonly activeSubscriptions: number;
  readonly source: 'unknown' | 'nip11' | 'learned' | 'mixed' | 'override';
  readonly expiresAt: number | null;
  readonly stale: boolean;
}

interface RelayCapabilityPacket {
  readonly from: string;
  readonly capability: RelayCapabilitySnapshot;
}
```

`null` limits mean unlimited or unknown. Consumers should not infer a concrete
relay limit from `null`.

## Data Flow

1. A default relay list is configured through the existing coordinator/facade
   path.
2. Resonote loads each relay's persisted capability record from Dexie.
3. If the NIP-11 success record is fresh, its NIP-11 fields are available for
   effective limit calculation.
4. If the NIP-11 failure record is fresh, no immediate HTTP retry is attempted.
   Runtime execution still uses any learned safety bound.
5. If there is no fresh NIP-11 state, Resonote prefetches the relay information
   document.
6. A successful NIP-11 fetch stores status `ok`, supported NIPs, limits, and a
   one-hour expiry.
7. A failed NIP-11 fetch stores status `failed` and a five-minute expiry without
   changing learned bounds.
8. Core receives effective capabilities and uses them for request execution.
9. Core batches equal logical requests by request identity, shards per relay by
   `maxFilters`, and queues excess shards by `maxSubscriptions`.
10. If a relay returns `CLOSED` with a limit-related reason, core emits a learned
    capability event. Resonote stores the learned bound and recomputes effective
    capability for subsequent execution.
11. Capability snapshots combine persisted metadata with runtime queue state.
12. Capability observation packets fire on NIP-11 updates, learned updates, queue
    depth changes, and active subscription changes.

## Rx-Nostr Interop Model

This design follows relay-session's batching and sharding ideas, not its public API.
The internal behavior should preserve these properties:

- app callers create one logical read or subscription
- the runtime batches interoperable filters under one logical request
- relay-specific shard plans respect `max_filters`
- relay-specific queues respect `max_subscriptions`
- reconnect replay restores the same relay-specific shard policy
- app-facing handlers do not see shard IDs, transport subscription IDs, or raw
  relay packets

## Duplicate Event Handling

Batching, sharding, multi-relay fan-out, and reconnect replay can produce the
same event more than once. The system should deduplicate in two layers.

First, coordinator ingress keeps a short-lived inflight map keyed by event id.
If the same event id arrives while validation or materialization is already in
progress, the subsequent packet waits for the same result or contributes only relay
hint information. Validation failure for one packet does not permanently reject
the id, because another relay may provide a valid event with the same id.

Second, the materializer and store provide durable deduplication. Dexie
`putWithReconcile()` remains the final authority for duplicate event ids,
replaceable events, deletions, and visibility. Within one logical subscription,
consumer callbacks receive a given event id at most once. Relay hints may still
be updated for each relay where the event is observed.

## Error Handling

- NIP-11 fetch failure records metadata failure only. It does not mark the relay
  transport as degraded.
- Unknown or failed NIP-11 state uses unlimited execution limits unless a
  learned safety bound exists.
- Learned bounds are never cleared by NIP-11 failure.
- Limit-related `CLOSED` packets are treated as learning signals, not fatal
  app-facing errors.
- If an error reason includes a numeric limit, the learned bound uses that
  number.
- If a `max_filters` error has no numeric value, the learned bound falls back to
  `1`.
- If a `max_subscriptions` error has no numeric value, the learned bound falls
  back to the number of active subscriptions that was known to be accepted, or
  `1` if no accepted count exists.
- Malformed, invalid-id, or invalid-signature events still go through existing
  coordinator ingress quarantine and are not emitted.
- Queue pressure is surfaced through capability observation state instead of raw
  transport errors.

## Tests And Guards

Core contract tests should cover:

- relay-specific sharding from NIP-11 `max_filters`
- per-relay queueing from `max_subscriptions`
- slot release after EOSE, CLOSED, unsubscribe, and reconnect replay
- learned capability events from limit-related `CLOSED` packets
- recomputing shard plans after learned bounds tighten
- logical request batching and event-id deduplication across shards

Adapter-Dexie contract tests should cover:

- `relay_capabilities` schema and indexes
- NIP-11 success TTL persistence
- NIP-11 failure TTL persistence
- learned safety bound persistence without expiry
- failed NIP-11 updates preserving learned bounds
- effective-limit source data surviving store recreation

Resonote contract tests should cover:

- default relay setting prefetches expired or missing capabilities
- fresh failed records suppress immediate retry but preserve learned execution
  bounds
- Dexie hydration passes effective capabilities into the core session
- learned core events update Dexie and capability observation packets
- snapshot and observe APIs return normalized fields only
- plugin APIs and facade exports do not expose raw NIP-11 documents or raw relay
  sessions

Facade tests should cover:

- `$shared/auftakt/resonote.ts` delegates `snapshotRelayCapabilities()` and
  `observeRelayCapabilities()` to the coordinator
- existing relay status APIs remain source-interoperable and separate from
  capability APIs

Completion verification:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

## Acceptance Criteria

- Default relay configuration triggers NIP-11 prefetch for missing or expired
  capability records.
- Successful NIP-11 records expire after one hour.
- Failed NIP-11 records expire after five minutes.
- Learned safety bounds are durable and do not expire.
- NIP-11 failure cannot loosen a learned effective limit.
- REQ execution respects effective `maxFilters` and `maxSubscriptions`.
- Limit-related relay errors tighten learned bounds and affect later execution.
- `snapshotRelayCapabilities()` and `observeRelayCapabilities()` expose only
  normalized operational fields.
- Duplicate event ids from batch, shard, relay fan-out, or reconnect replay are
  emitted at most once per logical subscription.
- Existing strict coordinator closure and migration proof checks pass.
