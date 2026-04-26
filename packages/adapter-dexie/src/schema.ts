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

export interface DexieRelayCapabilityRecord {
  readonly relay_url: string;
  readonly nip11_status: string;
  readonly nip11_checked_at: number | null;
  readonly nip11_expires_at: number | null;
  readonly supported_nips: number[];
  readonly nip11_max_filters: number | null;
  readonly nip11_max_subscriptions: number | null;
  readonly learned_max_filters: number | null;
  readonly learned_max_subscriptions: number | null;
  readonly learned_at: number | null;
  readonly learned_reason: string | null;
  readonly updated_at: number;
}

export interface DexieSyncCursorRecord {
  readonly key: string;
  readonly relay: string;
  readonly request_key: string;
  readonly cursor_created_at?: number;
  readonly cursor_id?: string;
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

export interface DexieMigrationStateRecord {
  readonly key: string;
  readonly version: number;
  readonly source_db_name: string;
  readonly migrated_rows: number;
  readonly dexie_only_writes: boolean;
}

export class AuftaktDexieDatabase extends Dexie {
  events!: Table<DexieEventRecord, string>;
  event_tags!: Table<DexieEventTagRecord, string>;
  deletion_index!: Table<DexieDeletionIndexRecord, string>;
  replaceable_heads!: Table<DexieReplaceableHeadRecord, string>;
  event_relay_hints!: Table<DexieRelayHintRecord, string>;
  relay_capabilities!: Table<DexieRelayCapabilityRecord, string>;
  sync_cursors!: Table<DexieSyncCursorRecord, string>;
  pending_publishes!: Table<DexiePendingPublishRecord, string>;
  projections!: Table<DexieProjectionRecord, string>;
  migration_state!: Table<DexieMigrationStateRecord, string>;
  quarantine!: Table<DexieQuarantineRecord, string>;

  constructor(name: string) {
    super(name);
    const versionOneStores = {
      events: 'id,[pubkey+kind],[pubkey+kind+d_tag],[kind+created_at],[created_at+id],*tag_values',
      event_tags: 'key,event_id,[tag+value]',
      deletion_index: 'key,deletion_id,created_at,target_id,pubkey',
      replaceable_heads: 'key,event_id,created_at',
      event_relay_hints: 'key,event_id,relay_url,[event_id+source],last_seen_at',
      sync_cursors: 'key,relay,request_key,updated_at',
      pending_publishes: 'id,created_at,status',
      projections: 'key,[projection+sort_key]',
      migration_state: 'key,version,source_db_name,dexie_only_writes',
      quarantine: 'key,event_id,relay_url,reason,created_at'
    };
    const versionTwoStores = {
      ...versionOneStores,
      relay_capabilities: 'relay_url,nip11_status,nip11_expires_at,learned_at,updated_at'
    };
    const versionFourStores = {
      ...versionTwoStores,
      events:
        'id,[pubkey+kind],[pubkey+kind+created_at],[pubkey+kind+d_tag],[kind+created_at],[created_at+id],*tag_values',
      sync_cursors:
        'key,relay,request_key,[relay+request_key],updated_at,[cursor_created_at+cursor_id]'
    };
    this.version(1).stores(versionOneStores);
    this.version(2).stores(versionTwoStores);
    this.version(3).stores({
      ...versionTwoStores,
      sync_cursors:
        'key,relay,request_key,[relay+request_key],updated_at,[cursor_created_at+cursor_id]'
    });
    this.version(4).stores(versionFourStores);
  }
}
