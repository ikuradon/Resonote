import type { Event as NostrEvent } from 'nostr-typedef';

import type { DexieEventRecord, DexieQuarantineRecord } from './schema.js';
import { AuftaktDexieDatabase } from './schema.js';

export const AUFTAKT_DEXIE_ADAPTER_VERSION = 1;

export interface CreateDexieEventStoreOptions {
  readonly dbName: string;
}

export interface DexieMaterializationResult {
  readonly stored: boolean;
  readonly emissions: readonly {
    readonly subjectId: string;
    readonly state: string;
    readonly reason: string;
  }[];
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

  async getByTagValue(tagValue: string): Promise<NostrEvent[]> {
    const parsed = parseTagValue(tagValue);
    const rows = await this.db.event_tags
      .where('[tag+value]')
      .equals([parsed.tag, parsed.value])
      .toArray();
    const events = await this.db.events.bulkGet(rows.map((row) => row.event_id));
    return events.filter((event): event is DexieEventRecord => Boolean(event)).map(toNostrEvent);
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
      emissions: targets.map((id) => ({ subjectId: id, state: 'deleted', reason: 'tombstoned' }))
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
