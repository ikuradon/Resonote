# Auftakt Broader Outbox Routing Design

Date: 2026-04-26
Branch: feat/auftakt

## Goal

Close the strict-gap follow-up for broader outbox routing without redesigning
the relay selection engine.

The current implementation already has core relay selection vocabulary,
conservative and strict outbox strategies, NIP-65 relay-list parsing, read
overlays, publish send options, relay hints, and coordinator-owned ordinary read
verification. This slice broadens proof and routing coverage for common Nostr
client flows:

- reply, reaction, and mention publish routing stays coordinator-owned
- addressable `a` tag publish routing uses explicit relay hints and durable
  hints when the referenced addressable event is locally known
- addressable reads use the author's NIP-65 write relays as read candidates
- `default-only` policy continues to suppress broader outbox candidates
- strict audit gates require broader outbox routing evidence

## Non-Goals

- Replace `@auftakt/core` relay selection strategy semantics.
- Add UI controls for routing policy.
- Add new public API signatures for publish or read calls.
- Implement a full relay category model, trust model, relay freshness scoring,
  or Amethyst-interoperable relay database.
- Treat temporary hints as durable relay configuration.
- Expand the NDK-like entity/model API surface in this slice.

## Current Context

`@auftakt/core` already owns the generic selection model:

- `RelaySelectionStrategy`
- `RelaySelectionIntent`
- `RelayCandidateSource`
- `RelaySelectionPolicyOptions`
- `buildRelaySelectionPlan()`
- NIP-65 `kind:10002` parsing

`@auftakt/resonote` already gathers runtime inputs for read and publish
routing:

- default relays
- temporary relay hints
- durable event relay hints
- author NIP-65 relay-list events
- publish tag relays for `e`, `q`, and `p`

The strict gap is not a missing routing foundation. The gap is that broader
outbox behavior is not fully proven for addressable targets and not protected by
the strict goal audit gate.

## Architecture

Keep `@auftakt/core` unchanged unless tests expose a pure planner gap. The
default implementation target is `packages/resonote/src/relay-selection-runtime.ts`.

Add small Resonote-owned candidate collection for addressable `a` tags:

1. Parse `a` tag values shaped as `kind:pubkey:d`.
2. Include the tag's explicit relay hint, when present, as an `audience` write
   candidate.
3. If the runtime store supports `getByReplaceKey(pubkey, kind, d)`, resolve the
   local addressable event.
4. If that event is found and the store supports `getRelayHints(event.id)`, add
   those durable hints as write candidates.
5. Ignore malformed `a` tags and invalid relays.

The existing publish candidate flow remains:

1. defaults
2. author write relays
3. target event durable hints
4. explicit target relays
5. audience pubkey relay lists
6. addressable target hints from this slice
7. core selection planning

Read routing already derives author relay-list candidates from addressable
filters because addressable reads include `authors`. This slice adds explicit
contract coverage so that behavior cannot regress.

## Data Flow

Publish with `a` tag:

1. A signed event reaches `ResonoteCoordinator.publishSignedEvent()`.
2. The coordinator asks `buildPublishRelaySendOptions()` for relay send options.
3. Runtime candidate collection reads defaults and author relay-list write
   relays.
4. For each valid `a` tag, explicit relay hints are added as audience write
   candidates.
5. For each valid locally resolvable addressable tag, durable relay hints for
   the target event are added as audience write candidates.
6. Core planner clips or selects candidates according to the configured policy.
7. Publish transport receives only the selected relay list.
8. Publish settlement and relay hint recording remain coordinator-owned.

Addressable read:

1. A caller reads `{ kinds: [kind], authors: [pubkey], '#d': [d], limit: 1 }`.
2. `buildReadRelayOverlay()` reads the author's NIP-65 relay-list event.
3. Author write relays are added as read candidates.
4. Core planner builds the overlay.
5. Ordinary read verification uses the coordinator relay gateway path and
   materializes candidates before public results.

Default-only policy:

1. The same candidate inputs are collected.
2. Core policy normalization filters out durable, audience, and NIP-65 outbox
   candidates unless explicitly enabled.
3. Transport receives default relays only.

## Error Handling

Malformed `a` tag values are ignored. Invalid kind values, missing pubkeys,
empty `d` values, and non-websocket relay hints do not throw.

Missing `getByReplaceKey()` or `getRelayHints()` support means durable
addressable hints are unavailable. Routing still uses defaults, author relays,
and explicit hints according to policy.

If a referenced addressable event is not local, this slice does not perform a
remote lookup just to discover durable hints. That keeps routing planning
side-effect free and local-first.

Failures in relay selection input gathering must not expose raw storage or
transport handles to public callers. Publish and read settlement behavior stays
with the existing coordinator paths.

## Tests

Add or extend focused contract tests:

- `packages/resonote/src/relay-selection-runtime.contract.test.ts` proves
  addressable read filters use author NIP-65 write relays.
- `packages/resonote/src/relay-selection-runtime.contract.test.ts` proves
  `default-only` policy suppresses NIP-65, durable, and audience candidates for
  broader outbox publish routing.
- `packages/resonote/src/relay-routing-publish.contract.test.ts` proves reply,
  reaction, and mention publish routing continue to use coordinator-selected
  author and audience relays.
- `packages/resonote/src/relay-routing-publish.contract.test.ts` proves `a` tag
  publish routing includes explicit relay hints.
- `packages/resonote/src/relay-routing-publish.contract.test.ts` proves `a` tag
  publish routing includes durable hints after resolving the local addressable
  target.
- `scripts/check-auftakt-strict-goal-audit.test.ts` proves the strict audit gate
  requires broader outbox routing evidence.

Existing ordinary read gateway, publish settlement, and relay selection tests
must keep passing.

## Interop

No app-facing or package public API signatures change. Existing callers keep
using `publishSignedEvent`, `publishSignedEvents`, `fetchBackwardEvents`,
`fetchNostrEventById`, entity handles, and relay set handles as they do now.

Stores that do not expose `getByReplaceKey()` keep current behavior. Relays
without addressable explicit hints keep current behavior. The new routing inputs
only add candidates for policies that allow them.

## Completion Criteria

- Publish routing understands valid `a` tag relay hints.
- Publish routing can use durable relay hints for locally known addressable
  targets.
- Addressable read routing has explicit regression proof for author NIP-65 write
  relays.
- `default-only` policy proof shows broader outbox inputs are suppressed.
- Strict goal audit marks broader outbox routing implemented and requires its
  runtime/test evidence.
- Focused relay routing tests, Resonote package tests, strict gates, migration
  proof, and package-wide tests pass.
