# Auftakt NIP Compliance Design

## Status

Approved follow-up design spec 4 of 5 for the Auftakt full redesign.

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
- Full official NIP inventory classification.
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

The official `nostr-protocol/nips` README is the source of truth for the NIP
inventory. The matrix must record the source URL and regeneration date.

The matrix is generated or checked by a repository script. The script compares
the current matrix against the official README inventory and fails CI when a NIP
is added, removed, renamed, or newly marked unrecommended without a local
classification update.

The existing matrix in `docs/auftakt/status-verification.md` is retained as a
historical input, but it must be regenerated after Specs 1-3 land. Transitional
wrappers do not count as final proof.

Mandatory matrix fields:

- NIP
- level
- status
- owner
- proof anchor
- scope notes
- unsupported behavior
- priority bucket
- source URL
- source date

## Proof Requirements

Each supported NIP needs one or more proof anchors:

- unit test for primitive behavior
- package contract test for runtime/storage behavior
- app regression test for user-facing behavior
- E2E test for complete flow when the behavior crosses relay/auth/UI boundaries

Docs must link proof anchors by file path.

## Full Inventory Policy

Every NIP listed in the official README must be classified before implementation
planning is considered complete. Classification is not the same as
implementation. Unsupported, deferred, and not-applicable NIPs are valid only
when the matrix records the reason.

Official source:

- https://github.com/nostr-protocol/nips
- https://raw.githubusercontent.com/nostr-protocol/nips/master/README.md

Priority buckets:

- `P0`: Auftakt/Resonote foundation. Implementation and proof are required
  unless a later approved scope decision explicitly downgrades the NIP.
- `P1`: built-in or optional plugin plan. The matrix must define owner and
  planned support boundary.
- `P2`: classified but deferred, not-supported, or not-applicable by default.
  The matrix must record why.
- `compatibility-only`: supported only for bounded compatibility. Do not build
  new primary surfaces on these NIPs.

## P0 Foundation Inventory

P0 NIPs:

- NIP-01: basic protocol flow
- NIP-02: follow list
- NIP-05: DNS identifier mapping
- NIP-07: browser signer capability
- NIP-09: deletion request
- NIP-10: text notes and threads
- NIP-11: relay information document
- NIP-18: reposts
- NIP-19: bech32 entities
- NIP-21: `nostr:` URI scheme
- NIP-22: comments
- NIP-24: extra metadata fields and tags
- NIP-25: reactions
- NIP-27: text note references
- NIP-30: custom emoji
- NIP-31: unknown events
- NIP-36: sensitive content
- NIP-39: external identities in profiles
- NIP-40: expiration timestamp
- NIP-42: relay authentication
- NIP-44: encrypted payloads
- NIP-45: count
- NIP-48: proxy tags
- NIP-49: private key encryption
- NIP-50: search
- NIP-51: lists
- NIP-56: reporting
- NIP-57: zaps
- NIP-65: relay list metadata
- NIP-66: relay discovery and liveness monitoring
- NIP-70: protected events
- NIP-73: external content ids
- NIP-77: negentropy
- NIP-78: application-specific data
- NIP-89: recommended application handlers
- NIP-92: media attachments
- NIP-94: file metadata
- NIP-98: HTTP auth
- NIP-B0: web bookmarks
- NIP-B7: Blossom

## P1 Plugin / Optional Inventory

P1 NIPs:

- NIP-14: subject tag
- NIP-17: private direct messages
- NIP-23: long-form content
- NIP-28: public chat
- NIP-29: relay-based groups
- NIP-32: labeling
- NIP-37: draft events
- NIP-38: user statuses
- NIP-46: remote signing
- NIP-47: wallet connect
- NIP-52: calendar events
- NIP-53: live activities
- NIP-58: badges
- NIP-59: gift wrap
- NIP-68: picture-first feeds
- NIP-71: video events
- NIP-7D: threads
- NIP-84: highlights
- NIP-88: polls
- NIP-A0: voice messages
- NIP-A4: public messages
- NIP-C7: chats

## P2 Deferred / Not-Applicable Inventory

P2 NIPs:

- NIP-03: OpenTimestamps attestations
- NIP-06: mnemonic seed key derivation
- NIP-13: proof of work
- NIP-15: marketplace
- NIP-34: git collaboration
- NIP-35: torrents
- NIP-43: relay access metadata and requests
- NIP-54: wiki
- NIP-55: Android signer
- NIP-5A: pubkey static websites
- NIP-60: Cashu wallet
- NIP-61: Nutzaps
- NIP-62: request to vanish
- NIP-64: chess
- NIP-69: peer-to-peer order events
- NIP-72: moderated communities
- NIP-75: zap goals
- NIP-85: trusted assertions
- NIP-86: relay management API
- NIP-87: ecash mint discoverability
- NIP-90: data vending machines
- NIP-99: classified listings
- NIP-BE: BLE communications
- NIP-C0: code snippets

## Compatibility-Only / Unrecommended Inventory

Compatibility-only NIPs:

- NIP-04: encrypted direct message. Deprecated in favor of NIP-17.
- NIP-08: mentions. Deprecated in favor of NIP-27.
- NIP-26: delegated event signing. Officially unrecommended.
- NIP-96: HTTP file storage integration. Replaced by Blossom direction.
- NIP-EE: E2EE messaging using MLS. Superseded by Marmot per official README.

Compatibility-only means no new primary runtime surface is built on the NIP.
Existing import, fallback, or migration behavior must stay bounded and tested.

## Verification

Commands:

```bash
pnpm run check:auftakt:nips
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run test:auftakt:app-regression
pnpm run test:auftakt:e2e
pnpm run check:auftakt-migration -- --proof
```

Docs checks:

- no broad "full NIP support" wording without matrix scope
- official NIP inventory diff is empty or intentionally classified
- every implemented/partial claim has a proof anchor
- every public claim has an app or E2E proof when user-facing
- every internal-only claim is absent from public product claims
