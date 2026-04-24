import type { ReadSettlement, StoredEvent } from '@auftakt/core';
import { createRxBackwardReq } from '@auftakt/core';
import {
  cachedFetchById as cachedFetchByIdHelper,
  invalidateFetchByIdCache as invalidateFetchByIdCacheHelper,
  type LatestReadDriver,
  useCachedLatest as useCachedLatestHelper
} from '@auftakt/resonote';

import { getRxNostr } from '$shared/nostr/client.js';
import { getEventsDB } from '$shared/nostr/event-db.js';

export interface FetchedEventFull extends StoredEvent {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}

export interface SettledReadResult<TEvent> {
  readonly event: TEvent | null;
  readonly settlement: ReadSettlement;
}

export type CachedFetchByIdResult = SettledReadResult<FetchedEventFull>;

interface CachedEvent extends StoredEvent {
  tags: string[][];
  content: string;
  created_at: number;
  pubkey: string;
  id: string;
  kind: number;
}

interface CachedReadRuntime {
  getEventsDB: typeof getEventsDB;
  getRxNostr: typeof getRxNostr;
  createRxBackwardReq: typeof createRxBackwardReq;
}

export interface UseCachedLatestResult {
  readonly event: CachedEvent | null;
  readonly settlement: ReadSettlement;
  destroy(): void;
}

function createCachedReadRuntime(): CachedReadRuntime {
  return {
    getEventsDB,
    getRxNostr,
    createRxBackwardReq
  };
}

let cachedReadRuntime = createCachedReadRuntime();

export async function cachedFetchById(eventId: string): Promise<CachedFetchByIdResult>;
export async function cachedFetchById(
  runtime: CachedReadRuntime,
  eventId: string
): Promise<CachedFetchByIdResult>;
export async function cachedFetchById(
  runtimeOrEventId: CachedReadRuntime | string,
  maybeEventId?: string
): Promise<CachedFetchByIdResult> {
  const runtime = typeof runtimeOrEventId === 'string' ? cachedReadRuntime : runtimeOrEventId;
  const eventId = typeof runtimeOrEventId === 'string' ? runtimeOrEventId : maybeEventId;
  if (!eventId) {
    throw new Error('eventId is required');
  }
  return cachedFetchByIdHelper(runtime, eventId);
}

export function invalidateFetchByIdCache(eventId: string): void;
export function invalidateFetchByIdCache(runtime: CachedReadRuntime, eventId: string): void;
export function invalidateFetchByIdCache(
  runtimeOrEventId: CachedReadRuntime | string,
  maybeEventId?: string
): void {
  const runtime = typeof runtimeOrEventId === 'string' ? cachedReadRuntime : runtimeOrEventId;
  const eventId = typeof runtimeOrEventId === 'string' ? runtimeOrEventId : maybeEventId;
  if (!eventId) {
    throw new Error('eventId is required');
  }
  invalidateFetchByIdCacheHelper(runtime, eventId);
}

export function resetFetchByIdCache(): void {
  cachedReadRuntime = createCachedReadRuntime();
}

export function useCachedLatest(pubkey: string, kind: number): UseCachedLatestResult;
export function useCachedLatest(
  runtime: CachedReadRuntime,
  pubkey: string,
  kind: number
): UseCachedLatestResult;
export function useCachedLatest(
  runtimeOrPubkey: CachedReadRuntime | string,
  pubkeyOrKind: string | number,
  maybeKind?: number
): UseCachedLatestResult {
  const runtime = typeof runtimeOrPubkey === 'string' ? cachedReadRuntime : runtimeOrPubkey;
  const pubkey = typeof runtimeOrPubkey === 'string' ? runtimeOrPubkey : (pubkeyOrKind as string);
  const kind = typeof runtimeOrPubkey === 'string' ? (pubkeyOrKind as number) : maybeKind;
  if (typeof kind !== 'number') {
    throw new Error('kind is required');
  }

  const driver = useCachedLatestHelper<LatestReadDriver<CachedEvent>>(runtime, pubkey, kind);
  const initial = driver.getSnapshot();
  let event = $state<CachedEvent | null>(initial.event);
  let settlement = $state<ReadSettlement>(initial.settlement);
  let destroyed = false;

  const unsubscribe = driver.subscribe(() => {
    if (destroyed) return;
    const snapshot = driver.getSnapshot();
    event = snapshot.event;
    settlement = snapshot.settlement;
  });

  return {
    get event() {
      return event;
    },
    get settlement() {
      return settlement;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      driver.destroy();
    }
  };
}
