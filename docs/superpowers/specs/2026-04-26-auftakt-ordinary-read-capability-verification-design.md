# Auftakt Ordinary Read Capability Verification Design

Date: 2026-04-26
Branch: feat/auftakt

## Goal

Close the strict-gap follow-up for capability-aware ordinary read verification.
The public read cutover already routes latest and by-id reads through
`EventCoordinator`, and sync cursor repair already gives explicit repair flows a
restart-safe cursor. This slice makes ordinary coordinator read verification use
the same relay capability strategy as cached by-id repair:

- try negentropy verification when a relay/session supports it
- fall back to ordinary REQ when negentropy is unsupported or fails
- keep relay packets private until runtime ingress validates and materializes
  them
- preserve the public API signatures and return shapes
- strengthen strict audit proof so ordinary reads cannot regress to raw REQ-only
  verification unnoticed

## Non-Goals

- Change `fetchBackwardEventsFromReadRuntime()`,
  `fetchLatestEventFromReadRuntime()`, or public Resonote API signatures.
- Force every ordinary read to become a persisted sync cursor repair flow.
- Redesign relay selection, outbox routing, or relay scoring.
- Rewrite streaming `useCachedLatest` live subscription behavior.
- Add new NDK-style model APIs in this slice.

## Current Context

`fetchBackwardEventsFromReadRuntime()` and
`fetchLatestEventFromReadRuntime()` already build an `EventCoordinator` and read
with `policy: 'localFirst'`. That gives public callers a local-first mediation
boundary, but the runtime relay verification hook still collects candidates via
ordinary backward REQ fetches.

`coordinatorFetchById()` already demonstrates the stricter behavior: it builds a
`RelayGateway`, asks for relay verification, uses negentropy when available, and
falls back to REQ. Relay responses are wrapped as internal candidates, then the
coordinator validates and materializes them before returning visible local
events.

The gap is that ordinary latest/backward coordinator reads do not uniformly use
that capability-aware gateway path.

## Architecture

Add an internal ordinary-read relay gateway helper in
`packages/resonote/src/runtime.ts`. The helper should reuse the existing
`createRelayGateway()` contract instead of duplicating negentropy and fallback
logic.

The helper owns three runtime-specific adapters:

- `requestNegentropySync`: call the runtime session's negentropy capability when
  available; return unsupported when the active session cannot perform
  negentropy.
- `fetchByReq`: fetch candidates from the specific relay with the existing
  per-relay REQ helper and an ordinary-read coordinator scope.
- `listLocalRefs`: ask the store for local negentropy refs when supported, using
  the same filters being verified.

`createRuntimeEventCoordinator().relayGateway.verify()` then changes from direct
REQ collection to this gateway helper:

1. Resolve read options and relay overlay exactly as it does today.
2. Select the target verification relays from the resolved overlay/default read
   relays.
3. For each target relay, call `gateway.verify(filters, { relayUrl })`.
4. Merge the returned internal relay candidates.
5. Let `EventCoordinator` perform the existing accept, quarantine, materialize,
   and result merge steps.

The public read helpers stay unchanged from a caller perspective. This is an
internal verification strategy change, not a new API.

## Data Flow

Latest read:

1. Public caller asks for the latest replaceable event.
2. Runtime builds `{ authors: [pubkey], kinds: [kind], limit: 1 }`.
3. `EventCoordinator.read()` reads local visible events first.
4. The runtime relay gateway verifies missing or stale data per relay.
5. Negentropy is attempted when supported; otherwise REQ fallback fetches
   candidates from that relay.
6. Relay candidates pass through runtime ingress and Dexie materialization.
7. The helper returns the newest visible event from local/coordinator results.

Backward read:

1. Public caller supplies filters to the backward read helper.
2. The coordinator reads local visible events first.
3. The ordinary-read gateway verifies the same filters against target relays.
4. Accepted relay events are materialized before they can appear in the returned
   event list.

By-id compatibility remains compatible with the existing cached gateway path.
This slice can share helper code where practical, but it should not weaken the
existing relay-hint behavior or cached by-id tests.

## Error Handling

Negentropy unsupported is not an error for ordinary reads. It selects REQ
fallback and records the fallback strategy through existing gateway settlement
vocabulary.

Negentropy failure for one relay should fall back to REQ for that relay when the
gateway can still issue REQ. Failure on one relay must not prevent other relays
from being verified.

Malformed relay packets remain quarantined by the existing runtime ingress path.
They must not be returned directly and must not be counted as materialized
results.

If no relay verification succeeds, ordinary reads keep the current local-first
behavior: return visible local data when present and respect existing
`rejectOnError` semantics for callers that request strict failure handling.

## Tests

Add focused contract coverage in `packages/resonote/src`:

- ordinary latest read attempts negentropy through the runtime coordinator
  gateway when the relay session supports it
- ordinary latest read falls back to REQ when negentropy is unsupported or fails
- backward read uses the same capability-aware gateway path instead of direct
  REQ-only candidate collection
- relay candidates returned by ordinary read verification are visible only after
  ingress and local materialization
- malformed ordinary-read relay candidates are quarantined and omitted from
  results
- strict audit checks require ordinary-read capability proof in runtime tests

Existing relay gateway contract tests should remain focused on gateway behavior.
Runtime tests should prove the ordinary public read surfaces are wired to that
gateway.

## Compatibility

No public API changes are allowed. Existing consumers of
`fetchBackwardEventsFromReadRuntime()`, `fetchLatestEventFromReadRuntime()`,
`fetchNostrEventByIdFromReadRuntime()`, and the Resonote facade should keep the
same call signatures and return shapes.

Relays without negentropy support keep working through REQ fallback. Stores that
cannot list local negentropy refs should cause the gateway to treat negentropy as
unsupported for that verification and fall back to REQ.

## Completion Criteria

- Ordinary latest and backward reads use a `RelayGateway`-backed verification
  path from inside `EventCoordinator`.
- Negentropy-capable sessions are exercised before REQ fallback.
- Unsupported or failed negentropy paths fall back to ordinary REQ.
- Public read results still come only from coordinator-visible local
  materialization, not raw relay packets.
- Existing cached by-id relay hint behavior remains intact.
- The strict goal audit and gate require ordinary read capability verification
  evidence.
- Focused runtime tests, package tests, and strict Auftakt gates pass.
