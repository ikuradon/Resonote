import {
  type OfflineDeliveryDecision,
  type ReconcileEmission,
  reconcileOfflineDelivery
} from '@auftakt/core';
import type { Event as NostrEvent } from 'nostr-typedef';

import { getEventsDB, resetEventsDB } from './event-db.js';

export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingEvent = NostrEvent;

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
  const db = await getEventsDB();
  return (await db.getPendingPublishes()).map((record) => record.event);
}

export async function removePendingPublish(id: string): Promise<void> {
  const db = await getEventsDB();
  await db.removePendingPublish(id);
}

export async function cleanExpired(): Promise<ReconcileEmission[]> {
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
  resetEventsDB(dbName);
}
