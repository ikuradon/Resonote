import 'fake-indexeddb/auto';

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
});
