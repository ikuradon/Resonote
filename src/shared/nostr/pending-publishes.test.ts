import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPendingPublish,
  cleanExpired,
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

      await cleanExpired();

      const results = await getPendingPublishes();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('new-ev');
    });

    it('should keep all events when none are expired', async () => {
      const recentCreatedAt = Math.floor(Date.now() / 1000);

      await addPendingPublish(makeEvent({ id: 'ev-1', created_at: recentCreatedAt }));
      await addPendingPublish(makeEvent({ id: 'ev-2', created_at: recentCreatedAt - 100 }));

      await cleanExpired();

      const results = await getPendingPublishes();
      expect(results).toHaveLength(2);
    });

    it('should remove all events when all are expired', async () => {
      const oldCreatedAt = Math.floor((Date.now() - PENDING_TTL_MS - 5000) / 1000);

      await addPendingPublish(makeEvent({ id: 'ev-1', created_at: oldCreatedAt }));
      await addPendingPublish(makeEvent({ id: 'ev-2', created_at: oldCreatedAt - 100 }));

      await cleanExpired();

      const results = await getPendingPublishes();
      expect(results).toHaveLength(0);
    });
  });
});
