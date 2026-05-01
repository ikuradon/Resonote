# Auftakt REQ Planner and Relay Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coordinator-owned request planner and relay gateway with NIP-11 capability limits, fair queues, reconnect replay, and negentropy-first verification with ordinary REQ fallback.

**Architecture:** Keep `@auftakt/core` responsible for pure planning and relay-session primitives. Keep `@auftakt/resonote` responsible for choosing policies and applying materialized deltas.

**Tech Stack:** TypeScript, Vitest, RxJS, `@auftakt/core`, `@auftakt/resonote`

---

## File Structure

- Modify: `packages/core/src/request-planning.ts`
- Modify: `packages/core/src/request-planning.contract.test.ts`
- Modify: `packages/core/src/relay-session.ts`
- Modify: `packages/core/src/relay-session.contract.test.ts`
- Create: `packages/resonote/src/relay-gateway.ts`
- Create: `packages/resonote/src/relay-gateway.contract.test.ts`

### Task 1: Add NIP-11 Capability Planning

**Files:**

- Modify: `packages/core/src/request-planning.ts`
- Modify: `packages/core/src/request-planning.contract.test.ts`

- [ ] **Step 1: Write failing capability tests**

```ts
import { buildRequestExecutionPlan } from './request-planning.js';

it('shards filters by relay max_filters capability', () => {
  const plan = buildRequestExecutionPlan(
    {
      mode: 'backward',
      filters: [{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }],
      overlay: { relays: ['wss://relay.example'] }
    },
    { maxFiltersPerShard: 2, maxSubscriptions: 1 }
  );

  expect(plan.shards).toHaveLength(2);
  expect(plan.capabilities.maxSubscriptions).toBe(1);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm exec vitest run packages/core/src/request-planning.contract.test.ts`  
Expected: FAIL until `maxSubscriptions` is accepted and returned.

- [ ] **Step 3: Extend capability types**

```ts
export interface RequestOptimizerCapabilities {
  readonly maxFiltersPerShard?: number | null;
  readonly maxSubscriptions?: number | null;
}

export interface OptimizedLogicalRequestPlan {
  readonly descriptor: LogicalRequestDescriptor;
  readonly requestKey: RequestKey;
  readonly logicalKey: string;
  readonly shards: readonly OptimizedRequestShard[];
  readonly capabilities: RequestOptimizerCapabilities;
}
```

- [ ] **Step 4: Return capabilities from plan**

```ts
return {
  descriptor,
  requestKey,
  logicalKey,
  shards,
  capabilities: {
    maxFiltersPerShard: capabilities.maxFiltersPerShard ?? null,
    maxSubscriptions: capabilities.maxSubscriptions ?? null
  }
};
```

- [ ] **Step 5: Run request planning tests**

Run: `pnpm exec vitest run packages/core/src/request-planning.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/request-planning.ts packages/core/src/request-planning.contract.test.ts
git commit -m "feat: include relay capability limits in request plans"
```

### Task 2: Add Relay Command Queue

**Files:**

- Modify: `packages/core/src/relay-session.ts`
- Modify: `packages/core/src/relay-session.contract.test.ts`

- [ ] **Step 1: Write failing command queue test**

```ts
it('queues REQ commands while relay is reconnecting and flushes after open', async () => {
  const sent: unknown[] = [];
  const session = createRelaySession({
    defaultRelays: ['wss://relay.example'],
    testSocketFactory: () => ({
      readyState: WebSocket.CONNECTING,
      send: (payload: string) => sent.push(JSON.parse(payload)),
      close: vi.fn(),
      addEventListener: vi.fn()
    })
  });

  const req = createBackwardReq({ requestKey: 'rq:v1:test' as never });
  session.use(req).subscribe({});
  req.emit({ kinds: [1] });
  req.over();

  expect(sent).toEqual([]);
  session.__testOpenRelay?.('wss://relay.example');
  expect(sent[0]).toEqual(expect.arrayContaining(['REQ']));
});
```

- [ ] **Step 2: Run relay-session tests and confirm failure**

Run: `pnpm exec vitest run packages/core/src/relay-session.contract.test.ts`  
Expected: FAIL because queued test hooks or queue behavior are missing.

- [ ] **Step 3: Add queue to `RelaySocket`**

```ts
private readonly queue: unknown[] = [];

async send(payload: unknown): Promise<void> {
  if (this.ws?.readyState !== WebSocket.OPEN) {
    this.queue.push(payload);
    await this.connect().catch(() => {});
    return;
  }
  this.ws.send(JSON.stringify(payload));
}

private flushQueue(): void {
  if (this.ws?.readyState !== WebSocket.OPEN) return;
  for (const payload of this.queue.splice(0)) {
    this.ws.send(JSON.stringify(payload));
  }
}
```

Call `flushQueue()` in the `open` event handler after `this.ws = ws`.

- [ ] **Step 4: Enforce known max subscriptions**

In `RelaySession.sendGroupToRelay()`, count active transport sub IDs per relay. If the next shard exceeds known `maxSubscriptions`, leave it queued and retry on EOSE/CLOSED or unsubscribe.

- [ ] **Step 5: Run relay-session tests**

Run: `pnpm exec vitest run packages/core/src/relay-session.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/relay-session.ts packages/core/src/relay-session.contract.test.ts
git commit -m "feat: queue relay commands across reconnect"
```

### Task 3: Add RelayGateway Negentropy-First Verification

**Files:**

- Create: `packages/resonote/src/relay-gateway.ts`
- Create: `packages/resonote/src/relay-gateway.contract.test.ts`

- [ ] **Step 1: Write failing negentropy fallback test**

```ts
import { createRelayGateway } from './relay-gateway.js';

it('falls back to ordinary REQ when negentropy is unsupported', async () => {
  const reqFetch = vi.fn(async () => [
    { id: 'remote', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
  ]);
  const gateway = createRelayGateway({
    requestNegentropySync: vi.fn(async () => ({
      capability: 'unsupported',
      reason: 'relay-error'
    })),
    fetchByReq: reqFetch,
    listLocalRefs: vi.fn(async () => [])
  });

  const result = await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });

  expect(reqFetch).toHaveBeenCalledWith([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });
  expect(result.events).toHaveLength(1);
  expect(result.strategy).toBe('fallback-req');
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `pnpm exec vitest run packages/resonote/src/relay-gateway.contract.test.ts`  
Expected: FAIL because gateway does not exist.

- [ ] **Step 3: Implement gateway**

```ts
export function createRelayGateway(deps: {
  requestNegentropySync(input: {
    relayUrl: string;
    filter: Record<string, unknown>;
    initialMessageHex: string;
  }): Promise<{
    capability: 'supported' | 'unsupported' | 'failed';
    messageHex?: string;
    reason?: string;
  }>;
  fetchByReq(
    filters: Array<Record<string, unknown>>,
    options: { relayUrl: string }
  ): Promise<Array<Record<string, unknown>>>;
  listLocalRefs(
    filters: Array<Record<string, unknown>>
  ): Promise<Array<{ id: string; created_at: number }>>;
}) {
  return {
    async verify(filters: Array<Record<string, unknown>>, options: { relayUrl: string }) {
      const localRefs = await deps.listLocalRefs(filters);
      const negentropy = await deps.requestNegentropySync({
        relayUrl: options.relayUrl,
        filter: filters[0] ?? {},
        initialMessageHex: JSON.stringify(localRefs)
      });

      if (negentropy.capability !== 'supported') {
        const events = await deps.fetchByReq(filters, options);
        return { strategy: 'fallback-req' as const, events };
      }

      return { strategy: 'negentropy' as const, events: [] };
    }
  };
}
```

- [ ] **Step 4: Add supported-relay missing-id fetch test**

```ts
it('uses ordinary REQ for missing ids found by negentropy', async () => {
  const fetchByReq = vi.fn(async () => [
    { id: 'missing', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
  ]);
  const gateway = createRelayGateway({
    requestNegentropySync: vi.fn(async () => ({
      capability: 'supported',
      messageHex: JSON.stringify({ remoteOnlyIds: ['missing'] })
    })),
    fetchByReq,
    listLocalRefs: vi.fn(async () => [])
  });

  await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });
  expect(fetchByReq).toHaveBeenCalledWith([{ ids: ['missing'] }], {
    relayUrl: 'wss://relay.example'
  });
});
```

- [ ] **Step 5: Run gateway tests**

Run: `pnpm exec vitest run packages/resonote/src/relay-gateway.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/resonote/src/relay-gateway.ts packages/resonote/src/relay-gateway.contract.test.ts
git commit -m "feat: add relay gateway verification planner"
```
