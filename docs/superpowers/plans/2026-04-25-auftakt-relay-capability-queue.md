# Auftakt Relay Capability Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable NIP-11 relay capability caching, learned safety bounds, max-filter/max-subscription-aware REQ execution, and separate capability observation APIs.

**Architecture:** `@auftakt/core` owns execution limits, sharding, queueing, runtime queue observation, CLOSED-limit learning, and duplicate event suppression. `@auftakt/adapter-dexie` persists NIP-11 metadata separately from learned safety bounds. `@auftakt/resonote` owns NIP-11 prefetch policy, Dexie hydration, core session synchronization, and the app-facing `snapshotRelayCapabilities()` / `observeRelayCapabilities()` facade.

**Tech Stack:** TypeScript, RxJS `Observable`/`Subject`, Vitest, fake-indexeddb, Dexie, SvelteKit facade modules, existing Auftakt package exports.

---

## File Structure

- Create `packages/core/src/relay-capability.ts`: capability types, effective-limit calculation, CLOSED reason parser, normalized snapshot helpers.
- Modify `packages/core/src/index.ts`: export capability types and helpers.
- Modify `packages/core/src/relay-request.ts`: use `maxFilters` naming while preserving current `maxFiltersPerShard` input compatibility.
- Modify `packages/core/src/relay-session.ts`: accept live relay capability updates, queue shards by `maxSubscriptions`, observe queue state, learn from `CLOSED`, deduplicate event ids per logical consumer.
- Modify `packages/core/src/relay-session.contract.test.ts`: prove queueing, learning, replay, and duplicate suppression.
- Create `packages/core/src/relay-capability.contract.test.ts`: prove effective limit calculation and CLOSED reason parsing.
- Modify `packages/adapter-dexie/src/schema.ts`: add `relay_capabilities` table and record type.
- Modify `packages/adapter-dexie/src/index.ts`: add read/write methods for relay capability records.
- Modify `packages/adapter-dexie/src/schema.contract.test.ts`: include the new table.
- Create `packages/adapter-dexie/src/relay-capabilities.contract.test.ts`: prove TTL fields, learned persistence, and failed-NIP-11 preservation.
- Create `packages/resonote/src/relay-capability-registry.ts`: Dexie-backed registry, NIP-11 fetch normalization, prefetch policy, observation subject, runtime snapshot merge.
- Create `packages/resonote/src/relay-capability-registry.contract.test.ts`: prove TTL, prefetch, learned updates, and normalized packets.
- Modify `packages/resonote/src/runtime.ts`: extend runtime/store interfaces, instantiate the registry, sync capabilities into core session, add coordinator methods.
- Modify `packages/resonote/src/index.ts`: export capability types and methods.
- Modify `src/shared/auftakt/resonote.ts`: expose facade functions.
- Add or modify facade tests under `src/shared/auftakt/` if existing patterns make a focused facade test useful after package tests land.
- Modify docs only if strict closure or NIP matrix checks report a required status update.

## Task 1: Add Core Capability Model

**Files:**

- Create: `packages/core/src/relay-capability.ts`
- Create: `packages/core/src/relay-capability.contract.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing capability model tests**

Create `packages/core/src/relay-capability.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  calculateEffectiveRelayCapability,
  normalizeRelayCapabilitySnapshot,
  parseRelayLimitClosedReason,
  type RelayCapabilityRecord
} from './index.js';

describe('relay capability model', () => {
  it('keeps learned safety bounds when NIP-11 is failed', () => {
    const record: RelayCapabilityRecord = {
      relayUrl: 'wss://relay.example',
      nip11Status: 'failed',
      nip11CheckedAt: 10,
      nip11ExpiresAt: 310,
      supportedNips: [],
      nip11MaxFilters: null,
      nip11MaxSubscriptions: null,
      learnedMaxFilters: 1,
      learnedMaxSubscriptions: 2,
      learnedAt: 20,
      learnedReason: 'CLOSED too many filters',
      updatedAt: 20
    };

    expect(calculateEffectiveRelayCapability(record, 100)).toMatchObject({
      relayUrl: 'wss://relay.example',
      maxFilters: 1,
      maxSubscriptions: 2,
      source: 'learned',
      stale: false
    });
  });

  it('uses the strictest fresh NIP-11, learned, and override limits', () => {
    const record: RelayCapabilityRecord = {
      relayUrl: 'wss://relay.example',
      nip11Status: 'ok',
      nip11CheckedAt: 10,
      nip11ExpiresAt: 3_610,
      supportedNips: [1, 11],
      nip11MaxFilters: 5,
      nip11MaxSubscriptions: 8,
      learnedMaxFilters: 2,
      learnedMaxSubscriptions: null,
      learnedAt: 20,
      learnedReason: 'CLOSED too many filters',
      updatedAt: 20
    };

    expect(
      calculateEffectiveRelayCapability(record, 100, {
        maxFilters: 3,
        maxSubscriptions: 4
      })
    ).toMatchObject({
      maxFilters: 2,
      maxSubscriptions: 4,
      supportedNips: [1, 11],
      source: 'mixed',
      expiresAt: 3_610,
      stale: false
    });
  });

  it('marks expired NIP-11 metadata stale without deleting learned bounds', () => {
    const record: RelayCapabilityRecord = {
      relayUrl: 'wss://relay.example',
      nip11Status: 'ok',
      nip11CheckedAt: 10,
      nip11ExpiresAt: 20,
      supportedNips: [1],
      nip11MaxFilters: 10,
      nip11MaxSubscriptions: 10,
      learnedMaxFilters: 2,
      learnedMaxSubscriptions: null,
      learnedAt: 15,
      learnedReason: 'CLOSED too many filters',
      updatedAt: 15
    };

    expect(calculateEffectiveRelayCapability(record, 30)).toMatchObject({
      maxFilters: 2,
      maxSubscriptions: null,
      source: 'learned',
      expiresAt: 20,
      stale: true
    });
  });

  it('parses CLOSED filter and subscription limit reasons', () => {
    expect(
      parseRelayLimitClosedReason({
        relayUrl: 'wss://relay.example',
        reason: 'too many filters: max_filters=2',
        activeAcceptedSubscriptions: 3
      })
    ).toEqual({
      relayUrl: 'wss://relay.example',
      kind: 'maxFilters',
      value: 2,
      reason: 'too many filters: max_filters=2'
    });

    expect(
      parseRelayLimitClosedReason({
        relayUrl: 'wss://relay.example',
        reason: 'too many subscriptions',
        activeAcceptedSubscriptions: 3
      })
    ).toEqual({
      relayUrl: 'wss://relay.example',
      kind: 'maxSubscriptions',
      value: 3,
      reason: 'too many subscriptions'
    });
  });

  it('normalizes runtime queue state into a public snapshot', () => {
    expect(
      normalizeRelayCapabilitySnapshot({
        relayUrl: 'wss://relay.example',
        maxFilters: null,
        maxSubscriptions: 1,
        supportedNips: [],
        source: 'learned',
        expiresAt: null,
        stale: false,
        queueDepth: 2,
        activeSubscriptions: 1
      })
    ).toEqual({
      url: 'wss://relay.example',
      maxFilters: null,
      maxSubscriptions: 1,
      supportedNips: [],
      source: 'learned',
      expiresAt: null,
      stale: false,
      queueDepth: 2,
      activeSubscriptions: 1
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-capability.contract.test.ts
```

Expected: FAIL with missing exports from `./index.js`.

- [ ] **Step 3: Add the capability model implementation**

Create `packages/core/src/relay-capability.ts`:

```ts
export type RelayCapabilitySource = 'unknown' | 'nip11' | 'learned' | 'mixed' | 'override';
export type RelayCapabilityNip11Status = 'unknown' | 'ok' | 'failed';

export interface RelayCapabilityRecord {
  readonly relayUrl: string;
  readonly nip11Status: RelayCapabilityNip11Status;
  readonly nip11CheckedAt: number | null;
  readonly nip11ExpiresAt: number | null;
  readonly supportedNips: readonly number[];
  readonly nip11MaxFilters: number | null;
  readonly nip11MaxSubscriptions: number | null;
  readonly learnedMaxFilters: number | null;
  readonly learnedMaxSubscriptions: number | null;
  readonly learnedAt: number | null;
  readonly learnedReason: string | null;
  readonly updatedAt: number;
}

export interface RelayCapabilityOverride {
  readonly maxFilters?: number | null;
  readonly maxSubscriptions?: number | null;
}

export interface RelayExecutionCapability {
  readonly relayUrl: string;
  readonly maxFilters: number | null;
  readonly maxSubscriptions: number | null;
  readonly supportedNips: readonly number[];
  readonly source: RelayCapabilitySource;
  readonly expiresAt: number | null;
  readonly stale: boolean;
}

export interface RelayCapabilitySnapshot extends Omit<RelayExecutionCapability, 'relayUrl'> {
  readonly url: string;
  readonly queueDepth: number;
  readonly activeSubscriptions: number;
}

export interface RelayCapabilityPacket {
  readonly from: string;
  readonly capability: RelayCapabilitySnapshot;
}

export interface RelayCapabilityLearningEvent {
  readonly relayUrl: string;
  readonly kind: 'maxFilters' | 'maxSubscriptions';
  readonly value: number;
  readonly reason: string;
}

export interface RelayRuntimeCapabilityState extends RelayExecutionCapability {
  readonly queueDepth: number;
  readonly activeSubscriptions: number;
}

export function calculateEffectiveRelayCapability(
  record: RelayCapabilityRecord | null,
  now: number,
  override: RelayCapabilityOverride = {},
  fallbackRelayUrl = ''
): RelayExecutionCapability {
  const relayUrl = record?.relayUrl ?? fallbackRelayUrl;
  const nip11Fresh =
    record?.nip11Status === 'ok' &&
    typeof record.nip11ExpiresAt === 'number' &&
    record.nip11ExpiresAt > now;
  const stale = Boolean(record?.nip11ExpiresAt && record.nip11ExpiresAt <= now);

  const maxFilters = minNullable(
    nip11Fresh ? record.nip11MaxFilters : null,
    record?.learnedMaxFilters ?? null,
    normalizePositiveInteger(override.maxFilters ?? null)
  );
  const maxSubscriptions = minNullable(
    nip11Fresh ? record.nip11MaxSubscriptions : null,
    record?.learnedMaxSubscriptions ?? null,
    normalizePositiveInteger(override.maxSubscriptions ?? null)
  );
  const source = resolveSource({
    hasFreshNip11:
      nip11Fresh &&
      (record.nip11MaxFilters !== null ||
        record.nip11MaxSubscriptions !== null ||
        record.supportedNips.length > 0),
    hasLearned: Boolean(record?.learnedMaxFilters ?? record?.learnedMaxSubscriptions),
    hasOverride: override.maxFilters != null || override.maxSubscriptions != null
  });

  return {
    relayUrl,
    maxFilters,
    maxSubscriptions,
    supportedNips: nip11Fresh ? [...(record?.supportedNips ?? [])] : [],
    source,
    expiresAt: record?.nip11ExpiresAt ?? null,
    stale
  };
}

export function normalizeRelayCapabilitySnapshot(
  state: RelayRuntimeCapabilityState
): RelayCapabilitySnapshot {
  return {
    url: state.relayUrl,
    maxFilters: state.maxFilters,
    maxSubscriptions: state.maxSubscriptions,
    supportedNips: [...state.supportedNips],
    source: state.source,
    expiresAt: state.expiresAt,
    stale: state.stale,
    queueDepth: state.queueDepth,
    activeSubscriptions: state.activeSubscriptions
  };
}

export function parseRelayLimitClosedReason(input: {
  readonly relayUrl: string;
  readonly reason: string;
  readonly activeAcceptedSubscriptions: number;
}): RelayCapabilityLearningEvent | null {
  const reason = input.reason.trim();
  const lower = reason.toLowerCase();
  if (!lower) return null;

  if (lower.includes('filter')) {
    return {
      relayUrl: input.relayUrl,
      kind: 'maxFilters',
      value: extractFirstPositiveInteger(reason) ?? 1,
      reason
    };
  }

  if (lower.includes('subscription') || lower.includes('too many subs')) {
    return {
      relayUrl: input.relayUrl,
      kind: 'maxSubscriptions',
      value: extractFirstPositiveInteger(reason) ?? Math.max(1, input.activeAcceptedSubscriptions),
      reason
    };
  }

  return null;
}

function minNullable(...values: Array<number | null>): number | null {
  const normalized = values.filter((value): value is number => value !== null);
  if (normalized.length === 0) return null;
  return Math.min(...normalized);
}

function normalizePositiveInteger(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
}

function extractFirstPositiveInteger(value: string): number | null {
  const match = value.match(/\b([1-9][0-9]*)\b/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function resolveSource(input: {
  readonly hasFreshNip11: boolean;
  readonly hasLearned: boolean;
  readonly hasOverride: boolean;
}): RelayCapabilitySource {
  const count = [input.hasFreshNip11, input.hasLearned, input.hasOverride].filter(Boolean).length;
  if (count > 1) return 'mixed';
  if (input.hasOverride) return 'override';
  if (input.hasLearned) return 'learned';
  if (input.hasFreshNip11) return 'nip11';
  return 'unknown';
}
```

Modify `packages/core/src/index.ts` by adding:

```ts
export type {
  RelayCapabilityLearningEvent,
  RelayCapabilityNip11Status,
  RelayCapabilityOverride,
  RelayCapabilityPacket,
  RelayCapabilityRecord,
  RelayCapabilitySnapshot,
  RelayCapabilitySource,
  RelayExecutionCapability,
  RelayRuntimeCapabilityState
} from './relay-capability.js';
export {
  calculateEffectiveRelayCapability,
  normalizeRelayCapabilitySnapshot,
  parseRelayLimitClosedReason
} from './relay-capability.js';
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-capability.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add packages/core/src/relay-capability.ts packages/core/src/relay-capability.contract.test.ts packages/core/src/index.ts
git commit -m "feat(auftakt): add relay capability model"
```

## Task 2: Add Core Max-Subscription Queueing

**Files:**

- Modify: `packages/core/src/relay-session.ts`
- Modify: `packages/core/src/relay-session.contract.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing queueing tests**

Append these tests inside the existing `describe('relay replay request identity contract', ...)` block in `packages/core/src/relay-session.contract.test.ts`:

```ts
it('queues backward shards by max_subscriptions and releases them after EOSE', async () => {
  const session = createRxNostrSession({
    defaultRelays: [RELAY_URL],
    eoseTimeout: 100,
    requestOptimizer: {
      relayCapabilities: {
        [RELAY_URL]: {
          relayUrl: RELAY_URL,
          maxFilters: 1,
          maxSubscriptions: 1,
          supportedNips: [1, 11],
          source: 'nip11',
          expiresAt: 3_600,
          stale: false
        }
      }
    }
  });
  const req = createRxBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      scope: 'contract:max-subscriptions-queue',
      filters: [{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }]
    })
  });

  const sub = session.use(req).subscribe({});
  req.emit([{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }]);
  req.over();

  await waitUntil(() => FakeWebSocket.instances.length > 0);
  const socket = latestSocket();
  socket.open();
  await waitUntil(() => socket.sent.length === 1);

  expect(session.getRelayCapabilitySnapshot(RELAY_URL)).toMatchObject({
    queueDepth: 2,
    activeSubscriptions: 1
  });

  const firstSubId = (socket.sent[0] as [string, string, ...unknown[]])[1];
  socket.message(['EOSE', firstSubId]);
  await waitUntil(() => socket.sent.length === 2);

  expect(session.getRelayCapabilitySnapshot(RELAY_URL)).toMatchObject({
    queueDepth: 1,
    activeSubscriptions: 1
  });

  const secondSubId = (socket.sent[1] as [string, string, ...unknown[]])[1];
  socket.message(['EOSE', secondSubId]);
  await waitUntil(() => socket.sent.length === 3);

  expect(session.getRelayCapabilitySnapshot(RELAY_URL)).toMatchObject({
    queueDepth: 0,
    activeSubscriptions: 1
  });

  sub.unsubscribe();
  session.dispose();
});

it('publishes capability packets when shard queue state changes', async () => {
  const session = createRxNostrSession({
    defaultRelays: [RELAY_URL],
    eoseTimeout: 100,
    requestOptimizer: {
      relayCapabilities: {
        [RELAY_URL]: {
          relayUrl: RELAY_URL,
          maxFilters: 1,
          maxSubscriptions: 1,
          supportedNips: [],
          source: 'learned',
          expiresAt: null,
          stale: false
        }
      }
    }
  });
  const packets: Array<{ queueDepth: number; activeSubscriptions: number }> = [];
  const capabilitySub = session.createRelayCapabilityObservable().subscribe({
    next: (packet) => {
      if (packet.from === RELAY_URL) {
        packets.push({
          queueDepth: packet.capability.queueDepth,
          activeSubscriptions: packet.capability.activeSubscriptions
        });
      }
    }
  });
  const req = createRxBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      scope: 'contract:queue-observation',
      filters: [{ ids: ['a'] }, { ids: ['b'] }]
    })
  });

  const sub = session.use(req).subscribe({});
  req.emit([{ ids: ['a'] }, { ids: ['b'] }]);
  req.over();

  await waitUntil(() => FakeWebSocket.instances.length > 0);
  const socket = latestSocket();
  socket.open();
  await waitUntil(() =>
    packets.some((packet) => packet.queueDepth === 1 && packet.activeSubscriptions === 1)
  );

  const firstSubId = (socket.sent[0] as [string, string, ...unknown[]])[1];
  socket.message(['EOSE', firstSubId]);
  await waitUntil(() =>
    packets.some((packet) => packet.queueDepth === 0 && packet.activeSubscriptions === 1)
  );

  capabilitySub.unsubscribe();
  sub.unsubscribe();
  session.dispose();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-session.contract.test.ts -t "max_subscriptions|capability packets"
```

Expected: FAIL because `relayCapabilities`, `getRelayCapabilitySnapshot()`, and `createRelayCapabilityObservable()` are not implemented.

- [ ] **Step 3: Extend session public types**

In `packages/core/src/relay-session.ts`, extend imports:

```ts
import {
  normalizeRelayCapabilitySnapshot,
  parseRelayLimitClosedReason,
  type RelayCapabilityLearningEvent,
  type RelayCapabilityPacket,
  type RelayCapabilitySnapshot,
  type RelayExecutionCapability,
  type RelayRuntimeCapabilityState
} from './relay-capability.js';
```

Update `RxNostr`:

```ts
  setRelayCapabilities(capabilities: Record<string, RelayExecutionCapability | undefined>): void;
  setRelayCapabilityLearningHandler(
    handler: ((event: RelayCapabilityLearningEvent) => void) | null
  ): void;
  getRelayCapabilitySnapshot(url: string): RelayCapabilitySnapshot;
  createRelayCapabilityObservable(): Observable<RelayCapabilityPacket>;
```

Update `RelayRequestOptimizerOptions`:

```ts
export interface RelayRequestOptimizerOptions {
  readonly defaultMaxFiltersPerRequest?: number;
  readonly relayMaxFiltersPerRequest?: Record<string, number | undefined>;
  readonly relayCapabilities?: Record<string, RelayExecutionCapability | undefined>;
  readonly onCapabilityLearned?: (event: RelayCapabilityLearningEvent) => void;
}
```

Update `ActiveRequestGroup`:

```ts
interface QueuedRelayShard {
  readonly shardKey: string;
  readonly filters: readonly Filter[];
}

interface ActiveRequestGroup {
  readonly groupKey: string;
  readonly mode: 'backward' | 'forward';
  readonly relayUrls: string[];
  readonly plansByRelay: Map<string, OptimizedLogicalRequestPlan>;
  readonly consumers: Set<RelayRequestConsumer>;
  consumerCount: number;
  readonly requestKeys: Set<RequestKey>;
  readonly pendingSubIds: Set<string>;
  readonly transportSubIds: Map<string, Map<string, string>>;
  readonly relayShardQueues: Map<string, QueuedRelayShard[]>;
  readonly activeRelaySubIds: Map<string, Set<string>>;
  readonly cleanup: Array<() => void>;
  started: boolean;
  finished: boolean;
}
```

Update `RelayRequestConsumer`:

```ts
interface RelayRequestConsumer {
  readonly requestKey: RequestKey;
  readonly observer: RelayRequestObserver;
  readonly deliveredEventIds: Set<string>;
  currentGroupKey: string | null;
}
```

Initialize `deliveredEventIds` where the consumer is created:

```ts
const consumer: RelayRequestConsumer = {
  requestKey,
  observer,
  deliveredEventIds: new Set(),
  currentGroupKey: null
};
```

- [ ] **Step 4: Add capability state helpers**

Inside `RelaySession`, add fields:

```ts
  private readonly relayCapabilities = new Map<string, RelayExecutionCapability>();
  private readonly capabilityStates = new Subject<RelayCapabilityPacket>();
  private capabilityLearningHandler:
    | ((event: RelayCapabilityLearningEvent) => void)
    | undefined;
```

In the constructor, after `this.setDefaultRelays([...defaultRelays]);`, add:

```ts
this.setRelayCapabilities(requestOptimizer.relayCapabilities ?? {});
this.capabilityLearningHandler = requestOptimizer.onCapabilityLearned;
```

Add methods to `RelaySession`:

```ts
  setRelayCapabilities(capabilities: Record<string, RelayExecutionCapability | undefined>): void {
    for (const [url, capability] of Object.entries(capabilities)) {
      if (!capability) {
        this.relayCapabilities.delete(url);
        this.publishRelayCapability(url);
        continue;
      }
      this.relayCapabilities.set(url, capability);
      this.publishRelayCapability(url);
    }
  }

  setRelayCapabilityLearningHandler(
    handler: ((event: RelayCapabilityLearningEvent) => void) | null
  ): void {
    this.capabilityLearningHandler = handler ?? undefined;
  }

  getRelayCapabilitySnapshot(url: string): RelayCapabilitySnapshot {
    return normalizeRelayCapabilitySnapshot(this.buildRuntimeCapabilityState(url));
  }

  createRelayCapabilityObservable(): Observable<RelayCapabilityPacket> {
    return this.capabilityStates.asObservable();
  }

  private buildRuntimeCapabilityState(url: string): RelayRuntimeCapabilityState {
    const capability = this.relayCapabilities.get(url);
    return {
      relayUrl: url,
      maxFilters: capability?.maxFilters ?? this.requestOptimizer.relayMaxFiltersPerRequest?.[url] ?? this.requestOptimizer.defaultMaxFiltersPerRequest ?? null,
      maxSubscriptions: capability?.maxSubscriptions ?? null,
      supportedNips: capability?.supportedNips ?? [],
      source: capability?.source ?? (this.requestOptimizer.relayMaxFiltersPerRequest?.[url] || this.requestOptimizer.defaultMaxFiltersPerRequest ? 'override' : 'unknown'),
      expiresAt: capability?.expiresAt ?? null,
      stale: capability?.stale ?? false,
      queueDepth: this.countQueuedShards(url),
      activeSubscriptions: this.countActiveSubscriptions(url)
    };
  }

  private publishRelayCapability(url: string): void {
    this.capabilityStates.next({
      from: url,
      capability: this.getRelayCapabilitySnapshot(url)
    });
  }

  private countQueuedShards(url: string): number {
    let count = 0;
    for (const group of this.requestGroups.values()) {
      count += group.relayShardQueues.get(url)?.length ?? 0;
    }
    return count;
  }

  private countActiveSubscriptions(url: string): number {
    let count = 0;
    for (const group of this.requestGroups.values()) {
      count += group.activeRelaySubIds.get(url)?.size ?? 0;
    }
    return count;
  }
```

Update `dispose()` to complete `this.capabilityStates`.

- [ ] **Step 5: Use effective maxFilters in request planning**

Replace `resolveRequestOptimizerCapabilities()` with:

```ts
  private resolveRequestOptimizerCapabilities(relayUrl: string): RequestOptimizerCapabilities {
    const capability = this.relayCapabilities.get(relayUrl);
    const legacyRelaySpecific = this.requestOptimizer.relayMaxFiltersPerRequest?.[relayUrl] ?? null;
    const legacyDefault = this.requestOptimizer.defaultMaxFiltersPerRequest ?? null;
    const maxFilters = minNullable(capability?.maxFilters ?? null, legacyRelaySpecific, legacyDefault);

    return {
      maxFiltersPerShard: maxFilters,
      maxSubscriptions: capability?.maxSubscriptions ?? null
    };
  }
```

Add a local helper near the bottom of `relay-session.ts`:

```ts
function minNullable(...values: Array<number | null | undefined>): number | null {
  const normalized = values.filter((value): value is number => typeof value === 'number');
  if (normalized.length === 0) return null;
  return Math.min(...normalized);
}
```

- [ ] **Step 6: Implement shard queue pumping**

Replace the body of `sendGroupToRelay()` with:

```ts
  private async sendGroupToRelay(group: ActiveRequestGroup, relayUrl: string): Promise<void> {
    const plan = group.plansByRelay.get(relayUrl);
    if (!plan || plan.shards.length === 0) {
      this.dropRelayPendingSubIds(group, relayUrl);
      this.completeBackwardGroupIfDone(group);
      this.publishRelayCapability(relayUrl);
      return;
    }

    try {
      await this.closeRelayTransport(group, relayUrl);
      group.relayShardQueues.set(
        relayUrl,
        plan.shards.map((shard) => ({ shardKey: shard.shardKey, filters: shard.filters }))
      );
      group.activeRelaySubIds.set(relayUrl, new Set());
      await this.pumpRelayShardQueue(group, relayUrl);
    } catch {
      this.dropRelayPendingSubIds(group, relayUrl);
      this.completeBackwardGroupIfDone(group);
      this.publishRelayCapability(relayUrl);
    }
  }
```

Add `pumpRelayShardQueue()`:

```ts
  private async pumpRelayShardQueue(group: ActiveRequestGroup, relayUrl: string): Promise<void> {
    const relay = this.getConnection(relayUrl);
    const queue = group.relayShardQueues.get(relayUrl) ?? [];
    const active = group.activeRelaySubIds.get(relayUrl) ?? new Set<string>();
    group.activeRelaySubIds.set(relayUrl, active);
    const maxSubscriptions = this.relayCapabilities.get(relayUrl)?.maxSubscriptions ?? null;
    const availableSlots =
      maxSubscriptions === null ? Number.POSITIVE_INFINITY : Math.max(0, maxSubscriptions - active.size);

    let sent = 0;
    while (queue.length > 0 && sent < availableSlots) {
      const shard = queue.shift();
      if (!shard) break;
      const subId = createSubId();
      const shardSubIds = group.transportSubIds.get(relayUrl) ?? new Map<string, string>();
      shardSubIds.set(shard.shardKey, subId);
      group.transportSubIds.set(relayUrl, shardSubIds);
      active.add(subId);
      this.trackRequestTransport(group.groupKey, subId, relayUrl);
      if (group.mode === 'backward') {
        group.pendingSubIds.add(subId);
      }
      await relay.send(['REQ', subId, ...shard.filters]);
      sent += 1;
    }

    group.relayShardQueues.set(relayUrl, queue);
    this.publishRelayCapability(relayUrl);
  }
```

When creating a new `ActiveRequestGroup`, initialize:

```ts
      relayShardQueues: new Map(),
      activeRelaySubIds: new Map(),
```

- [ ] **Step 7: Release slots and pump queued shards**

In the message handler for `EOSE` or `CLOSED`, after `group.pendingSubIds.delete(incomingSubId);`, add:

```ts
this.releaseRelaySubId(group, from, incomingSubId);
void this.pumpRelayShardQueue(group, from).catch(() => {
  this.dropRelayPendingSubIds(group, from);
  this.completeBackwardGroupIfDone(group);
});
```

Add helper:

```ts
  private releaseRelaySubId(group: ActiveRequestGroup, relayUrl: string, subId: string): void {
    group.activeRelaySubIds.get(relayUrl)?.delete(subId);
    const relaySubIds = group.transportSubIds.get(relayUrl);
    if (relaySubIds) {
      for (const [shardKey, trackedSubId] of relaySubIds.entries()) {
        if (trackedSubId === subId) {
          relaySubIds.delete(shardKey);
          break;
        }
      }
    }
    this.untrackSubId(subId);
    this.publishRelayCapability(relayUrl);
  }
```

Update `dropRelayPendingSubIds()` and `closeRelayTransport()` to clear `activeRelaySubIds` and publish capability:

```ts
group.activeRelaySubIds.get(relayUrl)?.clear();
this.publishRelayCapability(relayUrl);
```

- [ ] **Step 8: Run queueing tests**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-session.contract.test.ts -t "max_subscriptions|capability packets"
```

Expected: PASS.

- [ ] **Step 9: Run core package tests**

Run:

```bash
pnpm run test:auftakt:core
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

Run:

```bash
git add packages/core/src/relay-session.ts packages/core/src/relay-session.contract.test.ts packages/core/src/index.ts
git commit -m "feat(auftakt): queue relay shards by capability"
```

## Task 3: Learn From CLOSED Limits And Suppress Duplicate Event Emissions

**Files:**

- Modify: `packages/core/src/relay-session.ts`
- Modify: `packages/core/src/relay-session.contract.test.ts`

- [ ] **Step 1: Write failing learning and dedup tests**

Append these tests inside the existing relay session `describe` block:

```ts
it('learns max_filters from CLOSED and reports the safety bound', async () => {
  const learned: unknown[] = [];
  const session = createRxNostrSession({
    defaultRelays: [RELAY_URL],
    eoseTimeout: 100,
    requestOptimizer: {
      defaultMaxFiltersPerRequest: 3,
      onCapabilityLearned: (event) => learned.push(event)
    }
  });
  const req = createRxBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      scope: 'contract:learn-max-filters',
      filters: [{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }]
    })
  });

  const sub = session.use(req).subscribe({});
  req.emit([{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }]);
  req.over();

  await waitUntil(() => FakeWebSocket.instances.length > 0);
  const socket = latestSocket();
  socket.open();
  await waitUntil(() => socket.sent.length === 1);

  const subId = (socket.sent[0] as [string, string, ...unknown[]])[1];
  socket.message(['CLOSED', subId, 'too many filters: max_filters=1']);

  await waitUntil(() => learned.length === 1);
  expect(learned[0]).toEqual({
    relayUrl: RELAY_URL,
    kind: 'maxFilters',
    value: 1,
    reason: 'too many filters: max_filters=1'
  });

  sub.unsubscribe();
  session.dispose();
});

it('emits a duplicate event id once per logical consumer across shards', async () => {
  const session = createRxNostrSession({
    defaultRelays: [RELAY_URL],
    eoseTimeout: 100,
    requestOptimizer: {
      relayCapabilities: {
        [RELAY_URL]: {
          relayUrl: RELAY_URL,
          maxFilters: 1,
          maxSubscriptions: null,
          supportedNips: [],
          source: 'learned',
          expiresAt: null,
          stale: false
        }
      }
    }
  });
  const req = createRxForwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'forward',
      scope: 'contract:dedup-shards',
      filters: [{ ids: ['same'] }, { authors: ['pubkey-a'] }]
    })
  });
  const received: string[] = [];

  const sub = session.use(req).subscribe({
    next: (packet) => received.push(packet.event.id)
  });
  req.emit([{ ids: ['same'] }, { authors: ['pubkey-a'] }]);

  await waitUntil(() => FakeWebSocket.instances.length > 0);
  const socket = latestSocket();
  socket.open();
  await waitUntil(() => socket.sent.length === 2);

  const firstSubId = (socket.sent[0] as [string, string, ...unknown[]])[1];
  const secondSubId = (socket.sent[1] as [string, string, ...unknown[]])[1];
  const event = {
    id: 'same-event',
    pubkey: 'pubkey-a',
    content: 'dupe',
    created_at: 1,
    tags: [],
    kind: 1
  };

  socket.message(['EVENT', firstSubId, event]);
  socket.message(['EVENT', secondSubId, event]);

  await waitUntil(() => received.length === 1);
  expect(received).toEqual(['same-event']);

  sub.unsubscribe();
  session.dispose();
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-session.contract.test.ts -t "learns max_filters|duplicate event id"
```

Expected: FAIL because `CLOSED` limit learning and delivered-event dedup are not implemented.

- [ ] **Step 3: Emit learned capability events from CLOSED packets**

Inside the relay message handler where `type === 'EOSE' || type === 'CLOSED'`, add this before releasing the sub id:

```ts
if (type === 'CLOSED') {
  const reason = typeof message[2] === 'string' ? message[2] : '';
  const learned = parseRelayLimitClosedReason({
    relayUrl: from,
    reason,
    activeAcceptedSubscriptions: this.countActiveSubscriptions(from)
  });
  if (learned) {
    this.capabilityLearningHandler?.(learned);
  }
}
```

- [ ] **Step 4: Suppress duplicate event ids per consumer**

Replace the `EVENT` branch in the relay message handler with:

```ts
if (type === 'EVENT') {
  const event = (message as [string, string, NostrEvent])[2];
  for (const consumer of group.consumers) {
    const eventId = typeof event?.id === 'string' ? event.id : null;
    if (eventId && consumer.deliveredEventIds.has(eventId)) continue;
    if (eventId) consumer.deliveredEventIds.add(eventId);
    consumer.observer.next({ from, event });
  }
  return;
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-session.contract.test.ts -t "learns max_filters|duplicate event id"
```

Expected: PASS.

- [ ] **Step 6: Run core package tests**

Run:

```bash
pnpm run test:auftakt:core
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add packages/core/src/relay-session.ts packages/core/src/relay-session.contract.test.ts
git commit -m "feat(auftakt): learn relay limits from closed packets"
```

## Task 4: Persist Relay Capability Records In Dexie

**Files:**

- Modify: `packages/adapter-dexie/src/schema.ts`
- Modify: `packages/adapter-dexie/src/index.ts`
- Modify: `packages/adapter-dexie/src/schema.contract.test.ts`
- Create: `packages/adapter-dexie/src/relay-capabilities.contract.test.ts`

- [ ] **Step 1: Write failing Dexie capability tests**

Create `packages/adapter-dexie/src/relay-capabilities.contract.test.ts`:

```ts
import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { createDexieEventStore, type RelayCapabilityRecordInput } from './index.js';

function capability(
  overrides: Partial<RelayCapabilityRecordInput> = {}
): RelayCapabilityRecordInput {
  return {
    relayUrl: 'wss://relay.example',
    nip11Status: 'ok',
    nip11CheckedAt: 100,
    nip11ExpiresAt: 3_700,
    supportedNips: [1, 11],
    nip11MaxFilters: 5,
    nip11MaxSubscriptions: 10,
    learnedMaxFilters: null,
    learnedMaxSubscriptions: null,
    learnedAt: null,
    learnedReason: null,
    updatedAt: 100,
    ...overrides
  };
}

describe('DexieEventStore relay capabilities', () => {
  it('stores and restores NIP-11 success metadata', async () => {
    const store = await createDexieEventStore({
      dbName: 'auftakt-dexie-relay-capability-success'
    });

    await store.putRelayCapability(capability());

    await expect(store.getRelayCapability('wss://relay.example')).resolves.toMatchObject({
      relayUrl: 'wss://relay.example',
      nip11Status: 'ok',
      supportedNips: [1, 11],
      nip11MaxFilters: 5,
      nip11MaxSubscriptions: 10,
      nip11ExpiresAt: 3_700
    });
  });

  it('preserves learned bounds when NIP-11 failure is recorded', async () => {
    const store = await createDexieEventStore({
      dbName: 'auftakt-dexie-relay-capability-learned-preserve'
    });

    await store.putRelayCapability(
      capability({
        learnedMaxFilters: 1,
        learnedAt: 200,
        learnedReason: 'CLOSED too many filters'
      })
    );
    await store.putRelayCapability(
      capability({
        nip11Status: 'failed',
        nip11CheckedAt: 300,
        nip11ExpiresAt: 600,
        supportedNips: [],
        nip11MaxFilters: null,
        nip11MaxSubscriptions: null,
        learnedMaxFilters: null,
        learnedAt: null,
        learnedReason: null,
        updatedAt: 300
      })
    );

    await expect(store.getRelayCapability('wss://relay.example')).resolves.toMatchObject({
      nip11Status: 'failed',
      learnedMaxFilters: 1,
      learnedAt: 200,
      learnedReason: 'CLOSED too many filters'
    });
  });

  it('lists capability records after store recreation', async () => {
    const dbName = 'auftakt-dexie-relay-capability-list';
    const first = await createDexieEventStore({ dbName });
    await first.putRelayCapability(capability({ relayUrl: 'wss://relay-a.example' }));
    await first.putRelayCapability(capability({ relayUrl: 'wss://relay-b.example' }));

    const second = await createDexieEventStore({ dbName });
    await expect(second.listRelayCapabilities()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relayUrl: 'wss://relay-a.example' }),
        expect.objectContaining({ relayUrl: 'wss://relay-b.example' })
      ])
    );
  });
});
```

Update `packages/adapter-dexie/src/schema.contract.test.ts` expected table names to include `relay_capabilities`.

- [ ] **Step 2: Run storage tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/schema.contract.test.ts packages/adapter-dexie/src/relay-capabilities.contract.test.ts
```

Expected: FAIL because the table and store methods do not exist.

- [ ] **Step 3: Add schema record and table**

In `packages/adapter-dexie/src/schema.ts`, add:

```ts
export interface DexieRelayCapabilityRecord {
  readonly relay_url: string;
  readonly nip11_status: string;
  readonly nip11_checked_at: number | null;
  readonly nip11_expires_at: number | null;
  readonly supported_nips: number[];
  readonly nip11_max_filters: number | null;
  readonly nip11_max_subscriptions: number | null;
  readonly learned_max_filters: number | null;
  readonly learned_max_subscriptions: number | null;
  readonly learned_at: number | null;
  readonly learned_reason: string | null;
  readonly updated_at: number;
}
```

Add the table to `AuftaktDexieDatabase`:

```ts
  relay_capabilities!: Table<DexieRelayCapabilityRecord, string>;
```

Replace the constructor version block with version 1 plus version 2:

```ts
const versionOneStores = {
  events: 'id,[pubkey+kind],[pubkey+kind+d_tag],[kind+created_at],[created_at+id],*tag_values',
  event_tags: 'key,event_id,[tag+value]',
  deletion_index: 'key,deletion_id,created_at,target_id,pubkey',
  replaceable_heads: 'key,event_id,created_at',
  event_relay_hints: 'key,event_id,relay_url,[event_id+source],last_seen_at',
  sync_cursors: 'key,relay,request_key,updated_at',
  pending_publishes: 'id,created_at,status',
  projections: 'key,[projection+sort_key]',
  migration_state: 'key,version,source_db_name,dexie_only_writes',
  quarantine: 'key,event_id,relay_url,reason,created_at'
};
this.version(1).stores(versionOneStores);
this.version(2).stores({
  ...versionOneStores,
  relay_capabilities: 'relay_url,nip11_status,nip11_expires_at,learned_at,updated_at'
});
```

- [ ] **Step 4: Add store methods**

In `packages/adapter-dexie/src/index.ts`, import the schema type:

```ts
  DexieRelayCapabilityRecord,
```

Add near `RelayHintInput`:

```ts
export interface RelayCapabilityRecordInput {
  readonly relayUrl: string;
  readonly nip11Status: 'unknown' | 'ok' | 'failed';
  readonly nip11CheckedAt: number | null;
  readonly nip11ExpiresAt: number | null;
  readonly supportedNips: readonly number[];
  readonly nip11MaxFilters: number | null;
  readonly nip11MaxSubscriptions: number | null;
  readonly learnedMaxFilters: number | null;
  readonly learnedMaxSubscriptions: number | null;
  readonly learnedAt: number | null;
  readonly learnedReason: string | null;
  readonly updatedAt: number;
}
```

Add methods to `DexieEventStore`:

```ts
  async putRelayCapability(input: RelayCapabilityRecordInput): Promise<void> {
    const existing = await this.db.relay_capabilities.get(input.relayUrl);
    const preservedLearned = {
      learnedMaxFilters: input.learnedMaxFilters ?? existing?.learned_max_filters ?? null,
      learnedMaxSubscriptions:
        input.learnedMaxSubscriptions ?? existing?.learned_max_subscriptions ?? null,
      learnedAt: input.learnedAt ?? existing?.learned_at ?? null,
      learnedReason: input.learnedReason ?? existing?.learned_reason ?? null
    };

    await this.db.relay_capabilities.put({
      relay_url: input.relayUrl,
      nip11_status: input.nip11Status,
      nip11_checked_at: input.nip11CheckedAt,
      nip11_expires_at: input.nip11ExpiresAt,
      supported_nips: [...input.supportedNips],
      nip11_max_filters: input.nip11MaxFilters,
      nip11_max_subscriptions: input.nip11MaxSubscriptions,
      learned_max_filters: preservedLearned.learnedMaxFilters,
      learned_max_subscriptions: preservedLearned.learnedMaxSubscriptions,
      learned_at: preservedLearned.learnedAt,
      learned_reason: preservedLearned.learnedReason,
      updated_at: input.updatedAt
    });
  }

  async getRelayCapability(relayUrl: string): Promise<RelayCapabilityRecordInput | null> {
    const record = await this.db.relay_capabilities.get(relayUrl);
    return record ? toRelayCapabilityInput(record) : null;
  }

  async listRelayCapabilities(): Promise<RelayCapabilityRecordInput[]> {
    const records = await this.db.relay_capabilities.toArray();
    return records.map(toRelayCapabilityInput);
  }
```

Add helper near the existing helper functions:

```ts
function toRelayCapabilityInput(record: DexieRelayCapabilityRecord): RelayCapabilityRecordInput {
  return {
    relayUrl: record.relay_url,
    nip11Status: record.nip11_status as RelayCapabilityRecordInput['nip11Status'],
    nip11CheckedAt: record.nip11_checked_at,
    nip11ExpiresAt: record.nip11_expires_at,
    supportedNips: [...record.supported_nips],
    nip11MaxFilters: record.nip11_max_filters,
    nip11MaxSubscriptions: record.nip11_max_subscriptions,
    learnedMaxFilters: record.learned_max_filters,
    learnedMaxSubscriptions: record.learned_max_subscriptions,
    learnedAt: record.learned_at,
    learnedReason: record.learned_reason,
    updatedAt: record.updated_at
  };
}
```

- [ ] **Step 5: Run focused storage tests**

Run:

```bash
pnpm exec vitest run packages/adapter-dexie/src/schema.contract.test.ts packages/adapter-dexie/src/relay-capabilities.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run storage package tests**

Run:

```bash
pnpm run test:auftakt:storage
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add packages/adapter-dexie/src/schema.ts packages/adapter-dexie/src/index.ts packages/adapter-dexie/src/schema.contract.test.ts packages/adapter-dexie/src/relay-capabilities.contract.test.ts
git commit -m "feat(auftakt): persist relay capabilities"
```

## Task 5: Add Resonote Capability Registry

**Files:**

- Create: `packages/resonote/src/relay-capability-registry.ts`
- Create: `packages/resonote/src/relay-capability-registry.contract.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `packages/resonote/src/relay-capability-registry.contract.test.ts`:

```ts
import type {
  RelayCapabilityLearningEvent,
  RelayCapabilityPacket,
  RelayCapabilityRecord
} from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import { createRelayCapabilityRegistry } from './relay-capability-registry.js';

class MemoryCapabilityStore {
  readonly records = new Map<string, RelayCapabilityRecord>();

  async getRelayCapability(relayUrl: string) {
    return this.records.get(relayUrl) ?? null;
  }

  async listRelayCapabilities() {
    return [...this.records.values()];
  }

  async putRelayCapability(record: RelayCapabilityRecord) {
    const existing = this.records.get(record.relayUrl);
    this.records.set(record.relayUrl, {
      ...record,
      learnedMaxFilters: record.learnedMaxFilters ?? existing?.learnedMaxFilters ?? null,
      learnedMaxSubscriptions:
        record.learnedMaxSubscriptions ?? existing?.learnedMaxSubscriptions ?? null,
      learnedAt: record.learnedAt ?? existing?.learnedAt ?? null,
      learnedReason: record.learnedReason ?? existing?.learnedReason ?? null
    });
  }
}

describe('@auftakt/resonote relay capability registry', () => {
  it('prefetches missing default relay NIP-11 records and exposes normalized snapshots', async () => {
    const store = new MemoryCapabilityStore();
    const registry = createRelayCapabilityRegistry({
      openStore: async () => store,
      now: () => 100,
      fetchRelayInformation: vi.fn(async () => ({
        supportedNips: [1, 11],
        maxFilters: 3,
        maxSubscriptions: 2
      }))
    });

    await registry.prefetchDefaultRelays(['wss://relay.example']);

    await expect(registry.snapshot(['wss://relay.example'])).resolves.toEqual([
      {
        url: 'wss://relay.example',
        maxFilters: 3,
        maxSubscriptions: 2,
        supportedNips: [1, 11],
        queueDepth: 0,
        activeSubscriptions: 0,
        source: 'nip11',
        expiresAt: 3_700,
        stale: false
      }
    ]);
  });

  it('stores failed NIP-11 state for five minutes without clearing learned bounds', async () => {
    const store = new MemoryCapabilityStore();
    await store.putRelayCapability({
      relayUrl: 'wss://relay.example',
      nip11Status: 'ok',
      nip11CheckedAt: 0,
      nip11ExpiresAt: 10,
      supportedNips: [1],
      nip11MaxFilters: 10,
      nip11MaxSubscriptions: 10,
      learnedMaxFilters: 1,
      learnedMaxSubscriptions: null,
      learnedAt: 5,
      learnedReason: 'CLOSED too many filters',
      updatedAt: 5
    });
    const registry = createRelayCapabilityRegistry({
      openStore: async () => store,
      now: () => 20,
      fetchRelayInformation: vi.fn(async () => {
        throw new Error('network');
      })
    });

    await registry.prefetchDefaultRelays(['wss://relay.example']);

    await expect(registry.snapshot(['wss://relay.example'])).resolves.toEqual([
      expect.objectContaining({
        maxFilters: 1,
        maxSubscriptions: null,
        source: 'learned',
        expiresAt: 320,
        stale: false
      })
    ]);
    await expect(store.getRelayCapability('wss://relay.example')).resolves.toMatchObject({
      nip11Status: 'failed',
      learnedMaxFilters: 1
    });
  });

  it('records learned events and emits capability packets', async () => {
    const store = new MemoryCapabilityStore();
    const packets: RelayCapabilityPacket[] = [];
    const registry = createRelayCapabilityRegistry({
      openStore: async () => store,
      now: () => 100,
      fetchRelayInformation: vi.fn()
    });
    const sub = await registry.observe((packet) => packets.push(packet));
    const learned: RelayCapabilityLearningEvent = {
      relayUrl: 'wss://relay.example',
      kind: 'maxSubscriptions',
      value: 1,
      reason: 'too many subscriptions'
    };

    await registry.recordLearned(learned);

    expect(packets).toEqual([
      {
        from: 'wss://relay.example',
        capability: expect.objectContaining({
          url: 'wss://relay.example',
          maxSubscriptions: 1,
          source: 'learned'
        })
      }
    ]);
    await expect(store.getRelayCapability('wss://relay.example')).resolves.toMatchObject({
      learnedMaxSubscriptions: 1,
      learnedReason: 'too many subscriptions'
    });

    sub.unsubscribe();
  });
});
```

- [ ] **Step 2: Run registry tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-capability-registry.contract.test.ts
```

Expected: FAIL because the registry file does not exist.

- [ ] **Step 3: Implement registry file**

Create `packages/resonote/src/relay-capability-registry.ts`:

```ts
import {
  calculateEffectiveRelayCapability,
  normalizeRelayCapabilitySnapshot,
  type RelayCapabilityLearningEvent,
  type RelayCapabilityPacket,
  type RelayCapabilityRecord,
  type RelayCapabilitySnapshot,
  type RelayExecutionCapability,
  type RelayRuntimeCapabilityState
} from '@auftakt/core';
import { Subject } from 'rxjs';

export const NIP11_SUCCESS_TTL_SECONDS = 3_600;
export const NIP11_FAILURE_TTL_SECONDS = 300;

export interface RelayInformationDocument {
  readonly supportedNips: readonly number[];
  readonly maxFilters: number | null;
  readonly maxSubscriptions: number | null;
}

export interface RelayCapabilityStore {
  getRelayCapability(relayUrl: string): Promise<RelayCapabilityRecord | null>;
  listRelayCapabilities(): Promise<RelayCapabilityRecord[]>;
  putRelayCapability(record: RelayCapabilityRecord): Promise<void>;
}

export interface RelayCapabilityRegistryOptions {
  readonly openStore: () => Promise<RelayCapabilityStore>;
  readonly now?: () => number;
  readonly fetchRelayInformation?: (relayUrl: string) => Promise<RelayInformationDocument>;
}

export interface RelayCapabilityRegistry {
  prefetchDefaultRelays(urls: readonly string[]): Promise<void>;
  snapshot(urls: readonly string[]): Promise<RelayCapabilitySnapshot[]>;
  observe(onPacket: (packet: RelayCapabilityPacket) => void): Promise<{ unsubscribe(): void }>;
  recordLearned(event: RelayCapabilityLearningEvent): Promise<void>;
  setRuntimeState(
    url: string,
    state: { readonly queueDepth: number; readonly activeSubscriptions: number }
  ): void;
  getExecutionCapabilities(
    urls: readonly string[]
  ): Promise<Record<string, RelayExecutionCapability>>;
}

export function createRelayCapabilityRegistry(
  options: RelayCapabilityRegistryOptions
): RelayCapabilityRegistry {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const fetchRelayInformation = options.fetchRelayInformation ?? fetchNip11RelayInformation;
  const packets = new Subject<RelayCapabilityPacket>();
  const runtimeState = new Map<string, { queueDepth: number; activeSubscriptions: number }>();

  async function readRecord(relayUrl: string): Promise<RelayCapabilityRecord | null> {
    const store = await options.openStore();
    return store.getRelayCapability(relayUrl);
  }

  async function writeRecord(record: RelayCapabilityRecord): Promise<void> {
    const store = await options.openStore();
    await store.putRelayCapability(record);
  }

  async function capabilityFor(relayUrl: string): Promise<RelayRuntimeCapabilityState> {
    const effective = calculateEffectiveRelayCapability(
      await readRecord(relayUrl),
      now(),
      {},
      relayUrl
    );
    const runtime = runtimeState.get(relayUrl) ?? { queueDepth: 0, activeSubscriptions: 0 };
    return { ...effective, ...runtime };
  }

  async function publish(relayUrl: string): Promise<void> {
    packets.next({
      from: relayUrl,
      capability: normalizeRelayCapabilitySnapshot(await capabilityFor(relayUrl))
    });
  }

  return {
    async prefetchDefaultRelays(urls) {
      for (const relayUrl of urls) {
        const record = await readRecord(relayUrl);
        const timestamp = now();
        if (record?.nip11ExpiresAt && record.nip11ExpiresAt > timestamp) {
          continue;
        }

        try {
          const info = await fetchRelayInformation(relayUrl);
          await writeRecord({
            relayUrl,
            nip11Status: 'ok',
            nip11CheckedAt: timestamp,
            nip11ExpiresAt: timestamp + NIP11_SUCCESS_TTL_SECONDS,
            supportedNips: [...info.supportedNips],
            nip11MaxFilters: info.maxFilters,
            nip11MaxSubscriptions: info.maxSubscriptions,
            learnedMaxFilters: record?.learnedMaxFilters ?? null,
            learnedMaxSubscriptions: record?.learnedMaxSubscriptions ?? null,
            learnedAt: record?.learnedAt ?? null,
            learnedReason: record?.learnedReason ?? null,
            updatedAt: timestamp
          });
        } catch {
          await writeRecord({
            relayUrl,
            nip11Status: 'failed',
            nip11CheckedAt: timestamp,
            nip11ExpiresAt: timestamp + NIP11_FAILURE_TTL_SECONDS,
            supportedNips: [],
            nip11MaxFilters: null,
            nip11MaxSubscriptions: null,
            learnedMaxFilters: record?.learnedMaxFilters ?? null,
            learnedMaxSubscriptions: record?.learnedMaxSubscriptions ?? null,
            learnedAt: record?.learnedAt ?? null,
            learnedReason: record?.learnedReason ?? null,
            updatedAt: timestamp
          });
        }

        await publish(relayUrl);
      }
    },

    async snapshot(urls) {
      const snapshots: RelayCapabilitySnapshot[] = [];
      for (const url of urls) {
        snapshots.push(normalizeRelayCapabilitySnapshot(await capabilityFor(url)));
      }
      return snapshots;
    },

    async observe(onPacket) {
      const sub = packets.subscribe({ next: onPacket });
      return { unsubscribe: () => sub.unsubscribe() };
    },

    async recordLearned(event) {
      const record = await readRecord(event.relayUrl);
      const timestamp = now();
      await writeRecord({
        relayUrl: event.relayUrl,
        nip11Status: record?.nip11Status ?? 'unknown',
        nip11CheckedAt: record?.nip11CheckedAt ?? null,
        nip11ExpiresAt: record?.nip11ExpiresAt ?? null,
        supportedNips: record?.supportedNips ?? [],
        nip11MaxFilters: record?.nip11MaxFilters ?? null,
        nip11MaxSubscriptions: record?.nip11MaxSubscriptions ?? null,
        learnedMaxFilters:
          event.kind === 'maxFilters'
            ? tighten(record?.learnedMaxFilters ?? null, event.value)
            : (record?.learnedMaxFilters ?? null),
        learnedMaxSubscriptions:
          event.kind === 'maxSubscriptions'
            ? tighten(record?.learnedMaxSubscriptions ?? null, event.value)
            : (record?.learnedMaxSubscriptions ?? null),
        learnedAt: timestamp,
        learnedReason: event.reason,
        updatedAt: timestamp
      });
      await publish(event.relayUrl);
    },

    setRuntimeState(url, state) {
      runtimeState.set(url, state);
      void publish(url);
    },

    async getExecutionCapabilities(urls) {
      const entries = await Promise.all(
        urls.map(
          async (url) =>
            [
              url,
              await calculateEffectiveRelayCapability(await readRecord(url), now(), {}, url)
            ] as const
        )
      );
      return Object.fromEntries(entries);
    }
  };
}

export async function fetchNip11RelayInformation(
  relayUrl: string
): Promise<RelayInformationDocument> {
  const url = relayUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  const response = await fetch(url, {
    headers: { Accept: 'application/nostr+json' }
  });
  if (!response.ok) {
    throw new Error(`NIP-11 fetch failed: ${relayUrl}:${response.status}`);
  }

  const document = (await response.json()) as {
    supported_nips?: unknown;
    limitation?: {
      max_filters?: unknown;
      max_subscriptions?: unknown;
    };
  };

  return {
    supportedNips: Array.isArray(document.supported_nips)
      ? document.supported_nips.filter((value): value is number => Number.isInteger(value))
      : [],
    maxFilters: normalizePositiveInteger(document.limitation?.max_filters),
    maxSubscriptions: normalizePositiveInteger(document.limitation?.max_subscriptions)
  };
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : null;
}

function tighten(current: number | null, next: number): number {
  return current === null ? next : Math.min(current, next);
}
```

- [ ] **Step 4: Run registry tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-capability-registry.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add packages/resonote/src/relay-capability-registry.ts packages/resonote/src/relay-capability-registry.contract.test.ts
git commit -m "feat(auftakt): add relay capability registry"
```

## Task 6: Wire Registry Through Resonote Coordinator And Core Session

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Modify: `packages/resonote/src/index.ts`
- Modify: `packages/resonote/src/built-in-plugins.contract.test.ts`
- Modify: `packages/resonote/src/plugin-api.contract.test.ts`
- Modify: `packages/resonote/src/plugin-isolation.contract.test.ts`
- Modify: `packages/resonote/src/relay-repair.contract.test.ts`
- Modify: `packages/resonote/src/subscription-registry.contract.test.ts`
- Modify: `packages/resonote/src/subscription-visibility.contract.test.ts`

- [ ] **Step 1: Write failing coordinator API tests**

Append to `packages/resonote/src/built-in-plugins.contract.test.ts` or create `packages/resonote/src/relay-capability-api.contract.test.ts` if keeping the file focused is cleaner:

```ts
import type {
  RelayCapabilityLearningEvent,
  RelayCapabilityPacket,
  RelayExecutionCapability
} from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import { createResonoteCoordinator, type ResonoteRuntime } from './runtime.js';

function createCapabilityRuntime() {
  const capabilities: Record<string, RelayExecutionCapability | undefined> = {};
  const capabilityObservers: Array<(packet: RelayCapabilityPacket) => void> = [];
  const records = new Map<string, unknown>();
  const runtime: ResonoteRuntime = {
    async fetchLatestEvent() {
      return null;
    },
    async getEventsDB() {
      return {
        async getByPubkeyAndKind() {
          return null;
        },
        async getManyByPubkeysAndKind() {
          return [];
        },
        async getByReplaceKey() {
          return null;
        },
        async getByTagValue() {
          return [];
        },
        async getById() {
          return null;
        },
        async getAllByKind() {
          return [];
        },
        async listNegentropyEventRefs() {
          return [];
        },
        async recordRelayHint() {},
        async deleteByIds() {},
        async clearAll() {},
        async put() {
          return true;
        },
        async putWithReconcile() {
          return { stored: true, emissions: [] };
        },
        async getRelayCapability(relayUrl: string) {
          return records.get(relayUrl) ?? null;
        },
        async listRelayCapabilities() {
          return [...records.values()];
        },
        async putRelayCapability(record: unknown) {
          records.set((record as { relayUrl: string }).relayUrl, record);
        }
      };
    },
    async getRxNostr() {
      return {
        setRelayCapabilities(next: Record<string, RelayExecutionCapability | undefined>) {
          Object.assign(capabilities, next);
        },
        setRelayCapabilityLearningHandler() {},
        getRelayCapabilitySnapshot(url: string) {
          return {
            url,
            maxFilters: capabilities[url]?.maxFilters ?? null,
            maxSubscriptions: capabilities[url]?.maxSubscriptions ?? null,
            supportedNips: capabilities[url]?.supportedNips ?? [],
            source: capabilities[url]?.source ?? 'unknown',
            expiresAt: capabilities[url]?.expiresAt ?? null,
            stale: capabilities[url]?.stale ?? false,
            queueDepth: 0,
            activeSubscriptions: 0
          };
        },
        createRelayCapabilityObservable() {
          return {
            subscribe(observer: { next?: (packet: RelayCapabilityPacket) => void }) {
              if (observer.next) capabilityObservers.push(observer.next);
              return { unsubscribe() {} };
            }
          };
        },
        use() {
          return { subscribe: () => ({ unsubscribe() {} }) };
        }
      };
    },
    createRxBackwardReq() {
      return { emit() {}, over() {} };
    },
    createRxForwardReq() {
      return { emit() {}, over() {} };
    },
    uniq() {
      return (source: unknown) => source;
    },
    merge() {
      return { subscribe: () => ({ unsubscribe() {} }) };
    },
    async getRelayConnectionState() {
      return null;
    },
    async observeRelayConnectionStates() {
      return { unsubscribe() {} };
    }
  };

  const coordinator = createResonoteCoordinator({
    runtime,
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
    relayCapabilityRuntime: {
      fetchRelayInformation: async () => ({
        supportedNips: [1, 11],
        maxFilters: 2,
        maxSubscriptions: 1
      })
    }
  });

  return { coordinator, capabilities, capabilityObservers };
}

describe('@auftakt/resonote relay capability API', () => {
  it('prefetches and synchronizes capabilities when default relays are set', async () => {
    const { coordinator, capabilities } = createCapabilityRuntime();

    await coordinator.setDefaultRelays(['wss://relay.example']);

    expect(capabilities['wss://relay.example']).toMatchObject({
      relayUrl: 'wss://relay.example',
      maxFilters: 2,
      maxSubscriptions: 1,
      supportedNips: [1, 11],
      source: 'nip11'
    });
    await expect(coordinator.snapshotRelayCapabilities(['wss://relay.example'])).resolves.toEqual([
      expect.objectContaining({
        url: 'wss://relay.example',
        maxFilters: 2,
        maxSubscriptions: 1
      })
    ]);
  });

  it('observes normalized capability packets', async () => {
    const { coordinator } = createCapabilityRuntime();
    const packets: RelayCapabilityPacket[] = [];
    const sub = await coordinator.observeRelayCapabilities((packet) => packets.push(packet));

    await coordinator.setDefaultRelays(['wss://relay.example']);

    expect(packets).toEqual([
      expect.objectContaining({
        from: 'wss://relay.example',
        capability: expect.objectContaining({ url: 'wss://relay.example' })
      })
    ]);

    sub.unsubscribe();
  });
});
```

- [ ] **Step 2: Run resonote API tests and verify failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-capability-api.contract.test.ts
```

Expected: FAIL because coordinator capability options and methods are not implemented.

- [ ] **Step 3: Extend Resonote runtime interfaces**

In `packages/resonote/src/runtime.ts`, import capability types and registry:

```ts
  type RelayCapabilityPacket,
  type RelayCapabilityRecord,
  type RelayCapabilitySnapshot,
  type RelayExecutionCapability
```

from `@auftakt/core`, and:

```ts
import {
  createRelayCapabilityRegistry,
  fetchNip11RelayInformation,
  type RelayCapabilityRegistry,
  type RelayInformationDocument
} from './relay-capability-registry.js';
```

Extend the `getEventsDB()` return type inside `ResonoteRuntime`:

```ts
    getRelayCapability?(relayUrl: string): Promise<RelayCapabilityRecord | null>;
    listRelayCapabilities?(): Promise<RelayCapabilityRecord[]>;
    putRelayCapability?(record: RelayCapabilityRecord): Promise<void>;
```

Add:

```ts
export interface RelayCapabilityRuntime {
  fetchRelayInformation?(relayUrl: string): Promise<RelayInformationDocument>;
}
```

Extend `CreateResonoteCoordinatorOptions`:

```ts
  readonly relayCapabilityRuntime?: RelayCapabilityRuntime;
```

Extend `ResonoteCoordinator`:

```ts
  snapshotRelayCapabilities(urls: readonly string[]): Promise<RelayCapabilitySnapshot[]>;
  observeRelayCapabilities(
    onPacket: (packet: RelayCapabilityPacket) => void
  ): Promise<{ unsubscribe(): void }>;
```

- [ ] **Step 4: Instantiate and apply the registry**

Update the `createResonoteCoordinator()` parameter destructuring:

```ts
export function createResonoteCoordinator<TResult, TLatestResult>({
  runtime,
  cachedFetchByIdRuntime,
  cachedLatestRuntime,
  publishTransportRuntime,
  pendingPublishQueueRuntime,
  relayStatusRuntime,
  relayCapabilityRuntime
}: CreateResonoteCoordinatorOptions<TResult, TLatestResult>): ResonoteCoordinator<
  TResult,
  TLatestResult
> {
```

Inside `createResonoteCoordinator()`, before the returned coordinator object, add:

```ts
const memoryRelayCapabilityStore = createMemoryRelayCapabilityStore();
const relayCapabilityRegistry = createRelayCapabilityRegistry({
  openStore: async () => {
    const eventsDb = await runtime.getEventsDB();
    if (
      typeof eventsDb.getRelayCapability === 'function' &&
      typeof eventsDb.listRelayCapabilities === 'function' &&
      typeof eventsDb.putRelayCapability === 'function'
    ) {
      return {
        getRelayCapability: eventsDb.getRelayCapability.bind(eventsDb),
        listRelayCapabilities: eventsDb.listRelayCapabilities.bind(eventsDb),
        putRelayCapability: eventsDb.putRelayCapability.bind(eventsDb)
      };
    }
    return memoryRelayCapabilityStore;
  },
  fetchRelayInformation: relayCapabilityRuntime?.fetchRelayInformation ?? fetchNip11RelayInformation
});
```

Add a memory fallback near helper functions:

```ts
function createMemoryRelayCapabilityStore() {
  const records = new Map<string, RelayCapabilityRecord>();
  return {
    async getRelayCapability(relayUrl: string) {
      return records.get(relayUrl) ?? null;
    },
    async listRelayCapabilities() {
      return [...records.values()];
    },
    async putRelayCapability(record: RelayCapabilityRecord) {
      const existing = records.get(record.relayUrl);
      records.set(record.relayUrl, {
        ...record,
        learnedMaxFilters: record.learnedMaxFilters ?? existing?.learnedMaxFilters ?? null,
        learnedMaxSubscriptions:
          record.learnedMaxSubscriptions ?? existing?.learnedMaxSubscriptions ?? null,
        learnedAt: record.learnedAt ?? existing?.learnedAt ?? null,
        learnedReason: record.learnedReason ?? existing?.learnedReason ?? null
      });
    }
  };
}
```

Add helper:

```ts
async function applyRelayCapabilitiesToRuntime(
  runtime: ResonoteRuntime,
  registry: RelayCapabilityRegistry,
  urls: readonly string[]
): Promise<void> {
  const subscribedSessions = getCapabilitySubscribedSessions();
  const session = (await runtime.getRxNostr()) as Partial<{
    setRelayCapabilities(capabilities: Record<string, RelayExecutionCapability | undefined>): void;
    setRelayCapabilityLearningHandler(
      handler: ((event: RelayCapabilityLearningEvent) => void) | null
    ): void;
    createRelayCapabilityObservable(): {
      subscribe(observer: { next?: (packet: RelayCapabilityPacket) => void }): {
        unsubscribe(): void;
      };
    };
  }>;
  session.setRelayCapabilities?.(await registry.getExecutionCapabilities(urls));
  if (session && typeof session === 'object' && !subscribedSessions.has(session)) {
    subscribedSessions.add(session);
    session.setRelayCapabilityLearningHandler?.((event) => {
      void registry.recordLearned(event).then(async () => {
        session.setRelayCapabilities?.(await registry.getExecutionCapabilities([event.relayUrl]));
      });
    });
    session.createRelayCapabilityObservable?.().subscribe({
      next: (packet) =>
        registry.setRuntimeState(packet.from, {
          queueDepth: packet.capability.queueDepth,
          activeSubscriptions: packet.capability.activeSubscriptions
        })
    });
  }
}

const capabilitySubscribedSessions = new WeakSet<object>();

function getCapabilitySubscribedSessions(): WeakSet<object> {
  return capabilitySubscribedSessions;
}
```

- [ ] **Step 5: Wire coordinator methods**

In the returned coordinator object, replace `setDefaultRelays` with:

```ts
    setDefaultRelays: async (urls) => {
      await relayCapabilityRegistry.prefetchDefaultRelays(urls);
      await applyRelayCapabilitiesToRuntime(runtime, relayCapabilityRegistry, urls);
      await relayStatusRuntime.setDefaultRelays(urls);
    },
```

Add methods:

```ts
    snapshotRelayCapabilities: (urls) => relayCapabilityRegistry.snapshot(urls),
    observeRelayCapabilities: (onPacket) => relayCapabilityRegistry.observe(onPacket),
```

If TypeScript reports duplicate `setDefaultRelays`, keep only the new implementation.

- [ ] **Step 6: Export package helpers**

Add helper functions near existing relay status helpers in `packages/resonote/src/runtime.ts`:

```ts
export async function snapshotRelayCapabilities(
  coordinator: Pick<ResonoteCoordinator, 'snapshotRelayCapabilities'>,
  urls: readonly string[]
): Promise<RelayCapabilitySnapshot[]> {
  return coordinator.snapshotRelayCapabilities(urls);
}

export async function observeRelayCapabilities(
  coordinator: Pick<ResonoteCoordinator, 'observeRelayCapabilities'>,
  onPacket: (packet: RelayCapabilityPacket) => void
): Promise<{ unsubscribe(): void }> {
  return coordinator.observeRelayCapabilities(onPacket);
}
```

Update `packages/resonote/src/index.ts` exports:

```ts
  observeRelayCapabilities,
  snapshotRelayCapabilities,
```

and type exports:

```ts
  type RelayCapabilityPacket,
  type RelayCapabilitySnapshot,
```

If these types are only imported from `@auftakt/core`, re-export them from `runtime.ts` first:

```ts
export type { RelayCapabilityPacket, RelayCapabilitySnapshot } from '@auftakt/core';
```

- [ ] **Step 7: Run focused resonote tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-capability-api.contract.test.ts packages/resonote/src/relay-capability-registry.contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run resonote package tests and update fixtures only where required**

Run:

```bash
pnpm run test:auftakt:resonote
```

Expected: PASS. If TypeScript fixture errors report missing optional capability methods, make the new runtime/store fields optional and avoid editing unrelated fixture behavior.

- [ ] **Step 9: Commit Task 6**

Run:

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/index.ts packages/resonote/src/relay-capability-api.contract.test.ts packages/resonote/src/relay-capability-registry.ts packages/resonote/src/relay-capability-registry.contract.test.ts
git commit -m "feat(auftakt): expose relay capability coordinator API"
```

## Task 7: Add App Facade Capability APIs

**Files:**

- Modify: `src/shared/auftakt/resonote.ts`
- Modify or create: `src/shared/auftakt/relay-capability.test.ts`

- [ ] **Step 1: Write failing facade test**

Create `src/shared/auftakt/relay-capability.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@auftakt/resonote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@auftakt/resonote')>();
  return {
    ...actual,
    createResonoteCoordinator: vi.fn(() => ({
      snapshotRelayCapabilities: vi.fn(async () => [
        {
          url: 'wss://relay.example',
          maxFilters: 2,
          maxSubscriptions: 1,
          supportedNips: [1, 11],
          queueDepth: 0,
          activeSubscriptions: 0,
          source: 'nip11',
          expiresAt: 3_700,
          stale: false
        }
      ]),
      observeRelayCapabilities: vi.fn(async () => ({ unsubscribe() {} }))
    }))
  };
});

describe('$shared/auftakt relay capability facade', () => {
  it('delegates snapshots to the Resonote coordinator', async () => {
    const { snapshotRelayCapabilities } = await import('./resonote.js');

    await expect(snapshotRelayCapabilities(['wss://relay.example'])).resolves.toEqual([
      expect.objectContaining({
        url: 'wss://relay.example',
        maxFilters: 2,
        maxSubscriptions: 1
      })
    ]);
  });

  it('delegates observation to the Resonote coordinator', async () => {
    const { observeRelayCapabilities } = await import('./resonote.js');

    await expect(observeRelayCapabilities(vi.fn())).resolves.toEqual({
      unsubscribe: expect.any(Function)
    });
  });
});
```

- [ ] **Step 2: Run facade test and verify failure**

Run:

```bash
pnpm exec vitest run src/shared/auftakt/relay-capability.test.ts
```

Expected: FAIL because the facade functions are missing.

- [ ] **Step 3: Export facade functions**

In `src/shared/auftakt/resonote.ts`, add package imports:

```ts
  observeRelayCapabilities as observeRelayCapabilitiesHelper,
  snapshotRelayCapabilities as snapshotRelayCapabilitiesHelper,
  type RelayCapabilityPacket,
  type RelayCapabilitySnapshot,
```

Add type exports near existing exports:

```ts
export type { RelayCapabilityPacket, RelayCapabilitySnapshot };
```

Add facade functions near `snapshotRelayStatuses()`:

```ts
export async function snapshotRelayCapabilities(
  urls: readonly string[]
): Promise<RelayCapabilitySnapshot[]> {
  return snapshotRelayCapabilitiesHelper(coordinator, urls);
}

export async function observeRelayCapabilities(onPacket: (packet: RelayCapabilityPacket) => void) {
  return observeRelayCapabilitiesHelper(coordinator, onPacket);
}
```

- [ ] **Step 4: Run facade test**

Run:

```bash
pnpm exec vitest run src/shared/auftakt/relay-capability.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run strict closure**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

Run:

```bash
git add src/shared/auftakt/resonote.ts src/shared/auftakt/relay-capability.test.ts
git commit -m "feat(auftakt): expose relay capability facade"
```

## Task 8: Final Verification And Status Updates

**Files:**

- Modify only files reported by verification scripts.

- [ ] **Step 1: Run core verification**

Run:

```bash
pnpm run test:auftakt:core
```

Expected: PASS.

- [ ] **Step 2: Run storage verification**

Run:

```bash
pnpm run test:auftakt:storage
```

Expected: PASS.

- [ ] **Step 3: Run resonote verification**

Run:

```bash
pnpm run test:auftakt:resonote
```

Expected: PASS.

- [ ] **Step 4: Run facade regression**

Run:

```bash
pnpm exec vitest run src/shared/auftakt/relay-capability.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run strict closure and migration proof**

Run:

```bash
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected:

- strict closure exits 0
- migration proof prints `Status: COMPLETE`

- [ ] **Step 6: Run full type and lint check**

Run:

```bash
pnpm run check
```

Expected: PASS.

- [ ] **Step 7: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional implementation files are modified. Existing unrelated untracked files under `docs/superpowers/` and `.codex` may remain untouched.

- [ ] **Step 8: Commit verification updates if scripts required docs changes**

If verification required a docs or guard update, run:

```bash
git add docs/auftakt/spec.md docs/auftakt/status-verification.md docs/auftakt/nip-matrix.json docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md scripts/check-auftakt-strict-closure.ts
git commit -m "docs(auftakt): update relay capability status"
```

If no docs or guard update was required, do not create an empty commit.

## Spec Coverage Self-Check

- NIP-11 prefetch on default relay setting: Task 5 and Task 6.
- Success TTL one hour and failure TTL five minutes: Task 5 registry constants and tests.
- Learned safety bounds retained indefinitely: Task 1 model tests, Task 4 Dexie tests, Task 5 registry tests.
- NIP-11 failure cannot loosen learned bounds: Task 1, Task 4, Task 5.
- Effective strictest limit calculation: Task 1 and Task 2.
- rx-nostr-style batch, shard, queue, coalesce: Task 2 and existing request identity tests.
- CLOSED error learning: Task 3 and Task 5.
- Duplicate event-id emission suppression: Task 3.
- Separate capability APIs with normalized fields only: Task 5, Task 6, Task 7.
- Raw relay/NIP-11 internals stay out of plugin and facade surfaces: Task 6, Task 7, Task 8 strict closure.

## Execution Handoff

Plan execution should start from a clean branch state after the design commit `06f6ad5`. Keep each task committed before starting the next task. Do not revert existing unrelated untracked docs or local `.codex` files.
