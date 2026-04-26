import 'fake-indexeddb/auto';

import type { Event as NostrEvent } from 'nostr-typedef';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDexieEventStore, type DexieEventStore } from './index.js';

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

function forbidGlobalCreatedAtOrder(store: DexieEventStore): void {
  const original = store.db.events.orderBy.bind(store.db.events);
  vi.spyOn(store.db.events, 'orderBy').mockImplementation((index: string | string[]) => {
    if (index === '[created_at+id]') {
      throw new Error('global created_at scan forbidden for bounded hot path');
    }
    return original(index as string);
  });
}

function forbidLegacyPubkeyKindMaxScan(store: DexieEventStore): void {
  const original = store.db.events.where.bind(store.db.events);
  vi.spyOn(store.db.events, 'where').mockImplementation((index: string | string[]) => {
    if (index === '[pubkey+kind]') {
      throw new Error('legacy pubkey-kind max scan forbidden');
    }
    return original(index as string);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dexie storage hot paths', () => {
  it('uses kind index for ordered traversal', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-hot-kind-${Date.now()}` });
    await store.putMany([
      event('old-kind-1', { kind: 1, created_at: 1 }),
      event('kind-2', { kind: 2, created_at: 2 }),
      event('new-kind-1', { kind: 1, created_at: 3 })
    ]);
    forbidGlobalCreatedAtOrder(store);

    await expect(
      store.listOrderedEvents({ kinds: [1], direction: 'desc', limit: 2 })
    ).resolves.toMatchObject([{ id: 'new-kind-1' }, { id: 'old-kind-1' }]);
  });

  it('uses kind index for projection source traversal', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-hot-projection-${Date.now()}` });
    await store.putMany([
      event('kind-1-a', { kind: 1, created_at: 1 }),
      event('kind-2', { kind: 2, created_at: 2 }),
      event('kind-1-b', { kind: 1, created_at: 3 })
    ]);
    forbidGlobalCreatedAtOrder(store);

    await expect(
      store.listProjectionSourceEvents(
        {
          name: 'kind-one',
          sourceKinds: [1],
          sorts: [{ key: 'created_at', pushdownSupported: true }]
        },
        { direction: 'desc', limit: 2 }
      )
    ).resolves.toMatchObject([{ id: 'kind-1-b' }, { id: 'kind-1-a' }]);
  });

  it('uses pubkey kind created_at index for author max created_at lookups', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-hot-max-${Date.now()}` });
    await store.putMany([
      event('alice-old', { pubkey: 'alice', kind: 1, created_at: 1 }),
      event('bob-newer', { pubkey: 'bob', kind: 1, created_at: 5 }),
      event('alice-new', { pubkey: 'alice', kind: 1, created_at: 3 })
    ]);
    expect(store.db.events.schema.indexes.map((index) => index.name)).toContain(
      '[pubkey+kind+created_at]'
    );
    forbidLegacyPubkeyKindMaxScan(store);

    await expect(store.getMaxCreatedAt(1, 'alice')).resolves.toBe(3);
  });

  it('keeps tag and relay hint hot paths indexed', async () => {
    const store = await createDexieEventStore({ dbName: `dexie-hot-existing-${Date.now()}` });
    const eventTagIndexes = store.db.event_tags.schema.indexes.map((index) => index.name);
    const relayHintIndexes = store.db.event_relay_hints.schema.indexes.map((index) => index.name);

    expect(eventTagIndexes).toContain('[tag+value]');
    expect(eventTagIndexes).toContain('event_id');
    expect(relayHintIndexes).toContain('event_id');
    expect(relayHintIndexes).toContain('[event_id+source]');
  });
});
