/**
 * Unified Nostr Events DB using IndexedDB (via idb).
 * Stores raw Nostr events with indexes for efficient querying.
 * Handles replaceable event rules per NIP-01.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { Event as NostrEvent } from 'nostr-typedef';
import { createLogger } from '../utils/logger.js';

export type { Event as NostrEvent } from 'nostr-typedef';

const log = createLogger('event-db');

const DB_NAME = 'resonote-events';
const DB_VERSION = 1;
const STORE_NAME = 'events';

export interface StoredEvent extends NostrEvent {
  /** "d" tag value (empty string if absent) */
  d_tag: string;
  /** Indexed tag values in "tagname:value" format for multiEntry index */
  _tag_values: string[];
}

function isReplaceable(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind <= 19999);
}

function isParameterizedReplaceable(kind: number): boolean {
  return kind >= 30000 && kind <= 39999;
}

function getDTag(tags: string[][]): string {
  const dTag = tags.find((t) => t[0] === 'd');
  return dTag?.[1] ?? '';
}

function extractTagValues(tags: string[][]): string[] {
  const values: string[] = [];
  for (const tag of tags) {
    if (tag[0] && tag[1]) {
      values.push(`${tag[0]}:${tag[1]}`);
    }
  }
  return values;
}

function toStoredEvent(event: NostrEvent): StoredEvent {
  return {
    ...event,
    d_tag: getDTag(event.tags),
    _tag_values: extractTagValues(event.tags)
  };
}

function toNostrEvent(stored: StoredEvent): NostrEvent {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { d_tag, _tag_values, ...event } = stored;
  return event;
}

type EventsDBSchema = {
  events: {
    key: string;
    value: StoredEvent;
    indexes: {
      pubkey_kind: [string, number];
      replace_key: [string, number, string];
      kind_created: [number, number];
      tag_values: string;
    };
  };
};

let instancePromise: Promise<EventsDB> | undefined;

async function openEventsDB(): Promise<IDBPDatabase<EventsDBSchema>> {
  return openDB<EventsDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('pubkey_kind', ['pubkey', 'kind']);
      store.createIndex('replace_key', ['pubkey', 'kind', 'd_tag']);
      store.createIndex('kind_created', ['kind', 'created_at']);
      store.createIndex('tag_values', '_tag_values', { multiEntry: true });
    }
  });
}

export class EventsDB {
  private db: IDBPDatabase<EventsDBSchema>;

  constructor(db: IDBPDatabase<EventsDBSchema>) {
    this.db = db;
  }

  /** Replace an existing event if the new one is newer. */
  private async replaceIfNewer(
    existing: StoredEvent | undefined,
    stored: StoredEvent
  ): Promise<boolean> {
    if (!existing) {
      await this.db.put(STORE_NAME, stored);
      return true;
    }
    if (existing.created_at >= stored.created_at) return false;
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    await Promise.all([tx.store.delete(existing.id), tx.store.put(stored), tx.done]);
    return true;
  }

  /**
   * Store a single event, applying replaceable event rules.
   * Returns true if the event was stored, false if skipped (older duplicate).
   */
  async put(event: NostrEvent): Promise<boolean> {
    const stored = toStoredEvent(event);

    if (isReplaceable(event.kind)) {
      const existing = await this.db.getFromIndex(STORE_NAME, 'pubkey_kind', [
        event.pubkey,
        event.kind
      ]);
      return this.replaceIfNewer(existing, stored);
    }

    if (isParameterizedReplaceable(event.kind)) {
      const dTag = getDTag(event.tags);
      const existing = await this.db.getFromIndex(STORE_NAME, 'replace_key', [
        event.pubkey,
        event.kind,
        dTag
      ]);
      return this.replaceIfNewer(existing, stored);
    }

    await this.db.put(STORE_NAME, stored);
    return true;
  }

  /** Store multiple events, applying replaceable event rules for each. */
  async putMany(events: NostrEvent[]): Promise<void> {
    for (const event of events) {
      await this.put(event);
    }
  }

  /** Get the latest replaceable event for a pubkey+kind combination. */
  async getByPubkeyAndKind(pubkey: string, kind: number): Promise<NostrEvent | null> {
    const result = await this.db.getFromIndex(STORE_NAME, 'pubkey_kind', [pubkey, kind]);
    return result ? toNostrEvent(result) : null;
  }

  /** Get replaceable events for multiple pubkeys with the same kind. */
  async getManyByPubkeysAndKind(pubkeys: string[], kind: number): Promise<NostrEvent[]> {
    const results: NostrEvent[] = [];
    const tx = this.db.transaction(STORE_NAME, 'readonly');
    for (const pubkey of pubkeys) {
      const result = await tx.store.index('pubkey_kind').get([pubkey, kind]);
      if (result) results.push(toNostrEvent(result));
    }
    await tx.done;
    return results;
  }

  /** Get a parameterized replaceable event by pubkey+kind+d_tag. */
  async getByReplaceKey(pubkey: string, kind: number, dTag: string): Promise<NostrEvent | null> {
    const result = await this.db.getFromIndex(STORE_NAME, 'replace_key', [pubkey, kind, dTag]);
    return result ? toNostrEvent(result) : null;
  }

  /** Get all events of a given kind. Useful when most events match (e.g., kind:3 for WoT). */
  async getAllByKind(kind: number): Promise<NostrEvent[]> {
    const range = IDBKeyRange.bound([kind, -Infinity], [kind, Infinity]);
    const results = await this.db.getAllFromIndex(STORE_NAME, 'kind_created', range);
    return results.map(toNostrEvent);
  }

  /** Query events by tag value (e.g., "I:spotify:track:xxx"). Optionally filter by kind. */
  async getByTagValue(tagQuery: string, kind?: number): Promise<NostrEvent[]> {
    const results = await this.db.getAllFromIndex(STORE_NAME, 'tag_values', tagQuery);
    const events = results.map(toNostrEvent);
    if (kind !== undefined) {
      return events.filter((e) => e.kind === kind);
    }
    return events;
  }

  /** Get the maximum created_at for a given kind, optionally filtered by pubkey. */
  async getMaxCreatedAt(kind: number, pubkey?: string): Promise<number | null> {
    if (pubkey) {
      const results = await this.db.getAllFromIndex(STORE_NAME, 'pubkey_kind', [pubkey, kind]);
      if (results.length === 0) return null;
      return Math.max(...results.map((r) => r.created_at));
    }

    // Use kind_created index with a cursor in reverse
    const range = IDBKeyRange.bound([kind, -Infinity], [kind, Infinity]);
    const tx = this.db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('kind_created');
    const cursor = await index.openCursor(range, 'prev');
    await tx.done;
    if (cursor) {
      return cursor.value.created_at;
    }
    return null;
  }

  /** Delete events by their IDs. Silently ignores non-existent IDs. */
  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    for (const id of ids) {
      tx.store.delete(id);
    }
    await tx.done;
    log.debug('Deleted events from DB', { count: ids.length });
  }

  /** Clear all events from the database. */
  async clearAll(): Promise<void> {
    await this.db.clear(STORE_NAME);
    log.info('All events cleared from DB');
  }
}

/**
 * Get the singleton EventsDB instance.
 * Also cleans up the legacy 'resonote' database on first call.
 */
export async function getEventsDB(): Promise<EventsDB> {
  if (!instancePromise) {
    instancePromise = (async () => {
      // Clean up legacy DB
      try {
        indexedDB.deleteDatabase('resonote');
      } catch {
        // ignore
      }
      const db = await openEventsDB();
      return new EventsDB(db);
    })();
  }
  return instancePromise;
}

/** Reset singleton (for testing). */
export function resetEventsDB(): void {
  instancePromise = undefined;
}
