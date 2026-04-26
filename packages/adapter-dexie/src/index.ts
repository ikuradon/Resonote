import {
  defineProjection,
  type NegentropyEventRef,
  type OfflineDeliveryDecision,
  type OrderedEventCursor,
  type OrderedEventTraversalDirection,
  type OrderedEventTraversalOptions,
  type ProjectionDefinition,
  type ProjectionTraversalOptions,
  type ReconcileEmission,
  reconcileOfflineDelivery
} from '@auftakt/core';
import Dexie from 'dexie';
import type { Event as NostrEvent } from 'nostr-typedef';

import { buildProtectedCompactionEventIds } from './maintenance.js';
import type {
  DexieEventRecord,
  DexiePendingPublishRecord,
  DexieQuarantineRecord,
  DexieRelayCapabilityRecord
} from './schema.js';
import { AuftaktDexieDatabase } from './schema.js';

export type { Event as NostrEvent } from 'nostr-typedef';

export const AUFTAKT_DEXIE_ADAPTER_VERSION = 1;

export interface CreateDexieEventStoreOptions {
  readonly dbName: string;
}

export interface DexieMaterializationResult {
  readonly stored: boolean;
  readonly emissions: ReconcileEmission[];
}

export interface RelayHintInput {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
  readonly lastSeenAt: number;
}

export interface RelayCapabilityRecordInput {
  readonly relayUrl: string;
  readonly nip11Status: 'unknown' | 'ok' | 'failed';
  readonly nip11CheckedAt: number | null;
  readonly nip11ExpiresAt: number | null;
  readonly supportedNips: readonly number[];
  readonly nip11MaxFilters: number | null;
  readonly nip11MaxSubscriptions: number | null;
  readonly learnedMaxFilters: number | null;
  readonly learnedMaxSubscriptions: number | null;
  readonly learnedAt: number | null;
  readonly learnedReason: string | null;
  readonly updatedAt: number;
}

export interface SyncCursorRecordInput {
  readonly key: string;
  readonly relay: string;
  readonly requestKey: string;
  readonly cursor: OrderedEventCursor;
  readonly updatedAt: number;
}

export interface MigrationStateInput {
  readonly version: number;
  readonly sourceDbName: string;
  readonly migratedRows: number;
  readonly dexieOnlyWrites: boolean;
}

export interface CompactionOptions {
  readonly targetRows: number;
  readonly reason: string;
}

export interface CompactionResult {
  readonly removedEventIds: readonly string[];
}

const DELETION_KIND = 5;

export class DexieEventStore {
  constructor(readonly db: AuftaktDexieDatabase) {}

  tableNames(): string[] {
    return this.db.tables.map((table) => table.name);
  }

  async putEvent(event: NostrEvent): Promise<void> {
    await this.db.transaction('rw', this.db.events, this.db.event_tags, async () => {
      await writeEventRecord(this.db, event);
    });
  }

  async putWithReconcile(event: NostrEvent): Promise<DexieMaterializationResult> {
    if (event.kind === DELETION_KIND) return this.applyDeletion(event);
    if (await this.isDeleted(event.id, event.pubkey)) {
      return {
        stored: false,
        emissions: [{ subjectId: event.id, state: 'deleted', reason: 'tombstoned' }]
      };
    }
    if (isReplaceable(event.kind) || isParameterizedReplaceable(event.kind)) {
      return this.applyReplaceable(event);
    }
    await this.putEvent(event);
    return {
      stored: true,
      emissions: [{ subjectId: event.id, state: 'confirmed', reason: 'accepted-new' }]
    };
  }

  async getById(id: string): Promise<NostrEvent | null> {
    const record = await this.db.events.get(id);
    return record ? toNostrEvent(record) : null;
  }

  async put(event: NostrEvent): Promise<boolean> {
    const result = await this.putWithReconcile(event);
    return result.stored;
  }

  async putManyWithReconcile(events: readonly NostrEvent[]): Promise<DexieMaterializationResult[]> {
    const results: DexieMaterializationResult[] = [];
    for (const event of events) {
      results.push(await this.putWithReconcile(event));
    }
    return results;
  }

  async putMany(events: readonly NostrEvent[]): Promise<void> {
    await this.putManyWithReconcile(events);
  }

  async getByPubkeyAndKind(pubkey: string, kind: number): Promise<NostrEvent | null> {
    const rows = await this.db.events.where('[pubkey+kind]').equals([pubkey, kind]).toArray();
    const record = sortEventsDesc(rows).at(0) ?? null;
    return record ? toNostrEvent(record) : null;
  }

  async getManyByPubkeysAndKind(pubkeys: readonly string[], kind: number): Promise<NostrEvent[]> {
    const events = await Promise.all(
      pubkeys.map((pubkey) => this.getByPubkeyAndKind(pubkey, kind))
    );
    return events.filter((event): event is NostrEvent => event !== null);
  }

  async getByReplaceKey(pubkey: string, kind: number, dTag: string): Promise<NostrEvent | null> {
    const head = await this.getReplaceableHead(pubkey, kind, dTag);
    if (head) return head;

    const rows = await this.db.events
      .where('[pubkey+kind+d_tag]')
      .equals([pubkey, kind, dTag])
      .toArray();
    const record = sortEventsDesc(rows).at(0) ?? null;
    return record ? toNostrEvent(record) : null;
  }

  async getByTagValue(tagValue: string, kind?: number): Promise<NostrEvent[]> {
    const parsed = parseTagValue(tagValue);
    const rows = await this.db.event_tags
      .where('[tag+value]')
      .equals([parsed.tag, parsed.value])
      .toArray();
    const ids = [...new Set(rows.map((row) => row.event_id))];
    const events = await this.db.events.bulkGet(ids);
    return events
      .filter((event): event is DexieEventRecord => Boolean(event))
      .filter((event) => kind === undefined || event.kind === kind)
      .map(toNostrEvent);
  }

  async getAllByKind(kind: number): Promise<NostrEvent[]> {
    const records = await this.db.events
      .where('[kind+created_at]')
      .between([kind, Dexie.minKey], [kind, Dexie.maxKey])
      .toArray();
    return records.map(toNostrEvent);
  }

  async getMaxCreatedAt(kind: number, pubkey?: string): Promise<number | null> {
    const records = pubkey
      ? await this.db.events.where('[pubkey+kind]').equals([pubkey, kind]).toArray()
      : await this.db.events
          .where('[kind+created_at]')
          .between([kind, Dexie.minKey], [kind, Dexie.maxKey])
          .toArray();

    if (records.length === 0) return null;
    return Math.max(...records.map((record) => record.created_at));
  }

  async listOrderedEvents(options: OrderedEventTraversalOptions = {}): Promise<NostrEvent[]> {
    const limit = normalizeTraversalLimit(options.limit);
    if (limit === 0) return [];

    const kindSet = options.kinds?.length ? new Set(options.kinds) : null;
    const direction = options.direction ?? 'asc';
    const ordered =
      direction === 'desc'
        ? await this.db.events.orderBy('[created_at+id]').reverse().toArray()
        : await this.db.events.orderBy('[created_at+id]').toArray();

    return ordered
      .filter((event) => isBeyondCursor(event, options.cursor, direction))
      .filter((event) => !kindSet || kindSet.has(event.kind))
      .slice(0, limit)
      .map(toNostrEvent);
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
    const records = await this.db.events.orderBy('[created_at+id]').toArray();
    return records.map((event) => ({
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags
    }));
  }

  async getSyncCursor(key: string): Promise<OrderedEventCursor | null> {
    const record = await this.db.sync_cursors.get(key);
    if (
      !record ||
      typeof record.cursor_created_at !== 'number' ||
      typeof record.cursor_id !== 'string' ||
      record.cursor_id.length === 0
    ) {
      return null;
    }

    return {
      created_at: record.cursor_created_at,
      id: record.cursor_id
    };
  }

  async putSyncCursor(record: SyncCursorRecordInput): Promise<void> {
    await this.db.sync_cursors.put({
      key: record.key,
      relay: record.relay,
      request_key: record.requestKey,
      cursor_created_at: record.cursor.created_at,
      cursor_id: record.cursor.id,
      updated_at: record.updatedAt
    });
  }

  async deleteByIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.db.transaction(
      'rw',
      this.db.events,
      this.db.event_tags,
      this.db.replaceable_heads,
      this.db.event_relay_hints,
      async () => {
        await this.db.events.bulkDelete([...ids]);
        await Promise.all([
          ...ids.map((id) => this.db.event_tags.where('event_id').equals(id).delete()),
          ...ids.map((id) => this.db.replaceable_heads.where('event_id').equals(id).delete()),
          ...ids.map((id) => this.db.event_relay_hints.where('event_id').equals(id).delete())
        ]);
      }
    );
  }

  async clearAll(): Promise<void> {
    await Promise.all(this.db.tables.map((table) => table.clear()));
  }

  async putQuarantine(record: {
    readonly relayUrl: string;
    readonly eventId: string | null;
    readonly reason: string;
    readonly rawEvent: unknown;
  }): Promise<void> {
    const createdAt = Math.floor(Date.now() / 1000);
    await this.db.quarantine.put({
      key: `${record.eventId ?? 'unknown'}:${record.relayUrl}:${record.reason}:${createdAt}`,
      event_id: record.eventId,
      relay_url: record.relayUrl,
      reason: record.reason,
      created_at: createdAt,
      raw_event: record.rawEvent
    });
  }

  async listQuarantine(): Promise<DexieQuarantineRecord[]> {
    return this.db.quarantine.toArray();
  }

  async isDeleted(id: string, pubkey: string): Promise<boolean> {
    return Boolean(await this.db.deletion_index.get(`${id}:${pubkey}`));
  }

  async getReplaceableHead(pubkey: string, kind: number, dTag = ''): Promise<NostrEvent | null> {
    const head = await this.db.replaceable_heads.get(`${pubkey}:${kind}:${dTag}`);
    return head ? this.getById(head.event_id) : null;
  }

  async recordRelayHint(input: RelayHintInput): Promise<void> {
    await this.db.event_relay_hints.put({
      key: `${input.eventId}:${input.relayUrl}:${input.source}`,
      event_id: input.eventId,
      relay_url: input.relayUrl,
      source: input.source,
      last_seen_at: input.lastSeenAt
    });
  }

  async getRelayHints(eventId: string): Promise<RelayHintInput[]> {
    const rows = await this.db.event_relay_hints.where('event_id').equals(eventId).toArray();
    return rows.map((row) => ({
      eventId: row.event_id,
      relayUrl: row.relay_url,
      source: row.source as RelayHintInput['source'],
      lastSeenAt: row.last_seen_at
    }));
  }

  async putRelayCapability(input: RelayCapabilityRecordInput): Promise<void> {
    const existing = await this.db.relay_capabilities.get(input.relayUrl);
    const preservedLearned = {
      learnedMaxFilters: input.learnedMaxFilters ?? existing?.learned_max_filters ?? null,
      learnedMaxSubscriptions:
        input.learnedMaxSubscriptions ?? existing?.learned_max_subscriptions ?? null,
      learnedAt: input.learnedAt ?? existing?.learned_at ?? null,
      learnedReason: input.learnedReason ?? existing?.learned_reason ?? null
    };

    await this.db.relay_capabilities.put({
      relay_url: input.relayUrl,
      nip11_status: input.nip11Status,
      nip11_checked_at: input.nip11CheckedAt,
      nip11_expires_at: input.nip11ExpiresAt,
      supported_nips: [...input.supportedNips],
      nip11_max_filters: input.nip11MaxFilters,
      nip11_max_subscriptions: input.nip11MaxSubscriptions,
      learned_max_filters: preservedLearned.learnedMaxFilters,
      learned_max_subscriptions: preservedLearned.learnedMaxSubscriptions,
      learned_at: preservedLearned.learnedAt,
      learned_reason: preservedLearned.learnedReason,
      updated_at: input.updatedAt
    });
  }

  async getRelayCapability(relayUrl: string): Promise<RelayCapabilityRecordInput | null> {
    const record = await this.db.relay_capabilities.get(relayUrl);
    return record ? toRelayCapabilityInput(record) : null;
  }

  async listRelayCapabilities(): Promise<RelayCapabilityRecordInput[]> {
    const records = await this.db.relay_capabilities.toArray();
    return records.map(toRelayCapabilityInput);
  }

  async recordMigrationState(input: MigrationStateInput): Promise<void> {
    await this.db.migration_state.put({
      key: 'current',
      version: input.version,
      source_db_name: input.sourceDbName,
      migrated_rows: input.migratedRows,
      dexie_only_writes: input.dexieOnlyWrites
    });
  }

  async canRollbackMigration(): Promise<boolean> {
    const state = await this.db.migration_state.get('current');
    return Boolean(state && !state.dexie_only_writes);
  }

  async putPendingPublish(record: DexiePendingPublishRecord): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.pending_publishes,
      this.db.migration_state,
      async () => {
        await this.db.pending_publishes.put(record);
        await this.db.migration_state.update('current', { dexie_only_writes: true });
      }
    );
  }

  async getPendingPublishes(): Promise<DexiePendingPublishRecord[]> {
    return this.db.pending_publishes.toArray();
  }

  async removePendingPublish(id: string): Promise<void> {
    await this.db.pending_publishes.delete(id);
  }

  async drainPendingPublishes(
    deliver: (event: NostrEvent) => Promise<OfflineDeliveryDecision>
  ): Promise<{
    readonly emissions: ReconcileEmission[];
    readonly settledCount: number;
    readonly retryingCount: number;
  }> {
    const pending = await this.getPendingPublishes();
    const emissions: ReconcileEmission[] = [];
    let settledCount = 0;
    let retryingCount = 0;

    for (const record of pending) {
      let decision: OfflineDeliveryDecision;
      try {
        decision = await deliver(record.event);
      } catch {
        decision = 'retrying';
      }

      emissions.push(reconcileOfflineDelivery(record.id, decision));

      if (decision === 'confirmed' || decision === 'rejected') {
        await this.removePendingPublish(record.id);
        settledCount += 1;
        continue;
      }

      await this.db.pending_publishes.update(record.id, { status: 'retrying' });
      retryingCount += 1;
    }

    return { emissions, settledCount, retryingCount };
  }

  async compact(options: CompactionOptions): Promise<CompactionResult> {
    if (options.targetRows <= 0) return { removedEventIds: [] };

    const [deletionIndex, pendingPublishes, events] = await Promise.all([
      this.db.deletion_index.toArray(),
      this.db.pending_publishes.toArray(),
      this.db.events.toArray()
    ]);
    const protectedIds = buildProtectedCompactionEventIds({ deletionIndex, pendingPublishes });
    const removableIds = events
      .filter((event) => event.kind !== DELETION_KIND && !protectedIds.has(event.id))
      .sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id))
      .slice(0, options.targetRows)
      .map((event) => event.id);

    await this.db.transaction('rw', this.db.events, this.db.event_tags, async () => {
      await this.db.events.bulkDelete(removableIds);
      await Promise.all(
        removableIds.map((eventId) => this.db.event_tags.where('event_id').equals(eventId).delete())
      );
    });

    return { removedEventIds: removableIds };
  }

  private async applyDeletion(event: NostrEvent): Promise<DexieMaterializationResult> {
    const targets = deletionTargets(event);
    await this.db.transaction(
      'rw',
      this.db.events,
      this.db.event_tags,
      this.db.deletion_index,
      async () => {
        await writeEventRecord(this.db, event);
        for (const targetId of targets) {
          await this.db.deletion_index.put({
            key: `${targetId}:${event.pubkey}`,
            target_id: targetId,
            pubkey: event.pubkey,
            deletion_id: event.id,
            created_at: event.created_at
          });
          const target = await this.db.events.get(targetId);
          if (target?.pubkey === event.pubkey) {
            await this.db.events.delete(targetId);
            await this.db.event_tags.where('event_id').equals(targetId).delete();
          }
        }
      }
    );
    return {
      stored: true,
      emissions: [
        { subjectId: event.id, state: 'confirmed', reason: 'accepted-new' },
        ...targets.map((id) => ({
          subjectId: id,
          state: 'deleted' as const,
          reason: 'tombstoned' as const
        }))
      ]
    };
  }

  private async applyReplaceable(event: NostrEvent): Promise<DexieMaterializationResult> {
    const dTag = isParameterizedReplaceable(event.kind) ? getDTag(event.tags) : '';
    const key = `${event.pubkey}:${event.kind}:${dTag}`;
    const current = await this.db.replaceable_heads.get(key);
    if (current && current.created_at >= event.created_at) {
      return {
        stored: false,
        emissions: [{ subjectId: event.id, state: 'shadowed', reason: 'ignored-older' }]
      };
    }

    await this.db.transaction(
      'rw',
      this.db.events,
      this.db.event_tags,
      this.db.replaceable_heads,
      async () => {
        if (current) {
          await this.db.events.delete(current.event_id);
          await this.db.event_tags.where('event_id').equals(current.event_id).delete();
        }
        await writeEventRecord(this.db, event);
        await this.db.replaceable_heads.put({
          key,
          event_id: event.id,
          pubkey: event.pubkey,
          kind: event.kind,
          d_tag: dTag,
          created_at: event.created_at
        });
      }
    );
    return {
      stored: true,
      emissions: [
        {
          subjectId: event.id,
          state: 'confirmed',
          reason: current ? 'replaced-winner' : 'accepted-new'
        }
      ]
    };
  }
}

export async function createDexieEventStore(
  options: CreateDexieEventStoreOptions
): Promise<DexieEventStore> {
  const db = new AuftaktDexieDatabase(options.dbName);
  await db.open();
  return new DexieEventStore(db);
}

export * from './schema.js';

function toRelayCapabilityInput(record: DexieRelayCapabilityRecord): RelayCapabilityRecordInput {
  return {
    relayUrl: record.relay_url,
    nip11Status: record.nip11_status as RelayCapabilityRecordInput['nip11Status'],
    nip11CheckedAt: record.nip11_checked_at,
    nip11ExpiresAt: record.nip11_expires_at,
    supportedNips: [...record.supported_nips],
    nip11MaxFilters: record.nip11_max_filters,
    nip11MaxSubscriptions: record.nip11_max_subscriptions,
    learnedMaxFilters: record.learned_max_filters,
    learnedMaxSubscriptions: record.learned_max_subscriptions,
    learnedAt: record.learned_at,
    learnedReason: record.learned_reason,
    updatedAt: record.updated_at
  };
}

function sortEventsDesc<TEvent extends Pick<NostrEvent, 'created_at' | 'id'>>(
  events: readonly TEvent[]
): TEvent[] {
  return [...events].sort((left, right) => {
    if (right.created_at !== left.created_at) return right.created_at - left.created_at;
    return right.id.localeCompare(left.id);
  });
}

function normalizeTraversalLimit(limit: number | undefined): number {
  if (limit === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.floor(limit);
}

function isBeyondCursor(
  event: Pick<NostrEvent, 'created_at' | 'id'>,
  cursor: OrderedEventCursor | null | undefined,
  direction: OrderedEventTraversalDirection
): boolean {
  if (!cursor) return true;

  if (direction === 'desc') {
    if (event.created_at !== cursor.created_at) return event.created_at < cursor.created_at;
    return event.id < cursor.id;
  }

  if (event.created_at !== cursor.created_at) return event.created_at > cursor.created_at;
  return event.id > cursor.id;
}

async function writeEventRecord(db: AuftaktDexieDatabase, event: NostrEvent): Promise<void> {
  const record = {
    ...event,
    d_tag: getDTag(event.tags),
    tag_values: getTagValues(event.tags)
  };
  await db.events.put(record);
  await db.event_tags.where('event_id').equals(event.id).delete();
  await db.event_tags.bulkPut(
    record.tag_values.map((tagValue) => {
      const parsed = parseTagValue(tagValue);
      return {
        key: `${event.id}:${tagValue}`,
        event_id: event.id,
        tag: parsed.tag,
        value: parsed.value
      };
    })
  );
}

function deletionTargets(event: Pick<NostrEvent, 'tags'>): string[] {
  return [
    ...new Set(
      event.tags
        .filter((tag): tag is [string, string, ...string[]] => tag[0] === 'e' && Boolean(tag[1]))
        .map((tag) => tag[1])
    )
  ];
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

function getTagValues(tags: string[][]): string[] {
  return tags.flatMap((tag) => (tag[0] && tag[1] ? [`${tag[0]}:${tag[1]}`] : []));
}

function parseTagValue(tagValue: string): { tag: string; value: string } {
  const separator = tagValue.indexOf(':');
  if (separator === -1) return { tag: tagValue, value: '' };
  return {
    tag: tagValue.slice(0, separator),
    value: tagValue.slice(separator + 1)
  };
}

function toNostrEvent(record: DexieEventRecord): NostrEvent {
  return {
    id: record.id,
    pubkey: record.pubkey,
    created_at: record.created_at,
    kind: record.kind,
    tags: record.tags,
    content: record.content,
    sig: record.sig
  };
}
