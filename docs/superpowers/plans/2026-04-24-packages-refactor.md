# Packages Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse Auftakt workspace packages from five to three by moving timeline and relay runtime logic into `@auftakt/core`, while keeping `@auftakt/resonote` app-specific and `@auftakt/adapter-indexeddb` as the storage adapter.

**Architecture:** `@auftakt/core` becomes the shared runtime foundation for vocabulary, request planning, settlement, reconcile, relay session, relay observation, crypto, and NIP helpers. `@auftakt/resonote` depends on core for generic primitives and keeps coordinator/plugin/feature-facing behavior. `@auftakt/adapter-indexeddb` remains the only adapter package and depends on core only.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, SvelteKit, Hono, RxJS, nostr-typedef, IndexedDB via idb.

---

## File Structure

Create focused core modules:

- `packages/core/src/vocabulary.ts`: current shared types, branded identifiers, relay observation vocabulary, projection definitions, crypto-facing type exports.
- `packages/core/src/crypto.ts`: Nostr crypto helpers currently exported from core.
- `packages/core/src/request-planning.ts`: request descriptor canonicalization, request keys, request execution plans, optimizer shards, repair request scopes.
- `packages/core/src/settlement.ts`: `reduceReadSettlement` and read settlement reducer types.
- `packages/core/src/reconcile.ts`: reconcile state mapping and reconcile emission helpers.
- `packages/core/src/relay-observation.ts`: relay observation normalization and session observation helpers.
- `packages/core/src/relay-request.ts`: mutable relay request constructors and request interfaces.
- `packages/core/src/relay-session.ts`: WebSocket relay session implementation, replay registry, publish OK handling, relay status, read/write relay selection, `createRxNostrSession`.
- `packages/core/src/negentropy.ts`: negentropy transport request/result helpers owned by relay session.
- `packages/core/src/index.ts`: package public surface for all core primitives needed by app, packages, and tests.

Modify package metadata:

- `packages/core/package.json`: add runtime dependencies currently needed by timeline and relay, especially `rxjs`.
- `packages/resonote/package.json`: remove `@auftakt/timeline`; keep `@auftakt/core`.
- `packages/adapter-indexeddb/package.json`: replace `@auftakt/timeline` with `@auftakt/core`.
- root `package.json`: remove `@auftakt/timeline` and `@auftakt/adapter-relay`; add responsibility-based test scripts.
- `pnpm-workspace.yaml`: no change needed if it already includes `packages/*`; deleted package folders naturally disappear.

Remove package folders after migration:

- `packages/timeline`
- `packages/adapter-relay`

Update source imports:

- `packages/resonote/src/runtime.ts`
- `packages/resonote/src/*.contract.test.ts`
- `packages/adapter-indexeddb/src/index.ts`
- `packages/adapter-indexeddb/src/*.contract.test.ts`
- `src/shared/auftakt/resonote.ts`
- `src/shared/nostr/client.ts`
- `src/shared/nostr/query.ts`
- `src/shared/nostr/relays-config.ts`
- `src/shared/nostr/cached-query.svelte.ts`
- `src/features/comments/domain/deletion-rules.ts`
- `src/features/comments/ui/comment-view-model.svelte.ts`
- `src/features/profiles/application/profile-queries.ts`
- `src/shared/nostr/pending-publishes.ts`

Update tests and mocks:

- `src/shared/nostr/*.test.ts`
- `src/shared/browser/*.test.ts`
- feature tests that mock `@auftakt/adapter-relay`
- package contract tests moved from deleted packages

Update docs and proof scripts:

- `docs/auftakt/spec.md`
- `docs/auftakt/status-verification.md`
- `packages/AGENTS.md`
- `packages/core/AGENTS.md`
- `packages/resonote/AGENTS.md`
- `packages/adapter-indexeddb/AGENTS.md`
- `scripts/check-auftakt-migration.mjs`

---

### Task 1: Establish Core Module Shells

**Files:**

- Create: `packages/core/src/vocabulary.ts`
- Create: `packages/core/src/crypto.ts`
- Create: `packages/core/src/request-planning.ts`
- Create: `packages/core/src/settlement.ts`
- Create: `packages/core/src/reconcile.ts`
- Create: `packages/core/src/relay-observation.ts`
- Create: `packages/core/src/relay-request.ts`
- Create: `packages/core/src/relay-session.ts`
- Create: `packages/core/src/negentropy.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/public-api.contract.test.ts`

- [ ] **Step 1: Snapshot current core exports**

Run:

```bash
pnpm exec vitest run packages/core/src/public-api.contract.test.ts
```

Expected: PASS. If it fails before edits, stop and inspect the existing failure before moving code.

- [ ] **Step 2: Move existing core implementation into focused modules**

Use `git mv` or editor moves so the current contents of `packages/core/src/index.ts` are split by responsibility:

```ts
// packages/core/src/index.ts
export * from './vocabulary.js';
export * from './crypto.js';
export * from './request-planning.js';
export * from './settlement.js';
export * from './reconcile.js';
export * from './relay-observation.js';
export * from './relay-request.js';
export * from './relay-session.js';
export * from './negentropy.js';
```

Keep the exported names identical after the move.

- [ ] **Step 3: Run core public API contract**

Run:

```bash
pnpm exec vitest run packages/core/src/public-api.contract.test.ts
```

Expected: PASS. This confirms the shell split did not change the public surface.

- [ ] **Step 4: Run TypeScript check for package imports**

Run:

```bash
pnpm run test:packages -- packages/core/src/public-api.contract.test.ts
```

Expected: PASS. If this command does not accept the trailing path, use the exact Vitest command from Step 3.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/core/src
git commit -m "refactor(auftakt): split core modules"
```

Expected: commit succeeds and only core module split files are included.

---

### Task 2: Move Timeline Logic Into Core

**Files:**

- Modify: `packages/core/src/request-planning.ts`
- Modify: `packages/core/src/settlement.ts`
- Modify: `packages/core/src/reconcile.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/request-key.contract.test.ts`
- Modify: `packages/core/src/read-settlement.contract.test.ts`
- Modify: `packages/core/src/reconcile.contract.test.ts`
- Create: `packages/core/src/request-planning.contract.test.ts`
- Create: `packages/core/src/negentropy-repair.contract.test.ts`
- Source: `packages/timeline/src/index.ts`
- Source: `packages/timeline/src/request-optimizer.contract.test.ts`
- Source: `packages/timeline/src/negentropy-repair.contract.test.ts`

- [ ] **Step 1: Move timeline implementation**

Move the request planning, settlement, reconcile, stream orchestration types, and helper functions from `packages/timeline/src/index.ts` into the core modules:

```ts
// packages/core/src/request-planning.ts
export const REPAIR_REQUEST_COALESCING_SCOPE = 'timeline:repair';
export function createRuntimeRequestKey(options: RuntimeRequestDescriptorOptions): RequestKey {
  // move the existing implementation from packages/timeline/src/index.ts without behavior changes
}
export function buildRequestExecutionPlan(
  options: RequestExecutionPlanOptions
): OptimizedLogicalRequestPlan {
  // move the existing implementation from packages/timeline/src/index.ts without behavior changes
}
```

```ts
// packages/core/src/settlement.ts
export function reduceReadSettlement(input: ReadSettlementReducerInput): ReadSettlement {
  // move the existing implementation from packages/timeline/src/index.ts without behavior changes
}
```

```ts
// packages/core/src/reconcile.ts
export function reconcileReplayRepairSubjects(
  subjectIds: readonly string[],
  reason: 'repaired-replay' | 'restored-replay' = 'repaired-replay'
): ReconcileEmission[] {
  // move the existing implementation from packages/timeline/src/index.ts without behavior changes
}
```

- [ ] **Step 2: Move timeline contract tests into core**

Move tests as follows:

```bash
git mv packages/timeline/src/request-optimizer.contract.test.ts packages/core/src/request-planning.contract.test.ts
git mv packages/timeline/src/negentropy-repair.contract.test.ts packages/core/src/negentropy-repair.contract.test.ts
```

Update imports in the moved tests:

```ts
import {
  buildRequestExecutionPlan,
  createNegentropyRepairRequestKey,
  createRuntimeRequestKey,
  REPAIR_REQUEST_COALESCING_SCOPE
} from '@auftakt/core';
```

- [ ] **Step 3: Update existing core tests to import core only**

Replace imports like:

```ts
import { reduceReadSettlement } from '@auftakt/timeline';
```

with:

```ts
import { reduceReadSettlement } from '@auftakt/core';
```

Apply this to `request-key.contract.test.ts`, `read-settlement.contract.test.ts`, and `reconcile.contract.test.ts`.

- [ ] **Step 4: Run moved timeline contracts through core**

Run:

```bash
pnpm exec vitest run packages/core/src/request-key.contract.test.ts packages/core/src/read-settlement.contract.test.ts packages/core/src/reconcile.contract.test.ts packages/core/src/request-planning.contract.test.ts packages/core/src/negentropy-repair.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/core/src packages/timeline/src
git commit -m "refactor(auftakt): move timeline logic into core"
```

Expected: commit succeeds with timeline source tests moved into core.

---

### Task 3: Cut Over Timeline Consumers

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/relay-repair.contract.test.ts`
- Modify: `packages/resonote/src/subscription-registry.contract.test.ts`
- Modify: `packages/adapter-indexeddb/src/index.ts`
- Modify: `packages/adapter-indexeddb/src/reconcile.contract.test.ts`
- Modify: `src/features/comments/domain/deletion-rules.ts`
- Modify: `src/features/comments/ui/comment-view-model.svelte.ts`
- Modify: `src/features/profiles/application/profile-queries.ts`
- Modify: `src/shared/nostr/pending-publishes.ts`
- Modify: `src/shared/nostr/query.ts`
- Modify: `src/shared/nostr/relays-config.ts`
- Modify: package metadata files that depend on `@auftakt/timeline`

- [ ] **Step 1: Replace `@auftakt/timeline` imports in packages**

For each package file, replace:

```ts
import {
  createRuntimeRequestKey,
  reduceReadSettlement,
  reconcileReplayRepairSubjects
} from '@auftakt/timeline';
```

with:

```ts
import {
  createRuntimeRequestKey,
  reduceReadSettlement,
  reconcileReplayRepairSubjects
} from '@auftakt/core';
```

Preserve type-only imports as type-only imports when possible.

- [ ] **Step 2: Replace `@auftakt/timeline` imports in app source**

Run:

```bash
rg "@auftakt/timeline" src packages --glob '!packages/timeline/**'
```

Expected before edits: every active consumer is listed.

Edit each listed file so it imports the same names from `@auftakt/core`.

- [ ] **Step 3: Update package dependencies**

Edit metadata:

```json
// packages/resonote/package.json
"dependencies": {
  "@auftakt/core": "workspace:*"
}
```

```json
// packages/adapter-indexeddb/package.json
"dependencies": {
  "@auftakt/core": "workspace:*",
  "idb": "^8.0.3",
  "nostr-typedef": "^0.13.0"
}
```

- [ ] **Step 4: Run timeline consumer tests**

Run:

```bash
pnpm exec vitest run packages/core/src/request-planning.contract.test.ts packages/core/src/negentropy-repair.contract.test.ts packages/resonote/src/subscription-registry.contract.test.ts packages/resonote/src/relay-repair.contract.test.ts packages/adapter-indexeddb/src/reconcile.contract.test.ts src/features/comments/ui/comment-view-model.test.ts src/features/comments/application/comment-actions.test.ts src/features/profiles/application/profile-queries.test.ts src/shared/nostr/query.test.ts src/shared/nostr/relays-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify no active timeline imports remain outside the old package**

Run:

```bash
rg "@auftakt/timeline" src packages docs scripts --glob '!packages/timeline/**' --glob '!docs/superpowers/**'
```

Expected: no output.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages src package.json pnpm-lock.yaml
git commit -m "refactor(auftakt): cut over timeline consumers to core"
```

Expected: commit succeeds and no active consumer imports `@auftakt/timeline`.

---

### Task 4: Move Relay Runtime Into Core

**Files:**

- Modify: `packages/core/src/relay-request.ts`
- Modify: `packages/core/src/relay-session.ts`
- Modify: `packages/core/src/relay-observation.ts`
- Modify: `packages/core/src/negentropy.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Source: `packages/adapter-relay/src/index.ts`
- Source: `packages/adapter-relay/src/request-replay.contract.test.ts`
- Create: `packages/core/src/relay-session.contract.test.ts`
- Create: `packages/core/src/relay-observation.contract.test.ts`
- Create: `packages/core/src/negentropy-transport.contract.test.ts`

- [ ] **Step 1: Add relay runtime dependencies to core**

Edit `packages/core/package.json`:

```json
"dependencies": {
  "@noble/curves": "^1.9.7",
  "@noble/hashes": "^1.8.0",
  "@scure/base": "^2.0.0",
  "nostr-typedef": "^0.13.0",
  "rxjs": "^7.8.2"
}
```

- [ ] **Step 2: Move relay request constructors**

Move `RelayRequest`, `CreateRelayRequestOptions`, `MutableRelayRequest`, `createBackwardReq`, `createForwardReq`, `createRxBackwardReq`, and `createRxForwardReq` from `packages/adapter-relay/src/index.ts` into `packages/core/src/relay-request.ts`.

The exported constructors should remain:

```ts
export function createRxBackwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return new MutableRelayRequest('backward', options?.requestKey, options?.coalescingScope);
}

export function createRxForwardReq(options?: CreateRelayRequestOptions): RelayRequest {
  return new MutableRelayRequest('forward', options?.requestKey, options?.coalescingScope);
}
```

- [ ] **Step 3: Move relay session implementation**

Move relay session types and implementation into `packages/core/src/relay-session.ts`, importing request planning from core modules:

```ts
import {
  buildRequestExecutionPlan,
  type OptimizedLogicalRequestPlan,
  type RequestOptimizerCapabilities
} from './request-planning.js';
```

Keep these exports available from `@auftakt/core`:

```ts
export type { RxNostr, RelayStatus, EventPacket, OkPacketAgainstEvent };
export { createRelaySession, createRxNostrSession, nip07Signer, uniq, verifier };
```

- [ ] **Step 4: Split relay tests by responsibility**

Move the existing relay contract test into three files:

```bash
git mv packages/adapter-relay/src/request-replay.contract.test.ts packages/core/src/relay-session.contract.test.ts
```

Then split groups by behavior:

```ts
// packages/core/src/relay-observation.contract.test.ts
describe('@auftakt/core relay observation contract', () => {
  // move observation tests:
  // - typed runtime observation marks one relay success + one relay backoff as degraded relay
  // - aggregate session becomes degraded when all relays disconnect
  // - reconnect emits replaying -> live transition in typed observation
  // - dispose is represented as runtime-owned aggregate transition
});
```

```ts
// packages/core/src/negentropy-transport.contract.test.ts
describe('@auftakt/core negentropy transport contract', () => {
  // move negentropy transport tests:
  // - uses a dedicated negentropy subscription namespace and reports unsupported relays
  // - reports failed negentropy sync on timeout and closes the dedicated negentropy subscription
});
```

Keep the shared `FakeWebSocket`, `waitUntil`, and socket helpers local to each file or move them to `packages/core/src/relay-test-helpers.ts` if duplication becomes larger than 80 lines in more than one file.

- [ ] **Step 5: Update test imports**

In moved relay tests, replace:

```ts
import { createRxBackwardReq, createRxForwardReq, createRxNostrSession } from './index.js';
```

with:

```ts
import { createRxBackwardReq, createRxForwardReq, createRxNostrSession } from '@auftakt/core';
```

- [ ] **Step 6: Run relay core contracts**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-session.contract.test.ts packages/core/src/relay-observation.contract.test.ts packages/core/src/negentropy-transport.contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/core/src packages/core/package.json packages/adapter-relay/src
git commit -m "refactor(auftakt): move relay runtime into core"
```

Expected: commit succeeds with relay runtime available from `@auftakt/core`.

---

### Task 5: Cut Over Relay Consumers in Packages and App

**Files:**

- Modify: `src/shared/auftakt/resonote.ts`
- Modify: `src/shared/nostr/client.ts`
- Modify: `src/shared/nostr/query.ts`
- Modify: `src/shared/nostr/relays-config.ts`
- Modify: `src/shared/nostr/cached-query.svelte.ts`
- Modify: `src/shared/nostr/*.test.ts`
- Modify: `src/shared/browser/*.test.ts`
- Modify: `packages/resonote/src/*.contract.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Replace direct relay imports in app runtime bridges**

Replace:

```ts
import { createRxBackwardReq, createRxForwardReq, uniq, verifier } from '@auftakt/adapter-relay';
```

with:

```ts
import { createRxBackwardReq, createRxForwardReq, uniq, verifier } from '@auftakt/core';
```

Replace:

```ts
import { createRxNostrSession, nip07Signer, type RxNostr } from '@auftakt/adapter-relay';
```

with:

```ts
import { createRxNostrSession, nip07Signer, type RxNostr } from '@auftakt/core';
```

- [ ] **Step 2: Replace dynamic relay imports**

Replace dynamic imports:

```ts
const relay = await import('@auftakt/adapter-relay');
```

with:

```ts
const relay = await import('@auftakt/core');
```

Apply the same pattern to destructuring imports:

```ts
const { createRxBackwardReq } = await import('@auftakt/core');
```

- [ ] **Step 3: Update relay mocks**

Replace tests like:

```ts
vi.mock('@auftakt/adapter-relay', () => ({
  createRxBackwardReq: vi.fn(),
  createRxNostrSession: vi.fn()
}));
```

with:

```ts
vi.mock('@auftakt/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@auftakt/core')>();
  return {
    ...actual,
    createRxBackwardReq: vi.fn(),
    createRxNostrSession: vi.fn()
  };
});
```

Use `importOriginal` whenever the same test also needs real core exports such as `finalizeEvent`, `getPublicKey`, or `createRuntimeRequestKey`.

- [ ] **Step 4: Remove root dependency on adapter relay**

Edit root `package.json` dependencies so these entries are absent:

```json
"@auftakt/adapter-relay": "workspace:*",
"@auftakt/timeline": "workspace:*"
```

Keep:

```json
"@auftakt/core": "workspace:*",
"@auftakt/resonote": "workspace:*",
"@auftakt/adapter-indexeddb": "workspace:*"
```

- [ ] **Step 5: Run relay consumer tests**

Run:

```bash
pnpm exec vitest run src/shared/nostr/client.test.ts src/shared/nostr/client-integration.test.ts src/shared/nostr/query.test.ts src/shared/nostr/relays-config.test.ts src/shared/nostr/cached-query.test.ts src/shared/browser/relays.test.ts packages/resonote/src/subscription-registry.contract.test.ts packages/resonote/src/relay-repair.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify no active relay package imports remain**

Run:

```bash
rg "@auftakt/adapter-relay" src packages docs scripts --glob '!packages/adapter-relay/**' --glob '!docs/superpowers/**'
```

Expected: no output.

- [ ] **Step 7: Commit**

Run:

```bash
git add src packages package.json pnpm-lock.yaml
git commit -m "refactor(auftakt): cut over relay consumers to core"
```

Expected: commit succeeds and no active consumer imports `@auftakt/adapter-relay`.

---

### Task 6: Remove Obsolete Packages

**Files:**

- Delete: `packages/timeline`
- Delete: `packages/adapter-relay`
- Modify: `packages/AGENTS.md`
- Modify: `packages/core/AGENTS.md`
- Modify: `packages/resonote/AGENTS.md`
- Modify: `packages/adapter-indexeddb/AGENTS.md`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Verify consumers are gone before deleting**

Run:

```bash
rg "@auftakt/(timeline|adapter-relay)" src packages docs scripts --glob '!packages/timeline/**' --glob '!packages/adapter-relay/**' --glob '!docs/superpowers/**'
```

Expected: no output.

- [ ] **Step 2: Delete package folders**

Run:

```bash
git rm -r packages/timeline packages/adapter-relay
```

Expected: git stages deletion of both package folders.

- [ ] **Step 3: Update package workspace guide**

Edit `packages/AGENTS.md` role table to contain:

```markdown
| Package              | Role                                 | Notes                                       |
| -------------------- | ------------------------------------ | ------------------------------------------- |
| `core/`              | Auftakt runtime foundation           | vocabulary, planning, relay session         |
| `resonote/`          | Resonote app-specific runtime facade | coordinator, plugins, feature-facing flows  |
| `adapter-indexeddb/` | storage/materializer adapter         | IndexedDB apply + reconcile materialization |
```

Update anti-patterns to say adapters must not invent vocabulary that belongs in `@auftakt/core`.

- [ ] **Step 4: Update core package guide**

Edit `packages/core/AGENTS.md` overview:

```markdown
## OVERVIEW

Core Auftakt runtime foundation: shared vocabulary, crypto helpers, request planning, settlement, reconcile, relay observation, and relay session primitives.
```

Keep the rule that app-facing feature operations belong in `@auftakt/resonote`, not core.

- [ ] **Step 5: Refresh lockfile**

Run:

```bash
pnpm install --lockfile-only
```

Expected: completes successfully and removes deleted workspace packages from `pnpm-lock.yaml`.

- [ ] **Step 6: Run workspace package test discovery**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages package.json pnpm-lock.yaml
git commit -m "refactor(auftakt): remove obsolete packages"
```

Expected: commit succeeds and workspace contains only `core`, `resonote`, and `adapter-indexeddb` under `packages/`.

---

### Task 7: Reorganize Test Commands and Proof Guards

**Files:**

- Modify: `package.json`
- Modify: `scripts/check-auftakt-migration.mjs`

- [ ] **Step 1: Add responsibility-oriented test scripts**

Edit root `package.json` scripts:

```json
{
  "test:auftakt:core": "vitest run packages/core/src/",
  "test:auftakt:storage": "vitest run packages/adapter-indexeddb/src/",
  "test:auftakt:resonote": "vitest run packages/resonote/src/",
  "test:auftakt:app-regression": "vitest run src/shared/nostr/cached-query.test.ts src/shared/browser/profile.svelte.test.ts src/shared/browser/relays.test.ts src/features/comments/ui/comment-view-model.test.ts src/features/notifications/ui/notification-feed-view-model.test.ts src/features/relays/ui/relay-settings-view-model.test.ts src/features/comments/application/comment-actions.test.ts src/features/content-resolution/application/resolve-content.test.ts",
  "test:auftakt:e2e": "playwright test e2e/reply-thread.test.ts e2e/comment-flow.test.ts e2e/reaction-delete-reply.test.ts e2e/notifications-page.test.ts e2e/profile-data.test.ts e2e/relay-settings-data.test.ts e2e/nip19-routes.test.ts e2e/content-page.test.ts",
  "check:auftakt-semantic": "node scripts/check-auftakt-migration.mjs --semantic-guard && pnpm run test:auftakt:core && pnpm run test:auftakt:storage && pnpm run test:auftakt:resonote && pnpm run test:auftakt:app-regression && pnpm run test:auftakt:e2e"
}
```

Preserve existing unrelated scripts.

- [ ] **Step 2: Move raw negentropy allowlist**

In `scripts/check-auftakt-migration.mjs`, replace old allowlist entries:

```js
allowedFiles: [
  'packages/adapter-relay/src/index.ts',
  'packages/adapter-relay/src/request-replay.contract.test.ts'
];
```

with:

```js
allowedFiles: [
  'packages/core/src/negentropy.ts',
  'packages/core/src/relay-session.ts',
  'packages/core/src/negentropy-transport.contract.test.ts'
];
```

- [ ] **Step 3: Add residual package import guard**

Add or update a semantic guard policy that fails active imports:

```js
{
  name: 'obsolete-auftakt-package-import',
  description: 'deleted Auftakt package imports',
  pattern: /@auftakt\/(timeline|adapter-relay)/g,
  allowedFiles: [
    'docs/superpowers/specs/2026-04-24-packages-refactor-design.md',
    'docs/superpowers/plans/2026-04-24-packages-refactor.md'
  ]
}
```

If `docs/superpowers/` is not scanned by the script, omit those allowed files and keep `allowedFiles: []`.

- [ ] **Step 4: Run semantic guard**

Run:

```bash
pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt-migration -- --report consumers
pnpm run check:auftakt-semantic
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json scripts/check-auftakt-migration.mjs
git commit -m "test(auftakt): reorganize package refactor gates"
```

Expected: commit succeeds with updated scripts and proof guards.

---

### Task 8: Update Auftakt Documentation

**Files:**

- Modify: `docs/auftakt/spec.md`
- Modify: `docs/auftakt/status-verification.md`

- [ ] **Step 1: Update architecture diagrams and layer tables**

In `docs/auftakt/spec.md`, replace the five-package diagram with:

```mermaid
flowchart TD
    App[Feature / Shared Browser] --> Facade[src/shared/auftakt/resonote.ts]
    Facade --> Runtime[@auftakt/resonote]
    Runtime --> Core[@auftakt/core]
    Runtime --> Store[@auftakt/adapter-indexeddb]
    Store --> Core
```

Update the layer table:

```markdown
| Layer             | Role                                                               | Main location                            |
| ----------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| App / Feature     | Uses high-level API                                                | `src/features/*`, `src/shared/browser/*` |
| App-facing facade | Central app import point                                           | `src/shared/auftakt/resonote.ts`         |
| Resonote runtime  | coordinator, plugins, feature-facing operations                    | `packages/resonote/src/runtime.ts`       |
| Core runtime      | vocabulary, request planning, settlement, reconcile, relay session | `packages/core/src/`                     |
| Storage adapter   | persistence and materialization                                    | `packages/adapter-indexeddb/src/`        |
```

- [ ] **Step 2: Update package descriptions**

Replace old `@auftakt/timeline` and `@auftakt/adapter-relay` sections with a single expanded `@auftakt/core` section:

```markdown
### `@auftakt/core`

`@auftakt/core` defines Auftakt shared vocabulary and generic runtime primitives.

Responsibilities:

- public/shared types
- crypto and NIP helper primitives
- request descriptor canonicalization
- request key generation
- read settlement reduction
- reconcile decision helpers
- relay observation normalization
- relay request/session primitives
- reconnect/replay transport behavior
```

- [ ] **Step 3: Update NIP owner references**

In both docs, change NIP-01 and NIP-11 owner/proof rows:

```markdown
| NIP-01 | public | implemented (runtime-owned REQ/replay + EOSE/OK) | `packages/core/src/relay-session.ts` | `packages/core/src/relay-session.contract.test.ts` |
| NIP-11 | internal | implemented (runtime-only bounded support) | `packages/core/src/relay-session.ts` | `packages/core/src/relay-session.contract.test.ts` |
```

Keep NIP-77 owner as `packages/resonote/src/runtime.ts`.

- [ ] **Step 4: Run docs search**

Run:

```bash
rg "packages/(timeline|adapter-relay)|@auftakt/(timeline|adapter-relay)" docs/auftakt packages scripts src
```

Expected: no output.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/auftakt/spec.md docs/auftakt/status-verification.md packages/AGENTS.md packages/core/AGENTS.md packages/resonote/AGENTS.md packages/adapter-indexeddb/AGENTS.md
git commit -m "docs(auftakt): document three-package architecture"
```

Expected: commit succeeds with docs aligned to the new package boundaries.

---

### Task 9: Final Verification and Cleanup

**Files:**

- Review all changed files

- [ ] **Step 1: Verify deleted package imports are absent**

Run:

```bash
rg "@auftakt/(timeline|adapter-relay)" src packages docs scripts --glob '!docs/superpowers/**'
```

Expected: no output.

- [ ] **Step 2: Verify obsolete package folders are absent**

Run:

```bash
test ! -d packages/timeline && test ! -d packages/adapter-relay
```

Expected: exit code 0.

- [ ] **Step 3: Run package tests**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 4: Run proof gates**

Run:

```bash
pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt-migration -- --report consumers
```

Expected: both commands pass.

- [ ] **Step 5: Run semantic gate**

Run:

```bash
pnpm run check:auftakt-semantic
```

Expected: PASS.

- [ ] **Step 6: Run type and build completion gate**

Run:

```bash
pnpm run check:auftakt-complete
```

Expected: PASS.

- [ ] **Step 7: Inspect final git status**

Run:

```bash
git status --short
```

Expected: no unintended files. Ignored local docs under `docs/superpowers/` may exist and should not be staged.

- [ ] **Step 8: Commit any final corrections**

If Step 7 shows only intended tracked changes, run:

```bash
git add package.json pnpm-lock.yaml packages src docs scripts
git commit -m "refactor(auftakt): finalize package boundary consolidation"
```

Expected: either a final cleanup commit is created or there are no tracked changes left to commit.

---

## Self-Review Notes

- Spec coverage: package consolidation, Resonote app import cutover, test reorganization, docs updates, proof guard updates, and acceptance commands are covered.
- Placeholder scan: plan avoids open-ended implementation placeholders and gives concrete file paths, commands, import patterns, and expected results.
- Type consistency: all deleted package imports converge on `@auftakt/core`; `@auftakt/resonote` remains high-level; `@auftakt/adapter-indexeddb` remains storage-only.
