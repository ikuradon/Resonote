import {
  type OfflineDeliveryDecision,
  type ReconcileEmission,
  reconcileOfflineDelivery
} from '@auftakt/core';
import type { Event as NostrEvent } from 'nostr-typedef';

import { getEventsDB, resetEventsDB } from './event-db.js';

export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingEvent = NostrEvent;

const LEGACY_PENDING_DB_NAME = 'resonote-pending-publishes';
const LEGACY_PENDING_STORE_NAME = 'events';

let legacyMigrationPromise: Promise<void> | undefined;

export interface PendingDrainResult {
  readonly emissions: ReconcileEmission[];
  readonly settledCount: number;
  readonly retryingCount: number;
}

export async function addPendingPublish(event: PendingEvent): Promise<void> {
  const db = await getEventsDB();
  await db.putPendingPublish({
    id: event.id,
    status: 'retrying',
    created_at: event.created_at,
    event
  });
}

export async function getPendingPublishes(): Promise<PendingEvent[]> {
  await migrateLegacyPendingPublishes();
  const db = await getEventsDB();
  return (await db.getPendingPublishes()).map((record) => record.event);
}

export async function removePendingPublish(id: string): Promise<void> {
  const db = await getEventsDB();
  await db.removePendingPublish(id);
}

export async function cleanExpired(): Promise<ReconcileEmission[]> {
  await migrateLegacyPendingPublishes();
  const db = await getEventsDB();
  const cutoffSec = (Date.now() - PENDING_TTL_MS) / 1000;
  const pending = await db.getPendingPublishes();
  const expired = pending.filter((record) => record.created_at < cutoffSec);
  await Promise.all(expired.map((record) => db.removePendingPublish(record.id)));
  return expired.map((record) => reconcileOfflineDelivery(record.id, 'rejected'));
}

export async function drainPendingPublishes(
  deliver: (event: PendingEvent) => Promise<OfflineDeliveryDecision>
): Promise<PendingDrainResult> {
  await migrateLegacyPendingPublishes();
  const expiredEmissions = await cleanExpired();
  const db = await getEventsDB();
  const result = await db.drainPendingPublishes(deliver);
  return {
    emissions: [...expiredEmissions, ...result.emissions],
    settledCount: expiredEmissions.length + result.settledCount,
    retryingCount: result.retryingCount
  };
}

export function resetPendingDB(dbName?: string): void {
  legacyMigrationPromise = undefined;
  resetEventsDB(dbName);
}

function migrateLegacyPendingPublishes(): Promise<void> {
  legacyMigrationPromise ??= migrateLegacyPendingPublishesOnce().catch(() => {
    legacyMigrationPromise = undefined;
  });
  return legacyMigrationPromise;
}

async function migrateLegacyPendingPublishesOnce(): Promise<void> {
  const legacyEvents = await readLegacyPendingPublishes();
  if (legacyEvents.length > 0) {
    const db = await getEventsDB();
    for (const event of legacyEvents) {
      await db.putPendingPublish({
        id: event.id,
        status: 'retrying',
        created_at: event.created_at,
        event
      });
    }
  }
  await deleteLegacyPendingDB().catch(() => undefined);
}

async function readLegacyPendingPublishes(): Promise<PendingEvent[]> {
  const indexedDB = getGlobalIndexedDB();
  if (!indexedDB) return [];

  const db = await openLegacyPendingDB(indexedDB);
  try {
    if (!db.objectStoreNames.contains(LEGACY_PENDING_STORE_NAME)) return [];
    const tx = db.transaction(LEGACY_PENDING_STORE_NAME, 'readonly');
    const records = await requestToPromise<unknown[]>(
      tx.objectStore(LEGACY_PENDING_STORE_NAME).getAll()
    );
    return records.filter(isPendingEvent);
  } finally {
    db.close();
  }
}

function openLegacyPendingDB(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_PENDING_DB_NAME);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_PENDING_STORE_NAME)) {
        db.createObjectStore(LEGACY_PENDING_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open legacy pending DB'));
  });
}

function deleteLegacyPendingDB(): Promise<void> {
  const indexedDB = getGlobalIndexedDB();
  if (!indexedDB) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LEGACY_PENDING_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to delete legacy pending DB'));
    request.onblocked = () => resolve();
  });
}

function getGlobalIndexedDB(): IDBFactory | undefined {
  return 'indexedDB' in globalThis
    ? (globalThis as { indexedDB?: IDBFactory }).indexedDB
    : undefined;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function isPendingEvent(value: unknown): value is PendingEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<PendingEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.kind === 'number' &&
    typeof event.pubkey === 'string' &&
    typeof event.created_at === 'number' &&
    Array.isArray(event.tags) &&
    typeof event.content === 'string' &&
    typeof event.sig === 'string'
  );
}
