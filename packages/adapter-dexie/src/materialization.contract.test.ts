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

describe('Dexie deletion materialization', () => {
  it('stores deletion and hides matching existing target', async () => {
    const store = await createDexieEventStore({
      dbName: 'auftakt-dexie-delete-existing'
    });
    await store.putWithReconcile({
      id: 'target',
      pubkey: 'alice',
      created_at: 1,
      kind: 1,
      tags: [],
      content: 'x',
      sig: 'sig'
    });
    await store.putWithReconcile({
      id: 'delete',
      pubkey: 'alice',
      created_at: 2,
      kind: 5,
      tags: [['e', 'target']],
      content: '',
      sig: 'sig'
    });

    await expect(store.getById('target')).resolves.toBeNull();
    await expect(store.getById('delete')).resolves.toMatchObject({
      id: 'delete',
      kind: 5
    });
    await expect(store.isDeleted('target', 'alice')).resolves.toBe(true);
  });

  it('suppresses late target by target id and pubkey', async () => {
    const store = await createDexieEventStore({
      dbName: 'auftakt-dexie-delete-late'
    });
    await store.putWithReconcile({
      id: 'delete',
      pubkey: 'alice',
      created_at: 2,
      kind: 5,
      tags: [['e', 'target']],
      content: '',
      sig: 'sig'
    });

    const result = await store.putWithReconcile({
      id: 'target',
      pubkey: 'alice',
      created_at: 1,
      kind: 1,
      tags: [],
      content: 'x',
      sig: 'sig'
    });

    expect(result.stored).toBe(false);
    await expect(store.getById('target')).resolves.toBeNull();
  });
});

describe('Dexie NIP-40 expiration materialization', () => {
  it('rejects already expired events before indexing them', async () => {
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-expired-incoming-${Date.now()}`,
      now: () => 100
    });

    const result = await store.putWithReconcile(
      event('expired', {
        created_at: 90,
        tags: [
          ['expiration', '100'],
          ['e', 'root']
        ]
      })
    );

    expect(result).toEqual({
      stored: false,
      emissions: [
        {
          subjectId: 'expired',
          state: 'deleted',
          reason: 'expired'
        }
      ]
    });
    await expect(store.getById('expired')).resolves.toBeNull();
    await expect(store.getByTagValue('e:root')).resolves.toEqual([]);
    await expect(store.listNegentropyEventRefs()).resolves.toEqual([]);
  });

  it('hides and compacts events once their expiration timestamp is reached', async () => {
    let now = 100;
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-expiration-visibility-${Date.now()}`,
      now: () => now
    });
    await store.putWithReconcile(event('visible', { created_at: 80, tags: [['e', 'root']] }));
    await store.putWithReconcile(
      event('expiring', {
        created_at: 90,
        tags: [
          ['expiration', '120'],
          ['e', 'root']
        ]
      })
    );

    await expect(store.getById('expiring')).resolves.toMatchObject({
      id: 'expiring'
    });
    await expect(store.getByTagValue('e:root')).resolves.toHaveLength(2);

    now = 120;

    await expect(store.getById('expiring')).resolves.toBeNull();
    await expect(store.getByTagValue('e:root')).resolves.toEqual([
      expect.objectContaining({ id: 'visible' })
    ]);
    await expect(store.getAllByKind(1)).resolves.toEqual([
      expect.objectContaining({ id: 'visible' })
    ]);
    await expect(store.getMaxCreatedAt(1)).resolves.toBe(80);
    await expect(store.listOrderedEvents({ direction: 'desc' })).resolves.toEqual([
      expect.objectContaining({ id: 'visible' })
    ]);
    await expect(store.listNegentropyEventRefs()).resolves.toEqual([
      expect.objectContaining({ id: 'visible' })
    ]);

    await expect(store.compactExpiredEvents()).resolves.toEqual({
      removedEventIds: ['expiring']
    });
    await expect(store.db.events.get('expiring')).resolves.toBeUndefined();
  });

  it('does not let expired replaceable heads shadow fresh local replacements', async () => {
    let now = 100;
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-expiration-replaceable-${Date.now()}`,
      now: () => now
    });
    await store.putWithReconcile(
      event('profile-expiring', {
        kind: 0,
        created_at: 10,
        tags: [['expiration', '110']]
      })
    );

    now = 110;

    const result = await store.putWithReconcile(event('profile-fresh', { kind: 0, created_at: 9 }));

    expect(result.stored).toBe(true);
    await expect(store.getByPubkeyAndKind('alice', 0)).resolves.toMatchObject({
      id: 'profile-fresh'
    });
    await expect(store.getReplaceableHead('alice', 0, '')).resolves.toMatchObject({
      id: 'profile-fresh'
    });
  });
});

describe('Dexie replaceable materialization', () => {
  it('keeps newest replaceable head by pubkey and kind', async () => {
    const store = await createDexieEventStore({
      dbName: 'auftakt-dexie-replaceable'
    });
    await store.putWithReconcile({
      id: 'old',
      pubkey: 'alice',
      created_at: 1,
      kind: 0,
      tags: [],
      content: 'old',
      sig: 'sig'
    });
    await store.putWithReconcile({
      id: 'new',
      pubkey: 'alice',
      created_at: 2,
      kind: 0,
      tags: [],
      content: 'new',
      sig: 'sig'
    });

    await expect(store.getReplaceableHead('alice', 0, '')).resolves.toMatchObject({ id: 'new' });
    await expect(store.getById('old')).resolves.toBeNull();
  });

  it('keeps newest parameterized replaceable head by d tag', async () => {
    const store = await createDexieEventStore({
      dbName: 'auftakt-dexie-addressable'
    });
    await store.putWithReconcile({
      id: 'old',
      pubkey: 'alice',
      created_at: 1,
      kind: 30030,
      tags: [['d', 'emoji']],
      content: 'old',
      sig: 'sig'
    });
    await store.putWithReconcile({
      id: 'new',
      pubkey: 'alice',
      created_at: 2,
      kind: 30030,
      tags: [['d', 'emoji']],
      content: 'new',
      sig: 'sig'
    });

    await expect(store.getReplaceableHead('alice', 30030, 'emoji')).resolves.toMatchObject({
      id: 'new'
    });
  });
});
