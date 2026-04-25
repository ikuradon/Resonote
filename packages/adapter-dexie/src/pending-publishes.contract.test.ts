import 'fake-indexeddb/auto';

import { describe, expect, it, vi } from 'vitest';

import { createDexieEventStore } from './index.js';

const pendingEvent = {
  id: 'pending',
  pubkey: 'alice',
  created_at: 10,
  kind: 1,
  tags: [],
  content: 'queued',
  sig: 'sig'
};

describe('Dexie pending publishes', () => {
  it('adds, drains, and removes confirmed pending publishes', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-pending-${Date.now()}` });
    await store.putPendingPublish({
      id: pendingEvent.id,
      status: 'retrying',
      created_at: 10,
      event: pendingEvent
    });

    const deliver = vi.fn(async () => 'confirmed' as const);
    const result = await store.drainPendingPublishes(deliver);

    expect(deliver).toHaveBeenCalledWith(pendingEvent);
    expect(result).toMatchObject({ settledCount: 1, retryingCount: 0 });
    expect(result.emissions).toEqual([
      expect.objectContaining({ subjectId: pendingEvent.id, state: 'confirmed' })
    ]);
    await expect(store.getPendingPublishes()).resolves.toEqual([]);
  });

  it('keeps retrying pending publishes in Dexie', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-pending-retry-${Date.now()}` });
    await store.putPendingPublish({
      id: pendingEvent.id,
      status: 'retrying',
      created_at: 10,
      event: pendingEvent
    });

    const result = await store.drainPendingPublishes(async () => 'retrying' as const);

    expect(result).toMatchObject({ settledCount: 0, retryingCount: 1 });
    await expect(store.getPendingPublishes()).resolves.toHaveLength(1);
  });

  it('removes rejected pending publishes and retries delivery failures', async () => {
    const store = await createDexieEventStore({
      dbName: `dexie-pending-rejected-${Date.now()}`
    });
    await store.putPendingPublish({
      id: 'rejected',
      status: 'retrying',
      created_at: 10,
      event: { ...pendingEvent, id: 'rejected' }
    });
    await store.putPendingPublish({
      id: 'failed',
      status: 'retrying',
      created_at: 11,
      event: { ...pendingEvent, id: 'failed', created_at: 11 }
    });

    const result = await store.drainPendingPublishes(async (event) => {
      if (event.id === 'failed') throw new Error('relay offline');
      return 'rejected';
    });

    expect(result).toMatchObject({ settledCount: 1, retryingCount: 1 });
    await expect(store.getPendingPublishes()).resolves.toEqual([
      expect.objectContaining({ id: 'failed' })
    ]);
  });
});
