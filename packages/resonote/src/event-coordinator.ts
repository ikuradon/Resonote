import { reduceReadSettlement, type StoredEvent } from '@auftakt/core';

export type ReadPolicy = 'cacheOnly' | 'localFirst' | 'relayConfirmed' | 'repair';

export interface EventCoordinatorStore {
  getById(id: string): Promise<StoredEvent | null>;
  putWithReconcile(event: StoredEvent): Promise<unknown>;
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
  readonly store: EventCoordinatorStore;
  readonly relay: EventCoordinatorRelay;
}) {
  return {
    async read(
      filter: Record<string, unknown>,
      options: EventCoordinatorReadOptions
    ): Promise<EventCoordinatorReadResult> {
      const filters = [filter];
      const ids = Array.isArray(filter.ids)
        ? filter.ids.filter((id): id is string => typeof id === 'string')
        : [];
      const local = (await Promise.all(ids.map((id) => deps.store.getById(id)))).filter(
        (event): event is StoredEvent => Boolean(event)
      );

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
