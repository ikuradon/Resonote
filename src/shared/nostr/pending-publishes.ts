import {
  type OfflineDeliveryDecision,
  type ReconcileEmission,
  reconcileOfflineDelivery
} from '@auftakt/core';
import { type IDBPDatabase, openDB } from 'idb';

const DEFAULT_DB_NAME = 'resonote-pending-publishes';
const DB_VERSION = 1;
const STORE_NAME = 'events';
export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingEvent {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface PendingDrainResult {
  readonly emissions: ReconcileEmission[];
  readonly settledCount: number;
  readonly retryingCount: number;
}

let dbPromise: Promise<IDBPDatabase> | undefined;
let currentDbName = DEFAULT_DB_NAME;

function getDB(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(currentDbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    }
  });
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

export async function cleanExpired(): Promise<ReconcileEmission[]> {
  const db = await getDB();
  const all: PendingEvent[] = await db.getAll(STORE_NAME);
  const cutoffSec = (Date.now() - PENDING_TTL_MS) / 1000;
  const expired = all.filter((event) => event.created_at < cutoffSec);
  if (expired.length === 0) return [];
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await Promise.all([...expired.map((event) => tx.store.delete(event.id)), tx.done]);
  return expired.map((event) => reconcileOfflineDelivery(event.id, 'rejected'));
}

export async function drainPendingPublishes(
  deliver: (event: PendingEvent) => Promise<OfflineDeliveryDecision>
): Promise<PendingDrainResult> {
  const expiredEmissions = await cleanExpired();
  const pending = await getPendingPublishes();

  const emissions: ReconcileEmission[] = [...expiredEmissions];
  let settledCount = expiredEmissions.length;
  let retryingCount = 0;

  for (const event of pending) {
    let decision: OfflineDeliveryDecision;
    try {
      decision = await deliver(event);
    } catch {
      decision = 'retrying';
    }

    emissions.push(reconcileOfflineDelivery(event.id, decision));

    if (decision === 'confirmed' || decision === 'rejected') {
      await removePendingPublish(event.id);
      settledCount += 1;
      continue;
    }

    retryingCount += 1;
  }

  return {
    emissions,
    settledCount,
    retryingCount
  };
}

export function resetPendingDB(dbName?: string): void {
  currentDbName = dbName ?? DEFAULT_DB_NAME;
  dbPromise = undefined;
}
