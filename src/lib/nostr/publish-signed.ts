import { DEFAULT_RELAYS } from './relays.js';
import { addPendingPublish } from './pending-publishes.js';

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
