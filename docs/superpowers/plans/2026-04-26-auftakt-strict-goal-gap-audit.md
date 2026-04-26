# Auftakt Strict Goal Gap Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a focused audit gate and documentation layer that separates current scoped Auftakt completion from the stricter final coordinator/database mediation goal.

**Architecture:** Add a small `scripts/check-auftakt-strict-goal-audit.ts` gate that validates the strict gap artifact, checks raw transport usage by layer, and prevents ambiguous strict-completion wording. Keep runtime behavior unchanged in this phase; the implementation writes docs, tests, and guard rules only.

**Tech Stack:** TypeScript, Vitest, Node `--experimental-strip-types`, Markdown docs, existing `pnpm` scripts.

---

## File Structure

- Create `scripts/check-auftakt-strict-goal-audit.ts`: focused checker for the strict goal audit artifact, doc wording, and raw transport mediation classification.
- Create `scripts/check-auftakt-strict-goal-audit.test.ts`: contract tests for the new checker.
- Create `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`: current strict-vs-scoped audit artifact.
- Modify `docs/auftakt/spec.md`: link scoped completion wording to the strict gap audit and stop presenting scoped `Satisfied` rows as strict final completion.
- Modify `packages/resonote/src/public-api.contract.test.ts`: lock the package root value surface as an explicit coordinator-owned allowlist.
- Modify `packages/resonote/src/plugin-isolation.contract.test.ts`: add a stronger plugin API raw-handle leakage assertion.
- Modify `package.json`: add `check:auftakt:strict-goal-audit` and include it in `check:auftakt-complete`.

## Task 1: Add The Strict Goal Audit Checker Skeleton

**Files:**

- Create: `scripts/check-auftakt-strict-goal-audit.ts`
- Create: `scripts/check-auftakt-strict-goal-audit.test.ts`

- [ ] **Step 1: Write the failing checker tests**

Create `scripts/check-auftakt-strict-goal-audit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  checkStrictGoalAudit,
  STRICT_GOAL_AUDIT_PATH,
  type StrictGoalAuditFile
} from './check-auftakt-strict-goal-audit.ts';

function file(path: string, text: string): StrictGoalAuditFile {
  return { path, text };
}

const validAuditText = `# Auftakt Strict Goal Gap Audit

## Strict Final Goal

## Scoped Completion Baseline

## Classification Model

Satisfied
Scoped-Satisfied
Partial
Missing

## Seven Goal Matrix

rx-nostr-like reconnect and REQ optimization
NDK-like API convenience
strfry-like local-first event processing
NIP compliance
Offline incremental and kind:5
Minimal core plus plugin extensions
Single coordinator and database mediation

## Coordinator Mediation Audit

app-facing facade
package public API
plugin API
runtime internals
core primitives

## First Implementation Phase

strict coordinator audit closure

## Verification

pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt:strict-closure
`;

describe('checkStrictGoalAudit', () => {
  it('requires the strict goal gap audit artifact', () => {
    const result = checkStrictGoalAudit([]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(`${STRICT_GOAL_AUDIT_PATH} is missing`);
  });

  it('requires all seven strict goal areas', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        validAuditText.replace('NDK-like API convenience', 'NDK API row removed')
      )
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} is missing required strict goal area: NDK-like API convenience`
    );
  });

  it('rejects ambiguous strict final completion claims', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        `${validAuditText}\nStrict final completion is Satisfied for all goals.\n`
      )
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} claims strict final completion without preserving scoped-vs-strict distinction`
    );
  });

  it('passes a complete strict goal gap audit artifact', () => {
    const result = checkStrictGoalAudit([file(STRICT_GOAL_AUDIT_PATH, validAuditText)]);

    expect(result).toEqual({ ok: true, errors: [] });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the checker does not exist**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: FAIL with an import resolution error for `./check-auftakt-strict-goal-audit.ts`.

- [ ] **Step 3: Implement the checker skeleton**

Create `scripts/check-auftakt-strict-goal-audit.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface StrictGoalAuditFile {
  readonly path: string;
  readonly text: string;
}

export interface StrictGoalAuditResult {
  readonly ok: boolean;
  readonly errors: string[];
}

export const STRICT_GOAL_AUDIT_PATH = 'docs/auftakt/2026-04-26-strict-goal-gap-audit.md';

const REQUIRED_AUDIT_SECTIONS = [
  '## Strict Final Goal',
  '## Scoped Completion Baseline',
  '## Classification Model',
  '## Seven Goal Matrix',
  '## Coordinator Mediation Audit',
  '## First Implementation Phase',
  '## Verification'
];

const REQUIRED_CLASSIFICATIONS = ['Satisfied', 'Scoped-Satisfied', 'Partial', 'Missing'];

const REQUIRED_STRICT_GOAL_AREAS = [
  'rx-nostr-like reconnect and REQ optimization',
  'NDK-like API convenience',
  'strfry-like local-first event processing',
  'NIP compliance',
  'Offline incremental and kind:5',
  'Minimal core plus plugin extensions',
  'Single coordinator and database mediation'
];

const REQUIRED_MEDIATION_LAYERS = [
  'app-facing facade',
  'package public API',
  'plugin API',
  'runtime internals',
  'core primitives'
];

const REQUIRED_FIRST_PHASE_NAME = 'strict coordinator audit closure';

const AMBIGUOUS_STRICT_COMPLETION_PATTERNS = [
  /strict final completion is satisfied/i,
  /strict final target is satisfied/i,
  /all strict final goals are satisfied/i
];

function addUnique(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

function requireTextIncludes(
  errors: string[],
  path: string,
  text: string,
  required: readonly string[],
  description: string
): void {
  for (const entry of required) {
    if (!text.includes(entry)) {
      addUnique(errors, `${path} is missing required ${description}: ${entry}`);
    }
  }
}

export function checkStrictGoalAudit(files: readonly StrictGoalAuditFile[]): StrictGoalAuditResult {
  const errors: string[] = [];
  const strictAudit = files.find((file) => file.path === STRICT_GOAL_AUDIT_PATH);

  if (!strictAudit) {
    errors.push(`${STRICT_GOAL_AUDIT_PATH} is missing`);
    return { ok: false, errors };
  }

  requireTextIncludes(
    errors,
    strictAudit.path,
    strictAudit.text,
    REQUIRED_AUDIT_SECTIONS,
    'section'
  );
  requireTextIncludes(
    errors,
    strictAudit.path,
    strictAudit.text,
    REQUIRED_CLASSIFICATIONS,
    'classification'
  );
  requireTextIncludes(
    errors,
    strictAudit.path,
    strictAudit.text,
    REQUIRED_STRICT_GOAL_AREAS,
    'strict goal area'
  );
  requireTextIncludes(
    errors,
    strictAudit.path,
    strictAudit.text,
    REQUIRED_MEDIATION_LAYERS,
    'coordinator mediation layer'
  );

  if (!strictAudit.text.includes(REQUIRED_FIRST_PHASE_NAME)) {
    errors.push(`${strictAudit.path} is missing first implementation phase name`);
  }

  if (AMBIGUOUS_STRICT_COMPLETION_PATTERNS.some((pattern) => pattern.test(strictAudit.text))) {
    errors.push(
      `${strictAudit.path} claims strict final completion without preserving scoped-vs-strict distinction`
    );
  }

  return { ok: errors.length === 0, errors };
}

function collectFiles(root = process.cwd()): StrictGoalAuditFile[] {
  const paths = [STRICT_GOAL_AUDIT_PATH, 'docs/auftakt/spec.md'].filter((path) =>
    existsSync(join(root, path))
  );
  return paths.map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkStrictGoalAudit(collectFiles());
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts
git commit -m "test(auftakt): add strict goal audit checker"
```

Expected: commit succeeds.

## Task 2: Write The Strict Goal Gap Audit Artifact

**Files:**

- Create: `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`

- [ ] **Step 1: Run the checker and verify the artifact is missing**

Run:

```bash
node --experimental-strip-types scripts/check-auftakt-strict-goal-audit.ts
```

Expected: FAIL with `docs/auftakt/2026-04-26-strict-goal-gap-audit.md is missing`.

- [ ] **Step 2: Create the audit artifact**

Create `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`:

```md
# Auftakt Strict Goal Gap Audit

Date: 2026-04-26

## Strict Final Goal

The strict final goal is stronger than current scoped completion. In the strict
target, all app-facing and extension-facing APIs are mediated by a coordinator
connected to a strfry-like local database. Relays are remote verification,
repair, fill, and enrichment inputs. Relay packets are not public read,
subscription, plugin, or app-facing results until they pass validation,
quarantine-on-failure, materialization, and visibility filtering.

## Scoped Completion Baseline

The current scoped Auftakt baseline remains valid. These gates passed during the
design review:

- `pnpm run check:auftakt-migration -- --proof`
- `pnpm run check:auftakt:nips`
- `pnpm run check:auftakt:strict-closure`
- `pnpm run test:auftakt:core`
- `pnpm run test:auftakt:storage`
- `pnpm run test:auftakt:resonote`

Passing scoped proof means the current facade and package boundaries satisfy the
canonical scoped spec. It does not mean every strict final goal is fully
implemented.

## Classification Model

- `Satisfied`: strict final target is implemented, tested, and guarded.
- `Scoped-Satisfied`: scoped target is implemented and proven; strict target is
  broader.
- `Partial`: important pieces exist, but implementation, proof, or wording is
  incomplete.
- `Missing`: meaningful implementation or proof is absent.

## Seven Goal Matrix

| Area                                         | Verdict            | Evidence                                                                                                                                                                         | Strict Gap                                                                                                                                                                                                                                       | First Implementation Phase Decision                                                                 |
| -------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| rx-nostr-like reconnect and REQ optimization | `Scoped-Satisfied` | `packages/core/src/relay-session.ts`, `packages/core/src/request-planning.ts`, and core contract tests prove reconnect replay, request coalescing, shard planning, and queueing. | Ordinary reads are not uniformly defined as negentropy-first repair with REQ fallback, and adaptive reconnect/read policy is not a strict target proof.                                                                                          | Audit and classify transport policy gaps; keep transport behavior unchanged in this phase.          |
| NDK-like API convenience                     | `Scoped-Satisfied` | `src/shared/auftakt/resonote.ts`, `ResonoteCoordinator`, entity handles, relay hints, and package public API tests provide high-level access.                                    | The API is ergonomic for current Resonote flows, not a broad NDK-style model system. Some convenience APIs are allowlisted package-owned helpers rather than plugin registry calls.                                                              | Inventory public, facade, and plugin surfaces with explicit allowed reasons.                        |
| strfry-like local-first event processing     | `Partial`          | `EventCoordinator`, Dexie materialization, quarantine, hot index, deletion handling, replaceable heads, relay hints, and strict closure guards exist.                            | The browser store is not a full local relay database abstraction, and raw session usage remains inside coordinator-owned runtime helpers. Allowed internal transport zones need explicit audit classification.                                   | Add a coordinator mediation audit that separates public leaks from internal transport dependencies. |
| NIP compliance                               | `Scoped-Satisfied` | `scripts/check-auftakt-nips.ts`, `docs/auftakt/nips-inventory.json`, and `docs/auftakt/nip-matrix.json` validate scoped matrix coverage.                                         | Complete compliance must mean matrix-managed classification, not unlimited implementation of every possible NIP behavior. `unsupported-by-design` and `out-of-scope` claims must stay explicit.                                                  | Guard against ambiguous strict-completion wording.                                                  |
| Offline incremental and kind:5               | `Partial`          | Dexie pending publishes, deletion event storage, deletion index, target suppression, late target suppression, and repair tests exist.                                            | Sync cursor and restart-safe incremental repair semantics are not first-class strict proof for all read flows. Publish settlement is durable but not a full coordinator settlement vocabulary.                                                   | Record incremental repair and publish settlement as prioritized follow-up candidates.               |
| Minimal core plus plugin extensions          | `Scoped-Satisfied` | Core owns vocabulary, crypto, request planning, relay session, settlement, reconcile, and validation. Resonote runtime registers built-in read models and flows.                 | Core exposes protocol primitives for package composition. Strict mediation must state that production app and plugin APIs cannot use core relay IO primitives directly.                                                                          | Distinguish core primitive exports from app-facing runtime APIs in the audit gate.                  |
| Single coordinator and database mediation    | `Scoped-Satisfied` | App facade and package root avoid raw request/session exports. Runtime paths materialize relay candidates before public results.                                                 | The phrase "all core/extension APIs" can be read as banning necessary internal transport helpers. The strict target is public/app/plugin mediation, while coordinator-owned internals may use transport primitives when raw results cannot leak. | Add guard coverage for allowed internal transport zones and forbidden public leaks.                 |

## Coordinator Mediation Audit

| Layer              | Allowed                                                                                       | Forbidden                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| app-facing facade  | high-level reads, subscriptions, publish, relay status, relay capabilities, feature helpers   | raw relay session, raw request objects, adapter storage handles                            |
| package public API | coordinator factory, coordinator types, plugin registration, data-only projection metadata    | raw negentropy, raw relay request helpers, direct storage handles                          |
| plugin API         | `registerProjection`, `registerReadModel`, `registerFlow`                                     | `getRxNostr`, `getEventsDB`, `openEventsDb`, materializer queue, raw transport packet APIs |
| runtime internals  | coordinator-owned transport adapters, registry adapters, repair adapters, materializers       | returning raw relay candidates to public results                                           |
| core primitives    | protocol primitives for package composition, crypto, validation, relay session implementation | production app relay IO through core primitives                                            |

## First Implementation Phase

The first implementation phase is `strict coordinator audit closure`.

It includes:

- strict goal gap audit artifact creation
- scoped-vs-strict wording cleanup
- raw transport usage classification by layer
- package public surface allowlist proof
- plugin API raw-handle proof
- prioritized follow-up candidates with gates

It excludes:

- NIP-wide implementation expansion
- runtime transport redesign
- full NDK-compatible model expansion
- persistence migration to Worker, SQLite, WASM, or a real relay process
- UI behavior changes

## Follow-Up Candidates

1. Capability-aware ordinary read verification.
2. Coordinator-owned publish settlement.
3. Sync cursor incremental repair.
4. Broader outbox routing.
5. NDK-like model expansion.
6. Storage hot-path hardening.

## Verification

- `pnpm run check:auftakt:strict-goal-audit`
- `pnpm run check:auftakt-migration -- --proof`
- `pnpm run check:auftakt:nips`
- `pnpm run check:auftakt:strict-closure`
- `pnpm run test:auftakt:core`
- `pnpm run test:auftakt:storage`
- `pnpm run test:auftakt:resonote`
```

- [ ] **Step 3: Run the checker and verify it passes**

Run:

```bash
node --experimental-strip-types scripts/check-auftakt-strict-goal-audit.ts
```

Expected: PASS with no output.

- [ ] **Step 4: Run Prettier on the artifact**

Run:

```bash
pnpm exec prettier --write docs/auftakt/2026-04-26-strict-goal-gap-audit.md
```

Expected: Prettier writes the file or reports it unchanged.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add docs/auftakt/2026-04-26-strict-goal-gap-audit.md
git commit -m "docs(auftakt): add strict goal gap audit"
```

Expected: commit succeeds.

## Task 3: Classify Raw Transport Usage By Layer

**Files:**

- Modify: `scripts/check-auftakt-strict-goal-audit.ts`
- Modify: `scripts/check-auftakt-strict-goal-audit.test.ts`

- [ ] **Step 1: Add failing raw transport mediation tests**

Append these tests to `scripts/check-auftakt-strict-goal-audit.test.ts` inside the existing `describe` block:

```ts
it('allows raw transport tokens only in approved internal transport zones', () => {
  const result = checkStrictGoalAudit([
    file(STRICT_GOAL_AUDIT_PATH, validAuditText),
    file('packages/resonote/src/runtime.ts', 'const rxNostr = await runtime.getRxNostr();'),
    file('src/shared/nostr/client.ts', 'createRxNostrSession({ defaultRelays: [] });'),
    file('packages/core/src/relay-session.ts', 'export function createRxNostrSession() {}')
  ]);

  expect(result).toEqual({ ok: true, errors: [] });
});

it('flags raw transport usage in app production code', () => {
  const result = checkStrictGoalAudit([
    file(STRICT_GOAL_AUDIT_PATH, validAuditText),
    file('src/features/comments/application/leaky-transport.ts', 'await getRxNostr();')
  ]);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    'src/features/comments/application/leaky-transport.ts uses raw transport token getRxNostr outside an approved coordinator transport zone'
  );
});

it('flags raw storage and transport handles in production plugins', () => {
  const result = checkStrictGoalAudit([
    file(STRICT_GOAL_AUDIT_PATH, validAuditText),
    file(
      'packages/resonote/src/plugins/leaky-plugin.ts',
      'api.registerFlow("leaky", { getEventsDB, createRxBackwardReq });'
    )
  ]);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    'packages/resonote/src/plugins/leaky-plugin.ts exposes raw plugin handle getEventsDB'
  );
  expect(result.errors).toContain(
    'packages/resonote/src/plugins/leaky-plugin.ts exposes raw plugin handle createRxBackwardReq'
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: FAIL because the checker does not yet scan raw transport tokens.

- [ ] **Step 3: Add raw transport scanning to the checker**

Add these constants below `AMBIGUOUS_STRICT_COMPLETION_PATTERNS` in `scripts/check-auftakt-strict-goal-audit.ts`:

```ts
const RAW_TRANSPORT_TOKENS = [
  'getRxNostr',
  'createRxBackwardReq',
  'createRxForwardReq',
  'createRxNostrSession',
  'RxNostr'
];

const RAW_PLUGIN_HANDLE_TOKENS = [
  'getRxNostr',
  'getEventsDB',
  'openEventsDb',
  'createRxBackwardReq',
  'createRxForwardReq',
  'materializerQueue',
  'DexieEventStore'
];

const APPROVED_RAW_TRANSPORT_FILES = new Set([
  'packages/core/src/index.ts',
  'packages/core/src/request-planning.ts',
  'packages/core/src/relay-session.ts',
  'packages/resonote/src/runtime.ts',
  'src/shared/auftakt/cached-read.svelte.ts',
  'src/shared/auftakt/resonote.ts',
  'src/shared/nostr/client.ts'
]);
```

Add these helper functions above `checkStrictGoalAudit()`:

```ts
function isProductionSource(path: string): boolean {
  return (
    (path.startsWith('src/') || path.startsWith('packages/')) &&
    /\.(ts|svelte)$/.test(path) &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.contract.test.ts')
  );
}

function isProductionPluginSource(path: string): boolean {
  return (
    path.startsWith('packages/resonote/src/plugins/') &&
    path.endsWith('.ts') &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.contract.test.ts')
  );
}

function tokenPattern(token: string): RegExp {
  return new RegExp(`\\b${token}\\b`, 'g');
}

function checkRawTransportMediation(errors: string[], files: readonly StrictGoalAuditFile[]): void {
  for (const file of files) {
    if (!isProductionSource(file.path)) continue;

    if (!APPROVED_RAW_TRANSPORT_FILES.has(file.path)) {
      for (const token of RAW_TRANSPORT_TOKENS) {
        if (tokenPattern(token).test(file.text)) {
          errors.push(
            `${file.path} uses raw transport token ${token} outside an approved coordinator transport zone`
          );
        }
      }
    }

    if (isProductionPluginSource(file.path)) {
      for (const token of RAW_PLUGIN_HANDLE_TOKENS) {
        if (tokenPattern(token).test(file.text)) {
          errors.push(`${file.path} exposes raw plugin handle ${token}`);
        }
      }
    }
  }
}
```

Call the helper before the final return in `checkStrictGoalAudit()`:

```ts
checkRawTransportMediation(errors, files);

return { ok: errors.length === 0, errors };
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Run the checker against the real repository state**

Run:

```bash
node --experimental-strip-types scripts/check-auftakt-strict-goal-audit.ts
```

Expected: PASS with no output.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts
git commit -m "test(auftakt): guard strict coordinator mediation"
```

Expected: commit succeeds.

## Task 4: Guard Scoped-Vs-Strict Wording In Canonical Docs

**Files:**

- Modify: `scripts/check-auftakt-strict-goal-audit.ts`
- Modify: `scripts/check-auftakt-strict-goal-audit.test.ts`
- Modify: `docs/auftakt/spec.md`

- [ ] **Step 1: Add failing spec wording tests**

Append these tests to `scripts/check-auftakt-strict-goal-audit.test.ts` inside the existing `describe` block:

```ts
it('requires spec verdict wording to point strict claims to the strict gap audit', () => {
  const result = checkStrictGoalAudit([
    file(STRICT_GOAL_AUDIT_PATH, validAuditText),
    file(
      'docs/auftakt/spec.md',
      '### 14.3 監査判定マトリクス\n| strict single coordinator model | Satisfied | complete |'
    )
  ]);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    'docs/auftakt/spec.md must reference docs/auftakt/2026-04-26-strict-goal-gap-audit.md when presenting Auftakt goal verdicts'
  );
});

it('accepts spec wording that links scoped completion to strict gap status', () => {
  const result = checkStrictGoalAudit([
    file(STRICT_GOAL_AUDIT_PATH, validAuditText),
    file(
      'docs/auftakt/spec.md',
      '### 14.3 監査判定マトリクス\nStrict final gap details live in docs/auftakt/2026-04-26-strict-goal-gap-audit.md.\nScoped-Satisfied'
    )
  ]);

  expect(result).toEqual({ ok: true, errors: [] });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: FAIL because `docs/auftakt/spec.md` is not inspected by the checker.

- [ ] **Step 3: Add spec wording validation to the checker**

Add this constant below `STRICT_GOAL_AUDIT_PATH`:

```ts
const CANONICAL_SPEC_PATH = 'docs/auftakt/spec.md';
```

Add this helper above `checkStrictGoalAudit()`:

```ts
function checkCanonicalSpecWording(errors: string[], files: readonly StrictGoalAuditFile[]): void {
  const spec = files.find((file) => file.path === CANONICAL_SPEC_PATH);
  if (!spec) return;
  if (!spec.text.includes('### 14.3')) return;
  if (spec.text.includes(STRICT_GOAL_AUDIT_PATH)) return;

  errors.push(
    `${CANONICAL_SPEC_PATH} must reference ${STRICT_GOAL_AUDIT_PATH} when presenting Auftakt goal verdicts`
  );
}
```

Call the helper before `checkRawTransportMediation()`:

```ts
checkCanonicalSpecWording(errors, files);
checkRawTransportMediation(errors, files);
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Run the real checker and verify it fails on current spec wording**

Run:

```bash
node --experimental-strip-types scripts/check-auftakt-strict-goal-audit.ts
```

Expected: FAIL with `docs/auftakt/spec.md must reference docs/auftakt/2026-04-26-strict-goal-gap-audit.md when presenting Auftakt goal verdicts`.

- [ ] **Step 6: Update the spec verdict section**

In `docs/auftakt/spec.md`, update §14.3 so it introduces scoped verdicts and references the strict audit artifact. Replace the paragraph immediately under `### 14.3 監査判定マトリクス (Audit Verdict Matrix)` with:

```md
Auftakt の 7 つの主要目標に対する現在の達成状況を以下に定義する。この表は
現行正典の scoped completion を示す。厳格最終目標との差分、`Scoped-Satisfied`
と `Partial` の理由、および次フェーズ候補は
`docs/auftakt/2026-04-26-strict-goal-gap-audit.md` を正とする。
```

Change the verdict values in the §14.3 table to:

```md
| 目標 (Goal)                                 | 判定 (Verdict)   | 理由・理由                                                                                                                                                         |
| ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| rx-nostr級 reconnect + REQ optimization     | Scoped-Satisfied | scoped contract tests および E2E proof によって再接続性と REQ 最適化が証明済み。厳格な ordinary-read negentropy-first 化は strict gap audit で後続候補として扱う。 |
| NDK級 API convenience                       | Scoped-Satisfied | façade と高レベル API の整備、および leak guard による ergonomics 保護が証明済み。広範な NDK-style model system は strict gap audit で後続候補として扱う。         |
| strfry的 local-first seamless processing    | Partial          | `ReadSettlement` / reconcile / tombstone の一貫した動作は証明済み。完全な local relay database abstraction と内部 raw transport 分類は strict gap audit で扱う。   |
| scoped NIP compliance                       | Scoped-Satisfied | matrix + owner は定義済み。NIP-11 は runtime-only の限定的サポートであり、無制限の全 NIP 実装ではなく matrix-managed compliance として扱う。                       |
| offline incremental + kind:5                | Partial          | kind:5/tombstone および pending publish proof は存在する。sync cursor と restart-safe incremental repair の全面 proof は strict gap audit で後続候補として扱う。   |
| minimal core + plugin-based higher features | Scoped-Satisfied | public API 基盤の上で、高次機能の plugin 移行と隔離が証明済み。core primitive と app-facing runtime API の層分離は strict goal audit gate で維持する。             |
| strict single coordinator model             | Scoped-Satisfied | packages/resonote への集約と全 API の inventory 監査が完了している。内部 coordinator transport helper の許容範囲は strict goal audit gate で分類する。             |
```

- [ ] **Step 7: Run the real checker and verify it passes**

Run:

```bash
node --experimental-strip-types scripts/check-auftakt-strict-goal-audit.ts
```

Expected: PASS with no output.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts docs/auftakt/spec.md
git commit -m "docs(auftakt): separate scoped and strict goal status"
```

Expected: commit succeeds.

## Task 5: Lock Package Public Surface As An Explicit Allowlist

**Files:**

- Modify: `packages/resonote/src/public-api.contract.test.ts`

- [ ] **Step 1: Add the failing public value allowlist test**

Append this test inside `describe('@auftakt/resonote public api contract', () => { ... })`:

```ts
it('keeps package value exports on an explicit coordinator-owned allowlist', async () => {
  const mod = await import('@auftakt/resonote');
  const exportNames = Object.keys(mod).sort();

  expect(exportNames).toEqual(
    [
      'RESONOTE_COORDINATOR_PLUGIN_API_VERSION',
      'RESONOTE_PLAY_POSITION_SORT',
      'buildCommentContentFilters',
      'cachedFetchById',
      'castSigned',
      'createResonoteCoordinator',
      'fetchCustomEmojiCategories',
      'fetchCustomEmojiSources',
      'fetchFollowListSnapshot',
      'fetchLatestEvent',
      'fetchNostrEventById',
      'fetchNotificationTargetPreview',
      'fetchProfileCommentEvents',
      'fetchProfileMetadataEvents',
      'fetchProfileMetadataSources',
      'fetchRelayListEvents',
      'fetchRelayListSources',
      'fetchWot',
      'getRelayConnectionState',
      'getResonotePlayPositionMs',
      'invalidateFetchByIdCache',
      'loadCommentSubscriptionDeps',
      'observeRelayCapabilities',
      'observeRelayConnectionStates',
      'observeRelayStatuses',
      'publishSignedEvents',
      'publishSignedEventsWithOfflineFallback',
      'publishSignedEventWithOfflineFallback',
      'registerPlugin',
      'resonoteTimelineProjection',
      'retryPendingPublishes',
      'retryQueuedSignedPublishes',
      'searchBookmarkDTagEvent',
      'searchEpisodeBookmarkByGuid',
      'setDefaultRelays',
      'snapshotRelayCapabilities',
      'snapshotRelayStatuses',
      'sortResonoteTimelineByPlayPosition',
      'startCommentDeletionReconcile',
      'startCommentSubscription',
      'startMergedCommentSubscription',
      'subscribeNotificationStreams',
      'useCachedLatest'
    ].sort()
  );
});
```

- [ ] **Step 2: Run the package public API contract**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-api.contract.test.ts
```

Expected: PASS if the current package root surface matches the intended allowlist. If it fails, inspect the diff and either remove an unintended export or add the export to the allowlist only when it is coordinator-owned and does not expose raw transport or storage handles.

- [ ] **Step 3: Commit Task 5**

Run:

```bash
git add packages/resonote/src/public-api.contract.test.ts
git commit -m "test(auftakt): lock coordinator package value surface"
```

Expected: commit succeeds.

## Task 6: Strengthen Plugin API Raw-Handle Proof

**Files:**

- Modify: `packages/resonote/src/plugin-isolation.contract.test.ts`

- [ ] **Step 1: Add a stronger plugin API shape assertion**

Append this test inside `describe('@auftakt/resonote plugin isolation', () => { ... })`:

```ts
it('provides plugins only registration functions and no coordinator handles', async () => {
  const coordinator = createTestCoordinator();
  const forbiddenKeys = [
    'getRxNostr',
    'createRxBackwardReq',
    'createRxForwardReq',
    'getEventsDB',
    'openEventsDb',
    'materializerQueue',
    'relayGateway',
    'getEvent',
    'getUser',
    'getAddressable',
    'getRelaySet',
    'getRelayHints'
  ];

  await coordinator.registerPlugin({
    name: 'assert-plugin-api-shape',
    apiVersion: 'v1',
    setup(api) {
      expect(Object.keys(api).sort()).toEqual([
        'apiVersion',
        'registerFlow',
        'registerProjection',
        'registerReadModel'
      ]);
      for (const key of forbiddenKeys) {
        expect(api).not.toHaveProperty(key);
      }
    }
  });
});
```

- [ ] **Step 2: Run the plugin isolation contract**

Run:

```bash
pnpm exec vitest run packages/resonote/src/plugin-isolation.contract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit Task 6**

Run:

```bash
git add packages/resonote/src/plugin-isolation.contract.test.ts
git commit -m "test(auftakt): strengthen plugin mediation proof"
```

Expected: commit succeeds.

## Task 7: Add The New Gate To Package Scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add the package script**

In `package.json`, add this script next to the other Auftakt checks:

```json
"check:auftakt:strict-goal-audit": "node --experimental-strip-types scripts/check-auftakt-strict-goal-audit.ts"
```

- [ ] **Step 2: Include the gate in `check:auftakt-complete`**

Change `check:auftakt-complete` so it includes the new gate after `check:auftakt:strict-closure`:

```json
"check:auftakt-complete": "pnpm run check:auftakt-migration -- --proof && pnpm run check:auftakt-migration -- --report consumers && pnpm run test:packages && pnpm run check:auftakt-semantic && pnpm run check:auftakt:strict-closure && pnpm run check:auftakt:strict-goal-audit && pnpm run check && pnpm run build"
```

- [ ] **Step 3: Run the new package script**

Run:

```bash
pnpm run check:auftakt:strict-goal-audit
```

Expected: PASS with no checker output beyond the pnpm script header.

- [ ] **Step 4: Run JSON formatting**

Run:

```bash
pnpm exec prettier --write package.json
```

Expected: Prettier writes the file or reports it unchanged.

- [ ] **Step 5: Commit Task 7**

Run:

```bash
git add package.json
git commit -m "chore(auftakt): add strict goal audit gate"
```

Expected: commit succeeds.

## Task 8: Final Verification

**Files:**

- Verify: all files changed in Tasks 1-7

- [ ] **Step 1: Run focused unit checks**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts scripts/check-auftakt-strict-closure.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused Auftakt gates**

Run:

```bash
pnpm run check:auftakt:strict-goal-audit
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt:nips
pnpm run test:auftakt:resonote
```

Expected: every command exits 0.

- [ ] **Step 3: Run package tests**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 4: Commit verification-only formatting changes if hooks modified files**

Run:

```bash
git status --short
```

Expected: no unexpected modified files. If Prettier or hooks changed tracked files from this plan, inspect them with `git diff`, then commit them with:

```bash
git add scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts docs/auftakt/2026-04-26-strict-goal-gap-audit.md docs/auftakt/spec.md packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts package.json
git commit -m "chore(auftakt): finish strict goal audit closure"
```

Expected: commit succeeds only when there are planned formatting or hook changes.

- [ ] **Step 5: Record final status**

In the final implementation response, report:

- new audit artifact path
- new checker script and package script
- tests and gates run
- any command that could not be run
