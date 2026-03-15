import { openDB, type IDBPDatabase } from 'idb';

const DEFAULT_DB_NAME = 'resonote-pending-publishes';
const DB_VERSION = 1;
const STORE_NAME = 'events';
export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface PendingEvent {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Singleton DB promise — can be overridden for tests
let dbPromise: Promise<IDBPDatabase> | undefined;
let currentDbName = DEFAULT_DB_NAME;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(currentDbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      }
    });
  }
  return dbPromise;
}

export async function addPendingPublish(event: PendingEvent): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, event);
}

export async function getPendingPublishes(): Promise<PendingEvent[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function removePendingPublish(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function cleanExpired(): Promise<void> {
  const db = await getDB();
  const all: PendingEvent[] = await db.getAll(STORE_NAME);
  const cutoffSec = (Date.now() - PENDING_TTL_MS) / 1000;
  const expired = all.filter((e) => e.created_at < cutoffSec);
  if (expired.length === 0) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await Promise.all([...expired.map((e) => tx.store.delete(e.id)), tx.done]);
}

/** Reset singleton for tests. Optionally supply a unique DB name to isolate test data. */
export function resetPendingDB(dbName?: string): void {
  currentDbName = dbName ?? DEFAULT_DB_NAME;
  dbPromise = undefined;
}
