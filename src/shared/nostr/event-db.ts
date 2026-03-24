/**
 * Unified Nostr Events DB using IndexedDB (via idb).
 * Stores raw Nostr events with indexes for efficient querying.
 * Handles replaceable event rules per NIP-01.
 */

import { type IDBPDatabase, openDB } from 'idb';
import type { Event as NostrEvent } from 'nostr-typedef';

import { createLogger } from '$shared/utils/logger.js';

export type { Event as NostrEvent } from 'nostr-typedef';

const log = createLogger('event-db');

const DB_NAME = 'resonote-events';
const DB_VERSION = 1;
const STORE_NAME = 'events';

export interface StoredEvent extends NostrEvent {
  d_tag: string;
  _tag_values: string[];
}

function isReplaceable(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind <= 19999);
}

function isParameterizedReplaceable(kind: number): boolean {
  return kind >= 30000 && kind <= 39999;
}

function getDTag(tags: string[][]): string {
  const dTag = tags.find((tag) => tag[0] === 'd');
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

interface EventsDBSchema {
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
}

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

  /**
   * Batch insert events. Regular events are written in a single transaction
   * for performance. Replaceable events (NIP-01 kinds 0/3/10000-19999/30000-39999)
   * use individual put() calls because each needs a read-then-write to enforce
   * the "keep latest only" rule. The two groups are intentionally in separate
   * transactions — partial failure of one group does not roll back the other,
   * which is acceptable because events are idempotent and will be re-fetched.
   */
  async putMany(events: NostrEvent[]): Promise<void> {
    const replaceable: NostrEvent[] = [];
    const regular: StoredEvent[] = [];
    for (const event of events) {
      if (isReplaceable(event.kind) || isParameterizedReplaceable(event.kind)) {
        replaceable.push(event);
      } else {
        regular.push(toStoredEvent(event));
      }
    }
    if (regular.length > 0) {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      for (const stored of regular) void tx.store.put(stored);
      await tx.done;
    }
    for (const event of replaceable) await this.put(event);
  }

  async getByPubkeyAndKind(pubkey: string, kind: number): Promise<NostrEvent | null> {
    const result = await this.db.getFromIndex(STORE_NAME, 'pubkey_kind', [pubkey, kind]);
    return result ? toNostrEvent(result) : null;
  }

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

  async getByReplaceKey(pubkey: string, kind: number, dTag: string): Promise<NostrEvent | null> {
    const result = await this.db.getFromIndex(STORE_NAME, 'replace_key', [pubkey, kind, dTag]);
    return result ? toNostrEvent(result) : null;
  }

  async getAllByKind(kind: number): Promise<NostrEvent[]> {
    const range = IDBKeyRange.bound([kind, 0], [kind, Number.MAX_SAFE_INTEGER]);
    const results = await this.db.getAllFromIndex(STORE_NAME, 'kind_created', range);
    return results.map(toNostrEvent);
  }

  async getByTagValue(tagQuery: string, kind?: number): Promise<NostrEvent[]> {
    const results = await this.db.getAllFromIndex(STORE_NAME, 'tag_values', tagQuery);
    const events = results.map(toNostrEvent);
    if (kind !== undefined) {
      return events.filter((event) => event.kind === kind);
    }
    return events;
  }

  async getMaxCreatedAt(kind: number, pubkey?: string): Promise<number | null> {
    if (pubkey) {
      const results = await this.db.getAllFromIndex(STORE_NAME, 'pubkey_kind', [pubkey, kind]);
      if (results.length === 0) return null;
      return Math.max(...results.map((result) => result.created_at));
    }

    const range = IDBKeyRange.bound([kind, 0], [kind, Number.MAX_SAFE_INTEGER]);
    const tx = this.db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('kind_created');
    const cursor = await index.openCursor(range, 'prev');
    await tx.done;
    if (cursor) {
      return cursor.value.created_at;
    }
    return null;
  }

  async getById(id: string): Promise<NostrEvent | null> {
    const result = await this.db.get(STORE_NAME, id);
    return result ? toNostrEvent(result) : null;
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    for (const id of ids) {
      void tx.store.delete(id);
    }
    await tx.done;
    log.debug('Deleted events from DB', { count: ids.length });
  }

  async clearAll(): Promise<void> {
    await this.db.clear(STORE_NAME);
    log.info('All events cleared from DB');
  }
}

export async function getEventsDB(): Promise<EventsDB> {
  instancePromise ??= (async () => {
    // Fire-and-forget: delete legacy DB ('resonote') that was renamed to 'resonote-events'.
    // If another tab holds the old DB open, deletion is queued silently — this is fine
    // because the two DB names never conflict.
    try {
      indexedDB.deleteDatabase('resonote');
    } catch {
      // Ignore — old DB may not exist in fresh installs
    }
    const db = await openEventsDB();
    return new EventsDB(db);
  })();
  return instancePromise;
}

export function resetEventsDB(): void {
  instancePromise = undefined;
}
