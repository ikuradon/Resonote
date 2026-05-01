# Auftakt April Doc Completion Audit Design

## Summary

Audit `docs/superpowers/{specs,plans}/2026-04-2*.md` and turn the result into
an implementation plan for unfinished work. The audit treats the April 24-26
Auftakt documents as a completion set, but it does not trust Markdown checkbox
state by itself. The verdict must come from code, tests, guard scripts, recent
commits, and the top-level completion gate.

The current overall verdict is not complete because
`pnpm run check:auftakt-complete` fails in `check:auftakt-semantic`. The known
blocking violations are:

- `src/shared/auftakt/cached-read.test.ts`
- `src/shared/auftakt/relay-capability.test.ts`

Both files match the `direct-shared-nostr-consumer-import` semantic guard.

## Goals

- Produce a completion matrix for every
  `docs/superpowers/{specs,plans}/2026-04-2*.md` file.
- Classify each document as `Implemented`, `Superseded`,
  `Partially Implemented`, `Not Implemented`, or `Docs/Status Only`.
- Restore the mechanical completion gate by planning fixes for
  `pnpm run check:auftakt-complete`.
- Include stale script and status cleanup where it affects completion
  confidence, especially the retired `src/shared/nostr/cached-query.test.ts`
  reference in `test:auftakt:app-regression`.
- Convert only real gaps into implementation tasks.

## Non-Goals

- Do not add new runtime behavior as part of the audit design.
- Do not treat unchecked Markdown plan boxes as proof of unfinished code.
- Do not rewrite historical plans wholesale.
- Do not remove useful historical references from old plans merely because the
  implementation has since moved.

## Architecture

### Audit Source Collector

The collector enumerates:

- `docs/superpowers/specs/2026-04-2*.md`
- `docs/superpowers/plans/2026-04-2*.md`

For each document it records title, date, intent, local acceptance criteria,
verification commands, checkboxes, and any status note. The implementation plan
can use `rg --files`, `rg`, and focused `sed` reads rather than introducing a
new parser unless repetition becomes a practical problem.

### Evidence Mapper

Each document is mapped to evidence from source, tests, guard scripts, docs, and
commits. Examples:

- Relay selection: `packages/core/src/relay-selection.ts`,
  `packages/resonote/src/relay-selection-runtime.contract.test.ts`, and
  relay-routing tests.
- Entity handles: `packages/resonote/src/entity-handles.ts` and
  `packages/resonote/src/entity-handles.contract.test.ts`.
- NIP inventory refresh: `scripts/check-auftakt-nips.ts`,
  `scripts/check-auftakt-nips.test.ts`, `docs/auftakt/nips-inventory.json`, and
  `docs/auftakt/nip-matrix.json`.
- Cached query retirement: `src/shared/auftakt/cached-read.svelte.ts`,
  `src/shared/auftakt/cached-read.test.ts`, and strict closure guard coverage.

The mapper must record evidence path references, not just a prose claim.

### Gate Restorer

The first implementation priority is to make `pnpm run check:auftakt-complete`
pass. The current failure is semantic guard drift after moving cached read tests
under `src/shared/auftakt`. The plan should choose the smallest defensible fix:
either adjust test mocks so they no longer match direct consumer imports, or
allow these facade-owned tests explicitly in the semantic guard if that matches
the boundary model.

The stale `test:auftakt:app-regression` input
`src/shared/nostr/cached-query.test.ts` should be replaced with
`src/shared/auftakt/cached-read.test.ts` or removed if covered elsewhere. The
script should reflect the current source tree even if Vitest currently ignores
the missing input.

### Completion Matrix Artifact

The implementation plan should create or update a single audit artifact rather
than spreading verdicts across every historical plan. The artifact should list:

- document path
- classification
- evidence
- remaining action
- verification gate

Historical docs that are superseded should get a concise status note only when
the absence of such a note would make the current completion state misleading.

## Classification Rules

`Implemented`: Corresponding code, contract tests, required guard or docs proof,
and relevant gates exist and pass.

`Superseded`: The plan target was replaced by a later accepted plan or design.
The replacement document or implementation path must be named.

`Partially Implemented`: Main code exists, but a completion gate, docs status,
or a required policy remains inconsistent.

`Not Implemented`: No corresponding implementation or contract evidence is
found.

`Docs/Status Only`: The document is itself a handoff, audit, roadmap, or status
artifact rather than a code implementation target.

## Data Flow

1. Enumerate all matching April 24-26 spec and plan documents.
2. Extract each document's intent and acceptance criteria.
3. Map each document to implementation, tests, guard scripts, and commit
   evidence.
4. Run the completion gate and treat any failure as an overall blocker.
5. Write the completion matrix with classification, evidence, remaining action,
   and verification gate.
6. Turn only `Partially Implemented`, `Not Implemented`, and gate-blocking
   entries into implementation tasks.

## Error Handling

- Ambiguous evidence defaults to `Partially Implemented`, not `Implemented`.
- A passing focused test is not enough if the top-level completion gate fails.
- A stale historical reference in `docs/superpowers` can remain if the matrix or
  a local status note marks it as historical or superseded.
- A stale active script reference is a cleanup task even when it does not fail
  today.
- If verification commands fail for environment reasons, the plan must capture
  the exact command and reason before treating it as non-product risk.

## Verification Strategy

Primary gate:

```bash
pnpm run check:auftakt-complete
```

Focused diagnosis when the primary gate fails:

```bash
pnpm run check:auftakt-semantic
pnpm exec vitest run src/shared/auftakt/cached-read.test.ts src/shared/auftakt/relay-capability.test.ts scripts/check-auftakt-migration.test.ts scripts/check-auftakt-strict-closure.test.ts scripts/check-auftakt-nips.test.ts
```

Supporting gates already observed as passing during design exploration:

```bash
pnpm run check:auftakt:nips
pnpm run check:auftakt:strict-closure
pnpm run test:packages
pnpm run check
pnpm run build
pnpm run check:structure
```

Stale reference checks should include current source, package, script, and
active docs paths. Historical superpowers plans can keep old names when they are
classified as superseded.

## Acceptance Criteria

- The audit has one matrix entry for every matching 2026-04-2x spec and plan.
- Every `Implemented` entry names concrete source, test, or guard evidence.
- Every `Superseded` entry names its replacement plan, spec, or implementation.
- `pnpm run check:auftakt-complete` is the final implementation gate.
- The implementation plan includes concrete tasks for semantic guard drift,
  stale app-regression script cleanup, and any matrix entry that is not complete
  or explicitly superseded.
