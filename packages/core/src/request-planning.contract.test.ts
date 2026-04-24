import type { RequestKey } from '@auftakt/core';
import { describe, expect, it } from 'vitest';

import { buildRequestExecutionPlan } from './index.js';

describe('request optimizer contract', () => {
  it('coalesces equal logical requests by descriptor instead of object identity', () => {
    const left = buildRequestExecutionPlan({
      requestKey: 'rq:v1:left-plan' as RequestKey,
      mode: 'forward',
      filters: [
        { authors: ['pubkey-b', 'pubkey-a'], kinds: [7] },
        { '#e': ['event-b', 'event-a'], authors: ['pubkey-a'], kinds: [1] }
      ],
      overlay: {
        relays: ['wss://relay-b.contract.test', 'wss://relay-a.contract.test'],
        includeDefaultReadRelays: false
      }
    });

    const right = buildRequestExecutionPlan({
      requestKey: 'rq:v1:right-plan' as RequestKey,
      mode: 'forward',
      filters: [
        { kinds: [1], authors: ['pubkey-a'], '#e': ['event-a', 'event-b'] },
        { kinds: [7], authors: ['pubkey-a', 'pubkey-b'] }
      ],
      overlay: {
        relays: ['wss://relay-a.contract.test', 'wss://relay-b.contract.test'],
        includeDefaultReadRelays: false
      }
    });

    expect(left.requestKey).not.toBe(right.requestKey);
    expect(left.logicalKey).toBe(right.logicalKey);
    expect(left.shards).toEqual(right.shards);
  });

  it('plans deterministic shards from normalized filters and capability limits', () => {
    const base = {
      requestKey: 'rq:v1:deterministic-plan' as RequestKey,
      mode: 'backward' as const,
      filters: [
        { authors: ['pubkey-c'], kinds: [3] },
        { authors: ['pubkey-a'], kinds: [1] },
        { authors: ['pubkey-b'], kinds: [2] }
      ]
    };

    const first = buildRequestExecutionPlan(base, { maxFiltersPerShard: 2 });
    const second = buildRequestExecutionPlan(
      {
        ...base,
        filters: [
          { kinds: [2], authors: ['pubkey-b'] },
          { kinds: [1], authors: ['pubkey-a'] },
          { kinds: [3], authors: ['pubkey-c'] }
        ]
      },
      { maxFiltersPerShard: 2 }
    );

    expect(first.requestKey).toBe(base.requestKey);
    expect(first.logicalKey).toBe(second.logicalKey);
    expect(first.shards.map((shard) => shard.filters)).toEqual([
      [
        { authors: ['pubkey-a'], kinds: [1] },
        { authors: ['pubkey-b'], kinds: [2] }
      ],
      [{ authors: ['pubkey-c'], kinds: [3] }]
    ]);
    expect(first.shards.map((shard) => shard.shardKey)).toEqual(
      second.shards.map((shard) => shard.shardKey)
    );
  });

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

  it('keeps app request coalescing stable across different request scopes', () => {
    const left = buildRequestExecutionPlan({
      requestKey: 'rq:v1:scoped-app-left' as RequestKey,
      mode: 'backward',
      scope: 'contract:app:left',
      filters: [{ authors: ['pubkey-a'], kinds: [1] }],
      overlay: {
        relays: ['wss://relay.contract.test'],
        includeDefaultReadRelays: false
      }
    });
    const right = buildRequestExecutionPlan({
      requestKey: 'rq:v1:scoped-app-right' as RequestKey,
      mode: 'backward',
      scope: 'contract:app:right',
      filters: [{ kinds: [1], authors: ['pubkey-a'] }],
      overlay: {
        relays: ['wss://relay.contract.test'],
        includeDefaultReadRelays: false
      }
    });

    expect(left.requestKey).not.toBe(right.requestKey);
    expect(left.logicalKey).toBe(right.logicalKey);
  });

  it('isolates repair traffic from app logical groups with an explicit coalescing scope', () => {
    const appPlan = buildRequestExecutionPlan({
      requestKey: 'rq:v1:app-plan' as RequestKey,
      mode: 'backward',
      filters: [{ authors: ['pubkey-a'], kinds: [1] }],
      overlay: {
        relays: ['wss://relay.contract.test'],
        includeDefaultReadRelays: false
      }
    });
    const repairPlan = buildRequestExecutionPlan({
      requestKey: 'rq:v1:repair-plan' as RequestKey,
      mode: 'backward',
      scope: 'timeline:repair:negentropy',
      coalescingScope: 'timeline:repair',
      filters: [{ kinds: [1], authors: ['pubkey-a'] }],
      overlay: {
        relays: ['wss://relay.contract.test'],
        includeDefaultReadRelays: false
      }
    });

    expect(appPlan.logicalKey).not.toBe(repairPlan.logicalKey);
    expect(appPlan.shards.map((shard) => shard.filters)).toEqual(
      repairPlan.shards.map((shard) => shard.filters)
    );
  });
});
