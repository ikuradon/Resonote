# Cached Query Retirement Implementation Plan

> Status: Partially implemented at the time of the 2026-04-26 completion audit.
> The cached read bridge moved to `src/shared/auftakt/cached-read.svelte.ts`, but
> `pnpm run check:auftakt-complete` still required semantic guard and active
> stale-reference cleanup. See
> `docs/auftakt/2026-04-26-april-doc-completion-audit.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the retired `src/shared/nostr/cached-query*` bridge and keep cached read behavior behind `$shared/auftakt/resonote.js`.

**Architecture:** Move the cached read runtime driver from `src/shared/nostr` to `src/shared/auftakt/cached-read.svelte.ts`. `src/shared/auftakt/resonote.ts` remains the app-facing facade and injects the internal cached read driver into `createResonoteCoordinator()`. Guards and migration proof reject any reintroduced cached-query bridge or import.

**Tech Stack:** TypeScript, Svelte 5 runes in `.svelte.ts`, Vitest, Auftakt `ReadSettlement`, existing migration and strict-closure scripts.

---

## File Structure

- Create `src/shared/auftakt/cached-read.svelte.ts`: internal runtime-driver implementation for cached by-id and cached latest reads.
- Move `src/shared/nostr/cached-query.test.ts` to `src/shared/auftakt/cached-read.test.ts`: existing behavior coverage under the new owner.
- Modify `src/shared/auftakt/resonote.ts`: import cached read driver and result types from `$shared/auftakt/cached-read.svelte.js`.
- Delete `src/shared/nostr/cached-query.svelte.ts`: retired bridge implementation.
- Delete `src/shared/nostr/cached-query.ts`: retired alias.
- Modify `src/shared/nostr/AGENTS.md`: remove cached-query from active helper guidance.
- Modify `src/features/comments/AGENTS.md`: remove the literal retired cached-query path from local anti-patterns.
- Modify `scripts/check-auftakt-strict-closure.ts`: fail when retired cached-query files or imports reappear.
- Modify `scripts/check-auftakt-strict-closure.test.ts`: cover the new guard.
- Modify `scripts/check-auftakt-migration.mjs`: remove cached-query alias policy and direct-import allowlist entries.
- Modify `scripts/auftakt-migration-guard.mjs`: include the new Auftakt cached read files in ownership proof.
- Modify `scripts/auftakt-ownership-matrix.mjs`: remove old cached-query ownership entries and add new cached-read entries.
- Modify `docs/auftakt/spec.md`: update the Cached Query regression anchor to Cached Read.

## Task 1: Move Cached Read Behavior Tests To The Auftakt Boundary

**Files:**

- Move: `src/shared/nostr/cached-query.test.ts` -> `src/shared/auftakt/cached-read.test.ts`
- Modify: `src/shared/auftakt/cached-read.test.ts`

- [ ] **Step 1: Move the test file**

Run:

```bash
git mv src/shared/nostr/cached-query.test.ts src/shared/auftakt/cached-read.test.ts
```

Expected: file moves in git status.

- [ ] **Step 2: Update the moved test imports**

In `src/shared/auftakt/cached-read.test.ts`, replace this import:

```ts
import {
  cachedFetchById,
  invalidateFetchByIdCache,
  resetFetchByIdCache,
  useCachedLatest
} from './cached-query.svelte.js';
```

with:

```ts
import {
  cachedFetchById as cachedFetchByIdWithRuntime,
  invalidateFetchByIdCache as invalidateFetchByIdCacheWithRuntime,
  type CachedReadRuntime,
  useCachedLatest as useCachedLatestWithRuntime
} from './cached-read.svelte.js';
```

- [ ] **Step 3: Add a runtime harness for the moved tests**

In `src/shared/auftakt/cached-read.test.ts`, add this block immediately after:

```ts
const RELAY_SECRET_KEY = new Uint8Array(32).fill(1);
```

```ts
function createCachedReadRuntime(): CachedReadRuntime {
  return {
    getEventsDB: async () => ({
      getById: dbGetByIdMock,
      getByPubkeyAndKind: dbGetByPubkeyAndKindMock,
      listNegentropyEventRefs: vi.fn(async () => []),
      put: vi.fn(async () => true)
    }),
    getRxNostr: async () => ({
      use: () => ({
        subscribe: subscribeMock
      })
    }),
    createRxBackwardReq: () => ({
      emit: vi.fn(),
      over: vi.fn()
    })
  } as unknown as CachedReadRuntime;
}

let cachedReadRuntime = createCachedReadRuntime();

function resetRuntime(): void {
  cachedReadRuntime = createCachedReadRuntime();
}

async function cachedFetchById(eventId: string) {
  return cachedFetchByIdWithRuntime(cachedReadRuntime, eventId);
}

function invalidateFetchByIdCache(eventId: string): void {
  invalidateFetchByIdCacheWithRuntime(cachedReadRuntime, eventId);
}

function useCachedLatest(pubkey: string, kind: number) {
  return useCachedLatestWithRuntime(cachedReadRuntime, pubkey, kind);
}
```

- [ ] **Step 4: Replace reset calls**

In `src/shared/auftakt/cached-read.test.ts`, replace every:

```ts
resetFetchByIdCache();
```

with:

```ts
resetRuntime();
```

- [ ] **Step 5: Run the moved test and verify it fails for the missing module**

Run:

```bash
pnpm exec vitest run src/shared/auftakt/cached-read.test.ts
```

Expected: FAIL with an import error for `./cached-read.svelte.js`.

- [ ] **Step 6: Commit the failing test move**

Run:

```bash
git add src/shared/auftakt/cached-read.test.ts src/shared/nostr/cached-query.test.ts
git commit -m "test(auftakt): move cached read coverage under facade boundary"
```

## Task 2: Create The Internal Cached Read Driver

**Files:**

- Create: `src/shared/auftakt/cached-read.svelte.ts`
- Modify: `src/shared/auftakt/cached-read.test.ts`

- [ ] **Step 1: Create the cached read driver**

Create `src/shared/auftakt/cached-read.svelte.ts` with this content:

```ts
import type { ReadSettlement, StoredEvent } from '@auftakt/core';
import {
  cachedFetchById as cachedFetchByIdHelper,
  invalidateFetchByIdCache as invalidateFetchByIdCacheHelper,
  type LatestReadDriver,
  useCachedLatest as useCachedLatestHelper
} from '@auftakt/resonote';

export interface FetchedEventFull extends StoredEvent {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}

export interface SettledReadResult<TEvent> {
  readonly event: TEvent | null;
  readonly settlement: ReadSettlement;
}

export type CachedFetchByIdResult = SettledReadResult<FetchedEventFull>;

interface CachedEvent extends StoredEvent {
  tags: string[][];
  content: string;
  created_at: number;
  pubkey: string;
  id: string;
  kind: number;
}

export type CachedReadRuntime = Parameters<typeof cachedFetchByIdHelper>[0] &
  Parameters<typeof invalidateFetchByIdCacheHelper>[0] &
  Parameters<typeof useCachedLatestHelper>[0];

export interface UseCachedLatestResult {
  readonly event: CachedEvent | null;
  readonly settlement: ReadSettlement;
  destroy(): void;
}

export async function cachedFetchById(
  runtime: CachedReadRuntime,
  eventId: string
): Promise<CachedFetchByIdResult> {
  if (!eventId) {
    throw new Error('eventId is required');
  }
  return cachedFetchByIdHelper<CachedFetchByIdResult>(runtime, eventId);
}

export function invalidateFetchByIdCache(runtime: CachedReadRuntime, eventId: string): void {
  if (!eventId) {
    throw new Error('eventId is required');
  }
  invalidateFetchByIdCacheHelper(runtime, eventId);
}

export function useCachedLatest(
  runtime: CachedReadRuntime,
  pubkey: string,
  kind: number
): UseCachedLatestResult {
  if (typeof kind !== 'number') {
    throw new Error('kind is required');
  }

  const driver = useCachedLatestHelper<LatestReadDriver<CachedEvent>>(runtime, pubkey, kind);
  const initial = driver.getSnapshot();
  let event = $state<CachedEvent | null>(initial.event);
  let settlement = $state<ReadSettlement>(initial.settlement);
  let destroyed = false;

  const unsubscribe = driver.subscribe(() => {
    if (destroyed) return;
    const snapshot = driver.getSnapshot();
    event = snapshot.event;
    settlement = snapshot.settlement;
  });

  return {
    get event() {
      return event;
    },
    get settlement() {
      return settlement;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      driver.destroy();
    }
  };
}
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm exec vitest run src/shared/auftakt/cached-read.test.ts
```

Expected: PASS. The existing cached by-id TTL, invalidation, relay fallback, and latest-event accessor tests pass from the new location.

- [ ] **Step 3: Run type checking for the new driver**

Run:

```bash
pnpm run check
```

Expected: PASS. If TypeScript rejects the private runtime type intersection, replace the `CachedReadRuntime` alias with this explicit structural type and rerun:

```ts
export interface CachedReadRuntime {
  getEventsDB(): Promise<{
    getById(id: string): Promise<StoredEvent | null>;
    getByPubkeyAndKind(pubkey: string, kind: number): Promise<StoredEvent | null>;
    listNegentropyEventRefs(): Promise<readonly unknown[]>;
    put(event: StoredEvent): Promise<unknown>;
    putQuarantine?(record: unknown): Promise<void>;
    putWithReconcile?(event: StoredEvent): Promise<unknown>;
  }>;
  getRxNostr(): Promise<{
    use(
      req: { emit(input: unknown): void; over(): void },
      options?: { on?: { relays?: readonly string[]; defaultReadRelays?: boolean } }
    ): {
      subscribe(observer: {
        next?: (packet: { event: unknown; from?: string }) => void;
        complete?: () => void;
        error?: (error: unknown) => void;
      }): { unsubscribe(): void };
    };
  }>;
  createRxBackwardReq(options?: unknown): {
    emit(input: unknown): void;
    over(): void;
  };
}
```

- [ ] **Step 4: Commit the internal driver**

Run:

```bash
git add src/shared/auftakt/cached-read.svelte.ts src/shared/auftakt/cached-read.test.ts
git commit -m "refactor(auftakt): move cached read driver under facade"
```

## Task 3: Point The Facade At The New Driver And Delete Retired Bridges

**Files:**

- Modify: `src/shared/auftakt/resonote.ts`
- Delete: `src/shared/nostr/cached-query.svelte.ts`
- Delete: `src/shared/nostr/cached-query.ts`
- Modify: `src/shared/nostr/AGENTS.md`
- Modify: `src/features/comments/AGENTS.md`

- [ ] **Step 1: Update the facade import**

In `src/shared/auftakt/resonote.ts`, replace:

```ts
} from '$shared/nostr/cached-query.svelte.js';
```

with:

```ts
} from '$shared/auftakt/cached-read.svelte.js';
```

- [ ] **Step 2: Delete retired bridge files**

Run:

```bash
git rm src/shared/nostr/cached-query.svelte.ts src/shared/nostr/cached-query.ts
```

Expected: both files are staged for deletion.

- [ ] **Step 3: Update shared Nostr local guidance**

In `src/shared/nostr/AGENTS.md`, replace:

```md
- Read helpers: `cached-query.svelte.ts`, `cached-query.ts`, `query.ts`
```

with:

```md
- Read helpers: `query.ts`
```

Replace:

```md
- `cached-query.ts` and `user-relays.ts` are legacy aliases only; prefer app-facing access through `src/shared/auftakt/resonote.ts` or the direct bridge they alias.
```

with:

```md
- `user-relays.ts` is a legacy alias only; prefer app-facing access through `src/shared/auftakt/resonote.ts` or the direct bridge it aliases.
```

- [ ] **Step 4: Update comments local guidance**

In `src/features/comments/AGENTS.md`, replace:

```md
- No direct `$shared/nostr/gateway.js` or `$shared/nostr/cached-query.js` imports.
```

with:

```md
- No direct `$shared/nostr/gateway.js` imports or retired cached read bridge imports.
```

- [ ] **Step 5: Run source reference check**

Run:

```bash
rg "cached-query" src packages
```

Expected: no matches.

- [ ] **Step 6: Run focused cached read and facade-adjacent tests**

Run:

```bash
pnpm exec vitest run src/shared/auftakt/cached-read.test.ts src/shared/nostr/query.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit bridge deletion**

Run:

```bash
git add src/shared/auftakt/resonote.ts src/shared/nostr/AGENTS.md src/features/comments/AGENTS.md
git add -u src/shared/nostr/cached-query.svelte.ts src/shared/nostr/cached-query.ts
git commit -m "refactor(auftakt): retire shared nostr cached query bridge"
```

## Task 4: Update Migration Proof And Ownership Metadata

**Files:**

- Modify: `scripts/check-auftakt-migration.mjs`
- Modify: `scripts/auftakt-migration-guard.mjs`
- Modify: `scripts/auftakt-ownership-matrix.mjs`
- Modify: `docs/auftakt/spec.md`

- [ ] **Step 1: Remove cached-query from forbidden consumer specifiers**

In `scripts/check-auftakt-migration.mjs`, replace:

```js
const forbiddenConsumerSpecifiers = [
  '$shared/nostr/gateway.js',
  '$shared/nostr/cached-query.js',
  '$shared/nostr/user-relays.js'
];
```

with:

```js
const forbiddenConsumerSpecifiers = ['$shared/nostr/gateway.js', '$shared/nostr/user-relays.js'];
```

- [ ] **Step 2: Remove cached-query residual alias policy**

In `scripts/check-auftakt-migration.mjs`, replace:

```js
const residualLegacyAliasPolicies = [
  {
    file: 'src/shared/nostr/cached-query.ts',
    specifiers: ['$shared/nostr/cached-query.js'],
    allowedTestImporters: []
  },
  {
    file: 'src/shared/nostr/user-relays.ts',
    specifiers: ['$shared/nostr/user-relays.js'],
    allowedTestImporters: ['src/shared/nostr/user-relays.test.ts']
  }
];
```

with:

```js
const residualLegacyAliasPolicies = [
  {
    file: 'src/shared/nostr/user-relays.ts',
    specifiers: ['$shared/nostr/user-relays.js'],
    allowedTestImporters: ['src/shared/nostr/user-relays.test.ts']
  }
];
```

- [ ] **Step 3: Rename the semantic source contract guard**

In `scripts/check-auftakt-migration.mjs`, replace the semantic guard entry:

```js
{
  name: 'legacy-cached-query-source-contract',
  description: 'retired source=loading|cache|relay contract',
  pattern:
    /source\??\s*:\s*'(loading|cache|relay)'|source\s*:\s*'loading'\s*\|\s*'cache'\s*\|\s*'relay'/g,
  allowedFiles: []
},
```

with:

```js
{
  name: 'legacy-cached-read-source-contract',
  description: 'retired source=loading|cache|relay contract',
  pattern:
    /source\??\s*:\s*'(loading|cache|relay)'|source\s*:\s*'loading'\s*\|\s*'cache'\s*\|\s*'relay'/g,
  allowedFiles: []
},
```

- [ ] **Step 4: Build the direct shared Nostr import pattern without retired literals**

In `scripts/check-auftakt-migration.mjs`, add this constant above `semanticGuardPolicies`:

```js
const retiredCachedReadSpecifierPart = 'cached-' + 'query';
```

Then replace the `direct-shared-nostr-consumer-import` policy with:

```js
{
  name: 'direct-shared-nostr-consumer-import',
  description: 'direct $shared/nostr canonical imports outside façade/internal bridges',
  pattern: new RegExp(
    `\\$shared\\/nostr\\/(${retiredCachedReadSpecifierPart}|client|query|publish-signed)(?:\\.js)?`,
    'g'
  ),
  allowedFiles: [
    'src/shared/auftakt/resonote.ts',
    'src/shared/nostr/materialized-latest.ts',
    'src/shared/nostr/materialized-latest.test.ts',
    'src/shared/nostr/relays-config.ts',
    'src/shared/nostr/relays-config.test.ts',
    'src/shared/nostr/user-relays.test.ts'
  ]
}
```

- [ ] **Step 5: Include the new cached-read files in ownership proof**

In `scripts/auftakt-migration-guard.mjs`, replace:

```js
export const SHARED_NOSTR_ROOT = 'src/shared/nostr';
```

with:

```js
export const SHARED_NOSTR_ROOT = 'src/shared/nostr';
export const SHARED_AUFTAKT_OWNERSHIP_FILES = [
  'src/shared/auftakt/cached-read.svelte.ts',
  'src/shared/auftakt/cached-read.test.ts'
];
```

Then replace `listSharedNostrFiles()` with:

```js
export function listSharedNostrFiles(dir = SHARED_NOSTR_ROOT) {
  const files = walk(dir, { includeTests: true });
  if (dir !== SHARED_NOSTR_ROOT) return files;

  const extraFiles = SHARED_AUFTAKT_OWNERSHIP_FILES.filter((file) => {
    const stat = statSync(file, { throwIfNoEntry: false });
    return stat?.isFile();
  });

  return [...files, ...extraFiles].sort();
}
```

- [ ] **Step 6: Update ownership matrix entries**

In `scripts/auftakt-ownership-matrix.mjs`, remove the three entries for:

```js
'src/shared/nostr/cached-query.svelte.ts';
'src/shared/nostr/cached-query.test.ts';
'src/shared/nostr/cached-query.ts';
```

Add these entries at the top of `nostrOwnershipMatrix`:

```js
'src/shared/auftakt/cached-read.svelte.ts': {
  classification: 'adapter-specific',
  owner: 'shared/auftakt facade cached read driver',
  disposition: 'retain as internal coordinator-backed cached read runtime'
},
'src/shared/auftakt/cached-read.test.ts': {
  classification: 'app-owned',
  owner: 'app test harness',
  disposition: 'retain as regression coverage for facade-owned cached read behavior'
},
```

- [ ] **Step 7: Update docs companion coverage**

In `docs/auftakt/spec.md`, replace the regression row:

```md
| **Cached Query** | `src/shared/nostr/cached-query.svelte.ts` | `src/shared/nostr/cached-query.test.ts` | - |
```

with:

```md
| **Cached Read** | `src/shared/auftakt/cached-read.svelte.ts` | `src/shared/auftakt/cached-read.test.ts` | - |
```

- [ ] **Step 8: Run migration proof**

Run:

```bash
pnpm run check:auftakt-migration -- --proof
```

Expected: PASS. Proof output shows no residual cached-query alias entry and no stale ownership entries.

- [ ] **Step 9: Commit migration proof updates**

Run:

```bash
git add scripts/check-auftakt-migration.mjs scripts/auftakt-migration-guard.mjs scripts/auftakt-ownership-matrix.mjs docs/auftakt/spec.md
git commit -m "test(auftakt): update cached read migration proof"
```

## Task 5: Extend Strict Closure Guard For Retired Cached Query Files

**Files:**

- Modify: `scripts/check-auftakt-strict-closure.ts`
- Modify: `scripts/check-auftakt-strict-closure.test.ts`

- [ ] **Step 1: Add retired bridge constants**

In `scripts/check-auftakt-strict-closure.ts`, add this block after `ACTIVE_DOC_PATHS`:

```ts
const RETIRED_CACHED_READ_BASENAME = 'cached-' + 'query';
const RETIRED_CACHED_READ_PATHS = new Set([
  `src/shared/nostr/${RETIRED_CACHED_READ_BASENAME}.svelte.ts`,
  `src/shared/nostr/${RETIRED_CACHED_READ_BASENAME}.ts`
]);
const RETIRED_CACHED_READ_SPECIFIERS = [
  `$shared/nostr/${RETIRED_CACHED_READ_BASENAME}.js`,
  `$shared/nostr/${RETIRED_CACHED_READ_BASENAME}.svelte.js`,
  `./${RETIRED_CACHED_READ_BASENAME}.js`,
  `./${RETIRED_CACHED_READ_BASENAME}.svelte.js`
];
```

- [ ] **Step 2: Reject retired files and imports**

In `scripts/check-auftakt-strict-closure.ts`, add this block inside the `for (const file of files)` loop immediately after the legacy adapter path check:

```ts
if (RETIRED_CACHED_READ_PATHS.has(file.path)) {
  errors.push(`${file.path} is retired; use $shared/auftakt/resonote.js for cached reads`);
}
if (RETIRED_CACHED_READ_SPECIFIERS.some((specifier) => file.text.includes(specifier))) {
  errors.push(`${file.path} imports retired shared Nostr cached read bridge`);
}
```

- [ ] **Step 3: Add guard tests without retired literals**

In `scripts/check-auftakt-strict-closure.test.ts`, add this constant after the existing slug constants:

```ts
const retiredCachedReadSlug = 'cached-' + 'query';
```

Add this test before `passes when strict closure invariants are satisfied`:

```ts
it('flags retired shared nostr cached read bridge files and imports', () => {
  const retiredFile = `src/shared/nostr/${retiredCachedReadSlug}.ts`;
  const retiredImport = `$shared/nostr/${retiredCachedReadSlug}.js`;
  const result = checkStrictClosure([
    file(retiredFile, 'export {};'),
    file(
      'src/features/comments/ui/comment-view-model.svelte.ts',
      `import { cachedFetchById } from '${retiredImport}';`
    ),
    file(
      'packages/resonote/src/materializer-queue.ts',
      'export function createMaterializerQueue() {}'
    ),
    file('packages/resonote/src/runtime.ts', 'createMaterializerQueue(); createRelayGateway();')
  ]);

  expect(result.errors).toContain(
    `${retiredFile} is retired; use $shared/auftakt/resonote.js for cached reads`
  );
  expect(result.errors).toContain(
    'src/features/comments/ui/comment-view-model.svelte.ts imports retired shared Nostr cached read bridge'
  );
});
```

- [ ] **Step 4: Run strict closure test**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-closure.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run strict closure**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: PASS.

- [ ] **Step 6: Commit strict closure guard**

Run:

```bash
git add scripts/check-auftakt-strict-closure.ts scripts/check-auftakt-strict-closure.test.ts
git commit -m "test(auftakt): guard retired cached read bridge"
```

## Task 6: Final Verification And Reference Cleanup

**Files:**

- Verify only unless a command reports a concrete file to fix.

- [ ] **Step 1: Verify retired literal cleanup**

Run:

```bash
rg "cached-query" src packages scripts docs/auftakt
```

Expected: no matches.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm exec vitest run src/shared/auftakt/cached-read.test.ts src/shared/nostr/query.test.ts scripts/check-auftakt-strict-closure.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run migration and strict closure gates**

Run:

```bash
pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt:strict-closure
```

Expected: both PASS.

- [ ] **Step 4: Run package regression**

Run:

```bash
pnpm run test:auftakt:resonote
```

Expected: PASS.

- [ ] **Step 5: Run full type check**

Run:

```bash
pnpm run check
```

Expected: PASS.

- [ ] **Step 6: Inspect final status**

Run:

```bash
git status --short
```

Expected: only intentional implementation files are modified; unrelated pre-existing workspace changes remain untouched.

- [ ] **Step 7: Final commit if verification required fixes**

If Task 6 commands required additional fixes, commit only those fixes:

```bash
git add <fixed-files>
git commit -m "fix(auftakt): complete cached read retirement"
```

Expected: no commit is made in this step when Tasks 1-5 already committed all changes and Task 6 only verified.

## Plan Self-Review

- Spec coverage: Tasks 1-3 delete the Nostr bridge and preserve facade exports; Task 4 updates migration proof and ownership; Task 5 adds guard coverage; Task 6 runs the required verification.
- Completeness scan: no open-ended implementation gaps remain. The only branch is the explicit TypeScript fallback in Task 2 Step 3 with complete replacement code.
- Type consistency: the new internal file is consistently named `cached-read.svelte.ts`, the test is `cached-read.test.ts`, and the facade import uses `$shared/auftakt/cached-read.svelte.js`.
