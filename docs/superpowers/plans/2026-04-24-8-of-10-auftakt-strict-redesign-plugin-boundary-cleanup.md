# Auftakt Plugin Boundary Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure plugins receive only coordinator-safe handles, generic built-ins are separated from Resonote-only flows, and no plugin can bypass verification, quarantine, relay hints, or materialized visibility.

**Architecture:** Keep generic read models in plugin modules and keep Resonote-specific content/comment flows as `@auftakt/resonote` facades that compose generic read models. Plugin API is versioned and transactional.

**Tech Stack:** TypeScript, Vitest, `@auftakt/core`, `@auftakt/resonote`

---

## File Structure

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/plugins/built-in-plugins.ts`
- Create: `packages/resonote/src/plugins/resonote-flows.ts`
- Modify: `packages/resonote/src/plugin-isolation.contract.test.ts`
- Modify: `packages/resonote/src/built-in-plugins.contract.test.ts`

### Task 1: Add Safe Plugin Handle Contract

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/plugin-isolation.contract.test.ts`

- [ ] **Step 1: Write failing safe-handle test**

```ts
it('does not expose raw relay or raw storage handles to plugins', async () => {
  const observedKeys: string[][] = [];
  const coordinator = createResonoteCoordinator({
    runtime: fakeRuntime(),
    cachedFetchByIdRuntime: fakeCachedFetchByIdRuntime(),
    cachedLatestRuntime: fakeCachedLatestRuntime(),
    publishTransportRuntime: fakePublishTransportRuntime(),
    pendingPublishQueueRuntime: fakePendingQueueRuntime(),
    relayStatusRuntime: fakeRelayStatusRuntime()
  });

  await coordinator.registerPlugin({
    name: 'inspectPluginApi',
    apiVersion: 'v1',
    setup(api) {
      observedKeys.push(Object.keys(api).sort());
    }
  });

  expect(observedKeys[0]).toEqual([
    'apiVersion',
    'registerFlow',
    'registerProjection',
    'registerReadModel'
  ]);
  expect(observedKeys[0]).not.toContain('getRxNostr');
  expect(observedKeys[0]).not.toContain('getEventsDB');
});
```

- [ ] **Step 2: Run test and confirm current state**

Run: `pnpm exec vitest run packages/resonote/src/plugin-isolation.contract.test.ts`  
Expected: PASS if current API is safe; FAIL if raw handles are exposed.

- [ ] **Step 3: Tighten plugin API type**

Make `ResonoteCoordinatorPluginApi` contain only:

```ts
readonly apiVersion: ResonoteCoordinatorPluginApiVersion;
registerProjection(definition: ProjectionDefinition): void;
registerReadModel<TReadModel>(name: string, readModel: TReadModel): void;
registerFlow<TFlow>(name: string, flow: TFlow): void;
```

Do not add coordinator internals directly. Future safe handles should be explicit read-only wrappers.

- [ ] **Step 4: Run plugin isolation tests**

Run: `pnpm exec vitest run packages/resonote/src/plugin-isolation.contract.test.ts packages/resonote/src/public-api.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/plugin-isolation.contract.test.ts
git commit -m "test: lock safe plugin api boundary"
```

### Task 2: Move Resonote-Only Flow Names

**Files:**

- Modify: `packages/resonote/src/plugins/built-in-plugins.ts`
- Create: `packages/resonote/src/plugins/resonote-flows.ts`
- Modify: `packages/resonote/src/built-in-plugins.contract.test.ts`

- [ ] **Step 1: Write failing flow ownership test**

```ts
import { COMMENTS_FLOW, CONTENT_RESOLUTION_FLOW } from './plugins/resonote-flows.js';

it('keeps Resonote-only flow constants outside generic built-ins', () => {
  expect(COMMENTS_FLOW).toBe('resonoteCommentsFlow');
  expect(CONTENT_RESOLUTION_FLOW).toBe('resonoteContentResolution');
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/resonote/src/built-in-plugins.contract.test.ts`  
Expected: FAIL until constants move and names change.

- [ ] **Step 3: Create `resonote-flows.ts`**

```ts
import type { ResonoteCoordinatorPlugin } from '../runtime.js';
import type { CommentsFlow, ContentResolutionFlow } from './built-in-plugins.js';

export const COMMENTS_FLOW = 'resonoteCommentsFlow';
export const CONTENT_RESOLUTION_FLOW = 'resonoteContentResolution';

export function createResonoteCommentsFlowPlugin(flow: CommentsFlow): ResonoteCoordinatorPlugin {
  return {
    name: 'resonoteCommentsFlowPlugin',
    apiVersion: 'v1',
    setup: (api) => api.registerFlow(COMMENTS_FLOW, flow)
  };
}

export function createResonoteContentResolutionFlowPlugin(
  flow: ContentResolutionFlow
): ResonoteCoordinatorPlugin {
  return {
    name: 'resonoteContentResolutionFlowPlugin',
    apiVersion: 'v1',
    setup: (api) => api.registerFlow(CONTENT_RESOLUTION_FLOW, flow)
  };
}
```

- [ ] **Step 4: Remove Resonote-only constants from generic file**

In `built-in-plugins.ts`, keep generic plugin factories and shared interfaces. Remove or re-export only through `resonote-flows.ts` if package callers still need old imports during migration.

- [ ] **Step 5: Update runtime registration**

In `runtime.ts`, use:

```ts
createResonoteCommentsFlowPlugin({ ... })
createResonoteContentResolutionFlowPlugin({ ... })
```

- [ ] **Step 6: Run built-in tests**

Run: `pnpm exec vitest run packages/resonote/src/built-in-plugins.contract.test.ts packages/resonote/src/public-api.contract.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/resonote/src/plugins/built-in-plugins.ts packages/resonote/src/plugins/resonote-flows.ts packages/resonote/src/runtime.ts packages/resonote/src/built-in-plugins.contract.test.ts
git commit -m "refactor: separate resonote-only plugin flows"
```

### Task 3: Add Read-Only Relay Metrics Model

**Files:**

- Modify: `packages/resonote/src/plugins/built-in-plugins.ts`
- Modify: `packages/resonote/src/built-in-plugins.contract.test.ts`

- [ ] **Step 1: Add failing read-only model test**

```ts
it('registers relay metrics as a read-only model', () => {
  const model = {
    snapshot: vi.fn(() => [{ relayUrl: 'wss://relay.example', score: 1 }])
  };
  const plugin = createRelayMetricsPlugin(model);
  const registered: Record<string, unknown> = {};

  plugin.setup({
    apiVersion: 'v1',
    registerProjection: vi.fn(),
    registerFlow: vi.fn(),
    registerReadModel(name, value) {
      registered[name] = value;
    }
  });

  expect(registered.relayMetrics).toBe(model);
  expect(Object.keys(model)).toEqual(['snapshot']);
});
```

- [ ] **Step 2: Implement read-only model factory**

```ts
export const RELAY_METRICS_READ_MODEL = 'relayMetrics';

export interface RelayMetricsReadModel {
  snapshot(): Array<{ relayUrl: string; score: number }>;
}

export function createRelayMetricsPlugin(model: RelayMetricsReadModel): ResonoteCoordinatorPlugin {
  return {
    name: 'relayMetricsPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerReadModel(RELAY_METRICS_READ_MODEL, model);
    }
  };
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm exec vitest run packages/resonote/src/built-in-plugins.contract.test.ts`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/resonote/src/plugins/built-in-plugins.ts packages/resonote/src/built-in-plugins.contract.test.ts
git commit -m "feat: add read-only relay metrics plugin"
```
