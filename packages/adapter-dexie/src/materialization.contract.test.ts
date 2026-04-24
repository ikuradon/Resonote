import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { createDexieEventStore } from './index.js';

describe('Dexie deletion materialization', () => {
  it('stores deletion and hides matching existing target', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-delete-existing' });
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
    await expect(store.getById('delete')).resolves.toMatchObject({ id: 'delete', kind: 5 });
    await expect(store.isDeleted('target', 'alice')).resolves.toBe(true);
  });

  it('suppresses late target by target id and pubkey', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-delete-late' });
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

describe('Dexie replaceable materialization', () => {
  it('keeps newest replaceable head by pubkey and kind', async () => {
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-replaceable' });
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
    const store = await createDexieEventStore({ dbName: 'auftakt-dexie-addressable' });
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
