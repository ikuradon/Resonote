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
      'pending_publishes',
      'projections',
      'quarantine',
      'replaceable_heads',
      'sync_cursors'
    ]);
  });
});
