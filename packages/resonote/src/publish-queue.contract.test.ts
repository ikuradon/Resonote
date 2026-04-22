import { describe, expect, it, vi } from 'vitest';

import {
  publishSignedEventsWithOfflineFallback,
  publishSignedEventWithOfflineFallback,
  type RetryableSignedEvent,
  retryQueuedSignedPublishes} from './runtime.js';

function makeEvent(overrides: Partial<RetryableSignedEvent> = {}): RetryableSignedEvent {
  return {
    id: overrides.id ?? 'event-1',
    kind: overrides.kind ?? 1,
    pubkey: overrides.pubkey ?? 'pk-1',
    created_at: overrides.created_at ?? 100,
    tags: overrides.tags ?? [],
    content: overrides.content ?? 'hello',
    sig: overrides.sig ?? 'sig-1'
  };
}

describe('@auftakt/resonote publish queue contract', () => {
  it('retries queued publishes through runtime cast and keeps retrying failures queued', async () => {
    const castSigned = vi
      .fn<(_: RetryableSignedEvent) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('still offline'));
    const drainPendingPublishes = vi.fn(
      async (deliver: (event: RetryableSignedEvent) => Promise<string>) => {
        const confirmed = await deliver(makeEvent({ id: 'confirmed-1' }));
        const retrying = await deliver(makeEvent({ id: 'retry-1' }));

        return {
          emissions: [],
          settledCount: confirmed === 'confirmed' ? 1 : 0,
          retryingCount: retrying === 'retrying' ? 1 : 0
        };
      }
    );

    const result = await retryQueuedSignedPublishes({ castSigned }, { drainPendingPublishes });

    expect(drainPendingPublishes).toHaveBeenCalledOnce();
    expect(castSigned).toHaveBeenCalledTimes(2);
    expect(result.settledCount).toBe(1);
    expect(result.retryingCount).toBe(1);
  });

  it('queues only retryable signed events on single publish failure', async () => {
    const castSigned = vi
      .fn<(_: object) => Promise<void>>()
      .mockRejectedValue(new Error('offline'));
    const addPendingPublish = vi.fn(async () => undefined);
    const signed = makeEvent({ id: 'signed-1' });
    const unsigned = { kind: 1, tags: [], content: 'hello' };

    await publishSignedEventWithOfflineFallback({ castSigned }, { addPendingPublish }, signed);
    await publishSignedEventWithOfflineFallback({ castSigned }, { addPendingPublish }, unsigned);

    expect(addPendingPublish).toHaveBeenCalledTimes(1);
    expect(addPendingPublish).toHaveBeenCalledWith(signed);
  });

  it('queues only failed signed events in batch publish', async () => {
    const castSigned = vi
      .fn<(_: object) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('relay down'))
      .mockRejectedValueOnce(new Error('unsigned'));
    const addPendingPublish = vi.fn(async () => undefined);
    const signed = makeEvent({ id: 'signed-fail' });
    const unsigned = { kind: 1, tags: [], content: 'unsigned' };

    await publishSignedEventsWithOfflineFallback({ castSigned }, { addPendingPublish }, [
      makeEvent({ id: 'signed-ok' }),
      signed,
      unsigned
    ]);

    expect(castSigned).toHaveBeenCalledTimes(3);
    expect(addPendingPublish).toHaveBeenCalledTimes(1);
    expect(addPendingPublish).toHaveBeenCalledWith(signed);
  });
});
