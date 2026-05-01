# Auftakt Relay Selection And Outbox Routing Design

Date: 2026-04-26
Branch: `feat/auftakt`

## Summary

This design covers the next focused handoff wave after relay lifecycle policy:
relay selection and outbox routing for reads, subscriptions, repair, publish,
reply, reaction, and mention flows.

The key decision is that relay selection is an Auftakt runtime concern, not a
Resonote-only convenience. `@auftakt/core` owns generic Nostr relay selection
vocabulary, NIP-65 `kind:10002` relay-list parsing, strategy presets, relay
budgeting, and pure selection planning. `@auftakt/resonote` gathers app/runtime
inputs such as materialized relay-list events, durable event relay hints,
temporary NIP-19 hints, and Resonote operation subjects, then delegates planning
to core.

Outbox/inbox routing is configurable. Auftakt should support developers who
want no outbox model, developers who want conservative mobile-friendly routing,
and developers who want strict outbox/inbox fan-out.

## Current Context

The strict coordinator surface work made the coordinator the app-facing event IO
boundary. Relay candidates are validated, materialized, reconciled, and filtered
before app consumers see them.

Relay capability queue and relay lifecycle policy are prerequisites for this
wave:

- capability policy can enforce `max_filters`, `max_subscriptions`, queue depth,
  active subscription tracking, and learned safety bounds
- lifecycle policy keeps default relays as lazy-keep and treats temporary relays
  as lazy with idle disconnect
- durable `event_relay_hints` already exist in the Dexie adapter and hot index
- current read paths can pass explicit `overlay.relays` into the core session

The remaining gap is policy ownership. Today, explicit temporary relay hints can
be used, and default relays can be set, but the runtime does not yet expose a
coherent coordinator-owned selection plan across read, repair, subscription,
publish, reply, reaction, and mention intents.

## Goals

- Treat NIP-65 relay-list parsing and relay selection planning as generic
  `@auftakt/core` capabilities.
- Let developers choose between no outbox routing, conservative outbox routing,
  and strict outbox/inbox fan-out.
- Keep Resonote feature code from assembling raw relay fan-out plans.
- Preserve strict coordinator mediation for every relay candidate.
- Use temporary hints only for the request, subscription, or publish operation
  that supplied them.
- Use durable relay hints as read-only routing inputs outside coordinator and
  materializer ownership.
- Support read, subscribe, repair, publish, reply, reaction, and mention intents
  with one selection vocabulary.
- Keep existing facade functions source-interoperable while routing them through
  the new policy internally.

## Non-Goals

- No NDK-like entity handle API in this wave.
- No UI redesign for relay settings or routing strategy controls.
- No exposure of raw relay sessions, raw Dexie rows, materializer queues, or raw
  relay-list documents through app or plugin APIs.
- No requirement that Resonote use strict outbox fan-out by default.
- No automatic durable mutation of default relay lists from temporary hints.
- No replacement of the existing capability queue or lifecycle execution
  policy.

## Design Decisions

### Strategy Presets

`@auftakt/core` should define strategy presets:

```ts
type RelaySelectionStrategy = 'default-only' | 'conservative-outbox' | 'strict-outbox';
```

`default-only` avoids outbox/inbox routing. It uses configured default read and
write relays. Explicit temporary hints are included only when
`allowTemporaryHints` is true. It is for developers who want minimal connection
fan-out or who manage routing outside Auftakt.

`conservative-outbox` is the recommended Resonote default. It treats NIP-65
relay lists, durable relay hints, temporary hints, and audience relays as
candidate inputs, then clips the plan through explicit budgets such as
`maxReadRelays`, `maxWriteRelays`, `maxTemporaryRelays`, and
`maxAudienceRelays`. Default fallback relays remain available. This strategy is
designed for mobile or weak-network environments.

`strict-outbox` follows outbox/inbox routing more aggressively. It uses author
write relays, recipient read relays, target event hints, and explicit hints
without conservative clipping unless the caller configured a hard budget.
Default relays are still available as fallback when required relay-list data is
missing, invalid, or stale.

The core policy options are:

```ts
interface RelaySelectionPolicyOptions {
  readonly strategy: RelaySelectionStrategy;
  readonly maxReadRelays?: number;
  readonly maxWriteRelays?: number;
  readonly maxTemporaryRelays?: number;
  readonly maxAudienceRelays?: number;
  readonly includeDefaultFallback?: boolean;
  readonly allowTemporaryHints?: boolean;
  readonly includeDurableHints?: boolean;
  readonly includeAudienceRelays?: boolean;
}
```

`includeDefaultFallback` defaults to true for all presets. `allowTemporaryHints`
defaults to false for `default-only` and true for the outbox presets.
`includeDurableHints` and `includeAudienceRelays` default to false for
`default-only`, true for `conservative-outbox`, and true for `strict-outbox`.
Budgets are required for conservative clipping and optional hard caps for
strict routing.

### Core Ownership

`@auftakt/core` owns generic vocabulary and pure planning:

- NIP-65 `kind:10002` relay-list entry parsing and normalization
- read/write relay role interpretation
- relay candidate source vocabulary
- relay selection intent vocabulary
- strategy presets and configurable budgets
- deterministic dedupe and priority ordering
- plan diagnostics showing why relays were selected or clipped

Core does not read Dexie, fetch relay-list events, inspect Resonote comment
models, or own UI/application defaults. It receives normalized inputs and returns
a plan.

### Resonote Ownership

`@auftakt/resonote` owns integration:

- read materialized or cached relay-list events for relevant pubkeys
- read durable `event_relay_hints` for target events
- collect temporary hints from `nevent`, `naddr`, `nprofile`, and app-specific
  content references
- derive audience subjects from reply, reaction, mention, and comment publish
  flows
- choose the Resonote default strategy and budgets
- pass the selected read/write/temporary relay plan into core session execution

Resonote is not the owner of NIP-65 semantics. It is the layer that gathers
storage-backed and operation-specific inputs for the generic planner.

## Core Model

The core selection model should be centered on intent, candidates, and plans:

```ts
type RelaySelectionIntent =
  | 'read'
  | 'subscribe'
  | 'repair'
  | 'publish'
  | 'reply'
  | 'reaction'
  | 'mention';

type RelayCandidateSource =
  | 'default'
  | 'nip65-read'
  | 'nip65-write'
  | 'temporary-hint'
  | 'durable-hint'
  | 'audience';

interface RelaySelectionDiagnostic {
  readonly relay: string;
  readonly source: RelayCandidateSource;
  readonly role: 'read' | 'write' | 'temporary';
  readonly selected: boolean;
  readonly clipped: boolean;
  readonly reason: string;
}

interface RelaySelectionPlan {
  readonly readRelays: readonly string[];
  readonly writeRelays: readonly string[];
  readonly temporaryRelays: readonly string[];
  readonly diagnostics: readonly RelaySelectionDiagnostic[];
}
```

These names are the intended public contract for the core package. Callers
provide intent and normalized candidates; core returns read, write, and
temporary relay sets plus diagnostics.

The planner should make clipping explicit. Diagnostics should record the relay
URL, source, role, selected state, clipped state, and reason. This prevents
strategy decisions from becoming invisible behavior.

## Data Flow

### Reads, Subscriptions, And Repair

For a by-id read such as `fetchNostrEventById(eventId, relayHints)`,
`@auftakt/resonote` builds an intent of `read`, includes explicit temporary
hints from the call, asks storage for durable hints for the event id, includes
default read relays, and passes the normalized candidates to core.

For subscriptions, Resonote uses the same policy but marks the intent as
`subscribe`. Temporary relays remain isolated to that subscription. Existing
core lifecycle behavior makes non-default temporary relays lazy and idle
disconnects them after the stream no longer needs them.

For repair, Resonote may include durable hints and target-specific relays before
default fallback. Capability and lifecycle execution remain in core session
internals; repair candidates still pass through coordinator ingress and
materialization before becoming visible.

### Publish, Reply, Reaction, And Mention

For a plain publish, Resonote includes author write relay candidates from NIP-65
when available, default write fallback, and explicit overrides when supplied by
the caller.

For reply, reaction, and mention publish flows, Resonote also derives audience
candidates:

- target event durable relay hints
- target event explicit relay hints from UI/domain state
- mentioned or replied-to pubkey relay-list read relays
- temporary hints embedded in resolved NIP-19 inputs

`default-only` ignores audience routing unless explicit temporary hints are
allowed. `conservative-outbox` adds a small prioritized subset. `strict-outbox`
includes all resolved audience candidates unless a hard budget clips them.

Successful publish acknowledgements continue to record `event_relay_hints` with
source `published`.

## Error Handling

Relay-list absence, empty `r` tags, invalid relay URLs, stale relay-list data,
missing durable hints, and invalid temporary hints are policy-input problems.
They should not leak raw transport errors to app consumers.

`default-only` falls back to configured defaults. `conservative-outbox` falls
back to defaults and clips excess candidates with diagnostics. `strict-outbox`
uses resolved outbox/inbox candidates broadly, but still falls back to defaults
when required relay-list data is unavailable and fallback is enabled.

Invalid relay-list entries are ignored during normalization. If all candidate
inputs are invalid, the plan must either use configured fallback relays or return
an empty plan with diagnostics that let the caller produce a high-level failure.

Temporary hints never mutate durable defaults. Durable relay hints are read-only
inputs except for coordinator/materializer-owned writes from seen, repaired, or
published events.

## Interop

Existing facade functions remain available:

- `fetchBackwardEvents`
- `fetchBackwardFirst`
- `fetchNostrEventById`
- `publishSignedEvent`
- `publishSignedEvents`
- comment subscription and publish helpers
- relay-list fetch and publish helpers

Their internals can move to selection plans, but app consumers should not need a
source change for the default behavior. New strategy configuration can be added
as an optional coordinator/runtime option.

Plugin APIs remain limited to projections, read models, and flows. Plugins do
not receive raw relay sessions, raw storage handles, or mutable routing indexes.

## Verification Strategy

Core tests should cover:

- NIP-65 `r` tag parsing and read/write role normalization
- invalid relay URL rejection
- `default-only` read and write plans
- `conservative-outbox` priority ordering and budget clipping
- `strict-outbox` full fan-out when no hard budget is configured
- explicit budget clipping in `strict-outbox`
- temporary hint isolation
- durable hint and audience candidate priority
- deterministic plan output independent of input order

Resonote tests should cover:

- by-id reads combining explicit temporary hints, durable hints, and default
  fallback through a selection plan
- subscriptions isolating temporary relays to the subscription
- repair using target relay hints without bypassing coordinator ingress
- plain publish using author write relays and default fallback
- reply, reaction, and mention publish collecting audience candidates
- strategy selection defaults to conservative outbox for Resonote runtime
- facade interop for existing exported functions
- plugin isolation from raw relay, storage, and routing handles

The completion gate for this wave should include:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

## Acceptance Criteria

- `@auftakt/core` owns generic relay selection vocabulary, NIP-65 parsing, and
  pure strategy planning.
- `@auftakt/resonote` gathers storage-backed and Resonote operation inputs but
  does not own NIP-65 semantics.
- Developers can choose `default-only`, `conservative-outbox`, or
  `strict-outbox`.
- Resonote default routing is conservative and budgeted, not strict fan-out.
- Strict outbox/inbox fan-out is available for developers who choose it.
- App and feature code do not assemble raw relay fan-out plans.
- Temporary hints remain scoped to their operation and do not mutate durable
  defaults.
- Durable relay hints are not directly mutable from plugin or feature code.
- Read, subscription, repair, publish, reply, reaction, and mention flows share
  one selection vocabulary.
- Strict coordinator mediation remains mandatory for every relay candidate.
