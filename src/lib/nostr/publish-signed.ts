import type { PendingEvent } from './pending-publishes.js';
import {
  addPendingPublish,
  getPendingPublishes,
  removePendingPublish,
  cleanExpired
} from './pending-publishes.js';

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

/**
 * Publish a pre-signed Nostr event via rx-nostr's connection pool.
 * rx-nostr's send() skips re-signing when the event already has id+sig.
 * Falls back to pending-publishes queue on failure.
 */
export async function publishSignedEvent(
  event: PendingEvent | Record<string, unknown>
): Promise<void> {
  try {
    const { getRxNostr } = await import('./client.js');
    const rxNostr = await getRxNostr();
    await rxNostr.cast(event as never);
  } catch {
    await addPendingPublish(event as never);
  }
}

/**
 * Publish multiple pre-signed events via rx-nostr's connection pool.
 */
export async function publishSignedEvents(
  events: (PendingEvent | Record<string, unknown>)[]
): Promise<void> {
  if (events.length === 0) return;

  const { getRxNostr } = await import('./client.js');
  const rxNostr = await getRxNostr();

  await Promise.allSettled(
    events.map(async (event) => {
      try {
        await rxNostr.cast(event as never);
      } catch {
        await addPendingPublish(event as never);
      }
    })
  );
}
