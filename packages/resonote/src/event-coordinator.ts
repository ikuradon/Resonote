import { reduceReadSettlement, type StoredEvent } from '@auftakt/core';

import { createHotEventIndex, type HotEventIndex } from './hot-event-index.js';

export type ReadPolicy = 'cacheOnly' | 'localFirst' | 'relayConfirmed' | 'repair';

export interface EventCoordinatorStore {
  getById(id: string): Promise<StoredEvent | null>;
  putWithReconcile(event: StoredEvent): Promise<unknown>;
  recordRelayHint?(hint: {
    readonly eventId: string;
    readonly relayUrl: string;
    readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
    readonly lastSeenAt: number;
  }): Promise<void>;
}

export interface EventCoordinatorRelay {
  verify(
    filters: readonly Record<string, unknown>[],
    options: { readonly reason: ReadPolicy }
  ): Promise<readonly StoredEvent[]>;
}

export interface EventCoordinatorReadOptions {
  readonly policy: ReadPolicy;
}

export interface EventCoordinatorReadResult {
  readonly events: readonly StoredEvent[];
  readonly settlement: ReturnType<typeof reduceReadSettlement>;
}

export function createEventCoordinator(deps: {
  readonly hotIndex?: HotEventIndex;
  readonly store: EventCoordinatorStore;
  readonly relay: EventCoordinatorRelay;
}) {
  const hotIndex = deps.hotIndex ?? createHotEventIndex();

  return {
    applyLocalEvent(event: StoredEvent): void {
      hotIndex.applyVisible(event);
    },
    async materializeFromRelay(event: StoredEvent, relayUrl: string): Promise<boolean> {
      const result = await deps.store.putWithReconcile(event);
      const stored = (result as { stored?: boolean } | undefined)?.stored !== false;
      if (!stored) return false;

      hotIndex.applyVisible(event);
      const hint = {
        eventId: event.id,
        relayUrl,
        source: 'seen' as const,
        lastSeenAt: Math.floor(Date.now() / 1000)
      };
      hotIndex.applyRelayHint(hint);
      await deps.store.recordRelayHint?.(hint);
      return true;
    },
    async read(
      filter: Record<string, unknown>,
      options: EventCoordinatorReadOptions
    ): Promise<EventCoordinatorReadResult> {
      const filters = [filter];
      const ids = Array.isArray(filter.ids)
        ? filter.ids.filter((id): id is string => typeof id === 'string')
        : [];
      const hotHits = ids
        .map((id) => hotIndex.getById(id))
        .filter((event): event is StoredEvent => Boolean(event));
      const hotHitIds = new Set(hotHits.map((event) => event.id));
      const missingIds = ids.filter((id) => !hotHitIds.has(id));
      const durableHits = (
        await Promise.all(missingIds.map((id) => deps.store.getById(id)))
      ).filter((event): event is StoredEvent => Boolean(event));
      const local = [...hotHits, ...durableHits];

      if (options.policy !== 'cacheOnly') {
        void deps.relay.verify(filters, { reason: options.policy });
      }

      return {
        events: local,
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: options.policy === 'cacheOnly',
          relayRequired: options.policy !== 'cacheOnly',
          localHitProvenance: local.length > 0 ? 'store' : null,
          relayHit: false
        })
      };
    }
  };
}
