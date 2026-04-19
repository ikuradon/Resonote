import {
  createIndexedDbEventStore,
  IndexedDbEventStore,
  type IndexedDbStoredEvent,
  type NostrEvent
} from '@auftakt/adapter-indexeddb';

const DEFAULT_DB_NAME = 'resonote-events';
const LEGACY_DB_NAME = 'resonote';

let instancePromise: Promise<IndexedDbEventStore> | undefined;

export { type NostrEvent, type IndexedDbStoredEvent as StoredEvent };
export { IndexedDbEventStore as EventsDB };

export async function getEventsDB(): Promise<IndexedDbEventStore> {
  instancePromise ??= (async () => {
    try {
      indexedDB.deleteDatabase(LEGACY_DB_NAME);
    } catch {
      // Ignore — old DB may not exist in fresh installs
    }
    return createIndexedDbEventStore(DEFAULT_DB_NAME);
  })();
  return instancePromise;
}

export function resetEventsDB(): void {
  instancePromise = undefined;
}
