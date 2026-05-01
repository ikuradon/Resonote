import type { RelayCapabilityRecord, RelayExecutionCapability } from '@auftakt/core';
import type { RelayCapabilityPacket } from '@auftakt/runtime';
import { describe, expect, it, vi } from 'vitest';

import { createResonoteCoordinator, type ResonoteRuntime } from './runtime.js';

function createCapabilityRuntime(options: { readonly failEventsDb?: boolean } = {}) {
  const capabilities: Record<string, RelayExecutionCapability | undefined> = {};
  const capabilityObservers: Array<(packet: RelayCapabilityPacket) => void> = [];
  const records = new Map<string, RelayCapabilityRecord>();
  const setDefaultRelaysMock = vi.fn(async () => {});
  const runtime: ResonoteRuntime = {
    async fetchLatestEvent() {
      return null;
    },
    async getEventsDB() {
      if (options.failEventsDb) {
        throw new Error('indexeddb blocked');
      }
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
        async putRelayCapability(record: RelayCapabilityRecord) {
          records.set(record.relayUrl, record);
        }
      };
    },
    async getRelaySession() {
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
    createBackwardReq() {
      return { emit() {}, over() {} };
    },
    createForwardReq() {
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
      drainPendingPublishes: async () => ({
        emissions: [],
        settledCount: 0,
        retryingCount: 0
      })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: setDefaultRelaysMock
    },
    relayCapabilityRuntime: {
      fetchRelayInformation: async () => ({
        supportedNips: [1, 11],
        maxFilters: 2,
        maxSubscriptions: 1
      })
    }
  });

  return { coordinator, capabilities, capabilityObservers, setDefaultRelaysMock };
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

  it('applies default relays even when the capability store cannot open', async () => {
    const { coordinator, setDefaultRelaysMock } = createCapabilityRuntime({ failEventsDb: true });

    await expect(coordinator.setDefaultRelays(['wss://relay.example'])).resolves.toBeUndefined();

    expect(setDefaultRelaysMock).toHaveBeenCalledWith(['wss://relay.example']);
  });
});
