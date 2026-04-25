import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { createDexieEventStore } from './index.js';

describe('DexieEventStore schema', () => {
  it('opens all strict coordinator tables', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-schema-test' });

    expect(store.tableNames().sort()).toEqual([
      'deletion_index',
      'event_relay_hints',
      'event_tags',
      'events',
      'migration_state',
      'pending_publishes',
      'projections',
      'quarantine',
      'relay_capabilities',
      'replaceable_heads',
      'sync_cursors'
    ]);
  });

  it('stores events with tag rows and reads by id', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-event-test' });
    await store.putEvent({
      id: 'e1',
      pubkey: 'p1',
      created_at: 1,
      kind: 1,
      tags: [['e', 'parent']],
      content: 'hello',
      sig: 's1'
    });

    await expect(store.getById('e1')).resolves.toMatchObject({ id: 'e1' });
    await expect(store.getByTagValue('e:parent')).resolves.toHaveLength(1);
  });

  it('stores quarantine diagnostics without creating visible events', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-quarantine-test' });
    await store.putQuarantine({
      relayUrl: 'wss://relay.example',
      eventId: 'bad',
      reason: 'invalid-signature',
      rawEvent: { id: 'bad' }
    });

    await expect(store.getById('bad')).resolves.toBeNull();
    await expect(store.listQuarantine()).resolves.toHaveLength(1);
  });
});
