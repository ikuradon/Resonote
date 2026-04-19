import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPendingPublish,
  cleanExpired,
  drainPendingPublishes,
  getPendingPublishes,
  PENDING_TTL_MS,
  removePendingPublish,
  resetPendingDB
} from './pending-publishes.js';

let dbCounter = 0;

function makeEvent(overrides: {
  id?: string;
  kind?: number;
  pubkey?: string;
  created_at?: number;
  tags?: string[][];
  content?: string;
  sig?: string;
}) {
  return {
    id: overrides.id ?? 'event-1',
    kind: overrides.kind ?? 1,
    pubkey: overrides.pubkey ?? 'pk-1',
    created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
    tags: overrides.tags ?? [],
    content: overrides.content ?? 'hello',
    sig: overrides.sig ?? 'sig-1'
  };
}

describe('pending-publishes', () => {
  beforeEach(() => {
    resetPendingDB(`resonote-pending-test-${dbCounter++}`);
  });

  describe('addPendingPublish / getPendingPublishes', () => {
    it('should add and retrieve a pending event', async () => {
      const event = makeEvent({ id: 'ev-1' });
      await addPendingPublish(event);

      const results = await getPendingPublishes();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ev-1');
    });

    it('should return empty array when no events are pending', async () => {
      const results = await getPendingPublishes();
      expect(results).toHaveLength(0);
    });

    it('should store multiple events', async () => {
      await addPendingPublish(makeEvent({ id: 'ev-1' }));
      await addPendingPublish(makeEvent({ id: 'ev-2' }));
      await addPendingPublish(makeEvent({ id: 'ev-3' }));

      const results = await getPendingPublishes();
      expect(results).toHaveLength(3);
    });
  });

  describe('removePendingPublish', () => {
    it('should remove an event by id', async () => {
      await addPendingPublish(makeEvent({ id: 'ev-1' }));
      await addPendingPublish(makeEvent({ id: 'ev-2' }));

      await removePendingPublish('ev-1');

      const results = await getPendingPublishes();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ev-2');
    });

    it('should silently succeed when removing non-existent id', async () => {
      await addPendingPublish(makeEvent({ id: 'ev-1' }));

      await expect(removePendingPublish('nonexistent')).resolves.toBeUndefined();

      const results = await getPendingPublishes();
      expect(results).toHaveLength(1);
    });
  });

  describe('cleanExpired', () => {
    it('should remove events older than TTL', async () => {
      const nowMs = Date.now();
      const oldCreatedAt = Math.floor((nowMs - PENDING_TTL_MS - 1000) / 1000);
      const recentCreatedAt = Math.floor(nowMs / 1000);

      await addPendingPublish(makeEvent({ id: 'old-ev', created_at: oldCreatedAt }));
      await addPendingPublish(makeEvent({ id: 'new-ev', created_at: recentCreatedAt }));

      const emissions = await cleanExpired();

      const results = await getPendingPublishes();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('new-ev');
      expect(emissions).toEqual([
        {
          subjectId: 'old-ev',
          reason: 'rejected-offline',
          state: 'rejected'
        }
      ]);
    });

    it('should keep all events when none are expired', async () => {
      const recentCreatedAt = Math.floor(Date.now() / 1000);

      await addPendingPublish(makeEvent({ id: 'ev-1', created_at: recentCreatedAt }));
      await addPendingPublish(makeEvent({ id: 'ev-2', created_at: recentCreatedAt - 100 }));

      const emissions = await cleanExpired();

      const results = await getPendingPublishes();
      expect(results).toHaveLength(2);
      expect(emissions).toEqual([]);
    });

    it('should remove all events when all are expired', async () => {
      const oldCreatedAt = Math.floor((Date.now() - PENDING_TTL_MS - 5000) / 1000);

      await addPendingPublish(makeEvent({ id: 'ev-1', created_at: oldCreatedAt }));
      await addPendingPublish(makeEvent({ id: 'ev-2', created_at: oldCreatedAt - 100 }));

      const emissions = await cleanExpired();

      const results = await getPendingPublishes();
      expect(results).toHaveLength(0);
      expect(emissions).toEqual([
        {
          subjectId: 'ev-1',
          reason: 'rejected-offline',
          state: 'rejected'
        },
        {
          subjectId: 'ev-2',
          reason: 'rejected-offline',
          state: 'rejected'
        }
      ]);
    });
  });

  describe('drainPendingPublishes', () => {
    it('removes confirmed events and keeps retrying events', async () => {
      await addPendingPublish(makeEvent({ id: 'confirmed-1' }));
      await addPendingPublish(makeEvent({ id: 'retry-1' }));

      const result = await drainPendingPublishes(async (event) => {
        if (event.id === 'confirmed-1') return 'confirmed';
        return 'retrying';
      });

      expect(result.settledCount).toBe(1);
      expect(result.retryingCount).toBe(1);
      expect(result.emissions).toEqual([
        {
          subjectId: 'confirmed-1',
          reason: 'confirmed-offline',
          state: 'confirmed'
        },
        {
          subjectId: 'retry-1',
          reason: 'repaired-replay',
          state: 'repairing'
        }
      ]);

      const remaining = await getPendingPublishes();
      expect(remaining.map((event) => event.id)).toEqual(['retry-1']);
    });

    it('removes explicitly rejected events', async () => {
      await addPendingPublish(makeEvent({ id: 'reject-1' }));

      const result = await drainPendingPublishes(async () => 'rejected');

      expect(result.settledCount).toBe(1);
      expect(result.retryingCount).toBe(0);
      expect(result.emissions).toEqual([
        {
          subjectId: 'reject-1',
          reason: 'rejected-offline',
          state: 'rejected'
        }
      ]);
      expect(await getPendingPublishes()).toHaveLength(0);
    });

    it('treats delivery throw as retrying and keeps event queued', async () => {
      await addPendingPublish(makeEvent({ id: 'throw-1' }));

      const result = await drainPendingPublishes(async () => {
        throw new Error('temporary failure');
      });

      expect(result.settledCount).toBe(0);
      expect(result.retryingCount).toBe(1);
      expect(result.emissions).toEqual([
        {
          subjectId: 'throw-1',
          reason: 'repaired-replay',
          state: 'repairing'
        }
      ]);
      expect(await getPendingPublishes()).toHaveLength(1);
    });
  });
});
