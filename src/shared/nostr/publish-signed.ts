import type { EventParameters } from 'nostr-typedef';

import {
  publishSignedEvent as publishSignedEventFromFacade,
  publishSignedEvents as publishSignedEventsFromFacade,
  retryQueuedPublishes as retryQueuedPublishesFromFacade
} from '$shared/auftakt/resonote.js';

import type { PendingEvent } from './pending-publishes.js';

type PublishableEvent = PendingEvent | EventParameters;

export async function retryPendingPublishes(): Promise<void> {
  await retryQueuedPublishesFromFacade();
}

export async function publishSignedEvent(event: PublishableEvent): Promise<void> {
  await publishSignedEventFromFacade(event);
}

export async function publishSignedEvents(events: PublishableEvent[]): Promise<void> {
  await publishSignedEventsFromFacade(events);
}

export type { PendingDrainResult } from '@auftakt/resonote';
