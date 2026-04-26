# Auftakt Plugin Model API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add coordinator-mediated model handles to the v1 plugin API without exposing raw storage or transport handles.

**Architecture:** Extend the existing `ResonoteCoordinatorPluginApi` with a nested `models` namespace backed by the same entity handle factories already used by the coordinator. Keep package-root value exports unchanged, update plugin contracts to prove model convenience, and guard the strict audit with plugin model API evidence.

**Tech Stack:** TypeScript, Vitest, Auftakt workspace packages, Resonote coordinator runtime, existing strict audit scripts.

---

## File Structure

- Modify `packages/resonote/src/plugin-api.contract.test.ts`
  - Responsibility: package plugin API contract. Add tests for `api.models`, type export source, and plugin read models built from model handles.
- Modify `packages/resonote/src/plugin-isolation.contract.test.ts`
  - Responsibility: plugin isolation proof. Update expected API shape and prove `models` contains only high-level model handle factories.
- Modify `packages/resonote/src/runtime.ts`
  - Responsibility: coordinator runtime and plugin registration. Add `ResonoteCoordinatorPluginModels`, pass model handles into plugin setup, and keep registration failure isolation.
- Modify `packages/resonote/src/index.ts`
  - Responsibility: package root type exports. Export the new plugin model API type without adding value factories.
- Modify `scripts/check-auftakt-strict-goal-audit.test.ts`
  - Responsibility: strict audit checker regression coverage for plugin model API evidence.
- Modify `scripts/check-auftakt-strict-goal-audit.ts`
  - Responsibility: require plugin model API runtime and test proof.
- Modify `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`
  - Responsibility: human-readable strict goal gap audit status and verification evidence.

---

### Task 1: Add Plugin Model API Contract Tests

**Files:**

- Modify: `packages/resonote/src/plugin-api.contract.test.ts`
- Modify: `packages/resonote/src/plugin-isolation.contract.test.ts`

- [ ] **Step 1: Extend the plugin API contract test imports**

In `packages/resonote/src/plugin-api.contract.test.ts`, replace the imports with:

```ts
import {
  defineProjection,
  reduceReadSettlement,
  type ReadSettlement,
  type StoredEvent
} from '@auftakt/core';
import {
  createResonoteCoordinator,
  registerPlugin,
  RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
  type ResonoteCoordinatorPluginModels
} from '@auftakt/resonote';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 2: Add event and settlement helpers**

In `packages/resonote/src/plugin-api.contract.test.ts`, add these helpers after `const packageIndexPath = resolve(currentDir, 'index.ts');`:

```ts
const LOCAL_SETTLEMENT = reduceReadSettlement({
  localSettled: true,
  relaySettled: true,
  relayRequired: false,
  localHitProvenance: 'store'
});

function makeEvent(id: string, overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id,
    pubkey: 'pubkey'.padEnd(64, '0'),
    created_at: 1,
    kind: 1,
    tags: [],
    content: '',
    ...overrides
  };
}
```

- [ ] **Step 3: Extend the plugin coordinator fixture**

In `packages/resonote/src/plugin-api.contract.test.ts`, replace `function createTestCoordinator()` with:

```ts
function createTestCoordinator(
  options: {
    readonly read?: (
      filters: readonly Record<string, unknown>[],
      options: {
        readonly cacheOnly?: boolean;
        readonly timeoutMs?: number;
        readonly rejectOnError?: boolean;
      },
      temporaryRelays: readonly string[]
    ) => Promise<{
      readonly events: readonly StoredEvent[];
      readonly settlement: ReadSettlement;
    }>;
  } = {}
) {
  const read =
    options.read ??
    vi.fn(async () => ({
      events: [],
      settlement: LOCAL_SETTLEMENT
    }));

  return createResonoteCoordinator({
    runtime: {
      fetchLatestEvent: async () => null,
      getEventsDB: async () => ({
        getByPubkeyAndKind: async () => null,
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async () => null,
        getByTagValue: async () => [],
        getById: async () => null,
        getAllByKind: async () => [],
        listNegentropyEventRefs: async () => [],
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async () => ({ stored: true, emissions: [] })
      }),
      getRxNostr: async () => ({
        use: () => ({
          subscribe: () => ({ unsubscribe() {} })
        })
      }),
      createRxBackwardReq: () => ({ emit() {}, over() {} }),
      createRxForwardReq: () => ({ emit() {}, over() {} }),
      uniq: () => ({}) as unknown,
      merge: () => ({}) as unknown,
      getRelayConnectionState: async () => null,
      observeRelayConnectionStates: async () => ({ unsubscribe() {} })
    },
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: {
      useCachedLatest: () => null
    },
    publishTransportRuntime: {
      castSigned: async () => {}
    },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    },
    entityHandleRuntime: {
      read,
      snapshotRelaySet: async (subject) => ({
        subject,
        readRelays: ['wss://default.example/'],
        writeRelays: [],
        temporaryRelays: [],
        diagnostics: []
      })
    }
  });
}
```

- [ ] **Step 4: Update plugin API shape assertions**

In `packages/resonote/src/plugin-api.contract.test.ts`, update the first contract test body to include the new type source proof:

```ts
expect(source).toMatch(/\bResonoteCoordinatorPluginModels\b/);
```

In the `limits plugin api capabilities to versioned registration methods` test, add a model type assertion before registering the plugin:

```ts
let observedModels: ResonoteCoordinatorPluginModels | null = null;
```

Inside plugin setup, record the model namespace:

```ts
observedModels = api.models;
```

Replace the final `apiKeys` expectation with:

```ts
expect(apiKeys).toEqual([
  'apiVersion',
  'models',
  'registerFlow',
  'registerProjection',
  'registerReadModel'
]);
expect(Object.keys(observedModels ?? {}).sort()).toEqual([
  'getAddressable',
  'getEvent',
  'getRelayHints',
  'getRelaySet',
  'getUser'
]);
```

- [ ] **Step 5: Add plugin read model convenience test**

Add this test after `limits plugin api capabilities to versioned registration methods` in `packages/resonote/src/plugin-api.contract.test.ts`:

```ts
it('lets plugins register read models backed by coordinator model handles', async () => {
  const event = makeEvent('f'.repeat(64), { content: 'from plugin model api' });
  const read = vi.fn(async () => ({
    events: [event],
    settlement: LOCAL_SETTLEMENT
  }));
  const coordinator = createTestCoordinator({ read });
  let model: { fetch(): Promise<unknown> } | null = null;

  const registration = await registerPlugin(coordinator, {
    name: 'model-plugin',
    apiVersion: 'v1',
    setup(api) {
      const handle = api.models.getEvent({
        id: event.id,
        relayHints: ['wss://model.example', 'not a relay']
      });
      model = {
        fetch: () => handle.fetch({ timeoutMs: 250 })
      };
      api.registerReadModel('model.event', model);
    }
  });

  expect(registration.enabled).toBe(true);
  if (!model) throw new Error('Plugin read model was not registered');

  const result = await model.fetch();

  expect(read).toHaveBeenCalledWith([{ ids: [event.id] }], { timeoutMs: 250 }, [
    'wss://model.example/'
  ]);
  expect(result).toMatchObject({
    value: event,
    sourceEvent: event,
    state: 'local'
  });
});
```

- [ ] **Step 6: Update plugin isolation expected API shape**

In `packages/resonote/src/plugin-isolation.contract.test.ts`, update `does not expose raw relay or raw storage handles to plugins`:

```ts
it('does not expose raw relay or raw storage handles to plugins', async () => {
  const observedKeys: string[][] = [];
  const observedModelKeys: string[][] = [];
  const coordinator = createTestCoordinator();

  await coordinator.registerPlugin({
    name: 'inspectPluginApi',
    apiVersion: 'v1',
    setup(api) {
      observedKeys.push(Object.keys(api).sort());
      observedModelKeys.push(Object.keys(api.models).sort());
    }
  });

  expect(observedKeys[0]).toEqual([
    'apiVersion',
    'models',
    'registerFlow',
    'registerProjection',
    'registerReadModel'
  ]);
  expect(observedModelKeys[0]).toEqual([
    'getAddressable',
    'getEvent',
    'getRelayHints',
    'getRelaySet',
    'getUser'
  ]);
  expect(observedKeys[0]).not.toContain('getRxNostr');
  expect(observedKeys[0]).not.toContain('getEventsDB');
  expect(observedKeys[0]).not.toContain('getEvent');
  expect(observedKeys[0]).not.toContain('getUser');
  expect(observedKeys[0]).not.toContain('getAddressable');
  expect(observedKeys[0]).not.toContain('getRelaySet');
  expect(observedKeys[0]).not.toContain('getRelayHints');
  expect(observedKeys[0]).not.toContain('openEventsDb');
  expect(observedModelKeys[0]).not.toContain('getRxNostr');
  expect(observedModelKeys[0]).not.toContain('getEventsDB');
  expect(observedModelKeys[0]).not.toContain('openEventsDb');
  expect(observedModelKeys[0]).not.toContain('materializerQueue');
  expect(observedModelKeys[0]).not.toContain('relayGateway');
});
```

In `provides plugins only registration functions and no coordinator handles`, replace the setup assertion with:

```ts
      setup(api) {
        expect(Object.keys(api).sort()).toEqual([
          'apiVersion',
          'models',
          'registerFlow',
          'registerProjection',
          'registerReadModel'
        ]);
        expect(Object.keys(api.models).sort()).toEqual([
          'getAddressable',
          'getEvent',
          'getRelayHints',
          'getRelaySet',
          'getUser'
        ]);
        for (const key of forbiddenKeys) {
          expect(api).not.toHaveProperty(key);
        }
        const rawModelForbiddenKeys = [
          'getRxNostr',
          'createRxBackwardReq',
          'createRxForwardReq',
          'getEventsDB',
          'openEventsDb',
          'materializerQueue',
          'relayGateway'
        ];
        for (const key of rawModelForbiddenKeys) {
          expect(api.models).not.toHaveProperty(key);
        }
      }
```

- [ ] **Step 7: Run plugin tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/plugin-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts
```

Expected: FAIL. Failures mention missing `api.models`, missing `ResonoteCoordinatorPluginModels`, or old plugin API key shape.

---

### Task 2: Implement Plugin Model Namespace

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/index.ts`
- Test: `packages/resonote/src/plugin-api.contract.test.ts`
- Test: `packages/resonote/src/plugin-isolation.contract.test.ts`

- [ ] **Step 1: Add plugin model API types**

In `packages/resonote/src/runtime.ts`, add this interface after `export type ResonoteCoordinatorPluginApiVersion = 'v1';`:

```ts
export interface ResonoteCoordinatorPluginModels {
  getEvent(input: EventHandleInput): EventHandle;
  getUser(input: UserHandleInput): UserHandle;
  getAddressable(input: AddressableHandleInput): AddressableHandle;
  getRelaySet(subject: RelaySetSubject): RelaySetHandle;
  getRelayHints(eventId: string): RelayHintsHandle;
}
```

Then update `ResonoteCoordinatorPluginApi` to include:

```ts
  readonly models: ResonoteCoordinatorPluginModels;
```

The full interface becomes:

```ts
export interface ResonoteCoordinatorPluginApi {
  readonly apiVersion: ResonoteCoordinatorPluginApiVersion;
  readonly models: ResonoteCoordinatorPluginModels;
  registerProjection(definition: ProjectionDefinition): void;
  registerReadModel<TReadModel>(name: string, readModel: TReadModel): void;
  registerFlow<TFlow>(name: string, flow: TFlow): void;
}
```

- [ ] **Step 2: Pass models into plugin registration API creation**

In `packages/resonote/src/runtime.ts`, replace `createPluginRegistrationApi()` with:

```ts
function createPluginRegistrationApi(
  pending: PendingPluginRegistrations,
  models: ResonoteCoordinatorPluginModels
): ResonoteCoordinatorPluginApi {
  return {
    apiVersion: RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
    models,
    registerProjection(definition) {
      pending.projections.push(definition);
    },
    registerReadModel(name, readModel) {
      pending.readModels.push({ name, value: readModel });
    },
    registerFlow(name, flow) {
      pending.flows.push({ name, value: flow });
    }
  };
}
```

- [ ] **Step 3: Create entity handles before plugin registration functions**

In `createResonoteCoordinator()` in `packages/resonote/src/runtime.ts`, add this block immediately after `const relayCapabilityRegistry = createRelayCapabilityRegistry(...)` and before `const registerPlugin = async (...)`:

```ts
const entityHandles = createEntityHandleFactories({
  read:
    entityHandleRuntime?.read ??
    (async (filters, options, temporaryRelays) => {
      const resolvedOptions = await resolveReadOptions(
        coordinatorReadRuntime,
        filters,
        {
          timeoutMs: options.timeoutMs,
          rejectOnError: options.rejectOnError
        },
        'read',
        relaySelectionPolicy,
        temporaryRelays
      );
      const coordinator = createRuntimeEventCoordinator(coordinatorReadRuntime, resolvedOptions);
      return coordinator.read(filters, {
        policy: options.cacheOnly === true ? 'cacheOnly' : 'localFirst'
      });
    }),
  isDeleted:
    entityHandleRuntime?.isDeleted ??
    (async (id, pubkey) => {
      const db = await runtime.getEventsDB();
      return (await db.isDeleted?.(id, pubkey)) === true;
    }),
  openStore: () => runtime.getEventsDB(),
  snapshotRelaySet:
    entityHandleRuntime?.snapshotRelaySet ??
    (async (subject) => {
      const candidates = await buildRelaySetCandidates(runtime, subject);
      return buildRelaySetSnapshot({
        subject,
        policy: relaySelectionPolicy,
        candidates
      });
    })
});
```

Remove the duplicate `const entityHandles = createEntityHandleFactories({ ... });` block that currently appears after built-in plugin registration and before `const publishSignedEventFromCoordinator = async (...)`.

- [ ] **Step 4: Wire plugin setup to `entityHandles`**

In `packages/resonote/src/runtime.ts`, update both plugin setup calls:

```ts
await plugin.setup(createPluginRegistrationApi(pending, entityHandles));
```

and:

```ts
const setupResult = plugin.setup(createPluginRegistrationApi(pending, entityHandles));
```

- [ ] **Step 5: Export the plugin model type from the package root**

In `packages/resonote/src/index.ts`, add `ResonoteCoordinatorPluginModels` to the type export block:

```ts
  ResonoteCoordinatorPluginModels,
```

Place it next to the existing plugin API type exports:

```ts
  ResonoteCoordinatorPlugin,
  ResonoteCoordinatorPluginApi,
  ResonoteCoordinatorPluginApiVersion,
  ResonoteCoordinatorPluginModels,
  ResonoteCoordinatorPluginRegistration,
```

- [ ] **Step 6: Run focused plugin tests and verify pass**

Run:

```bash
pnpm exec vitest run packages/resonote/src/plugin-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/public-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit plugin model API implementation**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/index.ts packages/resonote/src/plugin-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts
git commit -m "feat(auftakt): add plugin model api"
```

---

### Task 3: Gate Plugin Model API In Strict Audit

**Files:**

- Modify: `scripts/check-auftakt-strict-goal-audit.test.ts`
- Modify: `scripts/check-auftakt-strict-goal-audit.ts`
- Modify: `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`

- [ ] **Step 1: Add failing strict audit checker tests**

In `scripts/check-auftakt-strict-goal-audit.test.ts`, add this sentence to `validAuditText` after the broader outbox evidence:

```ts
Plugin model API now gives extensions coordinator-mediated event, user, addressable, relay-set, and relay-hint handles without exposing raw storage or transport handles.
```

Add these proof files to `validRequiredProofFiles`:

```ts
(file(
  'packages/resonote/src/runtime.ts',
  'ResonoteCoordinatorPluginModels\nreadonly models: ResonoteCoordinatorPluginModels\ncreatePluginRegistrationApi(pending, entityHandles)'
),
  file(
    'packages/resonote/src/plugin-api.contract.test.ts',
    'lets plugins register read models backed by coordinator model handles\nResonoteCoordinatorPluginModels'
  ),
  file(
    'packages/resonote/src/plugin-isolation.contract.test.ts',
    'getAddressable\ngetEvent\ngetRelayHints\ngetRelaySet\ngetUser'
  ));
```

Add this test after the broader outbox checker test:

```ts
it('requires plugin model api implementation proof', () => {
  const result = checkStrictGoalAudit([
    file(
      STRICT_GOAL_AUDIT_PATH,
      validAuditText.replace(
        'Plugin model API now gives extensions coordinator-mediated event, user, addressable, relay-set, and relay-hint handles without exposing raw storage or transport handles.',
        'Plugin model API evidence removed.'
      )
    ),
    ...validRequiredProofFiles
  ]);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    `${STRICT_GOAL_AUDIT_PATH} is missing plugin model API implementation evidence`
  );
});
```

- [ ] **Step 2: Run the strict audit test and verify failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: FAIL. The new plugin model API evidence test passes only after the checker requires that evidence.

- [ ] **Step 3: Require plugin model API evidence in the checker**

In `scripts/check-auftakt-strict-goal-audit.ts`, add this constant after `REQUIRED_BROADER_OUTBOX_FILES`:

```ts
const REQUIRED_PLUGIN_MODEL_API_AUDIT_EVIDENCE =
  'Plugin model API now gives extensions coordinator-mediated event, user, addressable, relay-set, and relay-hint handles without exposing raw storage or transport handles.';

const REQUIRED_PLUGIN_MODEL_API_FILES = [
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'ResonoteCoordinatorPluginModels',
    description: 'plugin model API type'
  },
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'readonly models: ResonoteCoordinatorPluginModels',
    description: 'plugin model API handle wiring'
  },
  {
    path: 'packages/resonote/src/runtime.ts',
    text: 'createPluginRegistrationApi(pending, entityHandles)',
    description: 'plugin registration model API injection'
  },
  {
    path: 'packages/resonote/src/plugin-api.contract.test.ts',
    text: 'lets plugins register read models backed by coordinator model handles',
    description: 'plugin model API read model contract'
  },
  {
    path: 'packages/resonote/src/plugin-api.contract.test.ts',
    text: 'ResonoteCoordinatorPluginModels',
    description: 'plugin model API package type contract'
  },
  {
    path: 'packages/resonote/src/plugin-isolation.contract.test.ts',
    text: 'getAddressable',
    description: 'plugin model API high-level addressable factory contract'
  },
  {
    path: 'packages/resonote/src/plugin-isolation.contract.test.ts',
    text: 'materializerQueue',
    description: 'plugin model API raw-handle isolation contract'
  }
];
```

Add this evidence check after the broader outbox evidence check:

```ts
if (!strictAudit.text.includes(REQUIRED_PLUGIN_MODEL_API_AUDIT_EVIDENCE)) {
  errors.push(`${strictAudit.path} is missing plugin model API implementation evidence`);
}
```

Add this proof loop after the broader outbox proof loop:

```ts
for (const required of REQUIRED_PLUGIN_MODEL_API_FILES) {
  const text = findFileText(files, required.path);
  if (text === null) {
    errors.push(`${required.path} is missing for strict plugin model API audit`);
    continue;
  }
  if (!text.includes(required.text)) {
    errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
  }
}
```

Update `collectFiles()` to include:

```ts
('packages/resonote/src/plugin-api.contract.test.ts',
  'packages/resonote/src/plugin-isolation.contract.test.ts');
```

- [ ] **Step 4: Update strict gap audit documentation**

In `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`, replace follow-up candidate 5 with:

```md
5. NDK-like model expansion. `Implemented in this slice for plugin model convenience; keep plugin model API regression gates active.`
```

Add this verification bullet after the broader outbox bullet:

```md
- Plugin model API now gives extensions coordinator-mediated event, user, addressable, relay-set, and relay-hint handles without exposing raw storage or transport handles.
```

- [ ] **Step 5: Run the strict audit tests and checker**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
pnpm run check:auftakt:strict-goal-audit
```

Expected: PASS.

- [ ] **Step 6: Commit strict audit gate**

Run:

```bash
git add scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts docs/auftakt/2026-04-26-strict-goal-gap-audit.md
git commit -m "test(auftakt): gate plugin model api proof"
```

---

### Task 4: Run Completion Verification

**Files:**

- No source edits in this task.

- [ ] **Step 1: Run focused plugin and audit tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/plugin-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/public-api.contract.test.ts scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Resonote package tests**

Run:

```bash
pnpm run test:auftakt:resonote
```

Expected: PASS.

- [ ] **Step 3: Run strict gates**

Run:

```bash
pnpm run check:auftakt:strict-goal-audit
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: PASS.

- [ ] **Step 4: Run package-wide tests**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 5: Inspect final branch state**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: only pre-existing unrelated dirty files remain outside this slice, and the latest commits include:

```text
test(auftakt): gate plugin model api proof
feat(auftakt): add plugin model api
docs(auftakt): design plugin model api
```
