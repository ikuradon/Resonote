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
