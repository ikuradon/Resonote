import { describe, expect, it, vi } from 'vitest';

import { createHotEventIndex } from './hot-event-index.js';
import { publishSignedEventWithOfflineFallback } from './publish-queue.js';

describe('hot relay hint index', () => {
  it('keeps hot relay hints by event id', () => {
    const index = createHotEventIndex();
    index.applyRelayHint({
      eventId: 'e1',
      relayUrl: 'wss://relay.example',
      source: 'seen',
      lastSeenAt: 1
    });

    expect(index.getRelayHints('e1')).toEqual([
      { eventId: 'e1', relayUrl: 'wss://relay.example', source: 'seen', lastSeenAt: 1 }
    ]);
  });
});

it('records published relay hints after successful publish OK packets', async () => {
  const recordRelayHint = vi.fn(async () => {});
  const event = {
    id: 'published',
    pubkey: 'alice',
    created_at: 1,
    kind: 1,
    tags: [],
    content: 'hello',
    sig: 'sig'
  };

  await publishSignedEventWithOfflineFallback(
    {
      castSigned: async () => {},
      observePublishAcks: async (published, onAck) => {
        await onAck({ eventId: published.id, relayUrl: 'wss://relay.example', ok: true });
      }
    },
    { addPendingPublish: vi.fn(async () => {}) },
    event,
    { recordRelayHint }
  );

  expect(recordRelayHint).toHaveBeenCalledWith({
    eventId: 'published',
    relayUrl: 'wss://relay.example',
    source: 'published',
    lastSeenAt: expect.any(Number)
  });
});
