# Auftakt Relay Selection Completion Design

Date: 2026-04-26
Branch: `feat/auftakt`

## Summary

This design closes the remaining relay selection and outbox routing gaps after
the initial implementation of `2026-04-26-auftakt-relay-selection-outbox-routing`.

The completion target is option 1 plus a safe form of option 3:

- Normal app/runtime behavior is coordinator-owned. Resonote uses one
  coordinator policy source for reads, subscriptions, by-id reads with explicit
  relay hints, publishes, replies, reactions, and mentions.
- Advanced callers can build their own routing plans when needed, but only
  through safe public surfaces. `@auftakt/core` exposes the pure planner.
  `@auftakt/resonote` does not expose DB-backed routing helpers, raw relay
  sessions, raw storage handles, or mutable routing indexes.

## Current Gaps

The initial relay selection work is implemented and its focused Auftakt gates
pass, but completion is blocked by these issues:

- `pnpm run check` fails because `EventParameters.tags` is optional while
  `buildPublishRelaySendOptions()` currently expects `tags` to be present.
- `packages/resonote/src/runtime.ts` has formatting drift in the touched area.
- `fetchNostrEventById(eventId, relayHints)` still passes explicit relay hints
  as a direct overlay instead of converting them to temporary relay candidates
  and sending them through the planner.
- Relay selection strategy is hard-coded to Resonote's default conservative
  policy inside the coordinator, so developers cannot choose `default-only` or
  `strict-outbox` for coordinator-owned routing.
- `repair` exists in the core selection vocabulary, but the current Resonote
  repair API is a single-relay explicit repair path. The boundary needs to be
  locked so future multi-relay repair routing does not diverge from the shared
  vocabulary.

## Goals

- Make `pnpm run check` pass without weakening type safety.
- Keep default Resonote behavior as conservative outbox routing.
- Add an optional coordinator-level relay selection policy override.
- Route by-id explicit relay hints through the same relay selection planner as
  other reads.
- Preserve a manual routing escape hatch without leaking raw runtime internals.
- Keep package-root closure and plugin isolation intact.
- Add focused contracts for the remaining behavior.

## Non-Goals

- No relay settings UI.
- No raw relay session, storage, or routing-index exposure from
  `@auftakt/resonote`.
- No NDK-style entity handle API.
- No full redesign of `repairEventsFromRelay()`.
- No broad formatting of existing historical docs or unrelated dirty files.

## Architecture

### Coordinator-Owned Policy

`CreateResonoteCoordinatorOptions` gains:

```ts
relaySelectionPolicy?: RelaySelectionPolicyOptions;
```

`createResonoteCoordinator()` resolves one policy value:

- caller-provided `relaySelectionPolicy` when present
- otherwise `RESONOTE_DEFAULT_RELAY_SELECTION_POLICY`

That resolved policy is used for coordinator-owned read, subscription, by-id
read, publish, reply, reaction, and mention routing. This removes repeated
hard-coded default policy references and makes strategy selection a runtime
configuration concern.

The default policy remains internal and conservative:

```ts
{
  strategy: 'conservative-outbox',
  maxReadRelays: 4,
  maxWriteRelays: 4,
  maxTemporaryRelays: 2,
  maxAudienceRelays: 2
}
```

### Safe Manual Routing

Advanced callers can compose custom routing in two safe ways:

- Use the public `@auftakt/core` pure planner
  `buildRelaySelectionPlan()` with their own normalized candidates, then pass
  the selected relays through existing safe read `overlay` or publish transport
  option shapes.
- Provide an explicit overlay/options object to coordinator/facade methods that
  already accept one. The coordinator treats such input as caller-owned manual
  routing and does not rewrite it.

`@auftakt/resonote` continues to hide DB-backed helpers such as
`buildReadRelayOverlay()` and `buildPublishRelaySendOptions()`. Those helpers
depend on runtime storage and default-relay access, so exposing them would
weaken the current closure boundary.

## Data Flow

### Reads And By-Id Hints

Normal reads collect default relays, durable event relay hints, and author
relay-list data, then call the core planner through `buildReadRelayOverlay()`.

`fetchNostrEventById(eventId, relayHints)` changes from direct overlay use to
planner use:

- `relayHints` become `temporary-hint` candidates
- durable hints for `eventId` remain included when enabled by policy
- default read relays remain fallback candidates when enabled by policy
- planner output becomes the transport overlay

If a caller passes an explicit overlay to lower-level read methods, that overlay
remains authoritative and bypasses automatic selection.

### Subscriptions

Subscription registry entries resolve relay selection before transport use when
no explicit use options were supplied. The same coordinator policy is used.
Temporary relays are scoped to the subscription operation and are not persisted
as defaults.

### Publishes, Replies, Reactions, And Mentions

Publish routing accepts both signed/full events and minimal `EventParameters`.
The implementation normalizes missing optional fields:

- `tags` defaults to `[]`
- missing `pubkey` skips author relay-list lookup
- missing `id` does not prevent tag-based audience collection

Reply, reaction, and mention routing continue to collect candidates from event
tags, durable target hints, explicit relay hints embedded in tags, and audience
pubkey relay lists. The selected write relays are passed through the existing
publish transport options.

### Repair

The existing `repairEventsFromRelay(runtime, { relayUrl })` remains a
single-relay explicit repair API. It is not broadened in this completion wave.

The shared vocabulary still includes `intent: 'repair'`. Contracts should lock
that repair-interoperable overlay building uses the same policy path, so a future
multi-relay repair coordinator can reuse the same planner without introducing a
separate routing vocabulary.

## Error Handling

Missing optional `EventParameters` fields are treated as absent routing inputs,
not as errors. Invalid relay URLs are filtered by the core planner. Empty
candidate sets fall back to configured defaults when the policy allows fallback,
or return no automatic overlay/options so the existing transport behavior can
handle the request.

Relay-list absence, missing durable hints, and invalid temporary hints remain
policy-input conditions. They should not surface as raw storage or transport
errors to app consumers.

## Public Surface

`@auftakt/core` remains the public location for pure routing vocabulary and
manual plan construction:

- `buildRelaySelectionPlan()`
- `normalizeRelaySelectionPolicy()`
- `parseNip65RelayListTags()`
- relay selection types

`@auftakt/resonote` exposes coordinator configuration and existing high-level
operations, but not internal routing helpers:

- `relaySelectionPolicy` is accepted by `createResonoteCoordinator()`
- `buildReadRelayOverlay()` is not exported from the package root
- `buildPublishRelaySendOptions()` is not exported from the package root
- `RESONOTE_DEFAULT_RELAY_SELECTION_POLICY` is not exported from the package
  root
- plugin APIs continue to expose only projection, read-model, and flow
  registration

## Testing

Focused contracts should cover:

- `buildPublishRelaySendOptions()` accepts event-parameter-shaped input without
  `tags` or `pubkey`.
- `fetchNostrEventById(eventId, relayHints)` routes relay hints through
  temporary relay candidates and combines them with durable/default candidates.
- `CreateResonoteCoordinatorOptions.relaySelectionPolicy` affects read,
  subscription, and publish routing.
- `@auftakt/resonote` package root still does not expose raw routing helpers or
  the default policy constant.
- `@auftakt/core` still exposes the pure planner for manual routing.
- Repair-interoperable overlay building can use `intent: 'repair'` with the shared
  policy path while the existing explicit single-relay repair API stays
  unchanged.

Completion gates:

```bash
pnpm exec prettier --check packages/core/src/relay-selection.ts packages/core/src/relay-selection.contract.test.ts packages/resonote/src/relay-selection-runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/runtime.ts src/shared/nostr/client.ts src/shared/auftakt/resonote.ts docs/auftakt/status-verification.md docs/superpowers/specs/2026-04-26-auftakt-relay-selection-outbox-routing-design.md docs/superpowers/plans/2026-04-26-auftakt-relay-selection-outbox-routing.md
pnpm run check
pnpm exec vitest run packages/core/src/relay-selection.contract.test.ts packages/core/src/public-api.contract.test.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/plugin-api.contract.test.ts src/shared/nostr/client.test.ts src/features/relays/application/relay-actions.test.ts
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

## Acceptance Criteria

- `pnpm run check` passes.
- Touched relay-selection files pass targeted Prettier checks.
- Resonote default behavior remains conservative outbox routing.
- Developers can configure coordinator-owned routing with `default-only`,
  `conservative-outbox`, or `strict-outbox`.
- Advanced callers can manually build routing plans through `@auftakt/core`
  without receiving raw Resonote runtime internals.
- Explicit by-id relay hints are temporary planner inputs, not durable defaults
  and not direct overlay bypasses.
- Publish routing handles missing optional `EventParameters.tags` and `pubkey`.
- Public API and plugin isolation contracts still block raw routing helper leaks.
