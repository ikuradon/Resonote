# Auftakt Coordinator Publish Settlement Design

Date: 2026-04-26
Branch: feat/auftakt

## Goal

Close the strict-gap follow-up for coordinator-owned publish settlement without
changing the app-facing publish API shape.

Current publish behavior is durable enough to retry signed events after offline
failures, but the settlement vocabulary is split between runtime helper
control flow, pending publish storage, and reconcile emissions. This slice makes
publish outcome a first-class coordinator result:

- public `publishSignedEvent()` and `publishSignedEvents()` still resolve to
  `void` and preserve existing error behavior
- coordinator internals classify publish outcomes as settlement data
- signed events pass through local materialization before relay delivery
- relay OK acknowledgements record `published` relay hints
- retryable failures are stored in pending publish storage through the
  coordinator path

## Non-Goals

- Add a new public app API for publish history.
- Add a Dexie settlement history table.
- Change NIP-07 signing or relay `OK` threshold semantics.
- Change batch publish to throw aggregated failures.
- Expand outbox relay routing beyond the existing relay selection policy.

## Architecture

Add a small publish settlement vocabulary to `@auftakt/core`. It should describe
the coordinator-visible result, not low-level relay packet details.

Settlement fields:

- `phase`: `pending`, `partial`, or `settled`
- `state`: `confirmed`, `queued`, `retrying`, or `rejected`
- `durability`: `local`, `queued`, `relay`, or `degraded`
- `reason`: `local-materialized`, `relay-accepted`, `queued-offline`,
  `retrying-offline`, `rejected-offline`, or `materialization-degraded`

The reducer should take explicit booleans/decisions from the publish path and
return a stable data object. This mirrors `reduceReadSettlement()` but remains
publish-specific so read settlement semantics do not become overloaded.

`EventCoordinator.publish()` becomes the owner of the publish workflow:

1. Materialize the signed event into the local store with reconcile handling.
2. If no publish transport is available, enqueue the event and return queued
   settlement.
3. Publish through the configured transport.
4. Record `published` relay hints for matching successful acknowledgements.
5. On transport failure, enqueue retryable signed events and rethrow the
   original error for public compatibility.

The runtime-level `publishSignedEventWithOfflineFallback()` helper should
delegate to a coordinator-oriented publish function for signed events. Existing
callers still receive `Promise<void>`, while tests can assert the internal
settlement through coordinator and helper-level contracts.

## Data Flow

Public single publish:

1. `src/shared/auftakt/resonote.ts` calls the package facade.
2. `createResonoteCoordinator().publishSignedEvent()` resolves relay send
   options using the existing relay selection policy.
3. The coordinator materializes the event locally before relay delivery.
4. The transport publishes to selected relays.
5. Successful acknowledgements record relay hints.
6. Failures enqueue the signed event, then preserve the original thrown error.

Public batch publish:

1. `publishSignedEvents()` maps each event through the single-event coordinator
   path.
2. It keeps existing `Promise.allSettled()` behavior.
3. Only failed signed events are queued.
4. Unsigned/non-retryable events are not inserted into pending publish storage.

Retry queued publishes:

1. `retryQueuedSignedPublishes()` remains compatible with
   `drainPendingPublishes()`.
2. Its delivery decisions are reduced into publish settlement internally.
3. Existing `PendingDrainResult` and reconcile emissions remain the public
   contract for retry drains.

## Error Handling

Materialization failures do not block publish. They produce degraded settlement
and keep the event visible in the hot index through existing coordinator
behavior.

Transport failures queue retryable signed events and rethrow the original
transport error. This keeps current app behavior intact while adding internal
settlement proof.

Relay `OK` packets that do not match the event id, or are negative, do not
record `published` hints. They also do not by themselves reject the publish
unless the transport reports failure under the existing threshold rules.

Unsigned events can still be sent through the public publish API for signing by
the transport, but they are not durable retry candidates unless they contain
`id`, `pubkey`, `created_at`, and `sig`.

## Tests

Add focused contract coverage:

- `@auftakt/core` publish settlement reducer maps local materialization,
  relay acceptance, queueing, retrying, rejection, and degraded storage.
- `packages/resonote/src/event-coordinator.contract.test.ts` proves
  `publish()` materializes before transport, records successful relay hints, and
  returns settlement data.
- `packages/resonote/src/publish-queue.contract.test.ts` proves public helper
  compatibility: single failure queues and rethrows, batch queues only failed
  signed events, and retry drains retain existing result shape.
- strict audit coverage is updated so coordinator-owned publish settlement is
  no longer only a follow-up note.

## Compatibility

No app-facing imports need to change. `publishSignedEvent()`,
`publishSignedEvents()`, and `retryPendingPublishes()` continue to return
`Promise<void>` from public facades. New settlement types may be exported from
package internals or `@auftakt/core` for package contract tests, but package root
exports should remain conservative unless a test proves a public type export is
needed.

## Completion Criteria

- Core has publish settlement vocabulary and reducer contract tests.
- Coordinator publish returns settlement data and owns local materialization,
  relay hint recording, and queue decisions.
- Existing public publish API behavior remains compatible.
- Strict gap audit text and/or gate recognizes coordinator-owned publish
  settlement as implemented for this slice.
- Package tests and strict Auftakt gates pass.
