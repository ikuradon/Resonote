import {
  defineProjection,
  type OrderedEventCursor,
  type OrderedEventTraversalDirection,
  type OrderedEventTraversalOptions,
  type ProjectionDefinition,
  type ProjectionTraversalOptions
} from '@auftakt/core';
import {
  extractDeletionTargetIds,
  type NegentropyEventRef,
  reconcileDeletionTargets,
  type ReconcileEmission,
  reconcileReplaceableCandidates,
  type ReplaceableCandidate
} from '@auftakt/core';
import { type IDBPDatabase, openDB } from 'idb';
import type { Event as NostrEvent } from 'nostr-typedef';

export type { Event as NostrEvent } from 'nostr-typedef';

const DB_VERSION = 2;
const STORE_NAME = 'events';
const DELETION_KIND = 5;

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
      created_id: [number, string];
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

function normalizeTraversalDirection(
  direction: OrderedEventTraversalDirection | undefined
): IDBCursorDirection {
  return direction === 'desc' ? 'prev' : 'next';
}

function normalizeTraversalLimit(limit: number | undefined): number {
  if (limit === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.floor(limit);
}

function buildCreatedIdRange(
  cursor: OrderedEventCursor | null | undefined,
  direction: OrderedEventTraversalDirection | undefined
): IDBKeyRange | undefined {
  if (!cursor) return undefined;

  const key: [number, string] = [cursor.created_at, cursor.id];
  return direction === 'desc'
    ? IDBKeyRange.upperBound(key, true)
    : IDBKeyRange.lowerBound(key, true);
}

async function openEventsDB(dbName: string): Promise<IDBPDatabase<EventsDBSchema>> {
  return openDB<EventsDBSchema>(dbName, DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'id' });

      if (!store.indexNames.contains('created_id')) {
        store.createIndex('created_id', ['created_at', 'id']);
      }
      if (!store.indexNames.contains('pubkey_kind')) {
        store.createIndex('pubkey_kind', ['pubkey', 'kind']);
      }
      if (!store.indexNames.contains('replace_key')) {
        store.createIndex('replace_key', ['pubkey', 'kind', 'd_tag']);
      }
      if (!store.indexNames.contains('kind_created')) {
        store.createIndex('kind_created', ['kind', 'created_at']);
      }
      if (!store.indexNames.contains('tag_values')) {
        store.createIndex('tag_values', '_tag_values', { multiEntry: true });
      }
    }
  });
}

export class IndexedDbEventStore {
  constructor(private readonly db: IDBPDatabase<EventsDBSchema>) {}

  private async lookupDeletionPubkeys(targetId: string): Promise<Set<string>> {
    const matches = await this.db.getAllFromIndex(STORE_NAME, 'tag_values', `e:${targetId}`);
    return new Set(
      matches.filter((event) => event.kind === DELETION_KIND).map((event) => event.pubkey)
    );
  }

  private async isTombstoned(eventId: string, eventPubkey: string): Promise<boolean> {
    const deletionPubkeys = await this.lookupDeletionPubkeys(eventId);
    return deletionPubkeys.has(eventPubkey);
  }

  private async applyDeletionEvent(stored: IndexedDbStoredEvent): Promise<PutReconcileResult> {
    const targetIds = extractDeletionTargetIds(stored);
    const targetPubkeys = new Map<string, string>();

    for (const targetId of targetIds) {
      const target = await this.db.get(STORE_NAME, targetId);
      if (target) {
        targetPubkeys.set(targetId, target.pubkey);
      }
    }

    const { verifiedTargetIds, emissions } = reconcileDeletionTargets(stored, targetPubkeys);
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    await tx.store.put(stored);
    for (const targetId of verifiedTargetIds) {
      void tx.store.delete(targetId);
    }
    await tx.done;

    return {
      stored: true,
      emissions: [
        {
          subjectId: stored.id,
          reason: 'accepted-new',
          state: 'confirmed'
        },
        ...emissions
      ]
    };
  }

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

    if (event.kind === DELETION_KIND) {
      return this.applyDeletionEvent(stored);
    }

    if (await this.isTombstoned(event.id, event.pubkey)) {
      return {
        stored: false,
        emissions: reconcileDeletionTargets(
          { pubkey: event.pubkey, tags: [['e', event.id]] },
          new Map([[event.id, event.pubkey]])
        ).emissions
      };
    }

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
    return this.listOrderedEvents({ kinds: [kind] });
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

  async listOrderedEvents(options: OrderedEventTraversalOptions = {}): Promise<NostrEvent[]> {
    const limit = normalizeTraversalLimit(options.limit);
    if (limit === 0) return [];

    const direction = options.direction;
    const kindSet = options.kinds?.length ? new Set(options.kinds) : null;
    const tx = this.db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('created_id');
    const range = buildCreatedIdRange(options.cursor, direction);
    const results: NostrEvent[] = [];

    let cursor = await index.openCursor(range, normalizeTraversalDirection(direction));
    while (cursor && results.length < limit) {
      if (!kindSet || kindSet.has(cursor.value.kind)) {
        results.push(toNostrEvent(cursor.value));
      }
      cursor = await cursor.continue();
    }

    await tx.done;
    return results;
  }

  async listProjectionSourceEvents(
    definition: ProjectionDefinition,
    options: ProjectionTraversalOptions = {}
  ): Promise<NostrEvent[]> {
    const projection = defineProjection(definition);
    const sortKey = options.sortKey ?? 'created_at';
    const sort = projection.sorts.find((entry) => entry.key === sortKey);

    if (!sort) {
      throw new Error(`Projection sort is not registered: ${projection.name}:${sortKey}`);
    }

    if (sortKey !== 'created_at' && sort.pushdownSupported) {
      throw new Error(
        `Projection sort pushdown requires adapter-owned implementation: ${projection.name}:${sortKey}`
      );
    }

    return this.listOrderedEvents({
      cursor: options.cursor,
      direction: options.direction,
      limit: options.limit,
      kinds: projection.sourceKinds
    });
  }

  async listNegentropyEventRefs(): Promise<NegentropyEventRef[]> {
    const results = await this.listOrderedEvents();
    return results.map((event) => ({
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags
    }));
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
