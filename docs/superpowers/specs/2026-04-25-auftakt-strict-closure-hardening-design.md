# Auftakt Strict Closure Hardening Design

## Status

Approved design from brainstorming on 2026-04-25.

This spec follows the strict redesign closure review. Package contracts and
existing gates mostly pass, but the current static guard still allows a raw relay
candidate to become a public read or repair result before ingress validation and
materialization. This hardening closes that gap and updates completion
documentation so the closure status matches the code.

## Problem

The current strict closure guard passes, but the implementation still has
paths that are too permissive for the strict target:

- `EventCoordinator.read()` can merge `relayGateway.verify()` results directly
  into the returned event list.
- `RelayGateway` names its output `events`, which makes raw relay candidates
  look equivalent to accepted visible events.
- `fetchRepairEventsFromRelay()` reads `packet.event`, converts it with
  `toStoredEvent()`, and returns those values before validation and
  materialization.
- The guard detects `events.push(packet.event)`, but it does not detect
  equivalent bypasses such as `toStoredEvent(packet.event)` followed by a public
  return.
- README, CLAUDE, and the strict audit document still contain obsolete
  `adapter-relay` / `adapter-indexeddb` wording or stale incomplete verdicts.

The result is a false sense of completion: the package-level pieces exist, but
the strict "public flows only see materialized visibility" invariant is not yet
enforced everywhere.

## Goals

- Ensure relay gateway output is treated as internal relay candidates, not
  public visible events.
- Ensure coordinator reads return only events that passed ingress validation,
  quarantine policy, and materialization.
- Ensure repair fetches do not expose raw relay events before ingress.
- Make strict closure guard fail on the bypass forms found during review.
- Update README, CLAUDE, and strict audit/status docs after the runtime invariant
  is fixed.
- Keep the change focused enough for one implementation plan and completion
  gate.

## Non-Goals

- No UI changes.
- No package restructuring.
- No new public Nostr feature surface.
- No broad relay outbox routing rollout. Relay hints remain durable and can be
  used by later routing work, but this hardening does not make reply/reaction
  routing depend on hints.
- No Web Worker split for validation, relay IO, or materialization.
- No migration from old IndexedDB databases.

## Target Invariant

Relay transport may still produce raw packets inside `@auftakt/core` and
`@auftakt/resonote` internals. Raw relay candidates must not cross a public
runtime boundary.

The public-visible path is:

1. Relay session or relay gateway receives a raw packet.
2. Runtime wraps it as an internal candidate:
   `{ event: unknown, relayUrl: string }`.
3. Coordinator calls an ingress dependency for the candidate.
4. Ingress validates event shape, id, and signature.
5. Invalid candidates are quarantined and dropped.
6. Valid candidates are materialized through Dexie reconcile semantics.
7. Only stored visible events are returned to read, repair, subscription, plugin,
   or feature consumers.

`cacheOnly` reads may return local visible events without remote verification.
Every non-`cacheOnly` read may return local data early, but any remote result
must still pass ingress before it becomes visible.

## API Shape

`RelayGateway` should distinguish candidates from visible events:

```ts
export interface RelayGatewayCandidate {
  readonly event: unknown;
  readonly relayUrl: string;
}

export interface RelayGatewayResult {
  readonly strategy: 'negentropy' | 'fallback-req';
  readonly candidates: readonly RelayGatewayCandidate[];
}
```

`fetchByReq()` remains a gateway dependency that fetches raw event-like values
from one relay. `RelayGateway.verify()` wraps them with the relay URL and returns
`candidates`.

`EventCoordinator` receives an ingress dependency:

```ts
export interface EventCoordinatorRelayCandidate {
  readonly event: unknown;
  readonly relayUrl: string;
}

export type EventCoordinatorIngressResult =
  | { readonly ok: true; readonly event: StoredEvent }
  | { readonly ok: false };

readonly ingestRelayCandidate?: (
  candidate: EventCoordinatorRelayCandidate
) => Promise<EventCoordinatorIngressResult>;
```

When `relayGateway` is configured, production code must also configure
`ingestRelayCandidate`. If ingress is missing, coordinator must not publish
gateway candidates as visible events.

## Read Flow

`EventCoordinator.read()` keeps the existing local-first order:

1. hot index by-id hit
2. durable store by-id hit
3. remote verification for non-`cacheOnly`

The remote step changes:

1. Call `relayGateway.verify(filters, { reason })`.
2. For each candidate, call `ingestRelayCandidate(candidate)`.
3. Add only `{ ok: true }` events to `relayEvents`.
4. Apply accepted events to the hot index.
5. Merge accepted events with local visible events.

Relay settlement can be marked settled after the gateway attempt completes, but
`relayHit` is true only when at least one candidate was accepted by ingress.

## Repair Flow

`fetchRepairEventsFromRelay()` is renamed or split so the raw relay fetch returns
candidates, not `StoredEvent[]`.

Repair flow becomes:

1. Determine missing ids through negentropy or fallback.
2. Fetch raw candidates from the selected relay.
3. Run every candidate through ingress and materialization.
4. Emit repair reconcile state only for accepted stored event ids.

This keeps repair behavior aligned with ordinary reads and prevents invalid
relay input from being counted as repaired.

## Guarding

`scripts/check-auftakt-strict-closure.ts` should keep the existing checks and add
new checks for the bypasses found here:

- `toStoredEvent(packet.event)` in production `packages/resonote/src/*`
- public result collections populated from raw packet events
- `RelayGateway` result property named `events`
- coordinator code assigning `result.events` from a gateway directly into
  visible read output
- stale active docs that mention removed package boundaries outside historical
  `docs/superpowers/**`

The guard is intentionally conservative. If a future production path needs raw
packet access, it should make that access explicit in an internal-only file and
route visibility through ingress.

## Documentation Updates

After runtime and guard changes land:

- `README.md` NIP matrix must point NIP-01 and NIP-11 at core relay session
  files, and NIP-09 at adapter-dexie materialization tests.
- `README.md` tech stack must describe `@auftakt/core`,
  `@auftakt/resonote`, and `@auftakt/adapter-dexie`, not
  `@auftakt/adapter-relay`.
- `CLAUDE.md` tech stack must match the current package set.
- `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md` must be updated
  from stale Fail/Partial entries to the post-hardening verdict, with any
  remaining follow-up explicitly labeled.

## Verification

Targeted tests:

```bash
pnpm exec vitest run packages/resonote/src/event-coordinator.contract.test.ts
pnpm exec vitest run packages/resonote/src/relay-gateway.contract.test.ts
pnpm exec vitest run packages/resonote/src/relay-repair.contract.test.ts
pnpm exec vitest run scripts/check-auftakt-strict-closure.test.ts
```

Package and app gates:

```bash
pnpm run test:auftakt:resonote
pnpm run test:auftakt:app-regression
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt:nips
pnpm run check:auftakt-migration -- --proof
pnpm run check
pnpm run build
```

Final completion gate:

```bash
pnpm run check:auftakt-complete
```

## Acceptance Criteria

- `RelayGateway.verify()` returns candidates, not visible `events`.
- `EventCoordinator.read()` never returns a gateway candidate unless
  `ingestRelayCandidate()` accepted it.
- Repair fetches do not convert `packet.event` directly into public
  `StoredEvent[]` results.
- Strict closure guard fails on the previous bypass pattern.
- README, CLAUDE, and strict audit docs no longer describe removed packages as
  active runtime boundaries.
- `pnpm run check:auftakt-complete` passes, or any remaining failure is recorded
  with exact command output and an explicit follow-up.
