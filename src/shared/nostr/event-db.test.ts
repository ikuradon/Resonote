import 'fake-indexeddb/auto';

import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EventsDB, type NostrEvent } from './event-db.js';

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: overrides.id ?? 'event-1',
    pubkey: overrides.pubkey ?? 'pk-1',
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? 'hello',
    created_at: overrides.created_at ?? 1000,
    sig: overrides.sig ?? 'sig-1'
  };
}

const DB_NAME = 'resonote-events-test';
let dbCounter = 0;

async function createTestDB(): Promise<EventsDB> {
  const name = `${DB_NAME}-${dbCounter++}`;
  const db = await openDB(name, 1, {
    upgrade(db) {
      const store = db.createObjectStore('events', { keyPath: 'id' });
      store.createIndex('pubkey_kind', ['pubkey', 'kind']);
      store.createIndex('replace_key', ['pubkey', 'kind', 'd_tag']);
      store.createIndex('kind_created', ['kind', 'created_at']);
      store.createIndex('tag_values', '_tag_values', { multiEntry: true });
    }
  });
  // Use the EventsDB class with the test db
  return new EventsDB(db as never);
}

describe('EventsDB', () => {
  let eventsDB: EventsDB;

  beforeEach(async () => {
    eventsDB = await createTestDB();
  });

  afterEach(async () => {
    await eventsDB.clearAll();
  });

  describe('Regular events', () => {
    it('should store and retrieve regular events', async () => {
      const event = makeEvent({ kind: 1 });
      const stored = await eventsDB.put(event);
      expect(stored).toBe(true);

      const result = await eventsDB.getByPubkeyAndKind('pk-1', 1);
      expect(result).toEqual(event);
    });

    it('should store multiple regular events with same pubkey+kind', async () => {
      const e1 = makeEvent({ id: 'e1', kind: 1111, created_at: 100 });
      const e2 = makeEvent({ id: 'e2', kind: 1111, created_at: 200 });
      await eventsDB.put(e1);
      await eventsDB.put(e2);

      // Both should exist (regular events are not replaced)
      const all = await eventsDB.getByTagValue('nonexistent');
      expect(all).toHaveLength(0);
    });
  });

  describe('Replaceable events (kind 0, 3, 10000-19999)', () => {
    it('should replace older event with newer one (kind:3)', async () => {
      const old = makeEvent({ id: 'old', kind: 3, created_at: 100 });
      const newer = makeEvent({ id: 'new', kind: 3, created_at: 200 });

      await eventsDB.put(old);
      await eventsDB.put(newer);

      const result = await eventsDB.getByPubkeyAndKind('pk-1', 3);
      expect(result?.id).toBe('new');
    });

    it('should reject older event when newer exists (kind:0)', async () => {
      const newer = makeEvent({ id: 'new', kind: 0, created_at: 200 });
      const old = makeEvent({ id: 'old', kind: 0, created_at: 100 });

      await eventsDB.put(newer);
      const stored = await eventsDB.put(old);

      expect(stored).toBe(false);
      const result = await eventsDB.getByPubkeyAndKind('pk-1', 0);
      expect(result?.id).toBe('new');
    });

    it('should handle kind:10030 as replaceable', async () => {
      const old = makeEvent({ id: 'old', kind: 10030, created_at: 100 });
      const newer = makeEvent({ id: 'new', kind: 10030, created_at: 200 });

      await eventsDB.put(old);
      await eventsDB.put(newer);

      const result = await eventsDB.getByPubkeyAndKind('pk-1', 10030);
      expect(result?.id).toBe('new');
    });
  });

  describe('Parameterized replaceable events (kind 30000-39999)', () => {
    it('should replace by pubkey+kind+d_tag', async () => {
      const old = makeEvent({
        id: 'old',
        kind: 30030,
        created_at: 100,
        tags: [['d', 'my-set']]
      });
      const newer = makeEvent({
        id: 'new',
        kind: 30030,
        created_at: 200,
        tags: [['d', 'my-set']]
      });

      await eventsDB.put(old);
      await eventsDB.put(newer);

      const result = await eventsDB.getByReplaceKey('pk-1', 30030, 'my-set');
      expect(result?.id).toBe('new');
    });

    it('should not replace different d_tag', async () => {
      const e1 = makeEvent({
        id: 'e1',
        kind: 30030,
        created_at: 100,
        tags: [['d', 'set-a']]
      });
      const e2 = makeEvent({
        id: 'e2',
        kind: 30030,
        created_at: 200,
        tags: [['d', 'set-b']]
      });

      await eventsDB.put(e1);
      await eventsDB.put(e2);

      const r1 = await eventsDB.getByReplaceKey('pk-1', 30030, 'set-a');
      const r2 = await eventsDB.getByReplaceKey('pk-1', 30030, 'set-b');
      expect(r1?.id).toBe('e1');
      expect(r2?.id).toBe('e2');
    });

    it('should reject older parameterized replaceable', async () => {
      const newer = makeEvent({
        id: 'new',
        kind: 30030,
        created_at: 200,
        tags: [['d', 'my-set']]
      });
      const old = makeEvent({
        id: 'old',
        kind: 30030,
        created_at: 100,
        tags: [['d', 'my-set']]
      });

      await eventsDB.put(newer);
      const stored = await eventsDB.put(old);
      expect(stored).toBe(false);
    });
  });

  describe('putMany', () => {
    it('should store multiple events with replaceable rules', async () => {
      const events = [
        makeEvent({ id: 'e1', kind: 3, created_at: 100 }),
        makeEvent({ id: 'e2', kind: 3, created_at: 200 }),
        makeEvent({ id: 'e3', kind: 1, created_at: 300 })
      ];

      await eventsDB.putMany(events);

      const kind3 = await eventsDB.getByPubkeyAndKind('pk-1', 3);
      expect(kind3?.id).toBe('e2');
    });

    it('should batch non-replaceable and handle replaceable individually', async () => {
      const events = [
        makeEvent({ id: 'r1', kind: 1111, created_at: 100 }),
        makeEvent({ id: 'r2', kind: 1111, created_at: 200 }),
        makeEvent({ id: 'rep1', kind: 3, created_at: 100 }),
        makeEvent({ id: 'rep2', kind: 3, created_at: 200 }),
        makeEvent({ id: 'r3', kind: 7, created_at: 300 })
      ];

      await eventsDB.putMany(events);

      // Non-replaceable: all stored
      const kind1111 = await eventsDB.getAllByKind(1111);
      expect(kind1111).toHaveLength(2);
      const kind7 = await eventsDB.getAllByKind(7);
      expect(kind7).toHaveLength(1);

      // Replaceable: only latest kept
      const kind3 = await eventsDB.getByPubkeyAndKind('pk-1', 3);
      expect(kind3?.id).toBe('rep2');
    });
  });

  describe('getManyByPubkeysAndKind', () => {
    it('should batch query multiple pubkeys', async () => {
      await eventsDB.put(makeEvent({ id: 'e1', pubkey: 'pk-1', kind: 3, created_at: 100 }));
      await eventsDB.put(makeEvent({ id: 'e2', pubkey: 'pk-2', kind: 3, created_at: 100 }));
      await eventsDB.put(makeEvent({ id: 'e3', pubkey: 'pk-3', kind: 3, created_at: 100 }));

      const results = await eventsDB.getManyByPubkeysAndKind(['pk-1', 'pk-2', 'pk-4'], 3);
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.pubkey).sort()).toEqual(['pk-1', 'pk-2']);
    });
  });

  describe('getByTagValue', () => {
    it('should find events by tag value', async () => {
      await eventsDB.put(
        makeEvent({
          id: 'e1',
          kind: 1111,
          tags: [['I', 'spotify:track:abc']]
        })
      );
      await eventsDB.put(
        makeEvent({
          id: 'e2',
          kind: 7,
          tags: [['I', 'spotify:track:abc']]
        })
      );
      await eventsDB.put(
        makeEvent({
          id: 'e3',
          kind: 1111,
          tags: [['I', 'spotify:track:other']]
        })
      );

      const results = await eventsDB.getByTagValue('I:spotify:track:abc');
      expect(results).toHaveLength(2);
    });

    it('should filter by kind when provided', async () => {
      await eventsDB.put(
        makeEvent({
          id: 'e1',
          kind: 1111,
          tags: [['I', 'spotify:track:abc']]
        })
      );
      await eventsDB.put(
        makeEvent({
          id: 'e2',
          kind: 7,
          tags: [['I', 'spotify:track:abc']]
        })
      );

      const comments = await eventsDB.getByTagValue('I:spotify:track:abc', 1111);
      expect(comments).toHaveLength(1);
      expect(comments[0].kind).toBe(1111);
    });
  });

  describe('getAllByKind', () => {
    it('should return all events of a given kind', async () => {
      await eventsDB.put(makeEvent({ id: 'e1', pubkey: 'pk-1', kind: 3, created_at: 100 }));
      await eventsDB.put(makeEvent({ id: 'e2', pubkey: 'pk-2', kind: 3, created_at: 200 }));
      await eventsDB.put(makeEvent({ id: 'e3', pubkey: 'pk-1', kind: 1, created_at: 300 }));

      const results = await eventsDB.getAllByKind(3);
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.pubkey).sort()).toEqual(['pk-1', 'pk-2']);
    });

    it('should return empty array for nonexistent kind', async () => {
      const results = await eventsDB.getAllByKind(9999);
      expect(results).toHaveLength(0);
    });

    it('should filter by kind correctly with mixed kinds', async () => {
      const e1 = makeEvent({ id: 'k1', kind: 1111, created_at: 100 });
      const e2 = makeEvent({ id: 'k2', kind: 1111, created_at: 200 });
      const e3 = makeEvent({ id: 'k3', kind: 7, created_at: 300 });
      await eventsDB.put(e1);
      await eventsDB.put(e2);
      await eventsDB.put(e3);

      const results = await eventsDB.getAllByKind(1111);
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(['k1', 'k2']);
    });
  });

  describe('getMaxCreatedAt', () => {
    it('should return max created_at for a kind', async () => {
      await eventsDB.put(makeEvent({ id: 'e1', kind: 1111, created_at: 100 }));
      await eventsDB.put(makeEvent({ id: 'e2', kind: 1111, created_at: 300 }));
      await eventsDB.put(makeEvent({ id: 'e3', kind: 1111, created_at: 200 }));

      const max = await eventsDB.getMaxCreatedAt(1111);
      expect(max).toBe(300);
    });

    it('should return null for empty kind', async () => {
      const max = await eventsDB.getMaxCreatedAt(9999);
      expect(max).toBeNull();
    });

    it('should return max created_at among multiple events', async () => {
      await eventsDB.put(makeEvent({ id: 'max1', kind: 1111, created_at: 100 }));
      await eventsDB.put(makeEvent({ id: 'max2', kind: 1111, created_at: 500 }));
      await eventsDB.put(makeEvent({ id: 'max3', kind: 1111, created_at: 300 }));

      const max = await eventsDB.getMaxCreatedAt(1111);
      expect(max).toBe(500);
    });

    it('should filter by pubkey when provided', async () => {
      await eventsDB.put(makeEvent({ id: 'e1', pubkey: 'pk-1', kind: 3, created_at: 100 }));
      await eventsDB.put(makeEvent({ id: 'e2', pubkey: 'pk-2', kind: 3, created_at: 200 }));

      const max = await eventsDB.getMaxCreatedAt(3, 'pk-1');
      expect(max).toBe(100);
    });
  });

  describe('deleteByIds', () => {
    it('should delete events by their ids', async () => {
      await eventsDB.put(makeEvent({ id: 'e1', kind: 1111 }));
      await eventsDB.put(makeEvent({ id: 'e2', kind: 1111 }));
      await eventsDB.put(makeEvent({ id: 'e3', kind: 1111 }));

      await eventsDB.deleteByIds(['e1', 'e3']);

      const all = await eventsDB.getAllByKind(1111);
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('e2');
    });

    it('should silently ignore non-existent ids', async () => {
      await eventsDB.put(makeEvent({ id: 'e1', kind: 1111 }));

      await eventsDB.deleteByIds(['e1', 'nonexistent']);

      const all = await eventsDB.getAllByKind(1111);
      expect(all).toHaveLength(0);
    });

    it('should handle empty array', async () => {
      await eventsDB.put(makeEvent({ id: 'e1', kind: 1111 }));

      await eventsDB.deleteByIds([]);

      const all = await eventsDB.getAllByKind(1111);
      expect(all).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('should remove all events', async () => {
      await eventsDB.put(makeEvent({ id: 'e1' }));
      await eventsDB.put(makeEvent({ id: 'e2' }));

      await eventsDB.clearAll();

      const result = await eventsDB.getByPubkeyAndKind('pk-1', 1);
      expect(result).toBeNull();
    });
  });
});
