import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { createDexieEventStore } from './index.js';

const relayUrl = 'wss://relay.cursor.test';
const requestKey = 'rq:v1:cursor-contract';
const cursorKey = `relay:${relayUrl}\nrequest:${requestKey}`;
const cursorId = 'b'.repeat(64);

describe('Dexie sync cursor contract', () => {
  it('persists and restores ordered cursors by stable key', async () => {
    const dbName = `auftakt-sync-cursor-${Date.now()}-${Math.random()}`;
    const store = await createDexieEventStore({ dbName });

    await store.putSyncCursor({
      key: cursorKey,
      relay: relayUrl,
      requestKey,
      cursor: {
        created_at: 123,
        id: cursorId
      },
      updatedAt: 456
    });

    await expect(store.getSyncCursor(cursorKey)).resolves.toEqual({
      created_at: 123,
      id: cursorId
    });
    await expect(store.db.sync_cursors.get(cursorKey)).resolves.toMatchObject({
      key: cursorKey,
      relay: relayUrl,
      request_key: requestKey,
      cursor_created_at: 123,
      cursor_id: cursorId,
      updated_at: 456
    });

    store.db.close();

    const reopened = await createDexieEventStore({ dbName });
    await expect(reopened.getSyncCursor(cursorKey)).resolves.toEqual({
      created_at: 123,
      id: cursorId
    });
    reopened.db.close();
  });

  it('treats pre-version-3 timestamp-only rows as empty cursors', async () => {
    const store = await createDexieEventStore({
      dbName: `auftakt-sync-cursor-old-row-${Date.now()}-${Math.random()}`
    });

    await store.db.sync_cursors.put({
      key: cursorKey,
      relay: relayUrl,
      request_key: requestKey,
      updated_at: 111
    });

    await expect(store.getSyncCursor(cursorKey)).resolves.toBeNull();
    store.db.close();
  });
});
