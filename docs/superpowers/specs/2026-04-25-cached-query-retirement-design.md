# Cached Query Retirement Design

Date: 2026-04-25
Branch: `feat/auftakt`

## Summary

Retire the remaining `src/shared/nostr/cached-query*` bridge files and move their
runtime-driver implementation under the Auftakt facade boundary.

The app-facing API remains `$shared/auftakt/resonote.js`. The deleted Nostr
bridge files are not replaced by another public Nostr entry point.

## Goals

- Delete `src/shared/nostr/cached-query.svelte.ts`.
- Delete the legacy alias `src/shared/nostr/cached-query.ts`.
- Preserve `cachedFetchById`, `invalidateFetchByIdCache`, `useCachedLatest`,
  `CachedFetchByIdResult`, and `UseCachedLatestResult` as facade exports from
  `$shared/auftakt/resonote.js`.
- Keep cache TTL, invalidation race handling, latest-event Svelte accessors,
  and `ReadSettlement` behavior covered by tests.
- Add guard coverage so the retired cached-query bridge cannot reappear.

## Non-Goals

- No behavior change to cached by-id reads or latest-event reactive reads.
- No new public read helper under `src/shared/nostr`.
- No feature UI refactor beyond import fallout from the deleted bridge.
- No rewrite of `src/shared/nostr/query.ts`; it already delegates to the facade.

## Architecture

Create `src/shared/auftakt/cached-read.svelte.ts` as an internal facade-adjacent
runtime driver. It owns the code currently inside
`src/shared/nostr/cached-query.svelte.ts`:

- result types:
  - `FetchedEventFull`
  - `SettledReadResult<TEvent>`
  - `CachedFetchByIdResult`
  - `UseCachedLatestResult`
- runtime-driver functions:
  - `cachedFetchById(runtime, eventId)`
  - `invalidateFetchByIdCache(runtime, eventId)`
  - `useCachedLatest(runtime, pubkey, kind)`

`resetFetchByIdCache` is not carried forward as a public API. Tests isolate cache
state by creating fresh runtime objects.

`src/shared/auftakt/resonote.ts` imports the internal driver from
`$shared/auftakt/cached-read.svelte.js` and passes it into
`createResonoteCoordinator()`. The facade continues to export the public cached
read functions and types.

After this change, `src/shared/nostr/` no longer owns cached read public API.
It keeps transport and interop helpers that are still active, such as
`query.ts`, `client.ts`, and `event-db.ts`.

## Data Flow

Feature and browser code call:

```text
$shared/auftakt/resonote.js
  -> createResonoteCoordinator()
  -> src/shared/auftakt/cached-read.svelte.ts
  -> coordinator read runtime
  -> relay ingress / materialization / Dexie visibility
```

No production consumer may import `cached-query.svelte.ts` or `cached-query.ts`,
because both files are removed.

## Interop

The public facade remains source-interoperable for production consumers:

- `$shared/auftakt/resonote.js` still exports `cachedFetchById`.
- `$shared/auftakt/resonote.js` still exports `invalidateFetchByIdCache`.
- `$shared/auftakt/resonote.js` still exports `useCachedLatest`.
- `$shared/auftakt/resonote.js` still exports `CachedFetchByIdResult`.
- `$shared/auftakt/resonote.js` still exports `UseCachedLatestResult`.

The deprecated `$shared/nostr/cached-query.js` alias is intentionally removed.
Any remaining import from that path is a migration failure.

## Error Handling

Existing cached read semantics stay intact:

- Empty event IDs still throw `eventId is required`.
- `useCachedLatest()` still throws when `kind` is missing or not a number.
- DB errors still degrade to a settled miss where current behavior does that.
- Invalidation during an in-flight fetch still returns the caller's result but
  avoids re-caching the stale value.
- Relay candidates still become visible only through the coordinator-backed
  validation and materialization path already used by the runtime driver.

## Tests And Guards

Move the behavior tests from `src/shared/nostr/cached-query.test.ts` to
`src/shared/auftakt/cached-read.test.ts` and update imports to the new internal
driver.

Add strict closure guard checks for retired files:

- `src/shared/nostr/cached-query.svelte.ts` must not exist.
- `src/shared/nostr/cached-query.ts` must not exist.
- production files must not import `$shared/nostr/cached-query.js` or
  `$shared/nostr/cached-query.svelte.js`.

Update migration proof and ownership metadata:

- Remove the old cached-query alias contract from
  `scripts/check-auftakt-migration.mjs`.
- Remove old cached-query ownership entries from
  `scripts/auftakt-ownership-matrix.mjs`.
- Add ownership for `src/shared/auftakt/cached-read.svelte.ts` and its test.
- Update `docs/auftakt/spec.md` companion coverage from the old Nostr bridge to
  the new Auftakt cached read driver.

Verification commands:

```bash
pnpm exec vitest run src/shared/auftakt/cached-read.test.ts src/shared/nostr/query.test.ts scripts/check-auftakt-strict-closure.test.ts
pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt:strict-closure
pnpm run test:auftakt:resonote
```

## Acceptance Criteria

- `rg "cached-query" src packages scripts docs/auftakt` returns no matches.
- `src/shared/nostr/cached-query.svelte.ts` and
  `src/shared/nostr/cached-query.ts` are deleted.
- Facade cached read exports remain available from `$shared/auftakt/resonote.js`.
- Cached read tests pass from the new `src/shared/auftakt` location.
- Strict closure and migration proof pass.
