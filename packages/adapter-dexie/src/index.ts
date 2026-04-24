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

export interface RelayHintInput {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
  readonly lastSeenAt: number;
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
