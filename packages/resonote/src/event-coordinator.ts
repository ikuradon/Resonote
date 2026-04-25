import { reduceReadSettlement, type StoredEvent } from '@auftakt/core';

import { createHotEventIndex, type HotEventIndex } from './hot-event-index.js';
import { createMaterializerQueue, type MaterializerTask } from './materializer-queue.js';

export type ReadPolicy = 'cacheOnly' | 'localFirst' | 'relayConfirmed' | 'repair';

export interface EventCoordinatorStore {
  getById(id: string): Promise<StoredEvent | null>;
  getAllByKind?(kind: number): Promise<StoredEvent[]>;
  getByTagValue?(tagQuery: string, kind?: number): Promise<StoredEvent[]>;
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

export interface EventCoordinatorRelayCandidate {
  readonly event: unknown;
  readonly relayUrl: string;
}

export type EventCoordinatorIngressResult =
  | { readonly ok: true; readonly event: StoredEvent }
  | { readonly ok: false };

interface AcceptedRelayCandidate {
  readonly event: StoredEvent;
  readonly relayUrl: string;
}

type AcceptedRelayCandidateResult =
  | { readonly ok: true; readonly accepted: AcceptedRelayCandidate }
  | { readonly ok: false };

export interface EventCoordinatorRelayGateway {
  verify(
    filters: readonly Record<string, unknown>[],
    options: { readonly reason: ReadPolicy }
  ): Promise<{
    readonly strategy?: string;
    readonly candidates: readonly EventCoordinatorRelayCandidate[];
  }>;
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

export interface EventCoordinatorSubscriptionHandle {
  unsubscribe(): void;
}

export interface EventCoordinatorVisiblePacket<TEvent extends StoredEvent = StoredEvent> {
  readonly event: TEvent;
  readonly relayHint?: string;
}

export interface EventCoordinatorSubscriptionHandlers<TEvent extends StoredEvent = StoredEvent> {
  readonly onEvent: (packet: EventCoordinatorVisiblePacket<TEvent>) => void | Promise<void>;
  readonly onComplete?: () => void;
  readonly onError?: (error: unknown) => void;
}

export interface EventCoordinatorTransport {
  subscribe(
    filters: readonly Record<string, unknown>[],
    options: { readonly policy: ReadPolicy },
    handlers: {
      readonly onCandidate: (candidate: EventCoordinatorRelayCandidate) => void | Promise<void>;
      readonly onComplete?: () => void;
      readonly onError?: (error: unknown) => void;
    }
  ): EventCoordinatorSubscriptionHandle;
}

export interface EventCoordinatorPublishAck {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly ok: boolean;
}

export interface EventCoordinatorPublishTransport {
  publish(
    event: StoredEvent,
    handlers: { readonly onAck: (packet: EventCoordinatorPublishAck) => Promise<void> | void }
  ): Promise<void>;
}

export interface EventCoordinatorPendingPublishes {
  add(event: StoredEvent): Promise<void>;
}

export interface EventCoordinatorPublishResult {
  readonly queued: boolean;
  readonly ok: boolean;
}

export function createEventCoordinator(deps: {
  readonly hotIndex?: HotEventIndex;
  readonly materializerQueue?: EventCoordinatorMaterializerQueue;
  readonly relayGateway?: EventCoordinatorRelayGateway;
  readonly transport?: EventCoordinatorTransport;
  readonly publishTransport?: EventCoordinatorPublishTransport;
  readonly pendingPublishes?: EventCoordinatorPendingPublishes;
  readonly ingestRelayCandidate?: (
    candidate: EventCoordinatorRelayCandidate
  ) => Promise<EventCoordinatorIngressResult>;
  readonly store: EventCoordinatorStore;
  readonly relay: EventCoordinatorRelay;
}) {
  const hotIndex = deps.hotIndex ?? createHotEventIndex();
  const materializerQueue = deps.materializerQueue ?? createMaterializerQueue();
  const inflightAcceptedByEventId = new Map<string, Promise<AcceptedRelayCandidateResult>>();

  async function acceptAndMaterializeCandidate(
    candidate: EventCoordinatorRelayCandidate
  ): Promise<AcceptedRelayCandidateResult> {
    const accepted = deps.ingestRelayCandidate
      ? await deps.ingestRelayCandidate(candidate)
      : { ok: false as const };
    if (!accepted.ok) return { ok: false };

    const existing = inflightAcceptedByEventId.get(accepted.event.id);
    if (existing) {
      const result = await existing;
      if (result.ok) {
        await recordSeenHint(result.accepted.event.id, candidate.relayUrl);
      }
      return result;
    }

    const task = (async (): Promise<AcceptedRelayCandidateResult> => {
      const materialized = await materialize(accepted.event, candidate.relayUrl);
      if (!materialized.stored && materialized.durability !== 'degraded') {
        return { ok: false };
      }
      return {
        ok: true,
        accepted: {
          event: accepted.event,
          relayUrl: candidate.relayUrl
        }
      };
    })();

    inflightAcceptedByEventId.set(accepted.event.id, task);
    try {
      return await task;
    } finally {
      if (inflightAcceptedByEventId.get(accepted.event.id) === task) {
        inflightAcceptedByEventId.delete(accepted.event.id);
      }
    }
  }

  async function recordSeenHint(eventId: string, relayUrl: string): Promise<void> {
    const hint = buildSeenHint(eventId, relayUrl);
    hotIndex.applyRelayHint(hint);
    await deps.store.recordRelayHint?.(hint);
  }

  async function materialize(
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
          await recordSeenHint(event.id, relayUrl);
          materializeResult = { stored: false, durability: 'degraded' };
          return;
        }
        const stored = (result as { stored?: boolean } | undefined)?.stored !== false;
        if (!stored) {
          materializeResult = { stored: false, durability: 'durable' };
          return;
        }

        hotIndex.applyVisible(event);
        await recordSeenHint(event.id, relayUrl);
        materializeResult = { stored: true, durability: 'durable' };
      }
    });

    await materializerQueue.drain();
    return materializeResult;
  }

  async function read(
    filterOrFilters: Record<string, unknown> | readonly Record<string, unknown>[],
    options: EventCoordinatorReadOptions
  ): Promise<EventCoordinatorReadResult> {
    const filters = Array.isArray(filterOrFilters) ? [...filterOrFilters] : [filterOrFilters];
    const local = await readLocalVisibleEvents(filters, hotIndex, deps.store);
    const relayEvents: StoredEvent[] = [];
    let relaySettled = options.policy === 'cacheOnly';

    if (options.policy !== 'cacheOnly') {
      if (deps.relayGateway) {
        const result = await deps.relayGateway.verify(filters, { reason: options.policy });
        const acceptedResults = await Promise.all(
          result.candidates.map((candidate) => acceptAndMaterializeCandidate(candidate))
        );
        for (const acceptedResult of acceptedResults) {
          if (!acceptedResult.ok) continue;
          relayEvents.push(acceptedResult.accepted.event);
        }
        relaySettled = true;
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

  function subscribe<TEvent extends StoredEvent = StoredEvent>(
    filters: readonly Record<string, unknown>[],
    options: EventCoordinatorReadOptions,
    handlers: EventCoordinatorSubscriptionHandlers<TEvent>
  ): EventCoordinatorSubscriptionHandle {
    if (!deps.transport) {
      queueMicrotask(() => {
        handlers.onComplete?.();
      });
      return { unsubscribe() {} };
    }

    const deliveredEventIds = new Set<string>();

    return deps.transport.subscribe(filters, options, {
      onCandidate: async (candidate) => {
        const acceptedResult = await acceptAndMaterializeCandidate(candidate);
        if (!acceptedResult.ok) return;

        const event = acceptedResult.accepted.event;
        if (deliveredEventIds.has(event.id)) return;
        deliveredEventIds.add(event.id);

        await handlers.onEvent({
          event: event as TEvent,
          relayHint: acceptedResult.accepted.relayUrl || undefined
        });
      },
      onComplete: handlers.onComplete,
      onError: handlers.onError
    });
  }

  async function publish(event: StoredEvent): Promise<EventCoordinatorPublishResult> {
    if (!deps.publishTransport) {
      await deps.pendingPublishes?.add(event);
      return { queued: true, ok: false };
    }

    try {
      await deps.publishTransport.publish(event, {
        onAck: async (packet) => {
          if (!packet.ok || packet.eventId !== event.id) return;
          await deps.store.recordRelayHint?.({
            eventId: event.id,
            relayUrl: packet.relayUrl,
            source: 'published',
            lastSeenAt: Math.floor(Date.now() / 1000)
          });
        }
      });
      return { queued: false, ok: true };
    } catch (error) {
      await deps.pendingPublishes?.add(event);
      throw error;
    }
  }

  return {
    applyLocalEvent(event: StoredEvent): void {
      hotIndex.applyVisible(event);
    },
    materialize,
    materializeFromRelay: materialize,
    read,
    subscribe,
    publish
  };
}

async function readLocalVisibleEvents(
  filters: readonly Record<string, unknown>[],
  hotIndex: HotEventIndex,
  store: EventCoordinatorStore
): Promise<StoredEvent[]> {
  const events = new Map<string, StoredEvent>();

  for (const filter of filters) {
    for (const event of await readLocalVisibleFilter(filter, hotIndex, store)) {
      if (eventMatchesFilter(event, filter)) events.set(event.id, event);
    }
  }

  return [...events.values()];
}

async function readLocalVisibleFilter(
  filter: Record<string, unknown>,
  hotIndex: HotEventIndex,
  store: EventCoordinatorStore
): Promise<StoredEvent[]> {
  const ids = readStringArray(filter.ids);
  if (ids.length > 0) {
    const hotHits = ids
      .map((id) => hotIndex.getById(id))
      .filter((event): event is StoredEvent => Boolean(event));
    const hotHitIds = new Set(hotHits.map((event) => event.id));
    const durableHits = (
      await Promise.all(ids.filter((id) => !hotHitIds.has(id)).map((id) => store.getById(id)))
    ).filter((event): event is StoredEvent => Boolean(event));
    return [...hotHits, ...durableHits];
  }

  const tagFilters = Object.entries(filter).filter(
    ([key, value]) => key.startsWith('#') && readStringArray(value).length > 0
  );
  if (tagFilters.length > 0 && store.getByTagValue) {
    const kinds = readNumberArray(filter.kinds);
    const [tagKey, tagValues] = tagFilters[0]!;
    const tagName = tagKey.slice(1);
    const events = await Promise.all(
      readStringArray(tagValues).flatMap((tagValue) => {
        if (kinds.length === 0) return [store.getByTagValue?.(`${tagName}:${tagValue}`)];
        return kinds.map((kind) => store.getByTagValue?.(`${tagName}:${tagValue}`, kind));
      })
    );
    return events.flatMap((entry) => entry ?? []);
  }

  const kinds = readNumberArray(filter.kinds);
  if (kinds.length > 0 && store.getAllByKind) {
    const events = await Promise.all(kinds.map((kind) => store.getAllByKind?.(kind)));
    return events.flatMap((entry) => entry ?? []);
  }

  return [];
}

function eventMatchesFilter(event: StoredEvent, filter: Record<string, unknown>): boolean {
  const ids = readStringArray(filter.ids);
  if (ids.length > 0 && !ids.includes(event.id)) return false;

  const authors = readStringArray(filter.authors);
  if (authors.length > 0 && !authors.includes(event.pubkey)) return false;

  const kinds = readNumberArray(filter.kinds);
  if (kinds.length > 0 && !kinds.includes(event.kind)) return false;

  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith('#')) continue;
    const expected = readStringArray(value);
    if (expected.length === 0) continue;
    const tagName = key.slice(1);
    const actual = event.tags
      .filter((tag) => tag[0] === tagName && typeof tag[1] === 'string')
      .map((tag) => tag[1]);
    if (!expected.some((entry) => actual.includes(entry))) return false;
  }

  return true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === 'number')
    : [];
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
