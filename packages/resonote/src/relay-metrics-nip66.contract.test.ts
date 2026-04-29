import {
  NIP66_RELAY_DISCOVERY_KIND,
  NIP66_RELAY_MONITOR_ANNOUNCEMENT_KIND,
  type StoredEvent
} from '@auftakt/core';
import { describe, expect, it } from 'vitest';

import { createResonoteCoordinator } from './runtime.js';

function event(overrides: Partial<StoredEvent> & Pick<StoredEvent, 'id' | 'kind' | 'tags'>) {
  return {
    pubkey: 'monitor-pubkey',
    content: '',
    created_at: 100,
    ...overrides
  } satisfies StoredEvent;
}

function createCoordinator(eventsByKind: Map<number, StoredEvent[]>) {
  return createResonoteCoordinator({
    runtime: {
      fetchLatestEvent: async () => null,
      getEventsDB: async () => ({
        getByPubkeyAndKind: async () => null,
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async () => null,
        getByTagValue: async () => [],
        getById: async () => null,
        getAllByKind: async (kind: number) => eventsByKind.get(kind) ?? [],
        listNegentropyEventRefs: async () => [],
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async () => ({ stored: true, emissions: [] })
      }),
      getRelaySession: async () => ({
        use: () => ({
          subscribe: () => ({ unsubscribe() {} })
        })
      }),
      createBackwardReq: () => ({ emit() {}, over() {} }),
      createForwardReq: () => ({ emit() {}, over() {} }),
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
    }
  });
}

describe('@auftakt/resonote NIP-66 relay metrics read model', () => {
  it('snapshots local kind:30166 discovery events and monitor announcements', async () => {
    const discovery = event({
      id: 'discovery',
      kind: NIP66_RELAY_DISCOVERY_KIND,
      tags: [
        ['d', 'wss://relay.example/'],
        ['N', '1'],
        ['N', '11'],
        ['R', 'auth'],
        ['n', 'clearnet'],
        ['T', 'PublicOutbox'],
        ['t', 'music'],
        ['g', 'ww8p1r4t8'],
        ['rtt-open', '100'],
        ['rtt-read', '200'],
        ['rtt-write', '300']
      ]
    });
    const announcement = event({
      id: 'announcement',
      kind: NIP66_RELAY_MONITOR_ANNOUNCEMENT_KIND,
      tags: [
        ['frequency', '3600'],
        ['timeout', 'open', '5000'],
        ['c', 'open']
      ]
    });
    const coordinator = createCoordinator(
      new Map([
        [NIP66_RELAY_DISCOVERY_KIND, [discovery]],
        [NIP66_RELAY_MONITOR_ANNOUNCEMENT_KIND, [announcement]]
      ])
    );

    await expect(coordinator.snapshotRelayMetrics()).resolves.toEqual([
      {
        relayUrl: 'wss://relay.example/',
        monitorPubkey: 'monitor-pubkey',
        score: 0.833,
        updatedAt: 100,
        supportedNips: [1, 11],
        requirements: ['auth'],
        networkTypes: ['clearnet'],
        relayTypes: ['PublicOutbox'],
        topics: ['music'],
        geohashes: ['ww8p1r4t8'],
        rttOpenMs: 100,
        rttReadMs: 200,
        rttWriteMs: 300,
        monitorAnnouncement: {
          monitorPubkey: 'monitor-pubkey',
          createdAt: 100,
          frequencySeconds: 3600,
          checks: ['open'],
          timeouts: [{ check: 'open', timeoutMs: 5000 }],
          geohashes: []
        }
      }
    ]);
  });

  it('ignores malformed discovery events without blocking relay operation', async () => {
    const coordinator = createCoordinator(
      new Map([
        [
          NIP66_RELAY_DISCOVERY_KIND,
          [event({ id: 'malformed', kind: NIP66_RELAY_DISCOVERY_KIND, tags: [['N', '1']] })]
        ]
      ])
    );

    await expect(coordinator.snapshotRelayMetrics()).resolves.toEqual([]);
  });
});
