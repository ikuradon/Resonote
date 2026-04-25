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
