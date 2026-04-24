import Dexie, { type Table } from 'dexie';
import type { Event as NostrEvent } from 'nostr-typedef';

export interface DexieEventRecord extends NostrEvent {
  readonly d_tag: string;
  readonly tag_values: string[];
  readonly deleted?: boolean;
}

export interface DexieQuarantineRecord {
  readonly key: string;
  readonly event_id: string | null;
  readonly relay_url: string;
  readonly reason: string;
  readonly created_at: number;
  readonly raw_event: unknown;
}

export interface DexieEventTagRecord {
  readonly key: string;
  readonly event_id: string;
  readonly tag: string;
  readonly value: string;
}

export interface DexieDeletionIndexRecord {
  readonly key: string;
  readonly target_id: string;
  readonly pubkey: string;
  readonly deletion_id: string;
  readonly created_at: number;
}

export interface DexieReplaceableHeadRecord {
  readonly key: string;
  readonly event_id: string;
  readonly pubkey: string;
  readonly kind: number;
  readonly d_tag: string;
  readonly created_at: number;
}

export interface DexieRelayHintRecord {
  readonly key: string;
  readonly event_id: string;
  readonly relay_url: string;
  readonly source: string;
  readonly last_seen_at: number;
}

export interface DexieSyncCursorRecord {
  readonly key: string;
  readonly relay: string;
  readonly request_key: string;
  readonly updated_at: number;
}

export interface DexiePendingPublishRecord {
  readonly id: string;
  readonly status: string;
  readonly created_at: number;
  readonly event: NostrEvent;
}

export interface DexieProjectionRecord {
  readonly key: string;
  readonly projection: string;
  readonly sort_key: string;
  readonly value: unknown;
}

export class AuftaktDexieDatabase extends Dexie {
  events!: Table<DexieEventRecord, string>;
  event_tags!: Table<DexieEventTagRecord, string>;
  deletion_index!: Table<DexieDeletionIndexRecord, string>;
  replaceable_heads!: Table<DexieReplaceableHeadRecord, string>;
  event_relay_hints!: Table<DexieRelayHintRecord, string>;
  sync_cursors!: Table<DexieSyncCursorRecord, string>;
  pending_publishes!: Table<DexiePendingPublishRecord, string>;
  projections!: Table<DexieProjectionRecord, string>;
  quarantine!: Table<DexieQuarantineRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      events: 'id,[pubkey+kind],[pubkey+kind+d_tag],[kind+created_at],[created_at+id],*tag_values',
      event_tags: 'key,event_id,[tag+value]',
      deletion_index: 'key,deletion_id,created_at,target_id,pubkey',
      replaceable_heads: 'key,event_id,created_at',
      event_relay_hints: 'key,event_id,relay_url,[event_id+source],last_seen_at',
      sync_cursors: 'key,relay,request_key,updated_at',
      pending_publishes: 'id,created_at,status',
      projections: 'key,[projection+sort_key]',
      quarantine: 'key,event_id,relay_url,reason,created_at'
    });
  }
}
