# Auftakt April Doc Completion Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Auftakt completion gate and create a dated completion matrix for every `docs/superpowers/{specs,plans}/2026-04-2*.md` document.

**Architecture:** Fix the mechanical blockers first, then write the audit artifact from verified evidence. Keep historical plan files mostly intact; use the new audit matrix as the single current verdict surface.

**Tech Stack:** SvelteKit, Vitest, Node scripts, pnpm, Markdown docs.

---

## File Structure

- Create: `scripts/check-auftakt-migration.test.ts`
  - Regression test for semantic guard reporting. It proves facade-owned Auftakt tests may mock shared Nostr bridge modules without being treated as consumer leaks.
- Modify: `scripts/check-auftakt-migration.mjs`
  - Allowlist the two facade-owned test files in the `direct-shared-nostr-consumer-import` semantic policy.
- Modify: `package.json`
  - Replace the stale `test:auftakt:app-regression` input `src/shared/nostr/cached-query.test.ts` with `src/shared/auftakt/cached-read.test.ts`.
- Modify: `vite.config.ts`
  - Remove the stale coverage exclude entry for deleted `src/shared/nostr/cached-query.ts`.
- Create: `docs/auftakt/2026-04-26-april-doc-completion-audit.md`
  - Current completion matrix for all April 24-26 superpowers specs and plans.
- Modify: `docs/superpowers/plans/2026-04-25-cached-query-retirement.md`
  - Add a concise status note pointing to the completion audit.
- Modify: `docs/superpowers/plans/2026-04-25-auftakt-relay-capability-strict-completion.md`
  - Add a concise status note pointing to the completion audit.

## Task 1: Restore Semantic Guard For Facade-Owned Tests

**Files:**

- Create: `scripts/check-auftakt-migration.test.ts`
- Modify: `scripts/check-auftakt-migration.mjs`

- [ ] **Step 1: Write the failing semantic report regression test**

Create `scripts/check-auftakt-migration.test.ts`:

```ts
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

function runMigrationGuard(...args: string[]) {
  const result = spawnSync(process.execPath, ['scripts/check-auftakt-migration.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  if (result.error) throw result.error;
  return result;
}

describe('check-auftakt-migration semantic guard', () => {
  it('allows facade-owned Auftakt tests to mock shared Nostr bridges', () => {
    const result = runMigrationGuard('--report', 'semantic');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Status: PASS');
    expect(result.stdout).toContain(
      'file=src/shared/auftakt/cached-read.test.ts count=1 allowed=true'
    );
    expect(result.stdout).toContain(
      'file=src/shared/auftakt/relay-capability.test.ts count=1 allowed=true'
    );
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-migration.test.ts
```

Expected: FAIL. The stdout assertion should show semantic status is still `FAIL`
or one of the two `src/shared/auftakt/*.test.ts` hits is still `allowed=false`.

- [ ] **Step 3: Allow facade-owned Auftakt tests in the semantic guard**

In `scripts/check-auftakt-migration.mjs`, update the `allowedFiles` array for
the `direct-shared-nostr-consumer-import` policy to include the two facade-owned
test files:

```js
allowedFiles: [
  'src/shared/auftakt/resonote.ts',
  'src/shared/auftakt/cached-read.test.ts',
  'src/shared/auftakt/relay-capability.test.ts',
  'src/shared/nostr/materialized-latest.ts',
  'src/shared/nostr/materialized-latest.test.ts',
  'src/shared/nostr/relays-config.ts',
  'src/shared/nostr/relays-config.test.ts',
  'src/shared/nostr/user-relays.test.ts'
];
```

- [ ] **Step 4: Run the focused test and semantic report**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-migration.test.ts
node scripts/check-auftakt-migration.mjs --report semantic
```

Expected: PASS. The semantic report should include `Status: PASS` and both
`src/shared/auftakt/*.test.ts` hits should be `allowed=true`.

- [ ] **Step 5: Commit semantic guard restoration**

Run:

```bash
git add scripts/check-auftakt-migration.test.ts scripts/check-auftakt-migration.mjs
git commit -m "test(auftakt): allow facade-owned semantic mocks"
```

## Task 2: Remove Active Stale Cached Query References

**Files:**

- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: Confirm the stale active references**

Run:

```bash
rg -n "src/shared/nostr/cached-query" package.json vite.config.ts
```

Expected: FAIL-style evidence for this task, meaning two matches are printed:

```text
package.json:...
vite.config.ts:...
```

- [ ] **Step 2: Update `test:auftakt:app-regression`**

In `package.json`, replace the existing script value with this exact value:

```json
"test:auftakt:app-regression": "vitest run src/shared/auftakt/cached-read.test.ts src/shared/browser/profile.svelte.test.ts src/shared/browser/relays.test.ts src/features/comments/ui/comment-view-model.test.ts src/features/notifications/ui/notification-feed-view-model.test.ts src/features/relays/ui/relay-settings-view-model.test.ts src/features/comments/application/comment-actions.test.ts src/features/content-resolution/application/resolve-content.test.ts"
```

- [ ] **Step 3: Remove the stale coverage exclude**

In `vite.config.ts`, remove this line from `test.coverage.exclude`:

```ts
        'src/shared/nostr/cached-query.ts',
```

Do not add `src/shared/auftakt/cached-read.svelte.ts` to the exclude list; it is
an active tested module.

- [ ] **Step 4: Verify stale active references are gone**

Run:

```bash
rg -n "src/shared/nostr/cached-query" package.json vite.config.ts
```

Expected: no matches and exit code 1 from `rg`.

- [ ] **Step 5: Run app regression tests**

Run:

```bash
pnpm run test:auftakt:app-regression
```

Expected: PASS, including `src/shared/auftakt/cached-read.test.ts` in the Vitest
file list.

- [ ] **Step 6: Commit active stale reference cleanup**

Run:

```bash
git add package.json vite.config.ts
git commit -m "chore(auftakt): refresh cached read regression targets"
```

## Task 3: Create The April Completion Matrix

**Files:**

- Create: `docs/auftakt/2026-04-26-april-doc-completion-audit.md`

- [ ] **Step 1: Confirm the audited document set**

Run:

```bash
rg --files docs/superpowers/specs docs/superpowers/plans | rg '/2026-04-2.*\.md$' | sort
```

Expected: 45 files, including
`docs/superpowers/specs/2026-04-26-auftakt-april-doc-completion-audit-design.md`.

- [ ] **Step 2: Create the completion audit artifact**

Create `docs/auftakt/2026-04-26-april-doc-completion-audit.md`:

````markdown
# Auftakt April 24-26 Superpowers Completion Audit

Date: 2026-04-26

## Verdict

Not complete until `pnpm run check:auftakt-complete` passes after the semantic
guard and stale active reference cleanup. The April 24-26 implementation surface
is otherwise largely present in code, tests, and guard scripts.

## Blocking Gaps

| Gap                                                  | Status                         | Required Action                                                                                                                             | Gate                                                                                   |
| ---------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Semantic guard rejects facade-owned test mocks       | Fixed by implementation Task 1 | Allow `src/shared/auftakt/cached-read.test.ts` and `src/shared/auftakt/relay-capability.test.ts` in the direct shared Nostr semantic policy | `pnpm run check:auftakt-semantic`                                                      |
| Active config still names retired cached query paths | Fixed by implementation Task 2 | Replace stale app-regression input and remove stale coverage exclude                                                                        | `rg -n "src/shared/nostr/cached-query" package.json vite.config.ts` returns no matches |

## Classification Key

- `Implemented`: code, contract tests, guard proof, and relevant gates exist.
- `Superseded`: replaced by a later accepted plan or implementation path.
- `Partially Implemented`: main code exists but gate, status, or policy remains inconsistent.
- `Not Implemented`: no corresponding code or test evidence found.
- `Docs/Status Only`: audit, handoff, or planning document rather than a code target.

## Completion Matrix

| Document                                                                                                    | Classification        | Evidence                                                                                                                                                                                                                                                                         | Remaining Action                                                                 | Gate                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-04-24-1-of-5-auftakt-coordinator-local-first-pipeline-design.md`               | Implemented           | `packages/resonote/src/event-coordinator.ts`; `packages/resonote/src/event-ingress.ts`; `packages/resonote/src/event-coordinator.contract.test.ts`; `packages/resonote/src/event-ingress.contract.test.ts`                                                                       | None after final gate passes                                                     | `pnpm run test:auftakt:resonote`                                                                     |
| `docs/superpowers/specs/2026-04-24-2-of-5-auftakt-req-optimizer-relay-repair-design.md`                     | Implemented           | `packages/core/src/request-planning.ts`; `packages/core/src/relay-session.ts`; `packages/resonote/src/relay-gateway.ts`; `packages/resonote/src/relay-repair.contract.test.ts`                                                                                                   | None after final gate passes                                                     | `pnpm run test:auftakt:core && pnpm run test:auftakt:resonote`                                       |
| `docs/superpowers/specs/2026-04-24-3-of-5-auftakt-feature-plugin-read-models-design.md`                     | Implemented           | `packages/resonote/src/plugin-api.contract.test.ts`; `packages/resonote/src/plugin-isolation.contract.test.ts`; `packages/resonote/src/plugins/resonote-flows.ts`; `packages/resonote/src/plugins/timeline-plugin.ts`                                                            | None after final gate passes                                                     | `pnpm run test:auftakt:resonote`                                                                     |
| `docs/superpowers/specs/2026-04-24-4-of-5-auftakt-nip-compliance-design.md`                                 | Implemented           | `scripts/check-auftakt-nips.ts`; `scripts/check-auftakt-nips.test.ts`; `docs/auftakt/nips-inventory.json`; `docs/auftakt/nip-matrix.json`; `docs/auftakt/status-verification.md`                                                                                                 | None after final gate passes                                                     | `pnpm run check:auftakt:nips`                                                                        |
| `docs/superpowers/specs/2026-04-24-5-of-5-auftakt-storage-compaction-retention-design.md`                   | Implemented           | `packages/adapter-dexie/src/maintenance.ts`; `packages/adapter-dexie/src/maintenance.contract.test.ts`; `packages/resonote/src/degraded-storage.contract.test.ts`; `packages/adapter-dexie/src/pending-publishes.contract.test.ts`                                               | None after final gate passes                                                     | `pnpm run test:auftakt:storage && pnpm run test:auftakt:resonote`                                    |
| `docs/superpowers/specs/2026-04-24-packages-refactor-design.md`                                             | Implemented           | `packages/core/src/index.ts`; `packages/resonote/src/index.ts`; `packages/adapter-dexie/src/index.ts`; `packages/core/src/module-boundary.contract.test.ts`; absence of `packages/timeline`, `packages/adapter-relay`, and `packages/adapter-indexeddb` in `git ls-files`        | None after final gate passes                                                     | `pnpm run test:packages`                                                                             |
| `docs/superpowers/plans/2026-04-24-1-of-10-auftakt-strict-redesign-security-ingress.md`                     | Implemented           | `packages/core/src/event-validation.ts`; `packages/resonote/src/event-ingress.ts`; `packages/core/src/event-validation.contract.test.ts`; `packages/resonote/src/event-ingress.contract.test.ts`                                                                                 | None after final gate passes                                                     | `pnpm run test:auftakt:core && pnpm run test:auftakt:resonote`                                       |
| `docs/superpowers/plans/2026-04-24-2-of-10-auftakt-strict-redesign-dexie-store-foundation.md`               | Implemented           | `packages/adapter-dexie/src/schema.ts`; `packages/adapter-dexie/src/index.ts`; `packages/adapter-dexie/src/schema.contract.test.ts`; `packages/adapter-dexie/src/app-bridge.contract.test.ts`                                                                                    | None after final gate passes                                                     | `pnpm run test:auftakt:storage`                                                                      |
| `docs/superpowers/plans/2026-04-24-3-of-10-auftakt-strict-redesign-deletion-replaceable-materialization.md` | Implemented           | `packages/adapter-dexie/src/index.ts`; `packages/adapter-dexie/src/materialization.contract.test.ts`; `packages/core/src/reconcile.contract.test.ts`                                                                                                                             | None after final gate passes                                                     | `pnpm run test:auftakt:storage && pnpm exec vitest run packages/core/src/reconcile.contract.test.ts` |
| `docs/superpowers/plans/2026-04-24-4-of-10-auftakt-strict-redesign-coordinator-read-cutover.md`             | Implemented           | `packages/resonote/src/event-coordinator.ts`; `src/shared/auftakt/cached-read.svelte.ts`; `packages/resonote/src/event-coordinator.contract.test.ts`; `src/shared/auftakt/cached-read.test.ts`                                                                                   | None after final gate passes                                                     | `pnpm run test:auftakt:resonote && pnpm exec vitest run src/shared/auftakt/cached-read.test.ts`      |
| `docs/superpowers/plans/2026-04-24-5-of-10-auftakt-strict-redesign-hot-index-performance.md`                | Implemented           | `packages/resonote/src/hot-event-index.ts`; `packages/resonote/src/materializer-queue.ts`; `packages/resonote/src/hot-event-index.contract.test.ts`; `packages/resonote/src/materializer-queue.contract.test.ts`                                                                 | None after final gate passes                                                     | `pnpm run test:auftakt:resonote`                                                                     |
| `docs/superpowers/plans/2026-04-24-6-of-10-auftakt-strict-redesign-req-planner-relay-gateway.md`            | Implemented           | `packages/core/src/request-planning.ts`; `packages/resonote/src/relay-gateway.ts`; `packages/resonote/src/relay-repair.contract.test.ts`; `packages/resonote/src/relay-gateway.contract.test.ts`                                                                                 | None after final gate passes                                                     | `pnpm run test:auftakt:core && pnpm run test:auftakt:resonote`                                       |
| `docs/superpowers/plans/2026-04-24-7-of-10-auftakt-strict-redesign-relay-hints-outbox.md`                   | Implemented           | `packages/adapter-dexie/src/relay-hints.contract.test.ts`; `packages/resonote/src/relay-hints.contract.test.ts`; `packages/resonote/src/relay-routing-publish.contract.test.ts`                                                                                                  | Broad routing is covered by the later relay-selection plans                      | `pnpm run test:auftakt:storage && pnpm run test:auftakt:resonote`                                    |
| `docs/superpowers/plans/2026-04-24-8-of-10-auftakt-strict-redesign-plugin-boundary-cleanup.md`              | Implemented           | `packages/resonote/src/plugin-api.contract.test.ts`; `packages/resonote/src/plugin-isolation.contract.test.ts`; `packages/resonote/src/public-api.contract.test.ts`                                                                                                              | None after final gate passes                                                     | `pnpm run test:auftakt:resonote`                                                                     |
| `docs/superpowers/plans/2026-04-24-9-of-10-auftakt-strict-redesign-nip-matrix-generator.md`                 | Implemented           | `scripts/check-auftakt-nips.ts`; `scripts/check-auftakt-nips.test.ts`; `docs/auftakt/nips-inventory.json`; `docs/auftakt/nip-matrix.json`                                                                                                                                        | Extended by `docs/superpowers/plans/2026-04-26-auftakt-nip-inventory-refresh.md` | `pnpm run check:auftakt:nips`                                                                        |
| `docs/superpowers/plans/2026-04-24-10-of-10-auftakt-strict-redesign-retention-compaction.md`                | Implemented           | `packages/adapter-dexie/src/maintenance.ts`; `packages/adapter-dexie/src/maintenance.contract.test.ts`; `packages/resonote/src/degraded-storage.contract.test.ts`                                                                                                                | None after final gate passes                                                     | `pnpm run test:auftakt:storage && pnpm run test:auftakt:resonote`                                    |
| `docs/superpowers/plans/2026-04-24-packages-refactor.md`                                                    | Implemented           | `packages/core/src/module-boundary.contract.test.ts`; `packages/core/src/public-api.contract.test.ts`; `packages/resonote/src/public-api.contract.test.ts`; `git ls-files packages/adapter-indexeddb packages/adapter-relay packages/timeline` returns no active files           | None after final gate passes                                                     | `pnpm run test:packages`                                                                             |
| `docs/superpowers/specs/2026-04-25-auftakt-handoff-roadmap-design.md`                                       | Docs/Status Only      | `docs/superpowers/plans/2026-04-26-auftakt-handoff-status.md`; `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md`                                                                                                                                                     | Keep as roadmap context                                                          | No code gate                                                                                         |
| `docs/superpowers/specs/2026-04-25-auftakt-relay-capability-queue-design.md`                                | Implemented           | `packages/core/src/relay-capability.ts`; `packages/core/src/relay-session.contract.test.ts`; `packages/adapter-dexie/src/relay-capabilities.contract.test.ts`; `packages/resonote/src/relay-capability-registry.contract.test.ts`; `src/shared/auftakt/relay-capability.test.ts` | None after final gate passes                                                     | `pnpm run test:auftakt:core && pnpm run test:auftakt:storage && pnpm run test:auftakt:resonote`      |
| `docs/superpowers/specs/2026-04-25-auftakt-strict-closure-hardening-design.md`                              | Implemented           | `scripts/check-auftakt-strict-closure.ts`; `scripts/check-auftakt-strict-closure.test.ts`; `packages/resonote/src/event-ingress.contract.test.ts`                                                                                                                                | None after final gate passes                                                     | `pnpm run check:auftakt:strict-closure`                                                              |
| `docs/superpowers/specs/2026-04-25-auftakt-strict-coordinator-surface-design.md`                            | Implemented           | `packages/resonote/src/event-coordinator.ts`; `src/shared/auftakt/resonote.ts`; `src/shared/auftakt/cached-read.svelte.ts`; `scripts/check-auftakt-migration.mjs`                                                                                                                | Original cached-query wording is superseded by cached-read retirement            | `pnpm run check:auftakt-migration -- --proof`                                                        |
| `docs/superpowers/specs/2026-04-25-auftakt-strict-redesign-integration-closure-design.md`                   | Implemented           | `packages/adapter-dexie/src/index.ts`; `src/shared/nostr/event-db.ts`; `src/shared/nostr/pending-publishes.ts`; `scripts/check-auftakt-strict-closure.ts`                                                                                                                        | None after final gate passes                                                     | `pnpm run check:auftakt:strict-closure && pnpm run test:packages`                                    |
| `docs/superpowers/specs/2026-04-25-cached-query-retirement-design.md`                                       | Partially Implemented | `src/shared/auftakt/cached-read.svelte.ts`; `src/shared/auftakt/cached-read.test.ts`; `scripts/check-auftakt-strict-closure.test.ts`                                                                                                                                             | Complete Tasks 1 and 2, then reclassify as `Implemented`                         | `pnpm run check:auftakt-complete`                                                                    |
| `docs/superpowers/specs/2026-04-25-core-module-cleanup-design.md`                                           | Implemented           | `packages/core/src/index.ts`; `packages/core/src/module-boundary.contract.test.ts`; `packages/core/src/public-api.contract.test.ts`                                                                                                                                              | None after final gate passes                                                     | `pnpm run test:auftakt:core`                                                                         |
| `docs/superpowers/plans/2026-04-25-auftakt-relay-capability-queue.md`                                       | Implemented           | `packages/core/src/relay-capability.ts`; `packages/adapter-dexie/src/relay-capabilities.contract.test.ts`; `packages/resonote/src/relay-capability-registry.ts`; `src/shared/auftakt/relay-capability.test.ts`                                                                   | None after final gate passes                                                     | `pnpm run test:auftakt:core && pnpm run test:auftakt:storage && pnpm run test:auftakt:resonote`      |
| `docs/superpowers/plans/2026-04-25-auftakt-relay-capability-strict-completion.md`                           | Partially Implemented | `packages/resonote/src/event-coordinator.contract.test.ts`; `packages/resonote/src/subscription-visibility.contract.test.ts`; `src/shared/auftakt/relay-capability.test.ts`                                                                                                      | Complete Task 1, then reclassify as `Implemented`                                | `pnpm run check:auftakt-complete`                                                                    |
| `docs/superpowers/plans/2026-04-25-auftakt-relay-lifecycle-policy.md`                                       | Implemented           | `packages/core/src/relay-lifecycle.ts`; `packages/core/src/relay-lifecycle.contract.test.ts`; `packages/core/src/relay-session.contract.test.ts`; `packages/core/src/relay-observation.contract.test.ts`                                                                         | None after final gate passes                                                     | `pnpm run test:auftakt:core`                                                                         |
| `docs/superpowers/plans/2026-04-25-auftakt-strict-closure-hardening.md`                                     | Implemented           | `scripts/check-auftakt-strict-closure.ts`; `scripts/check-auftakt-strict-closure.test.ts`; `pnpm run check:auftakt:strict-closure`                                                                                                                                               | None after final gate passes                                                     | `pnpm run check:auftakt:strict-closure`                                                              |
| `docs/superpowers/plans/2026-04-25-auftakt-strict-coordinator-surface.md`                                   | Superseded            | `docs/superpowers/plans/2026-04-25-auftakt-strict-coordinator-surface-remaining.md`; `docs/superpowers/plans/2026-04-25-cached-query-retirement.md`; `src/shared/auftakt/cached-read.svelte.ts`                                                                                  | Keep historical plan; use replacement plans for current status                   | Matrix plus final gate                                                                               |
| `docs/superpowers/plans/2026-04-25-auftakt-strict-coordinator-surface-remaining.md`                         | Implemented           | `d498cb2 docs(auftakt): close coordinator surface plan status`; `packages/resonote/src/event-coordinator.ts`; `src/shared/auftakt/resonote.ts`                                                                                                                                   | None after final gate passes                                                     | `pnpm run check:auftakt-migration -- --proof`                                                        |
| `docs/superpowers/plans/2026-04-25-auftakt-strict-redesign-integration-closure.md`                          | Implemented           | `packages/adapter-dexie/src/index.ts`; `src/shared/nostr/event-db.ts`; `src/shared/nostr/pending-publishes.ts`; `scripts/check-auftakt-strict-closure.ts`; removal of `packages/adapter-indexeddb`                                                                               | None after final gate passes                                                     | `pnpm run check:auftakt:strict-closure && pnpm run test:packages`                                    |
| `docs/superpowers/plans/2026-04-25-cached-query-retirement.md`                                              | Partially Implemented | `src/shared/auftakt/cached-read.svelte.ts`; `src/shared/auftakt/cached-read.test.ts`; `scripts/check-auftakt-strict-closure.test.ts`                                                                                                                                             | Complete Tasks 1 and 2, then reclassify as `Implemented`                         | `pnpm run check:auftakt-complete`                                                                    |
| `docs/superpowers/plans/2026-04-25-core-module-cleanup.md`                                                  | Implemented           | `packages/core/src/index.ts`; `packages/core/src/module-boundary.contract.test.ts`; `packages/core/src/public-api.contract.test.ts`                                                                                                                                              | None after final gate passes                                                     | `pnpm run test:auftakt:core`                                                                         |
| `docs/superpowers/specs/2026-04-26-auftakt-april-doc-completion-audit-design.md`                            | Docs/Status Only      | This audit artifact and implementation plan                                                                                                                                                                                                                                      | Execute this plan                                                                | `pnpm run check:auftakt-complete`                                                                    |
| `docs/superpowers/specs/2026-04-26-auftakt-entity-handles-design.md`                                        | Implemented           | `packages/resonote/src/entity-handles.ts`; `packages/resonote/src/entity-handles.contract.test.ts`; `packages/resonote/src/public-api.contract.test.ts`                                                                                                                          | None after final gate passes                                                     | `pnpm run test:auftakt:resonote`                                                                     |
| `docs/superpowers/specs/2026-04-26-auftakt-handoff-status-design.md`                                        | Docs/Status Only      | `docs/superpowers/plans/2026-04-26-auftakt-handoff-status.md`; `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md`                                                                                                                                                     | Keep as status context                                                           | No code gate                                                                                         |
| `docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md`                                 | Implemented           | `scripts/check-auftakt-nips.ts`; `scripts/check-auftakt-nips.test.ts`; `docs/auftakt/nips-inventory.json`; `docs/auftakt/nip-matrix.json`; `docs/auftakt/status-verification.md`                                                                                                 | None after final gate passes                                                     | `pnpm run check:auftakt:nips`                                                                        |
| `docs/superpowers/specs/2026-04-26-auftakt-relay-selection-completion-design.md`                            | Implemented           | `packages/resonote/src/relay-selection-runtime.ts`; `packages/resonote/src/relay-routing-publish.contract.test.ts`; `packages/resonote/src/entity-handles.contract.test.ts`                                                                                                      | None after final gate passes                                                     | `pnpm run test:auftakt:resonote && pnpm run check`                                                   |
| `docs/superpowers/specs/2026-04-26-auftakt-relay-selection-outbox-routing-design.md`                        | Implemented           | `packages/core/src/relay-selection.ts`; `packages/core/src/relay-selection.contract.test.ts`; `packages/resonote/src/relay-selection-runtime.ts`; `packages/resonote/src/relay-selection-runtime.contract.test.ts`                                                               | None after final gate passes                                                     | `pnpm run test:auftakt:core && pnpm run test:auftakt:resonote`                                       |
| `docs/superpowers/plans/2026-04-26-auftakt-entity-handles.md`                                               | Implemented           | `packages/resonote/src/entity-handles.ts`; `packages/resonote/src/entity-handles.contract.test.ts`; commits `e4b7089`, `8213556`, `6c59eff`, `30d59a3`, `d37ed4a`, `abeea68`, `389d8a7`                                                                                          | None after final gate passes                                                     | `pnpm run test:auftakt:resonote`                                                                     |
| `docs/superpowers/plans/2026-04-26-auftakt-handoff-status.md`                                               | Docs/Status Only      | Commit `69f9a98 docs(auftakt): plan handoff status`; current status docs under `docs/auftakt/`                                                                                                                                                                                   | Keep as handoff context                                                          | No code gate                                                                                         |
| `docs/superpowers/plans/2026-04-26-auftakt-april-doc-completion-audit.md`                                   | Docs/Status Only      | This implementation plan                                                                                                                                                                                                                                                         | Execute this plan                                                                | `pnpm run check:auftakt-complete`                                                                    |
| `docs/superpowers/plans/2026-04-26-auftakt-nip-inventory-refresh.md`                                        | Implemented           | `scripts/check-auftakt-nips.ts`; `scripts/check-auftakt-nips.test.ts`; commits `30128b6`, `2c755eb`, `e53bc55`, `35c5cac`, `709cda7`                                                                                                                                             | None after final gate passes                                                     | `pnpm run check:auftakt:nips`                                                                        |
| `docs/superpowers/plans/2026-04-26-auftakt-relay-selection-completion.md`                                   | Implemented           | `packages/resonote/src/relay-selection-runtime.ts`; `packages/resonote/src/relay-routing-publish.contract.test.ts`; commits `42f364c`, `2f08397`, `c7e7f79`, `f0a027f`, `95691a9`                                                                                                | None after final gate passes                                                     | `pnpm run test:auftakt:resonote && pnpm run check`                                                   |
| `docs/superpowers/plans/2026-04-26-auftakt-relay-selection-outbox-routing.md`                               | Implemented           | `packages/core/src/relay-selection.ts`; `packages/core/src/relay-selection.contract.test.ts`; `packages/resonote/src/relay-selection-runtime.ts`; commits `e312434`, `0f1895d`, `151623c`, `63e8849`, `63d9dfd`, `9caf30a`, `512a65e`                                            | None after final gate passes                                                     | `pnpm run test:auftakt:core && pnpm run test:auftakt:resonote`                                       |

## Final Verification

Run this after the implementation tasks:

```bash
pnpm run check:auftakt-complete
```
````

````

- [ ] **Step 3: Verify the matrix has one row per audited doc**

Run:

```bash
rg --files docs/superpowers/specs docs/superpowers/plans | rg '/2026-04-2.*\.md$' | wc -l
rg -n '^\| `docs/superpowers/' docs/auftakt/2026-04-26-april-doc-completion-audit.md | wc -l
````

Expected: both counts are `45`.

- [ ] **Step 4: Commit the completion matrix**

Run:

```bash
git add docs/auftakt/2026-04-26-april-doc-completion-audit.md docs/superpowers/plans/2026-04-26-auftakt-april-doc-completion-audit.md
git commit -m "docs(auftakt): audit april superpowers completion"
```

## Task 4: Add Focused Status Notes To Misleading Historical Plans

**Files:**

- Modify: `docs/superpowers/plans/2026-04-25-cached-query-retirement.md`
- Modify: `docs/superpowers/plans/2026-04-25-auftakt-relay-capability-strict-completion.md`

- [ ] **Step 1: Add cached query retirement status note**

At the top of `docs/superpowers/plans/2026-04-25-cached-query-retirement.md`,
immediately after the H1, add:

```markdown
> Status: Partially implemented at the time of the 2026-04-26 completion audit.
> The cached read bridge moved to `src/shared/auftakt/cached-read.svelte.ts`, but
> `pnpm run check:auftakt-complete` still required semantic guard and active
> stale-reference cleanup. See
> `docs/auftakt/2026-04-26-april-doc-completion-audit.md`.
```

- [ ] **Step 2: Add relay capability strict completion status note**

At the top of
`docs/superpowers/plans/2026-04-25-auftakt-relay-capability-strict-completion.md`,
immediately after the H1, add:

```markdown
> Status: Partially implemented at the time of the 2026-04-26 completion audit.
> Runtime behavior and contract tests exist, but
> `src/shared/auftakt/relay-capability.test.ts` still needed semantic guard
> allowlist cleanup before the full completion gate could pass. See
> `docs/auftakt/2026-04-26-april-doc-completion-audit.md`.
```

- [ ] **Step 3: Verify the status notes exist**

Run:

```bash
rg -n "2026-04-26 completion audit|april-doc-completion-audit" docs/superpowers/plans/2026-04-25-cached-query-retirement.md docs/superpowers/plans/2026-04-25-auftakt-relay-capability-strict-completion.md
```

Expected: both files print status-note matches.

- [ ] **Step 4: Commit status notes**

Run:

```bash
git add docs/superpowers/plans/2026-04-25-cached-query-retirement.md docs/superpowers/plans/2026-04-25-auftakt-relay-capability-strict-completion.md
git commit -m "docs(auftakt): mark april completion blockers"
```

## Task 5: Final Gate Verification

**Files:**

- No source changes expected.

- [ ] **Step 1: Run focused verification**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-migration.test.ts src/shared/auftakt/cached-read.test.ts src/shared/auftakt/relay-capability.test.ts scripts/check-auftakt-strict-closure.test.ts scripts/check-auftakt-nips.test.ts
pnpm run check:auftakt:nips
pnpm run check:auftakt:strict-closure
pnpm run test:packages
pnpm run check
pnpm run build
```

Expected: all commands pass. Build may keep existing bundle-size and direct
`eval` warnings from dependencies; those warnings are not blockers for this
plan.

- [ ] **Step 2: Run the final completion gate**

Run:

```bash
pnpm run check:auftakt-complete
```

Expected: PASS. This command is the final proof that the April 24-26 completion
audit can be treated as resolved.

- [ ] **Step 3: Inspect final status**

Run:

```bash
git status --short
```

Expected: only intentional changes from this plan are present. Existing
unrelated untracked historical superpowers docs and `.gitignore` changes may
still appear; do not revert them.

- [ ] **Step 4: Commit any verification-only correction**

If Task 5 revealed and fixed a small verification-only issue, commit it:

```bash
git add package.json vite.config.ts scripts/check-auftakt-migration.mjs scripts/check-auftakt-migration.test.ts docs/auftakt/2026-04-26-april-doc-completion-audit.md docs/superpowers/plans/2026-04-25-cached-query-retirement.md docs/superpowers/plans/2026-04-25-auftakt-relay-capability-strict-completion.md
git commit -m "chore(auftakt): close april completion audit"
```

Expected: no commit is needed if Tasks 1-4 already committed all changes and
Task 5 passes without edits.

## Plan Self-Review

- Spec coverage: The plan covers completion gate restoration, stale active
  references, one matrix entry per April 24-26 doc, focused status notes, and
  final `check:auftakt-complete` verification.
- Red-flag scan: No incomplete-marker tasks remain. Every code change has exact
  file paths, content, commands, and expected results.
- Type consistency: The plan uses current file names:
  `src/shared/auftakt/cached-read.test.ts`,
  `src/shared/auftakt/relay-capability.test.ts`,
  `scripts/check-auftakt-migration.mjs`, and
  `docs/auftakt/2026-04-26-april-doc-completion-audit.md`.
