import type { EventParameters } from 'nostr-typedef';

import type { PendingEvent } from './pending-publishes.js';
import {
  addPendingPublish,
  drainPendingPublishes,
  type PendingDrainResult
} from './pending-publishes.js';

type PublishableEvent = PendingEvent | EventParameters;

/** Convert to PendingEvent only if it has the required fields (id + sig). */
function toPendingEvent(event: PublishableEvent): PendingEvent | null {
  const e = event as unknown as Record<string, unknown>;
  if (typeof e.id === 'string' && typeof e.sig === 'string' && typeof e.kind === 'number') {
    return event as unknown as PendingEvent;
  }
  return null;
}

export async function retryPendingPublishes(): Promise<void> {
  await drainPendingPublishes(async (event) => {
    try {
      const { getRxNostr } = await import('$shared/nostr/client.js');
      const rxNostr = await getRxNostr();
      await rxNostr.cast(event);
      return 'confirmed';
    } catch {
      return 'retrying';
    }
  });
}

export async function publishSignedEvent(event: PublishableEvent): Promise<void> {
  try {
    const { getRxNostr } = await import('$shared/nostr/client.js');
    const rxNostr = await getRxNostr();
    await rxNostr.cast(event);
  } catch {
    const pending = toPendingEvent(event);
    if (pending) await addPendingPublish(pending);
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
        const pending = toPendingEvent(event);
        if (pending) await addPendingPublish(pending);
      }
    })
  );
}

export type { PendingDrainResult };
