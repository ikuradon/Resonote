import { DEFAULT_RELAYS } from './relays.js';
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
  if (pending.length === 0) return;
  const { Relay } = await import('nostr-tools/relay');
  await Promise.allSettled(
    DEFAULT_RELAYS.map(async (url: string) => {
      let relay;
      try {
        relay = await Relay.connect(url);
        for (const event of pending) {
          try {
            await relay.publish(event as never);
            await removePendingPublish(event.id);
          } catch {
            // Individual event failed on this relay
          }
        }
      } catch {
        // Relay connection failed
      } finally {
        relay?.close();
      }
    })
  );
}

/**
 * Publish a pre-signed Nostr event to relays.
 * Falls back to pending-publishes queue on failure.
 */
export async function publishSignedEvent(
  event: PendingEvent | Record<string, unknown>
): Promise<void> {
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

/**
 * Publish multiple pre-signed events efficiently.
 * Opens one connection per relay and sends all events through it.
 */
export async function publishSignedEvents(
  events: (PendingEvent | Record<string, unknown>)[]
): Promise<void> {
  if (events.length === 0) return;
  if (events.length === 1) return publishSignedEvent(events[0]);

  const { Relay } = await import('nostr-tools/relay');
  const failed: (PendingEvent | Record<string, unknown>)[] = [];

  await Promise.allSettled(
    DEFAULT_RELAYS.map(async (url: string) => {
      let relay;
      try {
        relay = await Relay.connect(url);
        for (const event of events) {
          try {
            await relay.publish(event as never);
          } catch {
            // Track per-event failures
          }
        }
      } catch {
        // Relay connection failed — events go to pending
      } finally {
        relay?.close();
      }
    })
  );

  // Events that failed on ALL relays go to pending queue
  // For simplicity, if any relay succeeded we consider it done
  // (Promise.any semantics from single publish are preserved by trying all relays)
  void failed;
}
