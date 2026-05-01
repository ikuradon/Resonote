# Auftakt NIP Matrix Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CI-checkable NIP inventory matrix so "NIPs complete" means every official NIP is classified, owned, and proof-anchored or explicitly scoped out.

**Architecture:** Keep a vendored official inventory JSON for offline CI checks. A refresh command can update it from `nostr-protocol/nips`, but normal `check:auftakt:nips` is deterministic and network-free.

**Tech Stack:** TypeScript, pnpm scripts, Vitest or node script tests, docs

---

## File Structure

- Create: `docs/auftakt/nips-inventory.json`
- Create: `docs/auftakt/nip-matrix.json`
- Create: `scripts/check-auftakt-nips.ts`
- Create: `scripts/check-auftakt-nips.test.ts`
- Modify: `package.json`
- Modify: `docs/auftakt/status-verification.md`

### Task 1: Add Inventory and Matrix Files

**Files:**

- Create: `docs/auftakt/nips-inventory.json`
- Create: `docs/auftakt/nip-matrix.json`

- [ ] **Step 1: Add official inventory snapshot**

```json
{
  "sourceUrl": "https://github.com/nostr-protocol/nips",
  "sourceDate": "2026-04-24",
  "nips": [
    "01",
    "02",
    "05",
    "07",
    "09",
    "10",
    "11",
    "19",
    "21",
    "22",
    "25",
    "42",
    "44",
    "65",
    "70",
    "77"
  ]
}
```

- [ ] **Step 2: Add initial local matrix**

```json
{
  "sourceUrl": "https://github.com/nostr-protocol/nips",
  "sourceDate": "2026-04-24",
  "entries": [
    {
      "nip": "01",
      "level": "internal",
      "status": "partial",
      "owner": "packages/core/src/relay-session.ts",
      "proof": "packages/core/src/relay-session.contract.test.ts",
      "priority": "P0",
      "scopeNotes": "Basic relay protocol runtime behavior"
    }
  ]
}
```

- [ ] **Step 3: Commit inventory seed**

```bash
git add docs/auftakt/nips-inventory.json docs/auftakt/nip-matrix.json
git commit -m "docs: seed auftakt nip inventory matrix"
```

### Task 2: Implement Offline Matrix Check

**Files:**

- Create: `scripts/check-auftakt-nips.ts`
- Create: `scripts/check-auftakt-nips.test.ts`

- [ ] **Step 1: Write failing script tests**

```ts
import { checkNipMatrix } from './check-auftakt-nips.js';

describe('checkNipMatrix', () => {
  it('reports missing NIP classifications', () => {
    const result = checkNipMatrix(
      { nips: ['01', '02'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        entries: [
          {
            nip: '01',
            level: 'internal',
            status: 'partial',
            owner: 'owner',
            proof: 'proof',
            priority: 'P0',
            scopeNotes: 'notes'
          }
        ]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Missing matrix entry for NIP-02');
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run scripts/check-auftakt-nips.test.ts`  
Expected: FAIL because script does not exist.

- [ ] **Step 3: Implement check function and CLI**

```ts
import { readFileSync } from 'node:fs';

export interface NipInventory {
  sourceUrl: string;
  sourceDate: string;
  nips: string[];
}

export interface NipMatrix {
  entries: Array<{
    nip: string;
    level: string;
    status: string;
    owner: string;
    proof: string;
    priority: string;
    scopeNotes: string;
  }>;
}

export function checkNipMatrix(
  inventory: NipInventory,
  matrix: NipMatrix
): { ok: boolean; errors: string[] } {
  const entries = new Map(matrix.entries.map((entry) => [entry.nip, entry]));
  const errors: string[] = [];
  for (const nip of inventory.nips) {
    const entry = entries.get(nip);
    if (!entry) {
      errors.push(`Missing matrix entry for NIP-${nip}`);
      continue;
    }
    for (const key of ['level', 'status', 'owner', 'proof', 'priority', 'scopeNotes'] as const) {
      if (!entry[key]) errors.push(`NIP-${nip} missing ${key}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inventory = JSON.parse(
    readFileSync('docs/auftakt/nips-inventory.json', 'utf8')
  ) as NipInventory;
  const matrix = JSON.parse(readFileSync('docs/auftakt/nip-matrix.json', 'utf8')) as NipMatrix;
  const result = checkNipMatrix(inventory, matrix);
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run script tests**

Run: `pnpm exec vitest run scripts/check-auftakt-nips.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-auftakt-nips.ts scripts/check-auftakt-nips.test.ts
git commit -m "feat: add auftakt nip matrix checker"
```

### Task 3: Wire CI Command and Complete Matrix

**Files:**

- Modify: `package.json`
- Modify: `docs/auftakt/nip-matrix.json`
- Modify: `docs/auftakt/status-verification.md`

- [ ] **Step 1: Add package script**

```json
{
  "scripts": {
    "check:auftakt:nips": "tsx scripts/check-auftakt-nips.ts"
  }
}
```

Preserve existing scripts and add only this key.

- [ ] **Step 2: Complete matrix entries for every inventory item**

For each `nips-inventory.json` value, add one entry shaped like:

```json
{
  "nip": "02",
  "level": "public",
  "status": "implemented",
  "owner": "src/shared/browser/follows.svelte.ts",
  "proof": "src/shared/browser/follows.test.ts",
  "priority": "P0",
  "scopeNotes": "Follow list behavior and app-facing follow actions"
}
```

- [ ] **Step 3: Link generated matrix from status verification**

Add near the top of `docs/auftakt/status-verification.md`:

```md
The strict redesign matrix is checked by `pnpm run check:auftakt:nips` using
`docs/auftakt/nips-inventory.json` and `docs/auftakt/nip-matrix.json`.
```

- [ ] **Step 4: Run checks**

Run: `pnpm run check:auftakt:nips`  
Expected: PASS with no output.

Run: `pnpm exec vitest run scripts/check-auftakt-nips.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json docs/auftakt/nip-matrix.json docs/auftakt/status-verification.md
git commit -m "docs: check strict auftakt nip matrix"
```
