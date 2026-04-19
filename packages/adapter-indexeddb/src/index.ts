import {
  type ReconcileEmission,
  reconcileReplaceableCandidates,
  type ReplaceableCandidate
} from '@auftakt/timeline';
import { type IDBPDatabase, openDB } from 'idb';
import type { Event as NostrEvent } from 'nostr-typedef';

export type { Event as NostrEvent } from 'nostr-typedef';

const DB_VERSION = 1;
const STORE_NAME = 'events';

export interface IndexedDbStoredEvent extends NostrEvent {
  d_tag: string;
  _tag_values: string[];
}

export interface PutReconcileResult {
  readonly stored: boolean;
  readonly emissions: ReconcileEmission[];
}

interface EventsDBSchema {
  events: {
    key: string;
    value: IndexedDbStoredEvent;
    indexes: {
      pubkey_kind: [string, number];
      replace_key: [string, number, string];
      kind_created: [number, number];
      tag_values: string;
    };
  };
}

function isReplaceable(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind <= 19999);
}

function isParameterizedReplaceable(kind: number): boolean {
  return kind >= 30000 && kind <= 39999;
}

function getDTag(tags: string[][]): string {
  return tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
}

function extractTagValues(tags: string[][]): string[] {
  const values: string[] = [];
  for (const tag of tags) {
    if (tag[0] && tag[1]) values.push(`${tag[0]}:${tag[1]}`);
  }
  return values;
}

function toStoredEvent(event: NostrEvent): IndexedDbStoredEvent {
  return {
    ...event,
    d_tag: getDTag(event.tags),
    _tag_values: extractTagValues(event.tags)
  };
}

function toNostrEvent(stored: IndexedDbStoredEvent): NostrEvent {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { d_tag, _tag_values, ...event } = stored;
  return event;
}

async function openEventsDB(dbName: string): Promise<IDBPDatabase<EventsDBSchema>> {
  return openDB<EventsDBSchema>(dbName, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('pubkey_kind', ['pubkey', 'kind']);
      store.createIndex('replace_key', ['pubkey', 'kind', 'd_tag']);
      store.createIndex('kind_created', ['kind', 'created_at']);
      store.createIndex('tag_values', '_tag_values', { multiEntry: true });
    }
  });
}

export class IndexedDbEventStore {
  constructor(private readonly db: IDBPDatabase<EventsDBSchema>) {}

  private async replaceIfNewer(
    existing: IndexedDbStoredEvent | undefined,
    stored: IndexedDbStoredEvent
  ): Promise<PutReconcileResult> {
    const existingCandidate: ReplaceableCandidate | null = existing
      ? {
          id: existing.id,
          created_at: existing.created_at
        }
      : null;
    const incomingCandidate: ReplaceableCandidate = {
      id: stored.id,
      created_at: stored.created_at
    };

    const emissions = reconcileReplaceableCandidates(existingCandidate, incomingCandidate);
    const shouldStore = emissions.some(
      (emission) =>
        emission.subjectId === stored.id &&
        (emission.reason === 'accepted-new' || emission.reason === 'replaced-winner')
    );

    if (!shouldStore) {
      return {
        stored: false,
        emissions
      };
    }

    if (!existing) {
      await this.db.put(STORE_NAME, stored);
      return {
        stored: true,
        emissions
      };
    }

    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    await Promise.all([tx.store.delete(existing.id), tx.store.put(stored), tx.done]);
    return {
      stored: true,
      emissions
    };
  }

  async putWithReconcile(event: NostrEvent): Promise<PutReconcileResult> {
    const stored = toStoredEvent(event);

    if (isReplaceable(event.kind)) {
      const existing = await this.db.getFromIndex(STORE_NAME, 'pubkey_kind', [
        event.pubkey,
        event.kind
      ]);
      return this.replaceIfNewer(existing, stored);
    }

    if (isParameterizedReplaceable(event.kind)) {
      const existing = await this.db.getFromIndex(STORE_NAME, 'replace_key', [
        event.pubkey,
        event.kind,
        stored.d_tag
      ]);
      return this.replaceIfNewer(existing, stored);
    }

    await this.db.put(STORE_NAME, stored);
    return {
      stored: true,
      emissions: [
        {
          subjectId: event.id,
          reason: 'accepted-new',
          state: 'confirmed'
        }
      ]
    };
  }

  async put(event: NostrEvent): Promise<boolean> {
    const result = await this.putWithReconcile(event);
    return result.stored;
  }

  async putManyWithReconcile(events: NostrEvent[]): Promise<PutReconcileResult[]> {
    const results: PutReconcileResult[] = [];
    for (const event of events) {
      results.push(await this.putWithReconcile(event));
    }
    return results;
  }

  async putMany(events: NostrEvent[]): Promise<void> {
    await this.putManyWithReconcile(events);
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
    return kind === undefined ? events : events.filter((event) => event.kind === kind);
  }

  async getMaxCreatedAt(kind: number, pubkey?: string): Promise<number | null> {
    if (pubkey) {
      const results = await this.db.getAllFromIndex(STORE_NAME, 'pubkey_kind', [pubkey, kind]);
      if (results.length === 0) return null;
      return Math.max(...results.map((result) => result.created_at));
    }

    const range = IDBKeyRange.bound([kind, 0], [kind, Number.MAX_SAFE_INTEGER]);
    const tx = this.db.transaction(STORE_NAME, 'readonly');
    const cursor = await tx.store.index('kind_created').openCursor(range, 'prev');
    await tx.done;
    return cursor ? cursor.value.created_at : null;
  }

  async getById(id: string): Promise<NostrEvent | null> {
    const result = await this.db.get(STORE_NAME, id);
    return result ? toNostrEvent(result) : null;
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    for (const id of ids) void tx.store.delete(id);
    await tx.done;
  }

  async clearAll(): Promise<void> {
    await this.db.clear(STORE_NAME);
  }
}

export async function createIndexedDbEventStore(dbName: string): Promise<IndexedDbEventStore> {
  return new IndexedDbEventStore(await openEventsDB(dbName));
}
