# Auftakt Public Read Cutover Design

Date: 2026-04-26

## Goal

Move the next public read surfaces, `fetchLatestEvent` and `fetchNostrEventById`,
onto the existing coordinator-mediated local-first path. The slice closes the
highest-value strict gap after audit closure: public reads should interact with
the local event database through `EventCoordinator`, and remote relays should
serve as verification, repair, fill, and enrichment inputs whose packets are
validated and materialized before returning through API results.

This slice does not redesign streaming latest reads or subscriptions. In
particular, `useCachedLatest` remains a later streaming cutover candidate
because it owns reactive state and settlement behavior with a broader blast
radius.

## Current Context

`cachedFetchById` already delegates through `EventCoordinator.read()` and can use
`RelayGateway` for negentropy-first verification with ordinary REQ fallback.
`EventCoordinator` validates relay candidates through the runtime ingress path,
materializes accepted events through the store, and returns only merged visible
events. `RelayGateway` already wraps remote events as internal candidates rather
than returning raw relay results.

The remaining public read gaps in this slice are:

- `fetchLatestEvent`, which still delegates to `relayStatusRuntime.fetchLatestEvent`.
- `fetchNostrEventById`, which performs a direct DB read and then a compatibility
  backward fetch path instead of using the same coordinator read helper.

## Scope

In scope:

- Add coordinator-backed runtime helpers for latest replaceable reads and
  by-id reads with temporary relay hints.
- Route `ResonoteCoordinator.fetchLatestEvent()` through `EventCoordinator.read()`
  with `localFirst` policy.
- Route `ResonoteCoordinator.fetchNostrEventById()` through the coordinator read
  path and use `relayHints` as temporary relay overlay input.
- Preserve all existing public API names, signatures, and return shapes.
- Keep relay candidates private until validation, quarantine handling, and
  materialization have completed.
- Add focused contract tests proving the cutover and relay-hint behavior.

Out of scope:

- Rewriting `useCachedLatest` streaming internals.
- Replacing all subscription transports.
- Expanding NDK-style model APIs.
- Changing relay selection policy semantics outside the `relayHints` path.
- Changing Dexie materialization rules.

## Architecture

The coordinator remains the public-read mediation boundary. New helper functions
in `packages/resonote/src/runtime.ts` should build the same runtime coordinator
used by existing backward reads and cached by-id reads, then call
`EventCoordinator.read()` with stable filters.

For latest replaceable reads:

```ts
{ authors: [pubkey], kinds: [kind], limit: 1 }
```

The helper returns the newest visible event from the coordinator result, matching
the existing `fetchLatestEvent()` return contract.

For by-id reads:

```ts
{
  ids: [eventId];
}
```

The helper resolves relay options with `relayHints` as temporary relays, then
uses the coordinator path so remote candidates flow through validation,
quarantine, and materialization before the public API sees them.

## Data Flow

1. A public read API is called from `ResonoteCoordinator`.
2. Runtime code builds a local-first coordinator read request.
3. `EventCoordinator.read()` reads visible local events from hot index and Dexie.
4. For non-cache-only reads, the coordinator invokes the runtime relay gateway.
5. The gateway verifies by negentropy when supported and falls back to ordinary
   REQ when unsupported or failed.
6. Relay packets become internal candidates, not public results.
7. Runtime ingress validates each candidate and quarantines malformed input.
8. Accepted candidates are materialized through Dexie reconcile rules.
9. The public API returns only merged visible events in the existing shape.

## Error Handling

`fetchLatestEvent` should preserve its current tolerant behavior: if coordinator
verification fails and no local visible result exists, it returns `null`.

`fetchNostrEventById` should return a local visible result when available, a
materialized relay result when verification succeeds, and `null` otherwise.
Malformed relay candidates are quarantined and omitted from results. Raw relay
events must never be returned directly.

## Testing

Add contract coverage in `packages/resonote/src/event-coordinator.contract.test.ts`
or a nearby runtime contract test for:

- latest reads schedule local-first verification through coordinator semantics.
- latest relay candidates are returned only after ingress and materialization.
- malformed latest relay candidates are quarantined and omitted.
- `fetchNostrEventById` uses relay hints as temporary verification relays.
- package public API surface remains unchanged.

Run focused tests first, then the existing Auftakt package and migration gates.

## Follow-Up

After this slice, the next strict candidates are:

1. Streaming `useCachedLatest` cutover to coordinator subscription.
2. Coordinator-owned publish settlement vocabulary.
3. Sync cursor incremental repair for offline restart-safe reads.
