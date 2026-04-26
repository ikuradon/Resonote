import { finalizeEvent } from '@auftakt/core';
import { createResonoteCoordinator } from '@auftakt/resonote';
import { describe, expect, it, vi } from 'vitest';

const RELAY_SECRET_KEY = new Uint8Array(32).fill(9);

interface RequestRecord {
  readonly options: unknown;
  readonly emitted: unknown[];
}

function createCoordinatorFixture({
  defaultRelays = ['wss://default.example'],
  getById = async () => null,
  getAllByKind = async () => [],
  getRelayHints = async () => [],
  relayEvents = [],
  putWithReconcile = async () => ({ stored: true, emissions: [] }),
  putQuarantine = async () => {},
  relayStatusFetchLatestEvent = async () => null
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
} = {}) {
  const createdRequests: RequestRecord[] = [];
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
      getRxNostr: async () => ({
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
      }),
      createRxBackwardReq: () => ({
        emit(input: unknown) {
          createdRequests.at(-1)?.emitted.push(input);
        },
        over() {}
      }),
      createRxForwardReq: () => ({ emit() {}, over() {} }),
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

  return { coordinator, createdRequests, relayStatusLatest };
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
        relayUrl: 'wss://relay.example',
        eventId: 'not-a-valid-event',
        rawEvent: { id: 'not-a-valid-event' }
      })
    ]);
  });
});
