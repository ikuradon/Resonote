import type {
  NegentropyEventRef,
  NegentropyTransportResult,
  ReadSettlement,
  ReconcileEmission,
  StoredEvent
} from '@auftakt/core';
import {
  cachedFetchById as cachedFetchByIdHelper,
  invalidateFetchByIdCache as invalidateFetchByIdCacheHelper,
  type LatestReadDriver,
  useCachedLatest as useCachedLatestHelper
} from '@auftakt/runtime';

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

export interface CachedReadRuntime {
  getEventsDB(): Promise<{
    getById(id: string): Promise<StoredEvent | null>;
    getByPubkeyAndKind(pubkey: string, kind: number): Promise<StoredEvent | null>;
    getAllByKind(kind: number): Promise<StoredEvent[]>;
    getByTagValue(tagQuery: string, kind?: number): Promise<StoredEvent[]>;
    listNegentropyEventRefs(): Promise<NegentropyEventRef[]>;
    put(event: StoredEvent): Promise<unknown>;
    putQuarantine?(record: unknown): Promise<void>;
    putWithReconcile?(event: StoredEvent): Promise<{
      stored: boolean;
      emissions: ReconcileEmission[];
    }>;
  }>;
  getRxNostr(): Promise<{
    requestNegentropySync(options: {
      relayUrl: string;
      filter: Record<string, unknown>;
      initialMessageHex: string;
      timeoutMs?: number;
    }): Promise<NegentropyTransportResult>;
    use(
      req: { emit(input: unknown): void; over(): void },
      options?: { on?: { relays?: readonly string[]; defaultReadRelays?: boolean } }
    ): {
      subscribe(observer: {
        next?: (packet: { event: unknown; from?: string }) => void;
        complete?: () => void;
        error?: (error: unknown) => void;
      }): { unsubscribe(): void };
    };
  }>;
  createRxBackwardReq(options?: unknown): {
    emit(input: unknown): void;
    over(): void;
  };
}

export interface UseCachedLatestResult {
  readonly event: CachedEvent | null;
  readonly settlement: ReadSettlement;
  destroy(): void;
}

export async function cachedFetchById(
  runtime: CachedReadRuntime,
  eventId: string
): Promise<CachedFetchByIdResult> {
  if (!eventId) {
    throw new Error('eventId is required');
  }
  return cachedFetchByIdHelper<CachedFetchByIdResult>(runtime, eventId);
}

export function invalidateFetchByIdCache(runtime: CachedReadRuntime, eventId: string): void {
  if (!eventId) {
    throw new Error('eventId is required');
  }
  invalidateFetchByIdCacheHelper(runtime, eventId);
}

export function useCachedLatest(
  runtime: CachedReadRuntime,
  pubkey: string,
  kind: number
): UseCachedLatestResult {
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
