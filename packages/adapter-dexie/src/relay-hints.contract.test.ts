import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { createDexieEventStore } from './index.js';

describe('Dexie event relay hints', () => {
  it('records and reads event relay hints by source', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-relay-hints' });
    await store.recordRelayHint({
      eventId: 'e1',
      relayUrl: 'wss://relay.example',
      source: 'seen',
      lastSeenAt: 1
    });

    await expect(store.getRelayHints('e1')).resolves.toEqual([
      { eventId: 'e1', relayUrl: 'wss://relay.example', source: 'seen', lastSeenAt: 1 }
    ]);
  });
});
