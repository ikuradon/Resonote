import { reduceReadSettlement, type StoredEvent } from '@auftakt/core';

import { createHotEventIndex, type HotEventIndex } from './hot-event-index.js';
import { createMaterializerQueue, type MaterializerTask } from './materializer-queue.js';

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

export interface EventCoordinatorMaterializerQueue {
  enqueue(task: MaterializerTask): void;
  drain(): Promise<void>;
  size(): number;
}

export interface EventCoordinatorRelayGateway {
  verify(
    filters: readonly Record<string, unknown>[],
    options: { readonly reason: ReadPolicy }
  ): Promise<{ readonly events: readonly StoredEvent[] }>;
}

export interface EventCoordinatorReadOptions {
  readonly policy: ReadPolicy;
}

export interface EventCoordinatorReadResult {
  readonly events: readonly StoredEvent[];
  readonly settlement: ReturnType<typeof reduceReadSettlement>;
}

export interface EventCoordinatorMaterializeResult {
  readonly stored: boolean;
  readonly durability: 'durable' | 'degraded';
}

export function createEventCoordinator(deps: {
  readonly hotIndex?: HotEventIndex;
  readonly materializerQueue?: EventCoordinatorMaterializerQueue;
  readonly relayGateway?: EventCoordinatorRelayGateway;
  readonly store: EventCoordinatorStore;
  readonly relay: EventCoordinatorRelay;
}) {
  const hotIndex = deps.hotIndex ?? createHotEventIndex();
  const materializerQueue = deps.materializerQueue ?? createMaterializerQueue();

  return {
    applyLocalEvent(event: StoredEvent): void {
      hotIndex.applyVisible(event);
    },
    async materializeFromRelay(
      event: StoredEvent,
      relayUrl: string
    ): Promise<EventCoordinatorMaterializeResult> {
      let materializeResult: EventCoordinatorMaterializeResult = {
        stored: false,
        durability: 'durable'
      };

      materializerQueue.enqueue({
        priority: event.kind === 5 ? 'critical' : 'normal',
        async run() {
          let result: unknown;
          try {
            result = await deps.store.putWithReconcile(event);
          } catch {
            hotIndex.applyVisible(event);
            hotIndex.applyRelayHint(buildSeenHint(event.id, relayUrl));
            materializeResult = { stored: false, durability: 'degraded' };
            return;
          }
          const stored = (result as { stored?: boolean } | undefined)?.stored !== false;
          if (!stored) {
            materializeResult = { stored: false, durability: 'durable' };
            return;
          }

          hotIndex.applyVisible(event);
          const hint = buildSeenHint(event.id, relayUrl);
          hotIndex.applyRelayHint(hint);
          await deps.store.recordRelayHint?.(hint);
          materializeResult = { stored: true, durability: 'durable' };
        }
      });

      await materializerQueue.drain();
      return materializeResult;
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
      let relayEvents: readonly StoredEvent[] = [];
      let relaySettled = options.policy === 'cacheOnly';

      if (options.policy !== 'cacheOnly') {
        if (deps.relayGateway) {
          const result = await deps.relayGateway.verify(filters, { reason: options.policy });
          relayEvents = result.events;
          relaySettled = true;
          for (const event of relayEvents) {
            hotIndex.applyVisible(event);
          }
        } else {
          void deps.relay.verify(filters, { reason: options.policy });
        }
      }

      const events = mergeEventsById(local, relayEvents);

      return {
        events,
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled,
          relayRequired: options.policy !== 'cacheOnly',
          localHitProvenance: local.length > 0 ? 'store' : null,
          relayHit: relayEvents.length > 0
        })
      };
    }
  };
}

function mergeEventsById(
  localEvents: readonly StoredEvent[],
  relayEvents: readonly StoredEvent[]
): StoredEvent[] {
  const events = new Map<string, StoredEvent>();
  for (const event of localEvents) {
    events.set(event.id, event);
  }
  for (const event of relayEvents) {
    if (!events.has(event.id)) {
      events.set(event.id, event);
    }
  }
  return [...events.values()];
}

function buildSeenHint(eventId: string, relayUrl: string) {
  return {
    eventId,
    relayUrl,
    source: 'seen' as const,
    lastSeenAt: Math.floor(Date.now() / 1000)
  };
}
