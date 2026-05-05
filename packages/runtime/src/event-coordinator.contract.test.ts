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

  it('prefills tag reads from hot index while still checking durable store', async () => {
    const storeGetByTagValue = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      hotIndex: createHotEventIndex(),
      store: {
        getById: vi.fn(async () => null),
        getByTagValue: storeGetByTagValue,
        putWithReconcile: vi.fn()
      },
      relay: { verify: vi.fn(async () => []) }
    });
    coordinator.applyLocalEvent({
      id: 'hot-tagged',
      pubkey: 'p1',
      created_at: 1,
      kind: 1111,
      tags: [['e', 'root']],
      content: ''
    });

    const result = await coordinator.read(
      { kinds: [1111], '#e': ['root'] },
      { policy: 'cacheOnly' }
    );

    expect(result.events).toEqual([expect.objectContaining({ id: 'hot-tagged' })]);
    expect(storeGetByTagValue).toHaveBeenCalledWith('e:root', 1111);
  });

  it('prefills kind reads from hot index while still checking durable store', async () => {
    const storeGetAllByKind = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      hotIndex: createHotEventIndex(),
      store: {
        getById: vi.fn(async () => null),
        getAllByKind: storeGetAllByKind,
        putWithReconcile: vi.fn()
      },
      relay: { verify: vi.fn(async () => []) }
    });
    coordinator.applyLocalEvent({
      id: 'hot-kind',
      pubkey: 'p1',
      created_at: 1,
      kind: 1111,
      tags: [],
      content: ''
    });

    const result = await coordinator.read({ kinds: [1111] }, { policy: 'cacheOnly' });

    expect(result.events).toEqual([expect.objectContaining({ id: 'hot-kind' })]);
    expect(storeGetAllByKind).toHaveBeenCalledWith(1111);
  });

  it('applies Nostr time bounds and limit to ordered local kind matches', async () => {
    const event = (id: string, created_at: number) => ({
      id,
      pubkey: 'alice',
      created_at,
      kind: 1111,
      tags: [],
      content: ''
    });
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        getAllByKind: vi.fn(async () => [
          event('at-since', 10),
          event('too-new', 30),
          event('middle', 15),
          event('too-old', 9),
          event('at-until', 20)
        ]),
        putWithReconcile: vi.fn()
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const result = await coordinator.read(
      { kinds: [1111], since: 10, until: 20, limit: 2 },
      { policy: 'cacheOnly' }
    );

    expect(result.events.map((entry) => entry.id)).toEqual(['at-until', 'middle']);
  });

  it('continues relay-capable reads when local storage is unavailable', async () => {
    const remote = {
      id: 'remote-after-local-failure',
      pubkey: 'alice',
      created_at: 5,
      kind: 1,
      tags: [],
      content: 'relay'
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
        getById: vi.fn(async () => {
          throw new Error('db unavailable');
        }),
        putWithReconcile: vi.fn(async () => ({ stored: true }))
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const result = await coordinator.read(
      { ids: ['remote-after-local-failure'] },
      {
        policy: 'localFirst'
      }
    );

    expect(relayGateway.verify).toHaveBeenCalledWith([{ ids: ['remote-after-local-failure'] }], {
      reason: 'localFirst'
    });
    expect(result.events).toEqual([remote]);
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

  it('reads multiple filters from durable local visibility before relay verification', async () => {
    const store = {
      getById: vi.fn(async (id: string) =>
        id === 'by-id'
          ? {
              id: 'by-id',
              pubkey: 'alice',
              created_at: 2,
              kind: 1,
              tags: [['e', 'root']],
              content: 'id hit'
            }
          : null
      ),
      getAllByKind: vi.fn(async (kind: number) =>
        kind === 1111
          ? [
              {
                id: 'comment',
                pubkey: 'bob',
                created_at: 3,
                kind: 1111,
                tags: [['e', 'root']],
                content: 'tag hit'
              }
            ]
          : []
      ),
      putWithReconcile: vi.fn(async () => ({ stored: true }))
    };
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store,
      relay: { verify }
    });

    const result = await coordinator.read([{ ids: ['by-id'] }, { kinds: [1111], '#e': ['root'] }], {
      policy: 'localFirst'
    });

    expect(result.events.map((event) => event.id).sort()).toEqual(['by-id', 'comment']);
    expect(store.getById).toHaveBeenCalledWith('by-id');
    expect(store.getAllByKind).toHaveBeenCalledWith(1111);
    expect(verify).toHaveBeenCalledWith([{ ids: ['by-id'] }, { kinds: [1111], '#e': ['root'] }], {
      reason: 'localFirst'
    });
  });

  it('materializes relay candidates through the coordinator before read visibility', async () => {
    const remote = {
      id: 'remote',
      pubkey: 'alice',
      created_at: 4,
      kind: 1,
      tags: [],
      content: 'accepted'
    };
    const putWithReconcile = vi.fn(async () => ({ stored: true }));
    const recordRelayHint = vi.fn(async () => {});
    const coordinator = createEventCoordinator({
      relayGateway: {
        verify: vi.fn(async () => ({
          strategy: 'fallback-req' as const,
          candidates: [{ event: { raw: 'relay' }, relayUrl: 'wss://relay.example' }]
        }))
      },
      ingestRelayCandidate: vi.fn(async () => ({ ok: true as const, event: remote })),
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile,
        recordRelayHint
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const result = await coordinator.read({ ids: ['remote'] }, { policy: 'relayConfirmed' });

    expect(result.events).toEqual([remote]);
    expect(putWithReconcile).toHaveBeenCalledWith(remote);
    expect(recordRelayHint).toHaveBeenCalledWith({
      eventId: 'remote',
      relayUrl: 'wss://relay.example',
      source: 'seen',
      lastSeenAt: expect.any(Number)
    });
  });

  it('does not return a late older kind10002 relay candidate after newer local materialization', async () => {
    const newerRelayList = {
      id: 'new-relay-list',
      pubkey: 'alice',
      created_at: 1000,
      kind: 10002,
      tags: [['r', 'wss://new.example.test']],
      content: ''
    };
    const olderRelayList = {
      id: 'old-relay-list',
      pubkey: 'alice',
      created_at: 500,
      kind: 10002,
      tags: [['r', 'wss://old.example.test']],
      content: ''
    };
    const putWithReconcile = vi.fn(async (candidate: typeof newerRelayList) => ({
      stored: candidate.created_at > 500
    }));
    const coordinator = createEventCoordinator({
      relayGateway: {
        verify: vi.fn(async () => ({
          strategy: 'fallback-req' as const,
          candidates: [{ event: { raw: 'late-old' }, relayUrl: 'wss://old-relay.example.test' }]
        }))
      },
      ingestRelayCandidate: vi.fn(async () => ({ ok: true as const, event: olderRelayList })),
      store: {
        getById: vi.fn(async () => null),
        getAllByKind: vi.fn(async () => [newerRelayList]),
        putWithReconcile
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const result = await coordinator.read(
      { authors: ['alice'], kinds: [10002], limit: 1 },
      { policy: 'relayConfirmed' }
    );

    expect(result.events).toEqual([newerRelayList]);
    expect(result.events[0]?.tags).toEqual([['r', 'wss://new.example.test']]);
    expect(putWithReconcile).toHaveBeenCalledWith(olderRelayList);
  });

  it('coalesces duplicate gateway candidates while materialization is in flight', async () => {
    const remote = {
      id: 'dupe',
      pubkey: 'alice',
      created_at: 4,
      kind: 1,
      tags: [],
      content: 'accepted'
    };
    const releaseMaterialization: Array<() => void> = [];
    const putWithReconcile = vi.fn(
      async () =>
        new Promise<{ stored: true }>((resolve) => {
          releaseMaterialization.push(() => resolve({ stored: true }));
        })
    );
    const recordRelayHint = vi.fn(async () => {});
    const ingestRelayCandidate = vi.fn(async () => ({ ok: true as const, event: remote }));
    const coordinator = createEventCoordinator({
      relayGateway: {
        verify: vi.fn(async () => ({
          strategy: 'fallback-req' as const,
          candidates: [
            { event: { raw: 'relay-a' }, relayUrl: 'wss://relay-a.example' },
            { event: { raw: 'relay-b' }, relayUrl: 'wss://relay-b.example' }
          ]
        }))
      },
      ingestRelayCandidate,
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile,
        recordRelayHint
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const readPromise = coordinator.read({ ids: ['dupe'] }, { policy: 'relayConfirmed' });
    await vi.waitFor(() => expect(releaseMaterialization).toHaveLength(1));
    const secondCandidateReachedIngressWhileFirstWasPending =
      ingestRelayCandidate.mock.calls.length === 2;
    releaseMaterialization.splice(0).forEach((release) => release());
    if (!secondCandidateReachedIngressWhileFirstWasPending) {
      await vi.waitFor(() => expect(releaseMaterialization).toHaveLength(1));
      releaseMaterialization.splice(0).forEach((release) => release());
    }

    await expect(readPromise).resolves.toMatchObject({
      events: [remote]
    });
    expect(secondCandidateReachedIngressWhileFirstWasPending).toBe(true);
    expect(ingestRelayCandidate).toHaveBeenCalledTimes(2);
    expect(putWithReconcile).toHaveBeenCalledTimes(1);
    expect(recordRelayHint).toHaveBeenCalledWith({
      eventId: 'dupe',
      relayUrl: 'wss://relay-a.example',
      source: 'seen',
      lastSeenAt: expect.any(Number)
    });
    expect(recordRelayHint).toHaveBeenCalledWith({
      eventId: 'dupe',
      relayUrl: 'wss://relay-b.example',
      source: 'seen',
      lastSeenAt: expect.any(Number)
    });
  });

  it('does not let a rejected duplicate candidate poison a later valid event id', async () => {
    const remote = {
      id: 'recovered',
      pubkey: 'alice',
      created_at: 5,
      kind: 1,
      tags: [],
      content: 'accepted'
    };
    const putWithReconcile = vi.fn(async () => ({ stored: true }));
    const coordinator = createEventCoordinator({
      relayGateway: {
        verify: vi.fn(async () => ({
          strategy: 'fallback-req' as const,
          candidates: [
            { event: { raw: 'bad' }, relayUrl: 'wss://relay-a.example' },
            { event: { raw: 'good' }, relayUrl: 'wss://relay-b.example' }
          ]
        }))
      },
      ingestRelayCandidate: vi
        .fn()
        .mockResolvedValueOnce({ ok: false as const })
        .mockResolvedValueOnce({ ok: true as const, event: remote }),
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const result = await coordinator.read({ ids: ['recovered'] }, { policy: 'relayConfirmed' });

    expect(result.events).toEqual([remote]);
    expect(putWithReconcile).toHaveBeenCalledTimes(1);
  });

  it('subscribes through relay candidates but emits only accepted visible events', async () => {
    const accepted = {
      id: 'visible',
      pubkey: 'alice',
      created_at: 10,
      kind: 1,
      tags: [],
      content: 'visible'
    };
    const onEvent = vi.fn();
    const onComplete = vi.fn();
    let candidateHandler:
      | ((candidate: { event: unknown; relayUrl: string }) => Promise<void> | void)
      | undefined;
    const coordinator = createEventCoordinator({
      transport: {
        subscribe: vi.fn((_filters, _options, handlers) => {
          candidateHandler = handlers.onCandidate;
          return { unsubscribe: vi.fn() };
        })
      },
      ingestRelayCandidate: vi.fn(async () => ({ ok: true as const, event: accepted })),
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true }))
      },
      relay: { verify: vi.fn(async () => []) }
    });

    coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent, onComplete });
    await candidateHandler?.({ event: { raw: true }, relayUrl: 'wss://relay.example' });

    expect(onEvent).toHaveBeenCalledWith({
      event: accepted,
      relayHint: 'wss://relay.example'
    });
  });

  it('waits for subscription candidate materialization before visible handlers and completion', async () => {
    const accepted = {
      id: 'materialized-before-complete',
      pubkey: 'alice',
      created_at: 10,
      kind: 1,
      tags: [],
      content: 'visible'
    };
    const calls: string[] = [];
    let releaseMaterialization: (() => void) | null = null;
    let candidateHandler:
      | ((candidate: { event: unknown; relayUrl: string }) => Promise<void> | void)
      | undefined;
    let completeHandler: (() => void) | undefined;
    const coordinator = createEventCoordinator({
      transport: {
        subscribe: vi.fn((_filters, _options, handlers) => {
          candidateHandler = handlers.onCandidate;
          completeHandler = handlers.onComplete;
          return { unsubscribe: vi.fn() };
        })
      },
      ingestRelayCandidate: vi.fn(async () => ({ ok: true as const, event: accepted })),
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(
          async () =>
            new Promise<{ stored: true }>((resolve) => {
              releaseMaterialization = () => {
                calls.push('stored');
                resolve({ stored: true });
              };
            })
        )
      },
      relay: { verify: vi.fn(async () => []) }
    });

    coordinator.subscribe(
      [{ kinds: [1] }],
      { policy: 'localFirst' },
      {
        onEvent: () => {
          calls.push('event');
        },
        onComplete: () => {
          calls.push('complete');
        }
      }
    );
    void candidateHandler?.({ event: { raw: true }, relayUrl: 'wss://relay.example' });
    await vi.waitFor(() => expect(releaseMaterialization).toBeTypeOf('function'));
    completeHandler?.();

    expect(calls).toEqual([]);
    releaseMaterialization?.();

    await vi.waitFor(() => expect(calls).toEqual(['stored', 'event', 'complete']));
  });

  it('drops rejected subscription candidates before consumer callbacks', async () => {
    const onEvent = vi.fn();
    let candidateHandler:
      | ((candidate: { event: unknown; relayUrl: string }) => Promise<void> | void)
      | undefined;
    const coordinator = createEventCoordinator({
      transport: {
        subscribe: vi.fn((_filters, _options, handlers) => {
          candidateHandler = handlers.onCandidate;
          return { unsubscribe: vi.fn() };
        })
      },
      ingestRelayCandidate: vi.fn(async () => ({ ok: false as const })),
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true }))
      },
      relay: { verify: vi.fn(async () => []) }
    });

    coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent });
    await candidateHandler?.({ event: { malformed: true }, relayUrl: 'wss://relay.example' });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('emits duplicate subscription candidates once while preserving relay hints', async () => {
    const accepted = {
      id: 'visible-once',
      pubkey: 'alice',
      created_at: 10,
      kind: 1,
      tags: [],
      content: 'visible'
    };
    const onEvent = vi.fn();
    const recordRelayHint = vi.fn(async () => {});
    let candidateHandler:
      | ((candidate: { event: unknown; relayUrl: string }) => Promise<void> | void)
      | undefined;
    const coordinator = createEventCoordinator({
      transport: {
        subscribe: vi.fn((_filters, _options, handlers) => {
          candidateHandler = handlers.onCandidate;
          return { unsubscribe: vi.fn() };
        })
      },
      ingestRelayCandidate: vi.fn(async () => ({ ok: true as const, event: accepted })),
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true })),
        recordRelayHint
      },
      relay: { verify: vi.fn(async () => []) }
    });

    coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent });
    await candidateHandler?.({ event: { raw: 'first' }, relayUrl: 'wss://relay-a.example' });
    await candidateHandler?.({ event: { raw: 'second' }, relayUrl: 'wss://relay-b.example' });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({
      event: accepted,
      relayHint: 'wss://relay-a.example'
    });
    expect(recordRelayHint).toHaveBeenCalledWith({
      eventId: 'visible-once',
      relayUrl: 'wss://relay-a.example',
      source: 'seen',
      lastSeenAt: expect.any(Number)
    });
    expect(recordRelayHint).toHaveBeenCalledWith({
      eventId: 'visible-once',
      relayUrl: 'wss://relay-b.example',
      source: 'seen',
      lastSeenAt: expect.any(Number)
    });
  });

  it('does not share delivered-id suppression across subscription handles', async () => {
    const accepted = {
      id: 'visible-per-handle',
      pubkey: 'alice',
      created_at: 11,
      kind: 1,
      tags: [],
      content: 'visible'
    };
    const handlersBySubscription: Array<{
      onCandidate(candidate: { event: unknown; relayUrl: string }): Promise<void> | void;
    }> = [];
    const leftOnEvent = vi.fn();
    const rightOnEvent = vi.fn();
    const coordinator = createEventCoordinator({
      transport: {
        subscribe: vi.fn((_filters, _options, handlers) => {
          handlersBySubscription.push({ onCandidate: handlers.onCandidate });
          return { unsubscribe: vi.fn() };
        })
      },
      ingestRelayCandidate: vi.fn(async () => ({ ok: true as const, event: accepted })),
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true }))
      },
      relay: { verify: vi.fn(async () => []) }
    });

    coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent: leftOnEvent });
    coordinator.subscribe([{ kinds: [1] }], { policy: 'localFirst' }, { onEvent: rightOnEvent });

    await handlersBySubscription[0]?.onCandidate({
      event: { raw: 'left' },
      relayUrl: 'wss://relay-a.example'
    });
    await handlersBySubscription[1]?.onCandidate({
      event: { raw: 'right' },
      relayUrl: 'wss://relay-b.example'
    });

    expect(leftOnEvent).toHaveBeenCalledTimes(1);
    expect(rightOnEvent).toHaveBeenCalledTimes(1);
  });

  it('publishes through coordinator transport and records successful relay hints', async () => {
    const event = {
      id: 'published',
      pubkey: 'alice',
      created_at: 20,
      kind: 1,
      tags: [],
      content: 'publish',
      sig: 'sig'
    };
    const recordRelayHint = vi.fn(async () => {});
    const calls: string[] = [];
    const putWithReconcile = vi.fn(async () => {
      calls.push('materialize');
      return { stored: true };
    });
    const publish = vi.fn(async (_event, handlers) => {
      calls.push('publish');
      await handlers.onAck({ eventId: 'published', relayUrl: 'wss://relay.example', ok: true });
    });
    const coordinator = createEventCoordinator({
      publishTransport: { publish },
      pendingPublishes: { add: vi.fn(async () => {}) },
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile,
        recordRelayHint
      },
      relay: { verify: vi.fn(async () => []) }
    });

    await expect(coordinator.publish(event)).resolves.toEqual({
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
    expect(putWithReconcile).toHaveBeenCalledWith(event);
    expect(publish).toHaveBeenCalledWith(event, expect.any(Object));
    expect(recordRelayHint).toHaveBeenCalledWith({
      eventId: 'published',
      relayUrl: 'wss://relay.example',
      source: 'published',
      lastSeenAt: expect.any(Number)
    });
    expect(recordRelayHint).toHaveBeenCalledTimes(1);
  });

  it('queues retryable publish failures through coordinator pending storage', async () => {
    const event = {
      id: 'offline',
      pubkey: 'alice',
      created_at: 20,
      kind: 1,
      tags: [],
      content: 'publish',
      sig: 'sig'
    };
    const add = vi.fn(async () => {});
    const coordinator = createEventCoordinator({
      publishTransport: {
        publish: vi.fn(async () => {
          throw new Error('offline');
        })
      },
      pendingPublishes: { add },
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true }))
      },
      relay: { verify: vi.fn(async () => []) }
    });

    await expect(coordinator.publish(event)).rejects.toThrow('offline');
    expect(add).toHaveBeenCalledWith(event);
  });

  it('returns queued settlement when no publish transport is available', async () => {
    const event = {
      id: 'queued-no-transport',
      pubkey: 'alice',
      created_at: 20,
      kind: 1,
      tags: [],
      content: 'publish',
      sig: 'sig'
    };
    const add = vi.fn(async () => {});
    const coordinator = createEventCoordinator({
      pendingPublishes: { add },
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => ({ stored: true }))
      },
      relay: { verify: vi.fn(async () => []) }
    });

    await expect(coordinator.publish(event)).resolves.toEqual({
      queued: true,
      ok: false,
      settlement: {
        phase: 'pending',
        state: 'queued',
        durability: 'queued',
        reason: 'queued-offline'
      }
    });
    expect(add).toHaveBeenCalledWith(event);
  });

  it('returns degraded settlement when local materialization fails before publish', async () => {
    const event = {
      id: 'degraded-publish',
      pubkey: 'alice',
      created_at: 20,
      kind: 1,
      tags: [],
      content: 'publish',
      sig: 'sig'
    };
    const publish = vi.fn(async () => {});
    const coordinator = createEventCoordinator({
      publishTransport: { publish },
      pendingPublishes: { add: vi.fn(async () => {}) },
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => {
          throw new Error('indexeddb unavailable');
        })
      },
      relay: { verify: vi.fn(async () => []) }
    });

    await expect(coordinator.publish(event)).resolves.toEqual({
      queued: false,
      ok: true,
      settlement: {
        phase: 'partial',
        state: 'retrying',
        durability: 'degraded',
        reason: 'materialization-degraded'
      }
    });
    expect(publish).toHaveBeenCalledWith(event, expect.any(Object));
  });
});
