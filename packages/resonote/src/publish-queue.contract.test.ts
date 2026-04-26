import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addPendingPublish,
  drainPendingPublishes,
  getPendingPublishes,
  resetPendingDB
} from '../../../src/shared/nostr/pending-publishes.js';
import {
  publishSignedEventsWithOfflineFallback,
  publishSignedEventThroughCoordinator,
  publishSignedEventWithOfflineFallback,
  type RetryableSignedEvent,
  retryQueuedSignedPublishes
} from './runtime.js';

let dbCounter = 0;

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

beforeEach(() => {
  resetPendingDB(`resonote-publish-queue-contract-${dbCounter++}`);
});

describe('@auftakt/resonote publish queue contract', () => {
  it('persists queued publishes across queue runtime recreation and drains them after restart', async () => {
    const dbName = `resonote-publish-queue-restart-${dbCounter++}`;
    resetPendingDB(dbName);

    const queuedEvent = makeEvent({
      id: 'queued-after-restart',
      created_at: Math.floor(Date.now() / 1000)
    });
    const castSigned = vi
      .fn<(_: object) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'));

    await publishSignedEventsWithOfflineFallback({ castSigned }, { addPendingPublish }, [
      queuedEvent
    ]);

    expect(await getPendingPublishes()).toEqual([
      expect.objectContaining({ id: 'queued-after-restart' })
    ]);

    resetPendingDB(dbName);

    const resumedCastSigned = vi
      .fn<(_: RetryableSignedEvent) => Promise<void>>()
      .mockResolvedValue(undefined);

    const result = await retryQueuedSignedPublishes(
      { castSigned: resumedCastSigned },
      { drainPendingPublishes }
    );

    expect(resumedCastSigned).toHaveBeenCalledTimes(1);
    expect(resumedCastSigned).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'queued-after-restart' })
    );
    expect(result).toEqual({
      emissions: [
        {
          subjectId: 'queued-after-restart',
          reason: 'confirmed-offline',
          state: 'confirmed'
        }
      ],
      settledCount: 1,
      retryingCount: 0
    });
    expect(await getPendingPublishes()).toEqual([]);
  });

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

  it('queues retryable single publish failures while preserving the caller-visible error', async () => {
    const castSigned = vi
      .fn<(_: object) => Promise<void>>()
      .mockRejectedValue(new Error('offline'));
    const addPendingPublish = vi.fn(async () => undefined);
    const signed = makeEvent({ id: 'signed-1' });

    await expect(async () => {
      await publishSignedEventWithOfflineFallback({ castSigned }, { addPendingPublish }, signed);
    }).rejects.toThrow('offline');

    expect(addPendingPublish).toHaveBeenCalledOnce();
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

  it('publishes signed events through coordinator materialization and relay hints', async () => {
    const signed = makeEvent({ id: 'coordinator-signed' });
    const calls: string[] = [];
    const recordRelayHint = vi.fn(async () => {});
    const result = await publishSignedEventThroughCoordinator({
      event: signed,
      options: { on: { relays: ['wss://relay.example'] } },
      openStore: async () => ({
        getById: async () => null,
        putWithReconcile: async () => {
          calls.push('materialize');
          return { stored: true };
        },
        recordRelayHint
      }),
      publish: async (_event, handlers) => {
        calls.push('publish');
        await handlers.onAck({
          eventId: 'coordinator-signed',
          relayUrl: 'wss://relay.example',
          ok: true
        });
      },
      addPendingPublish: async () => {
        throw new Error('should not queue');
      }
    });

    expect(result).toEqual({
      queued: false,
      ok: true,
      settlement: {
        phase: 'settled',
        state: 'confirmed',
        durability: 'relay',
        reason: 'relay-accepted'
      }
    });
    expect(calls).toEqual(['materialize', 'publish']);
    expect(recordRelayHint).toHaveBeenCalledWith({
      eventId: 'coordinator-signed',
      relayUrl: 'wss://relay.example',
      source: 'published',
      lastSeenAt: expect.any(Number)
    });
  });
});
