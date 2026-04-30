import {
  createDexieEventStore,
  type DexieEventRecord,
  DexieEventStore
} from '@auftakt/adapter-dexie';
import type { Event as NostrEvent } from 'nostr-typedef';

const DEFAULT_DB_NAME = 'resonote-dexie-events';

let currentDbName = DEFAULT_DB_NAME;
let instancePromise: Promise<DexieEventStore> | undefined;

export { type NostrEvent, type DexieEventRecord as StoredEvent };
export { DexieEventStore as EventsDB };

export async function getEventsDB(): Promise<DexieEventStore> {
  instancePromise ??= createDexieEventStore({ dbName: currentDbName });
  return instancePromise;
}

export function resetEventsDB(dbName?: string): void {
  currentDbName = dbName ?? DEFAULT_DB_NAME;
  instancePromise = undefined;
}
