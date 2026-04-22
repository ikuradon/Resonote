import {
  type PendingDrainResult,
  publishSignedEventsWithOfflineFallback,
  publishSignedEventWithOfflineFallback,
  type RetryableSignedEvent,
  retryQueuedSignedPublishes} from '@auftakt/resonote';
import type { EventParameters } from 'nostr-typedef';

import { getRxNostr } from './client.js';
import type { PendingEvent } from './pending-publishes.js';
import { addPendingPublish, drainPendingPublishes } from './pending-publishes.js';

type PublishableEvent = PendingEvent | EventParameters;

const publishRuntime = {
  castSigned: async (event: EventParameters) => {
    const rxNostr = await getRxNostr();
    await rxNostr.cast(event);
  }
};

const pendingQueueRuntime = {
  addPendingPublish: (event: RetryableSignedEvent) => addPendingPublish(event as PendingEvent),
  drainPendingPublishes: (
    deliver: (event: RetryableSignedEvent) => Promise<'confirmed' | 'retrying' | 'rejected'>
  ) => drainPendingPublishes((event) => deliver(event as RetryableSignedEvent))
};

export async function retryPendingPublishes(): Promise<void> {
  await retryQueuedSignedPublishes(publishRuntime, pendingQueueRuntime);
}

export async function publishSignedEvent(event: PublishableEvent): Promise<void> {
  await publishSignedEventWithOfflineFallback(publishRuntime, pendingQueueRuntime, event);
}

export async function publishSignedEvents(events: PublishableEvent[]): Promise<void> {
  if (events.length === 0) return;

  const rxNostr = await getRxNostr();
  await publishSignedEventsWithOfflineFallback(
    {
      castSigned: async (event) => {
        await rxNostr.cast(event);
      }
    },
    pendingQueueRuntime,
    events
  );
}

export type { PendingDrainResult };
