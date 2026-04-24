# Auftakt NIP Compliance Design

## Status

Draft follow-up design spec 4 of 5 for the Auftakt full redesign. Pending
brainstorming approval.

Depends on:

- `2026-04-24-1-of-5-auftakt-coordinator-local-first-pipeline-design.md`
- `2026-04-24-2-of-5-auftakt-req-optimizer-relay-repair-design.md`
- `2026-04-24-3-of-5-auftakt-feature-plugin-read-models-design.md`

## Problem

The current compliance document uses scoped claims, but the development goal
mentions complete NIP compliance. These are not the same claim. The redesign
needs a precise compliance model so Resonote can avoid overclaiming support and
so implementation work has clear owners.

## Scope

This spec covers:

- Compliance terminology.
- Public/internal/non-goal NIP categories.
- Package ownership.
- Proof requirements.
- Missing implementation tracking.

This spec excludes:

- Implementing every NIP.
- UI feature design for optional NIPs.
- Storage compaction from Spec 5.

## Compliance Terms

Compliance levels:

- `public`: user-facing feature support exposed by Resonote.
- `public-compat`: compatibility path for a bounded user-facing behavior.
- `internal`: runtime behavior needed by coordinator or relay repair.
- `internal-only`: implementation detail with no public claim.
- `not-supported`: deliberately unsupported.
- `not-applicable`: relay-only, server-only, or out-of-product scope.

Status values:

- `implemented`
- `partial`
- `planned`
- `deferred`
- `not-applicable`

The phrase "NIPs complete" must only mean: every NIP relevant to Resonote is
classified, owned, and either implemented or explicitly scoped out. It must not
mean every published NIP is fully implemented as a public feature.

## Ownership

Canonical owners:

- `@auftakt/core`
  - cryptography, encoding, filter semantics, request protocol primitives,
    relay observation vocabulary
- `@auftakt/resonote`
  - coordinator-facing runtime behavior, plugin flows, settlement, repair
- `@auftakt/adapter-dexie`
  - storage-side materialization, deletion visibility, local query proofs
- `src/features/*`
  - user-facing actions and view-specific behavior
- `src/server/api/*`
  - server-only NIP integrations

No NIP claim can have an owner of "docs only".

## Initial Matrix Policy

The existing matrix in `docs/auftakt/status-verification.md` is retained as an
input, but it must be regenerated after Specs 1-3 land. Transitional wrappers do
not count as final proof.

Mandatory matrix fields:

- NIP
- level
- status
- owner
- proof anchor
- scope notes
- unsupported behavior

## Proof Requirements

Each supported NIP needs one or more proof anchors:

- unit test for primitive behavior
- package contract test for runtime/storage behavior
- app regression test for user-facing behavior
- E2E test for complete flow when the behavior crosses relay/auth/UI boundaries

Docs must link proof anchors by file path.

## High-Priority NIPs

The first compliance pass must cover:

- NIP-01: event, filter, REQ/EVENT/EOSE/OK semantics
- NIP-02: contact list behavior
- NIP-05: profile verification
- NIP-07: browser signer integration
- NIP-09: deletion event and visibility semantics
- NIP-10: reply/thread tags
- NIP-11: bounded relay metadata/capability usage
- NIP-19: route decoding and entity resolution
- NIP-22: comments
- NIP-25: reactions
- NIP-44: encrypted private mute compatibility
- NIP-65: relay list
- NIP-73: external content ids
- NIP-77: negentropy internal support

Other NIPs are classified in the matrix before implementation is planned.

## Verification

Commands:

```bash
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run test:auftakt:app-regression
pnpm run test:auftakt:e2e
pnpm run check:auftakt-migration -- --proof
```

Docs checks:

- no broad "full NIP support" wording without matrix scope
- every implemented/partial claim has a proof anchor
- every public claim has an app or E2E proof when user-facing
- every internal-only claim is absent from public product claims
