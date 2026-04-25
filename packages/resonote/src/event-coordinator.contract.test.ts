import { describe, expect, it, vi } from 'vitest';

import { createEventCoordinator } from './event-coordinator.js';
import { createHotEventIndex } from './hot-event-index.js';

describe('EventCoordinator read policy', () => {
  it('returns local hit immediately and schedules remote verification for localFirst', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => ({
          id: 'e1',
          pubkey: 'p1',
          created_at: 1,
          kind: 1,
          tags: [],
          content: 'local'
        })),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    const result = await coordinator.read({ ids: ['e1'] }, { policy: 'localFirst' });

    expect(result.events).toHaveLength(1);
    expect(result.settlement.phase).toBe('partial');
    expect(verify).toHaveBeenCalledWith(
      [{ ids: ['e1'] }],
      expect.objectContaining({ reason: 'localFirst' })
    );
  });

  it('does not schedule remote verification for cacheOnly', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    await coordinator.read({ ids: ['missing'] }, { policy: 'cacheOnly' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('uses cacheOnly only when explicitly requested', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    await coordinator.read({ ids: ['e1'] }, { policy: 'localFirst' });
    await coordinator.read({ ids: ['e1'] }, { policy: 'cacheOnly' });

    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('schedules verification for latest replaceable reads', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    await coordinator.read({ authors: ['alice'], kinds: [0], limit: 1 }, { policy: 'localFirst' });

    expect(verify).toHaveBeenCalledWith([{ authors: ['alice'], kinds: [0], limit: 1 }], {
      reason: 'localFirst'
    });
  });

  it('serves by-id reads from hot index before durable store', async () => {
    const storeGet = vi.fn(async () => null);
    const coordinator = createEventCoordinator({
      hotIndex: createHotEventIndex(),
      store: { getById: storeGet, putWithReconcile: vi.fn() },
      relay: { verify: vi.fn(async () => []) }
    });
    coordinator.applyLocalEvent({
      id: 'hot',
      pubkey: 'p1',
      created_at: 1,
      kind: 1,
      tags: [],
      content: ''
    });

    const result = await coordinator.read({ ids: ['hot'] }, { policy: 'cacheOnly' });

    expect(result.events).toEqual([expect.objectContaining({ id: 'hot' })]);
    expect(storeGet).not.toHaveBeenCalled();
  });

  it('records relay hint when a relay event materializes', async () => {
    const recordRelayHint = vi.fn(async () => {});
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true })),
        recordRelayHint
      },
      relay: { verify: vi.fn(async () => []) }
    });

    await coordinator.materializeFromRelay(
      {
        id: 'e1',
        pubkey: 'p1',
        created_at: 1,
        kind: 1,
        tags: [],
        content: ''
      },
      'wss://relay.example'
    );

    expect(recordRelayHint).toHaveBeenCalledWith({
      eventId: 'e1',
      relayUrl: 'wss://relay.example',
      source: 'seen',
      lastSeenAt: expect.any(Number)
    });
  });

  it('queues relay materialization before writing to the store', async () => {
    const writes: string[] = [];
    let queuedTask: { run(): Promise<void> } | null = null;
    const queue = {
      enqueue: vi.fn((task: { run(): Promise<void> }) => {
        writes.push('queued');
        queuedTask = task;
      }),
      drain: vi.fn(async () => {
        await queuedTask?.run();
      }),
      size: vi.fn(() => 0)
    };
    const coordinator = createEventCoordinator({
      materializerQueue: queue,
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => {
          writes.push('stored');
          return { stored: true };
        })
      },
      relay: { verify: vi.fn(async () => []) }
    });

    await coordinator.materializeFromRelay(
      {
        id: 'queued',
        pubkey: 'p1',
        created_at: 1,
        kind: 1,
        tags: [],
        content: ''
      },
      'wss://relay.example'
    );

    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ priority: 'normal' }));
    expect(queue.drain).toHaveBeenCalled();
    expect(writes).toEqual(['queued', 'stored']);
  });

  it('uses relay gateway for non-cacheOnly reads', async () => {
    const remote = {
      id: 'remote',
      pubkey: 'p1',
      created_at: 1,
      kind: 1,
      tags: [],
      content: ''
    };
    const relayGateway = {
      verify: vi.fn(async () => ({
        strategy: 'fallback-req' as const,
        candidates: [{ relayUrl: 'wss://relay.example', event: { raw: true } }]
      }))
    };
    const coordinator = createEventCoordinator({
      relayGateway,
      ingestRelayCandidate: vi.fn(async () => ({ ok: true as const, event: remote })),
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true }))
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const result = await coordinator.read({ ids: ['remote'] }, { policy: 'localFirst' });

    expect(relayGateway.verify).toHaveBeenCalledWith([{ ids: ['remote'] }], {
      reason: 'localFirst'
    });
    expect(result.events).toEqual([expect.objectContaining({ id: 'remote' })]);
    expect(result.settlement).toEqual({
      phase: 'settled',
      provenance: 'relay',
      reason: 'relay-repair'
    });
  });

  it('returns gateway candidates only after ingress accepts them', async () => {
    const accepted = {
      id: 'accepted',
      pubkey: 'p1',
      created_at: 1,
      kind: 1,
      tags: [],
      content: ''
    };
    const ingestRelayCandidate = vi.fn(async () => ({ ok: true as const, event: accepted }));
    const coordinator = createEventCoordinator({
      relayGateway: {
        verify: vi.fn(async () => ({
          strategy: 'fallback-req' as const,
          candidates: [{ relayUrl: 'wss://relay.example', event: { raw: true } }]
        }))
      },
      ingestRelayCandidate,
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true }))
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const result = await coordinator.read({ ids: ['accepted'] }, { policy: 'localFirst' });

    expect(ingestRelayCandidate).toHaveBeenCalledWith({
      relayUrl: 'wss://relay.example',
      event: { raw: true }
    });
    expect(result.events).toEqual([accepted]);
    expect(result.settlement.provenance).toBe('relay');
  });

  it('drops gateway candidates rejected by ingress', async () => {
    const coordinator = createEventCoordinator({
      relayGateway: {
        verify: vi.fn(async () => ({
          strategy: 'fallback-req' as const,
          candidates: [{ relayUrl: 'wss://relay.example', event: { malformed: true } }]
        }))
      },
      ingestRelayCandidate: vi.fn(async () => ({ ok: false as const })),
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true }))
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const result = await coordinator.read({ ids: ['bad'] }, { policy: 'localFirst' });

    expect(result.events).toEqual([]);
    expect(result.settlement).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'settled-miss'
    });
  });
});
