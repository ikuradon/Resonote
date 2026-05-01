import type { OfflineDeliveryDecision, ReconcileEmission, StoredEvent } from '@auftakt/core';
import type { EventParameters } from 'nostr-typedef';

import { createEventCoordinator } from './event-coordinator.js';
import type { PublishRelaySendOptions } from './relay-selection-runtime.js';

export type PublishTransportOptions = PublishRelaySendOptions;

export interface PublishAckPacket {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly ok: boolean;
}

export interface PublishHintRecorder {
  recordRelayHint(hint: {
    readonly eventId: string;
    readonly relayUrl: string;
    readonly source: 'published';
    readonly lastSeenAt: number;
  }): Promise<void>;
}

export interface PublishRuntime {
  castSigned(params: EventParameters, options?: PublishTransportOptions): Promise<void>;
  observePublishAcks?(
    event: RetryableSignedEvent,
    onAck: (packet: PublishAckPacket) => Promise<void> | void
  ): Promise<void>;
  retryPendingPublishes(): Promise<void>;
  publishSignedEvent(params: EventParameters): Promise<void>;
  publishSignedEvents(params: EventParameters[]): Promise<void>;
}

export interface RetryableSignedEvent extends StoredEvent {
  readonly sig: string;
}

export interface PendingDrainResult {
  readonly emissions: ReconcileEmission[];
  readonly settledCount: number;
  readonly retryingCount: number;
}

export interface PendingPublishQueueRuntime {
  addPendingPublish(event: RetryableSignedEvent): Promise<void>;
  drainPendingPublishes(
    deliver: (event: RetryableSignedEvent) => Promise<OfflineDeliveryDecision>
  ): Promise<PendingDrainResult>;
}

interface CoordinatorPublishStore {
  getById(id: string): Promise<StoredEvent | null>;
  putWithReconcile(event: StoredEvent): Promise<unknown>;
  recordRelayHint?(hint: {
    readonly eventId: string;
    readonly relayUrl: string;
    readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
    readonly lastSeenAt: number;
  }): Promise<void>;
}

export interface CoordinatorSignedPublishRuntime {
  readonly event: RetryableSignedEvent;
  readonly options?: PublishTransportOptions;
  readonly openStore: () => Promise<CoordinatorPublishStore>;
  readonly publish: (
    event: RetryableSignedEvent,
    handlers: { readonly onAck: (packet: PublishAckPacket) => Promise<void> | void },
    options?: PublishTransportOptions
  ) => Promise<void>;
  readonly addPendingPublish: (event: RetryableSignedEvent) => Promise<void>;
}

export interface PublishSignedEventCoordinator {
  publishSignedEvent(params: EventParameters): Promise<void>;
}

export interface PublishSignedEventsCoordinator {
  publishSignedEvents(params: EventParameters[]): Promise<void>;
}

export interface RetryPendingPublishesCoordinator {
  retryPendingPublishes(): Promise<void>;
}

export function toRetryableSignedEvent(
  event: EventParameters | RetryableSignedEvent
): RetryableSignedEvent | null {
  const candidate = event as Partial<RetryableSignedEvent>;

  if (
    typeof candidate.id === 'string' &&
    typeof candidate.sig === 'string' &&
    typeof candidate.kind === 'number' &&
    typeof candidate.pubkey === 'string' &&
    typeof candidate.created_at === 'number' &&
    Array.isArray(candidate.tags) &&
    typeof candidate.content === 'string'
  ) {
    return candidate as RetryableSignedEvent;
  }

  return null;
}

export async function publishSignedEvent(
  coordinator: PublishSignedEventCoordinator,
  params: EventParameters
): Promise<void> {
  return coordinator.publishSignedEvent(params);
}

export async function publishSignedEvents(
  coordinator: PublishSignedEventsCoordinator,
  params: EventParameters[]
): Promise<void> {
  return coordinator.publishSignedEvents(params);
}

export async function retryPendingPublishes(
  coordinator: RetryPendingPublishesCoordinator
): Promise<void> {
  return coordinator.retryPendingPublishes();
}

export async function publishSignedEventThroughCoordinator(input: CoordinatorSignedPublishRuntime) {
  const store = await input.openStore();
  const coordinator = createEventCoordinator({
    publishTransport: {
      publish: (event, handlers) =>
        input.publish(event as RetryableSignedEvent, handlers, input.options)
    },
    pendingPublishes: {
      add: (event) => input.addPendingPublish(event as RetryableSignedEvent)
    },
    store,
    relay: { verify: async () => [] }
  });

  return coordinator.publish(input.event);
}

export async function publishTransportRuntimeWithAcks(
  runtime: Pick<PublishRuntime, 'castSigned' | 'observePublishAcks'>,
  event: RetryableSignedEvent,
  handlers: { readonly onAck: (packet: PublishAckPacket) => Promise<void> | void },
  options?: PublishTransportOptions
): Promise<void> {
  await runtime.castSigned(event, options);
  await runtime.observePublishAcks?.(event, handlers.onAck);
}

export async function retryQueuedSignedPublishes(
  runtime: Pick<PublishRuntime, 'castSigned'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'drainPendingPublishes'>
): Promise<PendingDrainResult> {
  return queueRuntime.drainPendingPublishes(async (event) => {
    try {
      await runtime.castSigned(event);
      return 'confirmed';
    } catch {
      return 'retrying';
    }
  });
}

export async function publishSignedEventWithOfflineFallback(
  runtime: Pick<PublishRuntime, 'castSigned' | 'observePublishAcks'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'addPendingPublish'>,
  event: EventParameters | RetryableSignedEvent,
  hints?: PublishHintRecorder,
  options?: PublishTransportOptions
): Promise<void> {
  try {
    await runtime.castSigned(event, options);
  } catch (error) {
    const pending = toRetryableSignedEvent(event);
    if (pending) await queueRuntime.addPendingPublish(pending);
    throw error;
  }

  const pending = toRetryableSignedEvent(event);
  if (pending && runtime.observePublishAcks && hints) {
    await runtime.observePublishAcks(pending, async (packet) => {
      if (!packet.ok || packet.eventId !== pending.id) return;
      await hints.recordRelayHint({
        eventId: pending.id,
        relayUrl: packet.relayUrl,
        source: 'published',
        lastSeenAt: Math.floor(Date.now() / 1000)
      });
    });
  }
}

export async function publishSignedEventsWithOfflineFallback(
  runtime: Pick<PublishRuntime, 'castSigned' | 'observePublishAcks'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'addPendingPublish'>,
  events: Array<EventParameters | RetryableSignedEvent>,
  hints?: PublishHintRecorder,
  buildOptions?: (
    event: EventParameters | RetryableSignedEvent
  ) => Promise<PublishTransportOptions | undefined>
): Promise<void> {
  if (events.length === 0) return;

  await Promise.allSettled(
    events.map(async (event) =>
      publishSignedEventWithOfflineFallback(
        runtime,
        queueRuntime,
        event,
        hints,
        buildOptions ? await buildOptions(event) : undefined
      )
    )
  );
}
