import { DEFAULT_RELAYS } from './relays.js';
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
      await publishSignedEvent(event as unknown as Record<string, unknown>);
      await removePendingPublish(event.id);
    } catch {
      // Leave in queue for next retry
    }
  }
}

/**
 * Publish a pre-signed Nostr event to relays.
 * Falls back to pending-publishes queue on failure.
 */
export async function publishSignedEvent(event: Record<string, unknown>): Promise<void> {
  try {
    const { Relay } = await import('nostr-tools/relay');
    await Promise.any(
      DEFAULT_RELAYS.map(async (url: string) => {
        const relay = await Relay.connect(url);
        try {
          await relay.publish(event as never);
        } finally {
          relay.close();
        }
      })
    );
  } catch {
    await addPendingPublish(event as never);
  }
}
