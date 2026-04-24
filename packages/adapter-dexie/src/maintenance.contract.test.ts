import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { createDexieEventStore } from './index.js';

describe('Dexie migration metadata', () => {
  it('allows rollback before Dexie-only writes', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-migration-rollback' });
    await store.recordMigrationState({
      version: 1,
      sourceDbName: 'resonote-events',
      migratedRows: 10,
      dexieOnlyWrites: false
    });

    await expect(store.canRollbackMigration()).resolves.toBe(true);
  });

  it('refuses rollback after Dexie-only writes', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-migration-no-rollback' });
    await store.recordMigrationState({
      version: 1,
      sourceDbName: 'resonote-events',
      migratedRows: 10,
      dexieOnlyWrites: true
    });

    await expect(store.canRollbackMigration()).resolves.toBe(false);
  });
});

describe('Dexie retention compaction', () => {
  it('does not compact deletion index or pending publishes before raw old payloads', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-compaction-priority' });

    await store.putWithReconcile({
      id: 'delete',
      pubkey: 'alice',
      created_at: 2,
      kind: 5,
      tags: [['e', 'target']],
      content: '',
      sig: 'sig'
    });
    await store.putPendingPublish({
      id: 'pending',
      status: 'retrying',
      created_at: 3,
      event: {
        id: 'pending',
        pubkey: 'alice',
        created_at: 3,
        kind: 1,
        tags: [],
        content: 'x',
        sig: 'sig'
      }
    });
    await store.putEvent({
      id: 'old',
      pubkey: 'bob',
      created_at: 1,
      kind: 1,
      tags: [['e', 'visible']],
      content: 'old payload',
      sig: 'sig'
    });

    const result = await store.compact({ targetRows: 1, reason: 'quota-critical' });

    expect(result.removedEventIds).toEqual(['old']);
    await expect(store.isDeleted('target', 'alice')).resolves.toBe(true);
    await expect(store.getPendingPublishes()).resolves.toHaveLength(1);
    await expect(store.getByTagValue('e:visible')).resolves.toEqual([]);
  });
});
