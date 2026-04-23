import 'fake-indexeddb/auto';

import { defineProjection, toOrderedEventCursor } from '@auftakt/core';
import { describe, expect, it } from 'vitest';

import { createIndexedDbEventStore, type NostrEvent } from './index.js';

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: overrides.id ?? 'event-1',
    pubkey: overrides.pubkey ?? 'pk-1',
    kind: overrides.kind ?? 30030,
    tags: overrides.tags ?? [['d', 'topic']],
    content: overrides.content ?? 'hello',
    created_at: overrides.created_at ?? 100,
    sig: overrides.sig ?? 'sig-1'
  };
}

describe('@auftakt/adapter-indexeddb reconcile contract', () => {
  it('emits replaced-winner + conflict-shadowed-local for newer replaceable', async () => {
    const store = await createIndexedDbEventStore(
      `adapter-indexeddb-reconcile-${Date.now()}-${Math.random()}`
    );

    await store.putWithReconcile(makeEvent({ id: 'old', created_at: 100 }));
    const result = await store.putWithReconcile(makeEvent({ id: 'new', created_at: 200 }));

    expect(result.stored).toBe(true);
    expect(result.emissions).toEqual([
      {
        subjectId: 'new',
        reason: 'replaced-winner',
        state: 'confirmed'
      },
      {
        subjectId: 'old',
        reason: 'conflict-shadowed-local',
        state: 'shadowed'
      }
    ]);
  });

  it('emits ignored-older/shadowed when incoming replaceable loses', async () => {
    const store = await createIndexedDbEventStore(
      `adapter-indexeddb-reconcile-${Date.now()}-${Math.random()}`
    );

    await store.putWithReconcile(makeEvent({ id: 'newer', created_at: 200 }));
    const result = await store.putWithReconcile(makeEvent({ id: 'older', created_at: 100 }));

    expect(result.stored).toBe(false);
    expect(result.emissions).toEqual([
      {
        subjectId: 'older',
        reason: 'ignored-older',
        state: 'shadowed'
      }
    ]);
  });

  it('returns negentropy refs sorted by created_at asc and id asc', async () => {
    const store = await createIndexedDbEventStore(
      `adapter-indexeddb-negentropy-${Date.now()}-${Math.random()}`
    );

    await store.putMany([
      makeEvent({ id: 'b'.repeat(64), created_at: 300, kind: 1, tags: [] }),
      makeEvent({ id: 'c'.repeat(64), created_at: 100, kind: 1, tags: [] }),
      makeEvent({ id: 'a'.repeat(64), created_at: 300, kind: 1, tags: [] })
    ]);

    await expect(store.listNegentropyEventRefs()).resolves.toEqual([
      {
        id: 'c'.repeat(64),
        pubkey: 'pk-1',
        created_at: 100,
        kind: 1,
        tags: []
      },
      {
        id: 'a'.repeat(64),
        pubkey: 'pk-1',
        created_at: 300,
        kind: 1,
        tags: []
      },
      {
        id: 'b'.repeat(64),
        pubkey: 'pk-1',
        created_at: 300,
        kind: 1,
        tags: []
      }
    ]);
  });

  it('lists ordered events deterministically with cursor + direction', async () => {
    const store = await createIndexedDbEventStore(
      `adapter-indexeddb-ordered-${Date.now()}-${Math.random()}`
    );

    await store.putMany([
      makeEvent({ id: 'b'.repeat(64), created_at: 300, kind: 1, tags: [] }),
      makeEvent({ id: 'c'.repeat(64), created_at: 100, kind: 2, tags: [] }),
      makeEvent({ id: 'a'.repeat(64), created_at: 300, kind: 1, tags: [] }),
      makeEvent({ id: 'd'.repeat(64), created_at: 400, kind: 1, tags: [] })
    ]);

    await expect(store.listOrderedEvents({ kinds: [1], limit: 2 })).resolves.toMatchObject([
      { id: 'a'.repeat(64), created_at: 300, kind: 1 },
      { id: 'b'.repeat(64), created_at: 300, kind: 1 }
    ]);

    await expect(
      store.listOrderedEvents({
        kinds: [1],
        direction: 'desc',
        cursor: toOrderedEventCursor({ id: 'd'.repeat(64), created_at: 400 })
      })
    ).resolves.toMatchObject([
      { id: 'b'.repeat(64), created_at: 300, kind: 1 },
      { id: 'a'.repeat(64), created_at: 300, kind: 1 }
    ]);
  });

  it('lists projection source events generically without resurrecting tombstoned entries', async () => {
    const store = await createIndexedDbEventStore(
      `adapter-indexeddb-projection-${Date.now()}-${Math.random()}`
    );

    const projection = defineProjection({
      name: 'generic.timeline',
      sourceKinds: [7, 1111],
      sorts: [
        { key: 'created_at', pushdownSupported: true },
        { key: 'generic:secondary', pushdownSupported: false }
      ]
    });

    await store.putWithReconcile(
      makeEvent({ id: 'comment-1', kind: 1111, tags: [], created_at: 100 })
    );
    await store.putWithReconcile(
      makeEvent({ id: 'reaction-1', kind: 7, tags: [], created_at: 110 })
    );
    await store.putWithReconcile(
      makeEvent({ id: 'profile-1', kind: 0, tags: [], created_at: 120 })
    );
    await store.putWithReconcile(
      makeEvent({ id: 'delete-1', kind: 5, tags: [['e', 'comment-1']], created_at: 130 })
    );

    await expect(
      store.listProjectionSourceEvents(projection, { sortKey: 'generic:secondary' })
    ).resolves.toMatchObject([{ id: 'reaction-1', kind: 7, created_at: 110 }]);
  });

  it('applies verified tombstones and removes stored targets', async () => {
    const store = await createIndexedDbEventStore(
      `adapter-indexeddb-tombstone-${Date.now()}-${Math.random()}`
    );

    const target = makeEvent({ id: 'target-1', kind: 1111, tags: [] });
    await store.putWithReconcile(target);

    const deletion = makeEvent({
      id: 'delete-1',
      kind: 5,
      tags: [['e', 'target-1']]
    });

    const result = await store.putWithReconcile(deletion);

    expect(result.stored).toBe(true);
    expect(result.emissions).toEqual([
      {
        subjectId: 'delete-1',
        reason: 'accepted-new',
        state: 'confirmed'
      },
      {
        subjectId: 'target-1',
        reason: 'tombstoned',
        state: 'deleted'
      }
    ]);
    await expect(store.getById('target-1')).resolves.toBeNull();
    await expect(store.getById('delete-1')).resolves.toMatchObject({ id: 'delete-1', kind: 5 });
  });

  it('suppresses late events after a stored tombstone exists', async () => {
    const store = await createIndexedDbEventStore(
      `adapter-indexeddb-late-event-${Date.now()}-${Math.random()}`
    );

    await store.putWithReconcile(
      makeEvent({
        id: 'delete-late',
        kind: 5,
        tags: [['e', 'late-target']]
      })
    );

    const result = await store.putWithReconcile(
      makeEvent({ id: 'late-target', kind: 1111, tags: [] })
    );

    expect(result.stored).toBe(false);
    expect(result.emissions).toEqual([
      {
        subjectId: 'late-target',
        reason: 'tombstoned',
        state: 'deleted'
      }
    ]);
    await expect(store.getById('late-target')).resolves.toBeNull();
  });
});
