# Auftakt NIP Inventory Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the deterministic Auftakt NIP inventory checker so
inventory, matrix, and status docs drift fails CI without network access or
automatic support-status promotion.

**Architecture:** Keep `docs/auftakt/nips-inventory.json` as the vendored
official inventory snapshot and `docs/auftakt/nip-matrix.json` as the canonical
local classification matrix. Extend `scripts/check-auftakt-nips.ts` with pure
validation helpers and a CLI docs-sync read. Do not add a network refresh
command in this plan.

**Tech Stack:** TypeScript executed with Node `--experimental-strip-types`,
Vitest, JSON docs, Markdown status companion, pnpm scripts.

---

## Scope Check

This plan implements only the check-first design in
`docs/superpowers/specs/2026-04-26-auftakt-nip-inventory-refresh-design.md`.

It does not implement `pnpm run refresh:auftakt:nips`, does not fetch the
official README over the network, and does not rewrite JSON or Markdown files.
All changes are checker code, tests, and deterministic validation behavior.

## File Structure

- Modify: `scripts/check-auftakt-nips.ts`
  - Add schema validation for inventory and matrix.
  - Add source metadata drift detection.
  - Add stale matrix entry detection.
  - Add owner/proof/support-boundary rules.
  - Add docs sync validation against `docs/auftakt/status-verification.md`.
  - Add `assertNoRewriteOnRefreshFailure()` as a pure safety helper for future
    refresh command tests.
- Modify: `scripts/check-auftakt-nips.test.ts`
  - Add focused tests for inventory drift, stale entries, owner/proof gaps,
    docs drift, no-rewrite safety, and no auto-promotion.
- No changes: `docs/auftakt/nips-inventory.json`
- No changes: `docs/auftakt/nip-matrix.json`
- No changes: `docs/auftakt/status-verification.md`
- No changes: `package.json`

---

### Task 1: Add Strict Inventory And Matrix Set Checks

**Files:**

- Modify: `scripts/check-auftakt-nips.ts`
- Modify: `scripts/check-auftakt-nips.test.ts`

- [ ] **Step 1: Add failing tests for stale entries and source metadata drift**

Replace `scripts/check-auftakt-nips.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';

import { checkNipMatrix } from './check-auftakt-nips.js';

function entry(
  nip: string,
  overrides: Partial<Parameters<typeof checkNipMatrix>[1]['entries'][number]> = {}
) {
  return {
    nip,
    level: 'public',
    status: 'partial',
    owner: 'packages/resonote/src/runtime.ts',
    proof: 'packages/resonote/src/public-api.contract.test.ts',
    priority: 'P1',
    scopeNotes: 'bounded support boundary',
    ...overrides
  };
}

describe('checkNipMatrix', () => {
  it('reports missing NIP classifications', () => {
    const result = checkNipMatrix(
      { nips: ['01', '02'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01')]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Missing matrix entry for NIP-02');
  });

  it('reports stale matrix entries outside the official inventory', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01'), entry('02')]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Stale matrix entry for NIP-02');
  });

  it('reports inventory and matrix source metadata drift', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'official', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'local',
        sourceDate: '2026-04-25',
        entries: [entry('01')]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Matrix sourceUrl differs from inventory sourceUrl');
    expect(result.errors).toContain('Matrix sourceDate differs from inventory sourceDate');
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
```

Expected: FAIL because stale entries and source metadata drift are not reported.

- [ ] **Step 3: Extend matrix interfaces and set checks**

In `scripts/check-auftakt-nips.ts`, change `NipMatrix` to:

```ts
export interface NipMatrix {
  sourceUrl: string;
  sourceDate: string;
  entries: NipMatrixEntry[];
}
```

Replace `checkNipMatrix()` with:

```ts
export function checkNipMatrix(
  inventory: NipInventory,
  matrix: NipMatrix
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  errors.push(...validateInventory(inventory));
  errors.push(...validateMatrix(matrix));

  if (inventory.sourceUrl !== matrix.sourceUrl) {
    errors.push('Matrix sourceUrl differs from inventory sourceUrl');
  }
  if (inventory.sourceDate !== matrix.sourceDate) {
    errors.push('Matrix sourceDate differs from inventory sourceDate');
  }

  const inventoryNips = new Set(inventory.nips);
  const entries = new Map(matrix.entries.map((entry) => [entry.nip, entry]));

  for (const nip of inventory.nips) {
    const entry = entries.get(nip);
    if (!entry) {
      errors.push(`Missing matrix entry for NIP-${nip}`);
      continue;
    }
    errors.push(...validateMatrixEntry(entry));
  }

  for (const entry of matrix.entries) {
    if (!inventoryNips.has(entry.nip)) {
      errors.push(`Stale matrix entry for NIP-${entry.nip}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
```

Add helpers below it:

```ts
function validateInventory(inventory: NipInventory): string[] {
  const errors: string[] = [];
  if (!inventory.sourceUrl) errors.push('Inventory missing sourceUrl');
  if (!inventory.sourceDate) errors.push('Inventory missing sourceDate');
  const seen = new Set<string>();
  for (const nip of inventory.nips) {
    if (seen.has(nip)) errors.push(`Duplicate inventory NIP-${nip}`);
    seen.add(nip);
    if (nip !== nip.toUpperCase()) errors.push(`Inventory NIP-${nip} is not uppercase normalized`);
  }
  const sorted = [...inventory.nips].sort();
  if (inventory.nips.join('\n') !== sorted.join('\n')) {
    errors.push('Inventory NIPs are not sorted');
  }
  return errors;
}

function validateMatrix(matrix: NipMatrix): string[] {
  const errors: string[] = [];
  if (!matrix.sourceUrl) errors.push('Matrix missing sourceUrl');
  if (!matrix.sourceDate) errors.push('Matrix missing sourceDate');
  return errors;
}

function validateMatrixEntry(entry: NipMatrixEntry): string[] {
  const errors: string[] = [];
  for (const key of ['level', 'status', 'owner', 'proof', 'priority', 'scopeNotes'] as const) {
    if (!entry[key]) errors.push(`NIP-${entry.nip} missing ${key}`);
  }
  return errors;
}
```

- [ ] **Step 4: Run tests and checker**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
pnpm run check:auftakt:nips
```

Expected: PASS for both commands.

- [ ] **Step 5: Commit set check strengthening**

Run:

```bash
git add scripts/check-auftakt-nips.ts scripts/check-auftakt-nips.test.ts
git commit -m "test(auftakt): lock nip inventory drift checks"
```

Expected: focused commit for inventory/matrix set checks.

---

### Task 2: Add Owner, Support Boundary, Proof, And Enum Rules

**Files:**

- Modify: `scripts/check-auftakt-nips.ts`
- Modify: `scripts/check-auftakt-nips.test.ts`

- [ ] **Step 1: Add failing validation tests**

Append to `scripts/check-auftakt-nips.test.ts`:

```ts
describe('NIP matrix entry validation', () => {
  it('rejects unknown level status and priority values', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01', { level: 'mystery', status: 'done', priority: 'soon' })]
      }
    );

    expect(result.errors).toContain('NIP-01 has unknown level mystery');
    expect(result.errors).toContain('NIP-01 has unknown status done');
    expect(result.errors).toContain('NIP-01 has unknown priority soon');
  });

  it('rejects implemented or partial claims with docs-only owner or proof', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('01', {
            status: 'implemented',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-01 implemented claim cannot use docs-only owner');
    expect(result.errors).toContain('NIP-01 implemented claim cannot use docs-only proof');
  });

  it('rejects missing support boundary notes', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01', { scopeNotes: 'TBD' })]
      }
    );

    expect(result.errors).toContain('NIP-01 missing support boundary in scopeNotes');
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
```

Expected: FAIL because enum, docs-only, and support-boundary rules do not exist.

- [ ] **Step 3: Add validation constants and rules**

In `scripts/check-auftakt-nips.ts`, add near the interfaces:

```ts
const KNOWN_LEVELS = new Set([
  'public',
  'public-compat',
  'internal',
  'internal-only',
  'scoped-out'
]);
const KNOWN_STATUSES = new Set([
  'implemented',
  'partial',
  'planned',
  'deferred',
  'not-started',
  'not-applicable',
  'deprecated',
  'unrecommended'
]);
const KNOWN_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const DOCS_ONLY_OWNER = 'docs/auftakt/nip-matrix.json';
const NON_IMPLEMENTED_STATUSES = new Set([
  'not-started',
  'not-applicable',
  'deprecated',
  'unrecommended'
]);
```

Extend `validateMatrixEntry()` after the required field loop:

```ts
if (entry.level && !KNOWN_LEVELS.has(entry.level)) {
  errors.push(`NIP-${entry.nip} has unknown level ${entry.level}`);
}
if (entry.status && !KNOWN_STATUSES.has(entry.status)) {
  errors.push(`NIP-${entry.nip} has unknown status ${entry.status}`);
}
if (entry.priority && !KNOWN_PRIORITIES.has(entry.priority)) {
  errors.push(`NIP-${entry.nip} has unknown priority ${entry.priority}`);
}
if (/^(TBD|TODO|notes)$/i.test(entry.scopeNotes.trim())) {
  errors.push(`NIP-${entry.nip} missing support boundary in scopeNotes`);
}
if (!NON_IMPLEMENTED_STATUSES.has(entry.status)) {
  if (entry.owner === DOCS_ONLY_OWNER) {
    errors.push(`NIP-${entry.nip} ${entry.status} claim cannot use docs-only owner`);
  }
  if (entry.proof === DOCS_ONLY_OWNER) {
    errors.push(`NIP-${entry.nip} ${entry.status} claim cannot use docs-only proof`);
  }
}
```

- [ ] **Step 4: Run tests and checker**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
pnpm run check:auftakt:nips
```

Expected: PASS for both commands.

- [ ] **Step 5: Commit entry validation rules**

Run:

```bash
git add scripts/check-auftakt-nips.ts scripts/check-auftakt-nips.test.ts
git commit -m "test(auftakt): lock nip matrix entry rules"
```

Expected: focused commit for entry validation.

---

### Task 3: Add Status Documentation Sync Check

**Files:**

- Modify: `scripts/check-auftakt-nips.ts`
- Modify: `scripts/check-auftakt-nips.test.ts`

- [ ] **Step 1: Add failing docs sync tests**

Append to `scripts/check-auftakt-nips.test.ts`:

```ts
import { checkNipStatusDocsSync } from './check-auftakt-nips.js';

describe('checkNipStatusDocsSync', () => {
  it('reports matrix NIPs missing from status-verification docs', () => {
    const result = checkNipStatusDocsSync(
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01'), entry('02')]
      },
      '| NIP-01 | public | partial |'
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('docs/auftakt/status-verification.md missing NIP-02');
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
```

Expected: FAIL because `checkNipStatusDocsSync()` is not exported.

- [ ] **Step 3: Implement docs sync helper and CLI integration**

In `scripts/check-auftakt-nips.ts`, update the imports:

```ts
import { existsSync, readFileSync } from 'node:fs';
```

Add:

```ts
export function checkNipStatusDocsSync(
  matrix: NipMatrix,
  statusMarkdown: string
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const entry of matrix.entries) {
    if (!statusMarkdown.includes(`NIP-${entry.nip}`)) {
      errors.push(`docs/auftakt/status-verification.md missing NIP-${entry.nip}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
```

In the CLI block, after `const result = checkNipMatrix(inventory, matrix);`,
add:

```ts
const docsPath = 'docs/auftakt/status-verification.md';
const docsResult = existsSync(docsPath)
  ? checkNipStatusDocsSync(matrix, readFileSync(docsPath, 'utf8'))
  : { ok: false, errors: [`Missing ${docsPath}`] };
const errors = [...result.errors, ...docsResult.errors];
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
```

Remove the old `if (!result.ok) { ... }` block.

- [ ] **Step 4: Run tests and checker**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
pnpm run check:auftakt:nips
```

Expected: PASS for both commands.

- [ ] **Step 5: Commit docs sync check**

Run:

```bash
git add scripts/check-auftakt-nips.ts scripts/check-auftakt-nips.test.ts
git commit -m "test(auftakt): check nip status docs sync"
```

Expected: focused commit for docs sync.

---

### Task 4: Add No-Rewrite Refresh Safety Helper

**Files:**

- Modify: `scripts/check-auftakt-nips.ts`
- Modify: `scripts/check-auftakt-nips.test.ts`

- [ ] **Step 1: Add failing no-rewrite and no-auto-promotion tests**

Append to `scripts/check-auftakt-nips.test.ts`:

```ts
import { assertNoRewriteOnRefreshFailure, proposeInventoryDrift } from './check-auftakt-nips.js';

describe('refresh safety helpers', () => {
  it('does not rewrite docs when official fetch fails', async () => {
    const writes: string[] = [];
    const result = await assertNoRewriteOnRefreshFailure({
      fetchOfficialInventory: async () => {
        throw new Error('network unavailable');
      },
      writeFile: async (path) => {
        writes.push(path);
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['Official inventory fetch failed: network unavailable']);
    expect(writes).toEqual([]);
  });

  it('reports inventory drift without auto-promoting support status', () => {
    const result = proposeInventoryDrift(
      { sourceUrl: 'source', sourceDate: '2026-04-24', nips: ['01', '02'] },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01', { status: 'not-started' })]
      }
    );

    expect(result.addedNips).toEqual(['02']);
    expect(result.statusPromotions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
```

Expected: FAIL because the helper exports do not exist.

- [ ] **Step 3: Implement refresh safety helpers**

Append to `scripts/check-auftakt-nips.ts`:

```ts
export async function assertNoRewriteOnRefreshFailure(input: {
  readonly fetchOfficialInventory: () => Promise<NipInventory>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
}): Promise<{ ok: boolean; errors: string[] }> {
  try {
    await input.fetchOfficialInventory();
    return { ok: true, errors: [] };
  } catch (error) {
    return {
      ok: false,
      errors: [`Official inventory fetch failed: ${normalizeErrorMessage(error)}`]
    };
  }
}

export function proposeInventoryDrift(
  inventory: NipInventory,
  matrix: NipMatrix
): { addedNips: string[]; removedNips: string[]; statusPromotions: string[] } {
  const inventoryNips = new Set(inventory.nips);
  const matrixNips = new Set(matrix.entries.map((entry) => entry.nip));
  return {
    addedNips: inventory.nips.filter((nip) => !matrixNips.has(nip)),
    removedNips: matrix.entries.map((entry) => entry.nip).filter((nip) => !inventoryNips.has(nip)),
    statusPromotions: []
  };
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

The implementation intentionally does not call `writeFile()` in the failure
path.

- [ ] **Step 4: Run tests and checker**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
pnpm run check:auftakt:nips
```

Expected: PASS for both commands.

- [ ] **Step 5: Commit refresh safety helpers**

Run:

```bash
git add scripts/check-auftakt-nips.ts scripts/check-auftakt-nips.test.ts
git commit -m "test(auftakt): lock nip refresh safety"
```

Expected: focused commit for no-rewrite and no-auto-promotion safety.

---

### Task 5: Final Verification

**Files:**

- Verify: `scripts/check-auftakt-nips.ts`
- Verify: `scripts/check-auftakt-nips.test.ts`

- [ ] **Step 1: Run focused NIP checker tests**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run NIP check command**

Run:

```bash
pnpm run check:auftakt:nips
```

Expected: PASS with no output.

- [ ] **Step 3: Run migration proof**

Run:

```bash
pnpm run check:auftakt-migration -- --proof
```

Expected: PASS.

- [ ] **Step 4: Run root check**

Run:

```bash
pnpm run check
```

Expected: PASS with zero Svelte diagnostics.

- [ ] **Step 5: Confirm no accidental staged files remain**

Run:

```bash
git diff --cached --name-status
```

Expected: no output.

---

## Self-Review

Spec coverage:

- Official inventory fixture drift: Tasks 1 and 4.
- Unknown official NIP classification failure: Task 1 missing entry test.
- Stale matrix entries: Task 1.
- Missing owner/support/proof gaps: Task 2 plus existing required field loop.
- Docs sync drift: Task 3.
- Network failure no rewrite: Task 4.
- Support status no auto-promotion: Task 4.
- Deterministic network-free `check:auftakt:nips`: Tasks 3 and 5.

No task adds network fetch, refresh command wiring, support status promotion, or
docs rewrite behavior.
