import { finalizeEvent } from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import { createResonoteCoordinator } from './runtime.js';

const RELAY_SECRET_KEY = new Uint8Array(32).fill(9);

interface RequestRecord {
  readonly options: unknown;
  readonly emitted: unknown[];
}

interface NegentropyRequestRecord {
  readonly relayUrl: string;
  readonly filter: Record<string, unknown>;
  readonly initialMessageHex: string;
  readonly timeoutMs?: number;
}

interface NegentropyFixtureResult {
  readonly capability: 'supported' | 'unsupported' | 'failed';
  readonly messageHex?: string;
  readonly reason?: string;
}

function createCoordinatorFixture({
  defaultRelays = ['wss://default.example'],
  getById = async () => null,
  getAllByKind = async () => [],
  getRelayHints = async () => [],
  relayEvents = [],
  putWithReconcile = async () => ({ stored: true, emissions: [] }),
  putQuarantine = async () => {},
  relayStatusFetchLatestEvent = async () => null,
  negentropyResult
}: {
  defaultRelays?: readonly string[];
  getById?: (id: string) => Promise<unknown>;
  getAllByKind?: (kind: number) => Promise<unknown[]>;
  getRelayHints?: (eventId: string) => Promise<
    Array<{
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }>
  >;
  relayEvents?: readonly unknown[];
  putWithReconcile?: (event: unknown) => Promise<{ stored: boolean; emissions: unknown[] }>;
  putQuarantine?: (record: unknown) => Promise<void>;
  relayStatusFetchLatestEvent?: (
    pubkey: string,
    kind: number
  ) => Promise<{ tags: string[][]; content: string; created_at: number } | null>;
  negentropyResult?:
    | NegentropyFixtureResult
    | ((request: NegentropyRequestRecord) => Promise<NegentropyFixtureResult>);
} = {}) {
  const createdRequests: RequestRecord[] = [];
  const negentropyRequests: NegentropyRequestRecord[] = [];
  const relayStatusLatest = vi.fn(relayStatusFetchLatestEvent);

  const coordinator = createResonoteCoordinator({
    runtime: {
      fetchLatestEvent: async () => null,
      getDefaultRelays: async () => defaultRelays,
      getEventsDB: async () => ({
        getByPubkeyAndKind: async () => null,
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async () => null,
        getByTagValue: async () => [],
        getById: async (id: string) => getById(id),
        getAllByKind: async (kind: number) => getAllByKind(kind),
        listNegentropyEventRefs: async () => [],
        getRelayHints: async (eventId: string) => getRelayHints(eventId),
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async (event: unknown) => putWithReconcile(event),
        putQuarantine: async (record: unknown) => putQuarantine(record)
      }),
      getRelaySession: async () => {
        const relaySession: {
          use(
            req: { emit(input: unknown): void },
            options: unknown
          ): {
            subscribe(observer: {
              next?: (packet: { event: unknown; from?: string }) => void;
              complete?: () => void;
            }): { unsubscribe(): void };
          };
          requestNegentropySync?(
            request: NegentropyRequestRecord
          ): Promise<NegentropyFixtureResult>;
        } = {
          use(_req: { emit(input: unknown): void }, options: unknown) {
            const entry = { options, emitted: [] as unknown[] };
            createdRequests.push(entry);
            return {
              subscribe(observer: {
                next?: (packet: { event: unknown; from?: string }) => void;
                complete?: () => void;
              }) {
                queueMicrotask(() => {
                  for (const event of relayEvents) {
                    observer.next?.({ event, from: 'wss://relay.example' });
                  }
                  observer.complete?.();
                });
                return { unsubscribe() {} };
              }
            };
          }
        };

        if (negentropyResult !== undefined) {
          relaySession.requestNegentropySync = async (request) => {
            negentropyRequests.push(request);
            return typeof negentropyResult === 'function'
              ? negentropyResult(request)
              : negentropyResult;
          };
        }

        return relaySession;
      },
      createBackwardReq: () => ({
        emit(input: unknown) {
          createdRequests.at(-1)?.emitted.push(input);
        },
        over() {}
      }),
      createForwardReq: () => ({ emit() {}, over() {} }),
      uniq: () => ({}) as unknown,
      merge: () => ({}) as unknown,
      getRelayConnectionState: async () => null,
      observeRelayConnectionStates: async () => ({ unsubscribe() {} })
    },
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: {
      useCachedLatest: () => null
    },
    publishTransportRuntime: {
      castSigned: async () => {}
    },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: relayStatusLatest,
      setDefaultRelays: async () => {}
    }
  });

  return { coordinator, createdRequests, relayStatusLatest, negentropyRequests };
}

describe('@auftakt/resonote public read cutover', () => {
  it('routes public latest reads through coordinator materialization', async () => {
    const relayEvent = finalizeEvent(
      {
        kind: 0,
        content: 'relay metadata',
        tags: [],
        created_at: 123
      },
      RELAY_SECRET_KEY
    );
    const materialized: unknown[] = [];
    const { coordinator, createdRequests, relayStatusLatest } = createCoordinatorFixture({
      relayEvents: [relayEvent],
      putWithReconcile: async (event) => {
        materialized.push(event);
        return { stored: true, emissions: [] };
      },
      relayStatusFetchLatestEvent: async () => {
        throw new Error('legacy latest path used');
      }
    });

    const result = await coordinator.fetchLatestEvent(relayEvent.pubkey, 0);

    expect(result).toMatchObject({
      content: 'relay metadata',
      created_at: 123,
      tags: []
    });
    expect(materialized).toEqual([relayEvent]);
    expect(relayStatusLatest).not.toHaveBeenCalled();
    expect(createdRequests[0]?.emitted).toEqual([
      { kinds: [0], authors: [relayEvent.pubkey], limit: 1 }
    ]);
  });

  it('attempts negentropy before ordinary latest REQ verification', async () => {
    const relayEvent = finalizeEvent(
      {
        kind: 0,
        content: 'relay metadata via negentropy',
        tags: [],
        created_at: 124
      },
      RELAY_SECRET_KEY
    );
    const materialized: unknown[] = [];
    const { coordinator, createdRequests, negentropyRequests } = createCoordinatorFixture({
      relayEvents: [relayEvent],
      negentropyResult: {
        capability: 'supported',
        messageHex: JSON.stringify({ remoteOnlyIds: [relayEvent.id] })
      },
      putWithReconcile: async (event) => {
        materialized.push(event);
        return { stored: true, emissions: [] };
      }
    });

    const result = await coordinator.fetchLatestEvent(relayEvent.pubkey, 0);

    expect(result).toMatchObject({
      content: 'relay metadata via negentropy',
      created_at: 124,
      tags: []
    });
    expect(negentropyRequests).toEqual([
      {
        relayUrl: 'wss://default.example/',
        filter: { kinds: [0], authors: [relayEvent.pubkey], limit: 1 },
        initialMessageHex: '[]',
        timeoutMs: 250
      }
    ]);
    expect(createdRequests[0]?.emitted).toEqual([{ ids: [relayEvent.id] }]);
    expect(materialized).toEqual([relayEvent]);
  });

  it('falls back to REQ when ordinary latest negentropy fails', async () => {
    const relayEvent = finalizeEvent(
      {
        kind: 0,
        content: 'relay metadata via fallback',
        tags: [],
        created_at: 125
      },
      RELAY_SECRET_KEY
    );
    const { coordinator, createdRequests, negentropyRequests } = createCoordinatorFixture({
      relayEvents: [relayEvent],
      negentropyResult: {
        capability: 'failed',
        reason: 'timeout'
      }
    });

    const result = await coordinator.fetchLatestEvent(relayEvent.pubkey, 0);

    expect(result).toMatchObject({
      content: 'relay metadata via fallback',
      created_at: 125,
      tags: []
    });
    expect(negentropyRequests).toHaveLength(1);
    expect(createdRequests[0]?.emitted).toEqual([
      { kinds: [0], authors: [relayEvent.pubkey], limit: 1 }
    ]);
  });

  it('uses a short ordinary negentropy probe timeout before latest REQ fallback', async () => {
    const relayEvent = finalizeEvent(
      {
        kind: 0,
        content: 'relay metadata after short probe',
        tags: [],
        created_at: 126
      },
      RELAY_SECRET_KEY
    );
    const probeTimeouts: Array<number | undefined> = [];
    const { coordinator, createdRequests } = createCoordinatorFixture({
      relayEvents: [relayEvent],
      negentropyResult: async (request) => {
        probeTimeouts.push(request.timeoutMs);
        return {
          capability: 'failed',
          reason: 'timeout'
        };
      }
    });

    const result = await coordinator.fetchLatestEvent(relayEvent.pubkey, 0);

    expect(result).toMatchObject({
      content: 'relay metadata after short probe',
      created_at: 126,
      tags: []
    });
    expect(probeTimeouts).toEqual([expect.any(Number)]);
    expect(probeTimeouts[0]).toBeLessThanOrEqual(500);
    expect(createdRequests[0]?.emitted).toEqual([
      { kinds: [0], authors: [relayEvent.pubkey], limit: 1 }
    ]);
  });

  it('quarantines malformed latest relay candidates and returns null', async () => {
    const quarantined: unknown[] = [];
    const materialized: unknown[] = [];
    const { coordinator, relayStatusLatest } = createCoordinatorFixture({
      relayEvents: [{ id: 'not-a-valid-event' }],
      putWithReconcile: async (event) => {
        materialized.push(event);
        return { stored: true, emissions: [] };
      },
      putQuarantine: async (record) => {
        quarantined.push(record);
      },
      relayStatusFetchLatestEvent: async () => {
        throw new Error('legacy latest path used');
      }
    });

    await expect(coordinator.fetchLatestEvent('pubkey', 0)).resolves.toBeNull();
    expect(relayStatusLatest).not.toHaveBeenCalled();
    expect(materialized).toEqual([]);
    expect(quarantined).toEqual([
      expect.objectContaining({
        relayUrl: 'wss://default.example/',
        eventId: 'not-a-valid-event',
        rawEvent: { id: 'not-a-valid-event' }
      })
    ]);
  });

  it('uses capability-aware gateway for backward event reads', async () => {
    const relayEvent = finalizeEvent(
      {
        kind: 1,
        content: 'backward relay event',
        tags: [],
        created_at: 126
      },
      RELAY_SECRET_KEY
    );
    const materialized: unknown[] = [];
    const { coordinator, createdRequests, negentropyRequests } = createCoordinatorFixture({
      relayEvents: [relayEvent],
      negentropyResult: {
        capability: 'supported',
        messageHex: JSON.stringify({ remoteOnlyIds: [relayEvent.id] })
      },
      putWithReconcile: async (event) => {
        materialized.push(event);
        return { stored: true, emissions: [] };
      }
    });

    const events = await coordinator.fetchBackwardEvents<typeof relayEvent>([
      { kinds: [1], limit: 20 }
    ]);

    expect(events).toEqual([relayEvent]);
    expect(negentropyRequests).toEqual([
      {
        relayUrl: 'wss://default.example/',
        filter: { kinds: [1], limit: 20 },
        initialMessageHex: '[]',
        timeoutMs: 250
      }
    ]);
    expect(createdRequests[0]?.emitted).toEqual([{ ids: [relayEvent.id] }]);
    expect(materialized).toEqual([relayEvent]);
  });

  it('returns the newest event from fetchBackwardFirst when local reads are already descending', async () => {
    const olderEvent = finalizeEvent(
      {
        kind: 1,
        content: 'older local event',
        tags: [],
        created_at: 100
      },
      RELAY_SECRET_KEY
    );
    const newestEvent = finalizeEvent(
      {
        kind: 1,
        content: 'newest local event',
        tags: [],
        created_at: 200
      },
      RELAY_SECRET_KEY
    );
    const { coordinator } = createCoordinatorFixture({
      getAllByKind: async () => [olderEvent, newestEvent]
    });

    const event = await coordinator.fetchBackwardFirst<typeof newestEvent>([{ kinds: [1] }], {
      overlay: { relays: [], includeDefaultReadRelays: false }
    });

    expect(event).toEqual(newestEvent);
  });

  it('returns the newest relay event from fetchBackwardFirst when local-first reads include stale cache', async () => {
    const localEvent = finalizeEvent(
      {
        kind: 1,
        content: 'stale local event',
        tags: [],
        created_at: 100
      },
      RELAY_SECRET_KEY
    );
    const relayEvent = finalizeEvent(
      {
        kind: 1,
        content: 'newer relay event',
        tags: [],
        created_at: 200
      },
      RELAY_SECRET_KEY
    );
    const { coordinator } = createCoordinatorFixture({
      getAllByKind: async () => [localEvent],
      relayEvents: [relayEvent]
    });

    const event = await coordinator.fetchBackwardFirst<typeof relayEvent>([
      { kinds: [1], limit: 1 }
    ]);

    expect(event).toEqual(relayEvent);
  });

  it('still verifies cached public by-id reads with temporary relay hints', async () => {
    const localEvent = finalizeEvent(
      {
        kind: 1,
        content: 'local event',
        tags: [],
        created_at: 44
      },
      RELAY_SECRET_KEY
    );
    const { coordinator, createdRequests } = createCoordinatorFixture({
      defaultRelays: ['wss://default.example'],
      getById: async (id) => (id === localEvent.id ? localEvent : null)
    });

    const result = await coordinator.fetchNostrEventById<typeof localEvent>(localEvent.id, [
      'wss://temporary.example'
    ]);

    expect(result).toEqual(localEvent);
    expect(createdRequests.map((request) => request.options)).toEqual([
      {
        on: {
          relays: ['wss://temporary.example/'],
          defaultReadRelays: false
        }
      },
      {
        on: {
          relays: ['wss://default.example/'],
          defaultReadRelays: false
        }
      }
    ]);
    expect(createdRequests.map((request) => request.emitted)).toEqual([
      [{ ids: [localEvent.id] }],
      [{ ids: [localEvent.id] }]
    ]);
  });

  it('exposes comment subscription helpers through coordinator-owned runtime surface', async () => {
    const { coordinator } = createCoordinatorFixture();
    const mod = await import('@auftakt/resonote');

    expect(typeof coordinator.loadCommentSubscriptionDeps).toBe('function');
    expect(typeof mod.buildCommentContentFilters).toBe('function');
    expect(typeof mod.startCommentSubscription).toBe('function');
    expect(typeof mod.startMergedCommentSubscription).toBe('function');
    expect(typeof mod.startCommentDeletionReconcile).toBe('function');
  });
});
