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
