import type { EventParameters } from 'nostr-typedef';
import type { PendingEvent } from './pending-publishes.js';
import {
  addPendingPublish,
  getPendingPublishes,
  removePendingPublish,
  cleanExpired
} from './pending-publishes.js';

type PublishableEvent = PendingEvent | EventParameters;

function toPendingEvent(event: PublishableEvent): PendingEvent {
  return event as PendingEvent;
}

export async function retryPendingPublishes(): Promise<void> {
  await cleanExpired();
  const pending = await getPendingPublishes();
  for (const event of pending) {
    try {
      await publishSignedEvent(event);
      await removePendingPublish(event.id);
    } catch {
      // Will retry next time
    }
  }
}

export async function publishSignedEvent(event: PublishableEvent): Promise<void> {
  try {
    const { getRxNostr } = await import('$shared/nostr/client.js');
    const rxNostr = await getRxNostr();
    await rxNostr.cast(event);
  } catch {
    await addPendingPublish(toPendingEvent(event));
  }
}

export async function publishSignedEvents(events: PublishableEvent[]): Promise<void> {
  if (events.length === 0) return;

  const { getRxNostr } = await import('$shared/nostr/client.js');
  const rxNostr = await getRxNostr();

  await Promise.allSettled(
    events.map(async (event) => {
      try {
        await rxNostr.cast(event);
      } catch {
        await addPendingPublish(toPendingEvent(event));
      }
    })
  );
}
