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

  it('does not tombstone target when kind:5 author differs from target author', async () => {
    const store = await createDexieEventStore({
      dbName: 'auftakt-dexie-delete-wrong-author'
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
      id: 'delete-by-bob',
      pubkey: 'bob',
      created_at: 2,
      kind: 5,
      tags: [['e', 'target']],
      content: '',
      sig: 'sig'
    });

    await expect(store.getById('target')).resolves.toMatchObject({
      id: 'target',
      pubkey: 'alice'
    });
    await expect(store.getById('delete-by-bob')).resolves.toMatchObject({
      id: 'delete-by-bob',
      kind: 5
    });
    await expect(store.isDeleted('target', 'alice')).resolves.toBe(false);
  });

  it('suppresses late target arrival after valid same-author kind:5', async () => {
    const store = await createDexieEventStore({
      dbName: 'auftakt-dexie-late-resurrection-suppressed'
    });
    await store.putWithReconcile({
      id: 'delete',
      pubkey: 'alice',
      created_at: 10,
      kind: 5,
      tags: [['e', 'target']],
      content: 'deleting my post',
      sig: 'sig'
    });

    const result = await store.putWithReconcile({
      id: 'target',
      pubkey: 'alice',
      created_at: 5,
      kind: 1,
      tags: [],
      content: 'x',
      sig: 'sig'
    });

    expect(result.stored).toBe(false);
    expect(result.emissions).toContainEqual({
      subjectId: 'target',
      state: 'deleted',
      reason: 'tombstoned'
    });
    await expect(store.getById('target')).resolves.toBeNull();
    await expect(store.isDeleted('target', 'alice')).resolves.toBe(true);
  });

  it('allows late target when kind:5 author differs', async () => {
    const store = await createDexieEventStore({
      dbName: 'auftakt-dexie-wrong-author-no-suppression'
    });
    await store.putWithReconcile({
      id: 'delete-by-bob',
      pubkey: 'bob',
      created_at: 10,
      kind: 5,
      tags: [['e', 'target']],
      content: 'trying to delete',
      sig: 'sig'
    });

    const result = await store.putWithReconcile({
      id: 'target',
      pubkey: 'alice',
      created_at: 5,
      kind: 1,
      tags: [],
      content: 'x',
      sig: 'sig'
    });

    expect(result.stored).toBe(true);
    await expect(store.getById('target')).resolves.toMatchObject({
      id: 'target',
      pubkey: 'alice'
    });
    await expect(store.isDeleted('target', 'alice')).resolves.toBe(false);
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

describe('Dexie NIP-62 request to vanish materialization', () => {
  it('stores the vanish request and removes covered author events and deletion markers', async () => {
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-vanish-existing-${Date.now()}`
    });
    await store.putWithReconcile(event('old-note', { pubkey: 'alice', created_at: 10 }));
    await store.putWithReconcile(
      event('old-profile', { pubkey: 'alice', created_at: 12, kind: 0 })
    );
    await store.putWithReconcile(
      event('old-delete', {
        pubkey: 'alice',
        created_at: 11,
        kind: 5,
        tags: [['e', 'old-note']]
      })
    );
    await store.putWithReconcile(event('future-note', { pubkey: 'alice', created_at: 30 }));

    const result = await store.putWithReconcile(
      event('vanish', {
        pubkey: 'alice',
        created_at: 20,
        kind: 62,
        tags: [['relay', 'ALL_RELAYS']],
        content: 'legal request'
      })
    );

    expect(result.stored).toBe(true);
    expect(result.emissions).toHaveLength(3);
    expect(result.emissions).toContainEqual({
      subjectId: 'vanish',
      state: 'confirmed',
      reason: 'accepted-new'
    });
    expect(result.emissions).toContainEqual({
      subjectId: 'old-profile',
      state: 'deleted',
      reason: 'vanished'
    });
    expect(result.emissions).toContainEqual({
      subjectId: 'old-delete',
      state: 'deleted',
      reason: 'vanished'
    });
    await expect(store.getById('old-note')).resolves.toBeNull();
    await expect(store.getById('old-profile')).resolves.toBeNull();
    await expect(store.getById('old-delete')).resolves.toBeNull();
    await expect(store.getById('future-note')).resolves.toMatchObject({
      id: 'future-note'
    });
    await expect(store.getById('vanish')).resolves.toMatchObject({
      id: 'vanish',
      kind: 62
    });
    await expect(store.getVanishCutoff('alice')).resolves.toBe(20);
    await expect(store.listVanishRequests()).resolves.toEqual([
      expect.objectContaining({
        pubkey: 'alice',
        vanish_id: 'vanish',
        created_at: 20,
        target_relays: ['ALL_RELAYS'],
        global: true,
        content: 'legal request'
      })
    ]);
  });

  it('suppresses late author events and gift wraps covered by a request', async () => {
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-vanish-late-${Date.now()}`
    });
    await store.putWithReconcile(
      event('vanish', {
        pubkey: 'alice',
        created_at: 20,
        kind: 62,
        tags: [['relay', 'wss://relay.example']]
      })
    );

    await expect(
      store.putWithReconcile(event('late-note', { pubkey: 'alice', created_at: 10 }))
    ).resolves.toEqual({
      stored: false,
      emissions: [
        {
          subjectId: 'late-note',
          state: 'deleted',
          reason: 'vanished'
        }
      ]
    });
    await expect(
      store.putWithReconcile(
        event('late-delete', {
          pubkey: 'alice',
          created_at: 11,
          kind: 5,
          tags: [['e', 'late-note']]
        })
      )
    ).resolves.toEqual({
      stored: false,
      emissions: [
        {
          subjectId: 'late-delete',
          state: 'deleted',
          reason: 'vanished'
        }
      ]
    });
    await expect(store.getById('late-delete')).resolves.toBeNull();
    await expect(
      store.putWithReconcile(
        event('late-wrap', {
          pubkey: 'ephemeral',
          created_at: 19,
          kind: 1059,
          tags: [['p', 'alice']]
        })
      )
    ).resolves.toEqual({
      stored: false,
      emissions: [
        {
          subjectId: 'late-wrap',
          state: 'deleted',
          reason: 'vanished'
        }
      ]
    });
    await expect(
      store.putWithReconcile(
        event('future-wrap', {
          pubkey: 'ephemeral',
          created_at: 21,
          kind: 1059,
          tags: [['p', 'alice']]
        })
      )
    ).resolves.toMatchObject({ stored: true });
  });

  it('does not let older late vanish requests lower the retention cutoff', async () => {
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-vanish-cutoff-${Date.now()}`
    });
    await store.putWithReconcile(
      event('new-vanish', {
        pubkey: 'alice',
        created_at: 20,
        kind: 62,
        tags: [['relay', 'ALL_RELAYS']]
      })
    );

    await expect(
      store.putWithReconcile(
        event('old-vanish', {
          pubkey: 'alice',
          created_at: 10,
          kind: 62,
          tags: [['relay', 'ALL_RELAYS']]
        })
      )
    ).resolves.toEqual({
      stored: false,
      emissions: [
        {
          subjectId: 'old-vanish',
          state: 'deleted',
          reason: 'vanished'
        }
      ]
    });
    await expect(store.getVanishCutoff('alice')).resolves.toBe(20);
    await expect(
      store.putWithReconcile(
        event('covered-after-old-request', { pubkey: 'alice', created_at: 15 })
      )
    ).resolves.toMatchObject({ stored: false });
  });

  it('rejects malformed kind:62 events without relay tags', async () => {
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-vanish-malformed-${Date.now()}`
    });

    await expect(
      store.putWithReconcile(event('malformed', { pubkey: 'alice', created_at: 20, kind: 62 }))
    ).resolves.toEqual({
      stored: false,
      emissions: [
        {
          subjectId: 'malformed',
          state: 'rejected',
          reason: 'rejected-offline'
        }
      ]
    });
    await expect(store.getById('malformed')).resolves.toBeNull();
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

describe('Dexie mixed materialization visibility', () => {
  it('materializes a mixed batch in input order while exposing only surviving visible events', async () => {
    let now = 100;
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-mixed-batch-${Date.now()}-${Math.random()}`,
      now: () => now
    });

    const results = await store.putManyWithReconcile([
      event('deleted-target', { pubkey: 'alice', created_at: 10, tags: [['t', 'topic']] }),
      event('replace-old', { pubkey: 'alice', kind: 0, created_at: 11 }),
      event('vanish-covered', { pubkey: 'bob', created_at: 12, tags: [['t', 'topic']] }),
      event('expiring', {
        pubkey: 'carol',
        created_at: 13,
        tags: [
          ['expiration', '120'],
          ['t', 'topic']
        ]
      }),
      event('replace-new', { pubkey: 'alice', kind: 0, created_at: 14 }),
      event('delete', {
        pubkey: 'alice',
        kind: 5,
        created_at: 15,
        tags: [['e', 'deleted-target']]
      }),
      event('vanish', { pubkey: 'bob', kind: 62, created_at: 16, tags: [['relay', 'ALL_RELAYS']] }),
      event('survivor', { pubkey: 'dave', created_at: 17, tags: [['t', 'topic']] })
    ]);

    expect(results.map((result) => result.stored)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true
    ]);
    await expect(store.getById('deleted-target')).resolves.toBeNull();
    await expect(store.getById('replace-old')).resolves.toBeNull();
    await expect(store.getById('vanish-covered')).resolves.toBeNull();
    await expect(store.getById('replace-new')).resolves.toMatchObject({ id: 'replace-new' });
    await expect(store.getById('delete')).resolves.toMatchObject({ id: 'delete', kind: 5 });
    await expect(store.getById('vanish')).resolves.toMatchObject({ id: 'vanish', kind: 62 });

    now = 120;

    await expect(store.getById('expiring')).resolves.toBeNull();
    await expect(store.getByTagValue('t:topic')).resolves.toEqual([
      expect.objectContaining({ id: 'survivor' })
    ]);
    await expect(store.getByPubkeyAndKind('alice', 0)).resolves.toMatchObject({
      id: 'replace-new'
    });
  });

  it('keeps ordered traversal and negentropy refs visibility-consistent for mixed storage state', async () => {
    let now = 100;
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-mixed-visibility-${Date.now()}-${Math.random()}`,
      now: () => now
    });

    await store.putManyWithReconcile([
      event('live-a', { pubkey: 'alice', created_at: 10 }),
      event('deleted-target', { pubkey: 'alice', created_at: 11 }),
      event('delete', {
        pubkey: 'alice',
        kind: 5,
        created_at: 12,
        tags: [['e', 'deleted-target']]
      }),
      event('vanished-target', { pubkey: 'bob', created_at: 13 }),
      event('vanish', { pubkey: 'bob', kind: 62, created_at: 14, tags: [['relay', 'ALL_RELAYS']] }),
      event('expiring', { pubkey: 'carol', created_at: 15, tags: [['expiration', '120']] }),
      event('live-b', { pubkey: 'dave', created_at: 16 })
    ]);
    now = 120;

    const orderedIds = (await store.listOrderedEvents({ direction: 'asc' })).map(({ id }) => id);
    const negentropyIds = (await store.listNegentropyEventRefs()).map(({ id }) => id);

    expect(orderedIds).toEqual(['live-a', 'delete', 'vanish', 'live-b']);
    expect(negentropyIds).toEqual(orderedIds);
    await expect(store.listOrderedEvents({ direction: 'desc', limit: 2 })).resolves.toEqual([
      expect.objectContaining({ id: 'live-b' }),
      expect.objectContaining({ id: 'vanish' })
    ]);
  });

  it('excludes deleted, expired, and vanished source events during projection traversal', async () => {
    let now = 100;
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-projection-visible-${Date.now()}-${Math.random()}`,
      now: () => now
    });
    const projection = {
      name: 'comments',
      sourceKinds: [1, 1111],
      sorts: [{ key: 'created_at', pushdownSupported: false }]
    };

    await store.putManyWithReconcile([
      event('live-comment', { pubkey: 'alice', created_at: 10, kind: 1111 }),
      event('deleted-comment', { pubkey: 'alice', created_at: 11, kind: 1111 }),
      event('delete-comment', {
        pubkey: 'alice',
        created_at: 12,
        kind: 5,
        tags: [['e', 'deleted-comment']]
      }),
      event('vanished-comment', { pubkey: 'bob', created_at: 13, kind: 1111 }),
      event('vanish-bob', {
        pubkey: 'bob',
        kind: 62,
        created_at: 14,
        tags: [['relay', 'ALL_RELAYS']]
      }),
      event('expired-comment', {
        pubkey: 'carol',
        kind: 1111,
        created_at: 15,
        tags: [['expiration', '120']]
      }),
      event('live-note', { pubkey: 'dave', created_at: 16, kind: 1 })
    ]);
    now = 120;

    await expect(
      store.listProjectionSourceEvents(projection, { direction: 'asc' })
    ).resolves.toEqual([
      expect.objectContaining({ id: 'live-comment' }),
      expect.objectContaining({ id: 'live-note' })
    ]);
  });

  it('suppresses late resurrection even when callers use the raw putEvent interop path', async () => {
    const store = await createDexieEventStore({
      dbName: `auftakt-dexie-late-resurrection-${Date.now()}-${Math.random()}`
    });

    await store.putWithReconcile(event('target', { pubkey: 'alice', created_at: 10 }));
    await store.putWithReconcile(
      event('delete', { pubkey: 'alice', kind: 5, created_at: 11, tags: [['e', 'target']] })
    );
    await store.putEvent(event('target', { pubkey: 'alice', created_at: 10 }));

    await expect(store.getById('target')).resolves.toBeNull();
    await expect(store.listOrderedEvents({ direction: 'asc' })).resolves.toEqual([
      expect.objectContaining({ id: 'delete' })
    ]);
    await expect(store.listNegentropyEventRefs()).resolves.toEqual([
      expect.objectContaining({ id: 'delete' })
    ]);
  });
});
