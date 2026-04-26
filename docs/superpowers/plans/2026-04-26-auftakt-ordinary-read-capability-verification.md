# Auftakt Ordinary Read Capability Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ordinary latest and backward reads verify through a negentropy-first `RelayGateway` path with REQ fallback, while preserving coordinator-local materialization.

**Architecture:** Keep public read APIs unchanged. Harden `RelayGateway` fallback behavior, then route `createRuntimeEventCoordinator().relayGateway.verify()` through an ordinary-read gateway helper that selects explicit relay URLs from resolved read overlays/defaults and returns only internal relay candidates to `EventCoordinator`.

**Tech Stack:** TypeScript, Vitest, Auftakt workspace packages, `@auftakt/core` request keys, Resonote `EventCoordinator`, existing strict audit scripts.

---

## File Structure

- Modify `packages/resonote/src/relay-gateway.ts`
  - Responsibility: reusable relay verification strategy. Add REQ fallback when local negentropy refs cannot be listed.
- Modify `packages/resonote/src/relay-gateway.contract.test.ts`
  - Responsibility: gateway-level fallback contracts.
- Modify `packages/resonote/src/public-read-cutover.contract.test.ts`
  - Responsibility: public read/coordinator wiring proof. Extend fixture with optional negentropy support and add latest/backward ordinary read capability tests.
- Modify `packages/resonote/src/runtime.ts`
  - Responsibility: runtime coordinator read verification. Add ordinary-read gateway helper and route coordinator verification through it.
- Modify `scripts/check-auftakt-strict-goal-audit.ts`
  - Responsibility: strict goal audit proof gate. Require ordinary read capability evidence.
- Modify `scripts/check-auftakt-strict-goal-audit.test.ts`
  - Responsibility: strict gate regression tests.
- Modify `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`
  - Responsibility: human-readable strict goal gap audit status.

---

### Task 1: Harden RelayGateway Fallback

**Files:**

- Modify: `packages/resonote/src/relay-gateway.contract.test.ts`
- Modify: `packages/resonote/src/relay-gateway.ts`

- [ ] **Step 1: Write the failing gateway fallback test**

Add this test to `describe('createRelayGateway', ...)` in `packages/resonote/src/relay-gateway.contract.test.ts`:

```ts
it('falls back to REQ when local negentropy refs cannot be listed', async () => {
  const event = { id: 'event-from-req', created_at: 123 };
  const requestNegentropySync = vi.fn(async () => ({
    capability: 'supported' as const,
    messageHex: JSON.stringify({ remoteOnlyIds: ['should-not-be-used'] })
  }));
  const fetchByReq = vi.fn(async () => [event]);

  const gateway = createRelayGateway({
    requestNegentropySync,
    fetchByReq,
    listLocalRefs: async () => {
      throw new Error('refs unavailable');
    }
  });

  const result = await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example/' });

  expect(result).toEqual({
    strategy: 'fallback-req',
    candidates: [{ event, relayUrl: 'wss://relay.example/' }]
  });
  expect(requestNegentropySync).not.toHaveBeenCalled();
  expect(fetchByReq).toHaveBeenCalledWith([{ kinds: [1] }], {
    relayUrl: 'wss://relay.example/'
  });
});
```

- [ ] **Step 2: Run the focused gateway test and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-gateway.contract.test.ts
```

Expected: FAIL. The new test rejects with `refs unavailable` because `createRelayGateway()` currently reads local refs before it can choose REQ fallback.

- [ ] **Step 3: Implement minimal gateway fallback**

In `packages/resonote/src/relay-gateway.ts`, replace the first line of `verify()`:

```ts
const localRefs = await deps.listLocalRefs(filters);
```

with:

```ts
let localRefs: readonly { readonly id: string; readonly created_at: number }[];
try {
  localRefs = await deps.listLocalRefs(filters);
} catch {
  const events = await deps.fetchByReq(filters, options);
  return { strategy: 'fallback-req', candidates: toCandidates(events, options.relayUrl) };
}
```

- [ ] **Step 4: Run the focused gateway test and verify pass**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-gateway.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit gateway fallback hardening**

Run:

```bash
git add packages/resonote/src/relay-gateway.ts packages/resonote/src/relay-gateway.contract.test.ts
git commit -m "test(auftakt): harden relay gateway fallback"
```

---

### Task 2: Add Ordinary Read Capability Wiring Tests

**Files:**

- Modify: `packages/resonote/src/public-read-cutover.contract.test.ts`

- [ ] **Step 1: Extend the public read fixture with optional negentropy support**

In `packages/resonote/src/public-read-cutover.contract.test.ts`, add these types after `interface RequestRecord`:

```ts
interface NegentropyRequestRecord {
  readonly relayUrl: string;
  readonly filter: Record<string, unknown>;
  readonly initialMessageHex: string;
}

interface NegentropyFixtureResult {
  readonly capability: 'supported' | 'unsupported' | 'failed';
  readonly messageHex?: string;
  readonly reason?: string;
}
```

Extend `createCoordinatorFixture()` options with `negentropyResult`:

```ts
  negentropyResult
}: {
  defaultRelays?: readonly string[];
  getById?: (id: string) => Promise<unknown>;
  getAllByKind?: (kind: number) => Promise<unknown[]>;
  getRelayHints?: (eventId: string) => Promise<
    Array<{
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }>
  >;
  relayEvents?: readonly unknown[];
  putWithReconcile?: (event: unknown) => Promise<{ stored: boolean; emissions: unknown[] }>;
  putQuarantine?: (record: unknown) => Promise<void>;
  relayStatusFetchLatestEvent?: (
    pubkey: string,
    kind: number
  ) => Promise<{ tags: string[][]; content: string; created_at: number } | null>;
  negentropyResult?:
    | NegentropyFixtureResult
    | ((request: NegentropyRequestRecord) => Promise<NegentropyFixtureResult>);
} = {}) {
```

Add a request recorder near `createdRequests`:

```ts
const negentropyRequests: NegentropyRequestRecord[] = [];
```

Replace the current `getRxNostr: async () => ({ ... })` object with this block:

```ts
      getRxNostr: async () => {
        const rxNostr: {
          use(
            req: { emit(input: unknown): void },
            options: unknown
          ): {
            subscribe(observer: {
              next?: (packet: { event: unknown; from?: string }) => void;
              complete?: () => void;
            }): { unsubscribe(): void };
          };
          requestNegentropySync?(request: NegentropyRequestRecord): Promise<NegentropyFixtureResult>;
        } = {
          use(_req: { emit(input: unknown): void }, options: unknown) {
            const entry = { options, emitted: [] as unknown[] };
            createdRequests.push(entry);
            return {
              subscribe(observer: {
                next?: (packet: { event: unknown; from?: string }) => void;
                complete?: () => void;
              }) {
                queueMicrotask(() => {
                  for (const event of relayEvents) {
                    observer.next?.({ event, from: 'wss://relay.example' });
                  }
                  observer.complete?.();
                });
                return { unsubscribe() {} };
              }
            };
          }
        };

        if (negentropyResult !== undefined) {
          rxNostr.requestNegentropySync = async (request) => {
            negentropyRequests.push(request);
            return typeof negentropyResult === 'function'
              ? negentropyResult(request)
              : negentropyResult;
          };
        }

        return rxNostr;
      },
```

Return the recorder from the fixture:

```ts
return { coordinator, createdRequests, relayStatusLatest, negentropyRequests };
```

- [ ] **Step 2: Add failing latest negentropy-first test**

Add this test after `routes public latest reads through coordinator materialization`:

```ts
it('attempts negentropy before ordinary latest REQ verification', async () => {
  const relayEvent = finalizeEvent(
    {
      kind: 0,
      content: 'relay metadata via negentropy',
      tags: [],
      created_at: 124
    },
    RELAY_SECRET_KEY
  );
  const materialized: unknown[] = [];
  const { coordinator, createdRequests, negentropyRequests } = createCoordinatorFixture({
    relayEvents: [relayEvent],
    negentropyResult: {
      capability: 'supported',
      messageHex: JSON.stringify({ remoteOnlyIds: [relayEvent.id] })
    },
    putWithReconcile: async (event) => {
      materialized.push(event);
      return { stored: true, emissions: [] };
    }
  });

  const result = await coordinator.fetchLatestEvent(relayEvent.pubkey, 0);

  expect(result).toMatchObject({
    content: 'relay metadata via negentropy',
    created_at: 124,
    tags: []
  });
  expect(negentropyRequests).toEqual([
    {
      relayUrl: 'wss://default.example/',
      filter: { kinds: [0], authors: [relayEvent.pubkey], limit: 1 },
      initialMessageHex: '[]'
    }
  ]);
  expect(createdRequests[0]?.emitted).toEqual([{ ids: [relayEvent.id] }]);
  expect(materialized).toEqual([relayEvent]);
});
```

- [ ] **Step 3: Add failing latest fallback test**

Add this test after the negentropy-first latest test:

```ts
it('falls back to REQ when ordinary latest negentropy fails', async () => {
  const relayEvent = finalizeEvent(
    {
      kind: 0,
      content: 'relay metadata via fallback',
      tags: [],
      created_at: 125
    },
    RELAY_SECRET_KEY
  );
  const { coordinator, createdRequests, negentropyRequests } = createCoordinatorFixture({
    relayEvents: [relayEvent],
    negentropyResult: {
      capability: 'failed',
      reason: 'timeout'
    }
  });

  const result = await coordinator.fetchLatestEvent(relayEvent.pubkey, 0);

  expect(result).toMatchObject({
    content: 'relay metadata via fallback',
    created_at: 125,
    tags: []
  });
  expect(negentropyRequests).toHaveLength(1);
  expect(createdRequests[0]?.emitted).toEqual([
    { kinds: [0], authors: [relayEvent.pubkey], limit: 1 }
  ]);
});
```

- [ ] **Step 4: Add failing backward read gateway test**

Add this test before the by-id relay hint test:

```ts
it('uses capability-aware gateway for backward event reads', async () => {
  const relayEvent = finalizeEvent(
    {
      kind: 1,
      content: 'backward relay event',
      tags: [],
      created_at: 126
    },
    RELAY_SECRET_KEY
  );
  const materialized: unknown[] = [];
  const { coordinator, createdRequests, negentropyRequests } = createCoordinatorFixture({
    relayEvents: [relayEvent],
    negentropyResult: {
      capability: 'supported',
      messageHex: JSON.stringify({ remoteOnlyIds: [relayEvent.id] })
    },
    putWithReconcile: async (event) => {
      materialized.push(event);
      return { stored: true, emissions: [] };
    }
  });

  const events = await coordinator.fetchBackwardEvents<typeof relayEvent>([
    { kinds: [1], limit: 20 }
  ]);

  expect(events).toEqual([relayEvent]);
  expect(negentropyRequests).toEqual([
    {
      relayUrl: 'wss://default.example/',
      filter: { kinds: [1], limit: 20 },
      initialMessageHex: '[]'
    }
  ]);
  expect(createdRequests[0]?.emitted).toEqual([{ ids: [relayEvent.id] }]);
  expect(materialized).toEqual([relayEvent]);
});
```

- [ ] **Step 5: Run the focused public read test and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-read-cutover.contract.test.ts
```

Expected: FAIL. The new negentropy tests should show `negentropyRequests` as `[]` because ordinary reads still use direct REQ verification.

---

### Task 3: Route Ordinary Runtime Reads Through RelayGateway

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Test: `packages/resonote/src/public-read-cutover.contract.test.ts`

- [ ] **Step 1: Add ordinary read gateway helpers**

In `packages/resonote/src/runtime.ts`, add these helper functions below `createRuntimeEventCoordinator()` or immediately above it:

```ts
function createOrdinaryReadRelayGateway(
  runtime: CoordinatorReadRuntime,
  options?: FetchBackwardOptions
) {
  return createRelayGateway({
    requestNegentropySync: async ({ relayUrl, filter, initialMessageHex }) => {
      const session = (await runtime.getRxNostr()) as Partial<NegentropySessionRuntime>;
      if (typeof session.requestNegentropySync !== 'function') {
        return {
          capability: 'unsupported' as const,
          reason: 'missing-negentropy'
        };
      }

      try {
        return await session.requestNegentropySync({
          relayUrl,
          filter,
          initialMessageHex
        });
      } catch (error) {
        return {
          capability: 'failed' as const,
          reason: error instanceof Error ? error.message : 'negentropy-error'
        };
      }
    },
    fetchByReq: async (filters, requestOptions) =>
      fetchRelayCandidateEventsFromRelay(
        runtime as ResonoteRuntime,
        filters,
        requestOptions.relayUrl,
        options?.timeoutMs,
        'coordinator:ordinary-read:gateway'
      ),
    listLocalRefs: async (filters) => {
      const db = await runtime.getEventsDB();
      return filterNegentropyEventRefs(await db.listNegentropyEventRefs(), filters);
    }
  });
}

async function verifyOrdinaryReadRelayCandidates(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options: FetchBackwardOptions | undefined
): Promise<Array<{ event: unknown; relayUrl: string }>> {
  if (filters.length === 0) return [];

  const relayUrls = await selectOrdinaryReadVerificationRelays(runtime, options);
  if (relayUrls.length === 0) return [];

  const gateway = createOrdinaryReadRelayGateway(runtime, options);
  const results = await Promise.all(
    relayUrls.map(async (relayUrl) => {
      try {
        return await gateway.verify(filters, { relayUrl });
      } catch (error) {
        if (options?.rejectOnError) throw error;
        return { strategy: 'fallback-req' as const, candidates: [] };
      }
    })
  );

  return results.flatMap((result) => result.candidates);
}

async function selectOrdinaryReadVerificationRelays(
  runtime: CoordinatorReadRuntime,
  options: FetchBackwardOptions | undefined
): Promise<string[]> {
  const relays: string[] = [];
  const addRelays = (values: readonly string[]) => {
    for (const relay of values) {
      if (!relays.includes(relay)) relays.push(relay);
    }
  };

  if (options?.overlay) {
    addRelays(options.overlay.relays);
    if (options.overlay.includeDefaultReadRelays !== true) return relays;
  }

  if (typeof runtime.getDefaultRelays === 'function') {
    addRelays(await runtime.getDefaultRelays());
  }

  if (relays.length > 0) return relays;

  const session = (await runtime.getRxNostr()) as Partial<{
    getDefaultRelays(): Record<string, { read: boolean }>;
  }>;
  const sessionDefaults = Object.entries(session.getDefaultRelays?.() ?? {})
    .filter(([, config]) => config.read)
    .map(([relayUrl]) => relayUrl);
  addRelays(sessionDefaults);

  return relays;
}
```

- [ ] **Step 2: Replace direct runtime candidate fetching in coordinator verification**

In `createRuntimeEventCoordinator()`, replace the current `relayGateway.verify` body:

```ts
verify: async (filters, verifyOptions) => {
  const candidates = await fetchRelayCandidateEventsFromRuntime(runtime, filters, {
    overlay: options?.overlay,
    rejectOnError: options?.rejectOnError,
    timeoutMs: options?.timeoutMs,
    scope: `coordinator:runtime-read:${verifyOptions.reason}`
  });
  return { candidates };
};
```

with:

```ts
verify: async (filters) => {
  const candidates = await verifyOrdinaryReadRelayCandidates(runtime, filters, options);
  return { candidates };
};
```

- [ ] **Step 3: Delete obsolete direct runtime candidate helper**

Delete the obsolete `fetchRelayCandidateEventsFromRuntime()` helper from
`packages/resonote/src/runtime.ts` after `createRuntimeEventCoordinator()` no
longer calls it. Remove the whole function:

```ts
async function fetchRelayCandidateEventsFromRuntime(
  runtime: CoordinatorReadRuntime,
  filters: readonly RuntimeFilter[],
  options: {
    readonly overlay?: RelayReadOverlayOptions;
    readonly rejectOnError?: boolean;
    readonly timeoutMs?: number;
    readonly scope: string;
  }
): Promise<Array<{ event: unknown; relayUrl: string }>> {
  // Remove this function body and signature.
}
```

- [ ] **Step 4: Run focused public read tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/public-read-cutover.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run gateway and runtime package tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-gateway.contract.test.ts packages/resonote/src/public-read-cutover.contract.test.ts
pnpm run test:auftakt:resonote
```

Expected: both commands PASS.

- [ ] **Step 6: Commit ordinary read gateway routing**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/public-read-cutover.contract.test.ts
git commit -m "feat(auftakt): verify ordinary reads through relay gateway"
```

---

### Task 4: Update Strict Audit Proof Gate

**Files:**

- Modify: `scripts/check-auftakt-strict-goal-audit.ts`
- Modify: `scripts/check-auftakt-strict-goal-audit.test.ts`
- Modify: `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`

- [ ] **Step 1: Add failing strict audit test data**

In `scripts/check-auftakt-strict-goal-audit.test.ts`, add this line to `validAuditText` after the sync cursor evidence sentence:

```text
Ordinary read capability verification now routes latest and backward coordinator reads through negentropy-first RelayGateway verification with REQ fallback.
```

Add these proof file entries to `validRequiredProofFiles`:

```ts
(file(
  'packages/resonote/src/public-read-cutover.contract.test.ts',
  'attempts negentropy before ordinary latest REQ verification\nuses capability-aware gateway for backward event reads'
),
  file(
    'packages/resonote/src/runtime.ts',
    'createOrdinaryReadRelayGateway\nverifyOrdinaryReadRelayCandidates'
  ));
```

- [ ] **Step 2: Add failing strict audit requirement test**

Add this test after `requires sync cursor incremental repair implementation proof`:

```ts
it('requires ordinary read capability verification implementation proof', () => {
  const result = checkStrictGoalAudit([
    file(
      STRICT_GOAL_AUDIT_PATH,
      validAuditText.replace(
        'Ordinary read capability verification now routes latest and backward coordinator reads through negentropy-first RelayGateway verification with REQ fallback.',
        'Ordinary read capability evidence removed.'
      )
    ),
    ...validRequiredProofFiles
  ]);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    `${STRICT_GOAL_AUDIT_PATH} is missing ordinary read capability verification implementation evidence`
  );
});
```

- [ ] **Step 3: Run strict audit script tests and verify failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: FAIL. The checker has no ordinary-read requirement yet.

- [ ] **Step 4: Implement strict audit checker requirements**

In `scripts/check-auftakt-strict-goal-audit.ts`, add these constants after `REQUIRED_SYNC_CURSOR_REPAIR_FILES`:

```ts
const REQUIRED_ORDINARY_READ_CAPABILITY_AUDIT_EVIDENCE =
  'Ordinary read capability verification now routes latest and backward coordinator reads through negentropy-first RelayGateway verification with REQ fallback.';

const REQUIRED_ORDINARY_READ_CAPABILITY_FILES = [
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'createOrdinaryReadRelayGateway',
    description: 'ordinary read relay gateway helper'
  },
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'verifyOrdinaryReadRelayCandidates',
    description: 'ordinary read coordinator gateway verifier'
  },
  {
    path: 'packages/resonote/src/public-read-cutover.contract.test.ts',
    text: 'attempts negentropy before ordinary latest REQ verification',
    description: 'latest ordinary read negentropy contract'
  },
  {
    path: 'packages/resonote/src/public-read-cutover.contract.test.ts',
    text: 'uses capability-aware gateway for backward event reads',
    description: 'backward ordinary read gateway contract'
  }
];
```

In `checkStrictGoalAudit()`, add this evidence check after the sync cursor evidence check:

```ts
if (!strictAudit.text.includes(REQUIRED_ORDINARY_READ_CAPABILITY_AUDIT_EVIDENCE)) {
  errors.push(
    `${strictAudit.path} is missing ordinary read capability verification implementation evidence`
  );
}
```

Add this file loop after the sync cursor proof file loop:

```ts
for (const required of REQUIRED_ORDINARY_READ_CAPABILITY_FILES) {
  const text = findFileText(files, required.path);
  if (text === null) {
    errors.push(`${required.path} is missing for strict ordinary read capability audit`);
    continue;
  }
  if (!text.includes(required.text)) {
    errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
  }
}
```

Add the public read contract test to `collectFiles()`:

```ts
    'packages/resonote/src/public-read-cutover.contract.test.ts',
```

- [ ] **Step 5: Update the strict goal gap audit document**

In `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`, add this exact sentence to the `rx-nostr-like reconnect and REQ optimization` evidence or the `Verification` section:

```md
Ordinary read capability verification now routes latest and backward coordinator reads through negentropy-first RelayGateway verification with REQ fallback.
```

Change follow-up candidate 1 from:

```md
1. Capability-aware ordinary read verification.
```

to:

```md
1. Capability-aware ordinary read verification. `Implemented in this slice; keep ordinary read gateway regression gates active.`
```

- [ ] **Step 6: Run strict audit focused tests and gate**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
pnpm run check:auftakt:strict-goal-audit
```

Expected: both commands PASS.

- [ ] **Step 7: Commit strict audit proof**

Run:

```bash
git add scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts docs/auftakt/2026-04-26-strict-goal-gap-audit.md
git commit -m "test(auftakt): gate ordinary read capability proof"
```

---

### Task 5: Final Verification

**Files:**

- Read: all changed files
- No source edits unless a verification command exposes a concrete defect

- [ ] **Step 1: Run focused regression suite**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-gateway.contract.test.ts packages/resonote/src/public-read-cutover.contract.test.ts scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Auftakt package tests and strict gates**

Run:

```bash
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-goal-audit
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: all commands PASS.

- [ ] **Step 3: Run package-wide tests**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 4: Inspect final git state**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: only known unrelated dirty files remain outside this slice; recent commits include the gateway fallback, ordinary read gateway routing, and strict proof commits.
