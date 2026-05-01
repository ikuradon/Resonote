import 'fake-indexeddb/auto';

import type { Event as NostrEvent } from 'nostr-typedef';
import { describe, expect, it } from 'vitest';

import { createDexieEventStore } from './index.js';

function event(id: string, overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id,
    pubkey: overrides.pubkey ?? 'alice',
    created_at: overrides.created_at ?? 1,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? '',
    sig: overrides.sig ?? 'sig'
  };
}

describe('Dexie app bridge contract', () => {
  it('supports profile, replaceable, tag, kind, and bulk reads', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-app-bridge-${Date.now()}` });
    await store.put(event('profile', { kind: 0, created_at: 5 }));
    await store.put(event('bookmark', { kind: 39701, tags: [['d', 'https://example.com']] }));
    await store.put(event('tagged', { kind: 1111, tags: [['e', 'root']] }));
    await store.put(event('bob-profile', { pubkey: 'bob', kind: 0, created_at: 6 }));

    await expect(store.getByPubkeyAndKind('alice', 0)).resolves.toMatchObject({ id: 'profile' });
    await expect(store.getManyByPubkeysAndKind(['alice', 'bob'], 0)).resolves.toHaveLength(2);
    await expect(
      store.getByReplaceKey('alice', 39701, 'https://example.com')
    ).resolves.toMatchObject({
      id: 'bookmark'
    });
    await expect(store.getByTagValue('e:root', 1111)).resolves.toEqual([
      expect.objectContaining({ id: 'tagged' })
    ]);
    await expect(store.getAllByKind(0)).resolves.toHaveLength(2);
  });

  it('supports max created_at, ordered traversal, and projection source reads', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-app-traversal-${Date.now()}` });
    await store.putMany([
      event('a', { kind: 1, created_at: 1 }),
      event('b', { kind: 2, created_at: 2 }),
      event('c', { kind: 1, created_at: 3 })
    ]);

    await expect(store.getMaxCreatedAt(1)).resolves.toBe(3);
    await expect(store.getMaxCreatedAt(1, 'alice')).resolves.toBe(3);
    await expect(store.listOrderedEvents({ direction: 'desc', limit: 2 })).resolves.toMatchObject([
      { id: 'c' },
      { id: 'b' }
    ]);
    await expect(
      store.listProjectionSourceEvents({
        name: 'kind-one',
        sourceKinds: [1],
        sorts: [{ key: 'created_at', pushdownSupported: true }]
      })
    ).resolves.toMatchObject([{ id: 'a' }, { id: 'c' }]);
  });

  it('supports delete, clear, and negentropy refs', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-app-maintenance-${Date.now()}` });
    await store.put(event('a', { created_at: 1 }));
    await store.put(event('b', { created_at: 2 }));

    await expect(store.listNegentropyEventRefs()).resolves.toEqual([
      expect.objectContaining({ id: 'a', created_at: 1 }),
      expect.objectContaining({ id: 'b', created_at: 2 })
    ]);

    await store.deleteByIds(['a']);
    await expect(store.getById('a')).resolves.toBeNull();
    await expect(store.getById('b')).resolves.toMatchObject({ id: 'b' });

    await store.clearAll();
    await expect(store.getAllByKind(1)).resolves.toEqual([]);
  });
});
