# Negentropy Message Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add focused package-internal contract tests for the Negentropy message codec so PR #235 clears patch coverage while locking the wire-format regression.

**Architecture:** Keep the production codec unchanged. Add one sibling contract test file under `packages/runtime/src/` that imports the internal helper directly, verifies the NIP-77 ID-list message behavior, and exercises malformed input branches.

**Tech Stack:** TypeScript, Vitest, V8 coverage, Auftakt runtime package contracts.

---

## File Structure

- Create: `packages/runtime/src/negentropy-message.contract.test.ts`
  - Owns package-internal contract coverage for `encodeNegentropyIdListMessage` and `decodeNegentropyIdListMessage`.
  - Does not add public exports.
- Read-only validation: `packages/runtime/src/negentropy-message.ts`
  - Production helper under test. Do not change unless a test reveals the documented spec is wrong.
- Existing regression checks:
  - `packages/runtime/src/relay-gateway.contract.test.ts`
  - `packages/runtime/src/relay-repair.contract.test.ts`
  - `packages/runtime/src/package-boundary.contract.test.ts`
  - `packages/runtime/src/public-api.contract.test.ts`

## Task 1: Add Codec Contract Tests

**Files:**

- Create: `packages/runtime/src/negentropy-message.contract.test.ts`

- [ ] **Step 1: Record the current focused coverage baseline**

Run:

```bash
pnpm exec vitest run packages/runtime/src/relay-gateway.contract.test.ts packages/runtime/src/relay-repair.contract.test.ts --coverage
```

Expected: tests pass, and `packages/runtime/src/negentropy-message.ts` remains below the patch target because only gateway/repair integration paths exercise it.

- [ ] **Step 2: Create the contract test file**

Add this complete file at `packages/runtime/src/negentropy-message.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  decodeNegentropyIdListMessage,
  encodeNegentropyIdListMessage
} from './negentropy-message.js';

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);
const ID_C = 'c'.repeat(64);

function idListMessage(ids: readonly string[]): string {
  return `61000002${ids.length.toString(16).padStart(2, '0')}${ids.join('')}`;
}

describe('@auftakt/runtime negentropy message codec', () => {
  it('encodes an empty local set as the canonical empty ID-list message', () => {
    // NIP-77 helper frame used here:
    // 61 = protocol version byte
    // 00 = infinity upper-bound timestamp varint
    // 00 = zero-length ID prefix
    // 02 = ID-list mode
    // 00 = empty ID-list length
    expect(encodeNegentropyIdListMessage([])).toBe('6100000200');
  });

  it('decodes an empty ID-list message to an empty id array', () => {
    expect(decodeNegentropyIdListMessage('6100000200')).toEqual([]);
  });

  it('sorts event refs by created_at and then id before encoding', () => {
    const messageHex = encodeNegentropyIdListMessage([
      { id: ID_C, created_at: 2 },
      { id: ID_B, created_at: 1 },
      { id: ID_A, created_at: 1 }
    ]);

    expect(decodeNegentropyIdListMessage(messageHex)).toEqual([ID_A, ID_B, ID_C]);
  });

  it('decodes ID-list messages and normalizes uppercase ids to lowercase hex', () => {
    expect(decodeNegentropyIdListMessage(idListMessage([ID_A.toUpperCase()]))).toEqual([ID_A]);
  });

  it('preserves duplicate IDs as lossless wire data', () => {
    expect(decodeNegentropyIdListMessage(idListMessage([ID_A, ID_A]))).toEqual([ID_A, ID_A]);
  });

  it('rejects odd-length hex payloads', () => {
    expect(() => decodeNegentropyIdListMessage('610')).toThrow(/even length/i);
  });

  it('rejects JSON-like non-hex payloads', () => {
    expect(() => decodeNegentropyIdListMessage('[]')).toThrow(/invalid byte/i);
  });

  it('rejects unsupported protocol versions', () => {
    expect(() => decodeNegentropyIdListMessage('6200000200')).toThrow(/unsupported.*version/i);
  });

  it('rejects event IDs with invalid length during encode', () => {
    expect(() => encodeNegentropyIdListMessage([{ id: 'a'.repeat(63), created_at: 1 }])).toThrow(
      /32-byte hex ids/i
    );
  });

  it('rejects event IDs with non-hex characters during encode', () => {
    expect(() => encodeNegentropyIdListMessage([{ id: 'g'.repeat(64), created_at: 1 }])).toThrow(
      /32-byte hex ids/i
    );
  });

  it('rejects unsupported range modes', () => {
    expect(() => decodeNegentropyIdListMessage('61000001')).toThrow(/unsupported.*mode/i);
  });

  it('rejects truncated ID-list payloads', () => {
    expect(() => decodeNegentropyIdListMessage('6100000201')).toThrow(/truncated/i);
  });

  it('rejects bytes that cannot be parsed as a complete trailing frame', () => {
    expect(() => decodeNegentropyIdListMessage('6100000200ff')).toThrow(/unterminated/i);
  });

  it('consumes skip-only ranges without generating synthetic IDs', () => {
    // 61 = protocol version, then one range:
    // 00 = infinity upper-bound timestamp varint
    // 00 = zero-length ID prefix
    // 00 = skip mode
    expect(decodeNegentropyIdListMessage('61000000')).toEqual([]);
  });

  it('consumes skip ranges before returning later ID-list IDs', () => {
    const messageHex = `6100000000000201${ID_B}`;
    // First range: 00 upper-bound, 00 prefix length, 00 skip mode.
    // Second range: 00 upper-bound, 00 prefix length, 02 ID-list mode, 01 ID-list length, ID_B.
    expect(decodeNegentropyIdListMessage(messageHex)).toEqual([ID_B]);
  });
});
```

- [ ] **Step 3: Run the new contract test**

Run:

```bash
pnpm exec vitest run packages/runtime/src/negentropy-message.contract.test.ts
```

Expected: PASS. If any test fails, compare the failure against `packages/runtime/src/negentropy-message.ts`; only change production code if the test exposes a real mismatch with the approved design.

- [ ] **Step 4: Run focused regression tests**

Run:

```bash
pnpm exec vitest run packages/runtime/src/negentropy-message.contract.test.ts packages/runtime/src/relay-gateway.contract.test.ts packages/runtime/src/relay-repair.contract.test.ts
```

Expected: PASS. This confirms the direct codec contract and the existing ordinary read verification / relay repair contracts all agree.

- [ ] **Step 5: Commit the codec tests**

Run:

```bash
git add packages/runtime/src/negentropy-message.contract.test.ts
git commit -m "test: cover negentropy message codec"
```

Expected: commit succeeds. Pre-commit may run Prettier/ESLint; if it changes the test file, inspect `git diff --cached` before committing again.

## Task 2: Verify Package Boundaries and Coverage

**Files:**

- Validate only:
  - `packages/runtime/src/negentropy-message.contract.test.ts`
  - `packages/runtime/src/package-boundary.contract.test.ts`
  - `packages/runtime/src/public-api.contract.test.ts`
  - `coverage/lcov.info`

- [ ] **Step 1: Run package boundary checks for the new test file**

Run:

```bash
pnpm exec vitest run packages/runtime/src/package-boundary.contract.test.ts packages/runtime/src/public-api.contract.test.ts
```

Expected: PASS. This confirms the new `.contract.test.ts` remains test-only and does not alter public exports.

- [ ] **Step 2: Run package tests**

Run:

```bash
pnpm run test:packages
```

Expected: PASS with all package contract tests green.

- [ ] **Step 3: Run the Auftakt migration proof**

Run:

```bash
pnpm run check:auftakt-migration -- --proof
```

Expected: `Status: COMPLETE` and zero coverage / ownership violations.

- [ ] **Step 4: Run full coverage**

Run:

```bash
pnpm run test:coverage
```

Expected: PASS. If sandbox blocks Vitest workers that spawn `git ls-files`, rerun the same command with sandbox escalation. In the coverage table, `packages/runtime/src/negentropy-message.ts` should be at or above 80% statements and lines, with branch coverage improved from the previous 50% baseline.

- [ ] **Step 5: Commit verification artifacts only if source changed**

Run:

```bash
git status -sb
```

Expected: no source changes except the intended test commit. Do not commit generated `coverage/`, `test-results/`, or unrelated `.codex` files.

## Task 3: Update PR Branch

**Files:**

- No file edits expected.

- [ ] **Step 1: Confirm branch status**

Run:

```bash
git status -sb
git log --oneline --decorate --max-count 6
```

Expected: branch is `codex/fix-negentropy-initial-message`; only intended commits are ahead of `origin/codex/fix-negentropy-initial-message`; `.codex` remains untracked and excluded.

- [ ] **Step 2: Push the branch**

Run:

```bash
git push origin codex/fix-negentropy-initial-message
```

Expected: push succeeds and updates PR #235.

- [ ] **Step 3: Update PR #235 description with the codec coverage follow-up**

Use the GitHub connector to update PR #235 with this body:

```md
## Summary

- ordinary read の Negentropy 初期messageをJSON文字列ではなくNIP-77のhex-encoded messageに変更
- Negentropy ID list encode/decodeをruntime内部helperへ分離し、relay repairとordinary read gatewayで共有
- contract testを実際のhex payload期待へ更新
- package-internal contract coverage for the Negentropy message codecを追加し、malformed hex、unsupported modes、truncation、skip ranges、sorting、uppercase normalization、duplicate ID preservationを固定

## Root Cause

ordinary read gatewayが`initialMessageHex`へ`JSON.stringify(localRefs)`を渡していたため、空配列では`[]`がWebSocket上の`NEG-OPEN`へ流れていました。relay側はNIP-77どおりhex文字列としてparseするため、先頭文字`[`のASCII code `91`で`unexpected character in from_hex: 91`が発生していました。

## Validation

- `pnpm run test:packages`
- `pnpm run check:auftakt-migration -- --proof`
- `pnpm run test:coverage`
```

Expected: reviewers can see that the coverage change is intentional regression coverage for the `from_hex: 91` bug, not threshold gaming.
