import 'fake-indexeddb/auto';

import { createDexieEventStore } from '@auftakt/adapter-dexie';
import type { RequestKey, StoredEvent } from '@auftakt/core';
import {
  createNegentropyRepairRequestKey,
  createRuntimeRequestKey,
  finalizeEvent
} from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import { repairEventsFromRelay, type ResonoteRuntime } from './runtime.js';

type FixtureEvent = StoredEvent & { sig: string };
const fixtureSecret = (() => {
  const secret = new Uint8Array(32);
  secret[31] = 1;
  return secret;
})();
const repairRelayUrl = 'wss://relay.contract.test';

function repairCursorKey(relayUrl: string, requestKey: RequestKey): string {
  return `relay:${relayUrl}\nrequest:${requestKey}`;
}

function hexId(seed: string): string {
  return seed.repeat(64);
}

function makeEvent(id: string, overrides: Partial<FixtureEvent> = {}): FixtureEvent {
  return finalizeEvent(
    {
      kind: overrides.kind ?? 1,
      tags: overrides.tags ?? [['p', 'pubkey-a']],
      content: overrides.content ?? `hello:${id.slice(0, 8)}`,
      created_at: overrides.created_at ?? 100
    },
    fixtureSecret
  ) as FixtureEvent;
}

function encodeNegentropyIdList(ids: readonly string[]): string {
  return `61000002${ids.length.toString(16).padStart(2, '0')}${ids.join('')}`;
}

class FakeBackwardRequest {
  readonly emitted: Array<Record<string, unknown>> = [];

  constructor(readonly requestKey?: RequestKey) {}

  emit(input: unknown): void {
    this.emitted.push(input as Record<string, unknown>);
  }

  over(): void {}
}

async function createRuntimeFixture(options: {
  dbName?: string;
  initialEvents?: FixtureEvent[];
  negentropyResult?: {
    capability: 'supported' | 'unsupported' | 'failed';
    reason?: string;
    messageHex?: string;
  };
  fallbackEvents?: FixtureEvent[];
  rawFallbackEvents?: unknown[];
  relayEventsById?: Record<string, unknown>;
}) {
  const createdRequests: FakeBackwardRequest[] = [];
  const materialized: StoredEvent[] = [];
  const negentropyRequests: Array<{
    relayUrl: string;
    filter: Record<string, unknown>;
    timeoutMs?: number;
  }> = [];
  let negentropyCallCount = 0;
  const eventsDB = await createDexieEventStore({
    dbName: options.dbName ?? `relay-repair-contract-${Date.now()}-${Math.random()}`
  });

  for (const event of options.initialEvents ?? []) {
    await eventsDB.putWithReconcile(event);
  }

  const session = {
    requestNegentropySync: options.negentropyResult
      ? async (request: {
          relayUrl: string;
          filter: Record<string, unknown>;
          timeoutMs?: number;
        }) => {
          negentropyCallCount += 1;
          negentropyRequests.push(request);
          return options.negentropyResult;
        }
      : undefined,
    use(req: FakeBackwardRequest) {
      return {
        subscribe(observer: {
          next?: (packet: { event: unknown }) => void;
          complete?: () => void;
        }) {
          queueMicrotask(() => {
            const ids = req.emitted.flatMap((filter) =>
              Array.isArray(filter.ids)
                ? filter.ids.filter((value): value is string => typeof value === 'string')
                : []
            );

            const events: unknown[] =
              ids.length > 0
                ? ids.reduce<unknown[]>((results, id) => {
                    const event = options.relayEventsById?.[id];
                    if (event) results.push(event);
                    return results;
                  }, [])
                : [...(options.rawFallbackEvents ?? options.fallbackEvents ?? [])];

            for (const event of events) {
              observer.next?.({ event });
            }
            observer.complete?.();
          });

          return {
            unsubscribe() {}
          };
        }
      };
    }
  };

  const runtime: ResonoteRuntime = {
    async fetchLatestEvent() {
      return null;
    },
    async getEventsDB() {
      return {
        getByPubkeyAndKind: eventsDB.getByPubkeyAndKind.bind(eventsDB),
        getManyByPubkeysAndKind: eventsDB.getManyByPubkeysAndKind.bind(eventsDB),
        getByReplaceKey: eventsDB.getByReplaceKey.bind(eventsDB),
        getByTagValue: eventsDB.getByTagValue.bind(eventsDB),
        getById: eventsDB.getById.bind(eventsDB),
        getAllByKind: eventsDB.getAllByKind.bind(eventsDB),
        listNegentropyEventRefs: eventsDB.listNegentropyEventRefs.bind(eventsDB),
        getSyncCursor: eventsDB.getSyncCursor.bind(eventsDB),
        putSyncCursor: eventsDB.putSyncCursor.bind(eventsDB),
        deleteByIds: eventsDB.deleteByIds.bind(eventsDB),
        clearAll: eventsDB.clearAll.bind(eventsDB),
        async put(event: StoredEvent) {
          materialized.push(event);
          return eventsDB.put(event as FixtureEvent);
        },
        async putWithReconcile(event: StoredEvent) {
          materialized.push(event);
          return eventsDB.putWithReconcile(event as FixtureEvent);
        },
        putQuarantine: eventsDB.putQuarantine.bind(eventsDB)
      } as Awaited<ReturnType<typeof createDexieEventStore>>;
    },
    async getRxNostr() {
      return session as unknown;
    },
    createRxBackwardReq(options) {
      const request = new FakeBackwardRequest(options?.requestKey);
      createdRequests.push(request);
      return request as unknown;
    },
    createRxForwardReq() {
      throw new Error('not used in relay repair contract tests');
    },
    uniq() {
      return {};
    },
    merge() {
      return {
        subscribe() {
          return { unsubscribe() {} };
        }
      };
    },
    async getRelayConnectionState() {
      return null;
    },
    async observeRelayConnectionStates() {
      return { unsubscribe() {} };
    }
  };

  return {
    createdRequests,
    materialized,
    negentropyRequests,
    getNegentropyCallCount: () => negentropyCallCount,
    eventsDB,
    runtime
  };
}

describe('@auftakt/resonote relay repair contract', () => {
  it('falls back to canonical backward repair when negentropy is unsupported', async () => {
    const missingEvent = makeEvent(hexId('b'), { created_at: 200 });
    const filter = { authors: ['pubkey-a'], kinds: [1] };
    const fixture = await createRuntimeFixture({
      initialEvents: [makeEvent(hexId('a'))],
      negentropyResult: {
        capability: 'unsupported',
        reason: 'unsupported: relay disabled negentropy'
      },
      fallbackEvents: [missingEvent]
    });

    await expect(
      repairEventsFromRelay(fixture.runtime, {
        filters: [filter],
        relayUrl: 'wss://relay.contract.test'
      })
    ).resolves.toEqual({
      strategy: 'fallback',
      capability: 'unsupported',
      repairedIds: [missingEvent.id],
      materializationEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'accepted-new',
          state: 'confirmed'
        }
      ],
      repairEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'repaired-replay',
          state: 'repairing'
        }
      ]
    });

    const appRequestKey = createRuntimeRequestKey({
      mode: 'backward',
      filters: [filter],
      overlay: {
        relays: ['wss://relay.contract.test'],
        includeDefaultReadRelays: false
      }
    });

    expect(fixture.createdRequests).toHaveLength(1);
    expect(fixture.createdRequests[0]?.requestKey).not.toBe(appRequestKey);
    expect(fixture.materialized).toEqual([missingEvent]);
  });

  it('does not count malformed relay repair candidates as repaired', async () => {
    const malformedId = hexId('b');
    const fixture = await createRuntimeFixture({
      negentropyResult: {
        capability: 'unsupported',
        reason: 'unsupported: relay disabled negentropy'
      },
      relayEventsById: {
        [malformedId]: { malformed: true }
      }
    });
    const putWithReconcile = vi.spyOn(fixture.eventsDB, 'putWithReconcile');
    const putQuarantine = vi.spyOn(fixture.eventsDB, 'putQuarantine');

    const result = await repairEventsFromRelay(fixture.runtime, {
      filters: [{ ids: [malformedId] }],
      relayUrl: 'wss://relay.contract.test',
      timeoutMs: 10
    });

    expect(result.repairedIds).toEqual([]);
    expect(putWithReconcile).not.toHaveBeenCalled();
    expect(putQuarantine).toHaveBeenCalledWith(expect.objectContaining({ reason: 'malformed' }));
  });

  it('falls back to canonical backward repair when negentropy payload decode fails', async () => {
    const missingEvent = makeEvent(hexId('c'), { created_at: 300 });
    const fixture = await createRuntimeFixture({
      initialEvents: [makeEvent(hexId('a'))],
      negentropyResult: {
        capability: 'supported',
        messageHex: '61zz'
      },
      fallbackEvents: [missingEvent]
    });

    await expect(
      repairEventsFromRelay(fixture.runtime, {
        filters: [{ authors: ['pubkey-a'], kinds: [1] }],
        relayUrl: 'wss://relay.contract.test'
      })
    ).resolves.toEqual({
      strategy: 'fallback',
      capability: 'failed',
      repairedIds: [missingEvent.id],
      materializationEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'accepted-new',
          state: 'confirmed'
        }
      ],
      repairEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'repaired-replay',
          state: 'repairing'
        }
      ]
    });

    expect(fixture.getNegentropyCallCount()).toBe(1);
    expect(fixture.createdRequests).toHaveLength(1);
    expect(fixture.materialized).toEqual([missingEvent]);
  });

  it('falls back with failed capability for timeout-style negentropy transport results', async () => {
    const missingEvent = makeEvent(hexId('d'), { created_at: 400 });
    const fixture = await createRuntimeFixture({
      initialEvents: [makeEvent(hexId('a'))],
      negentropyResult: {
        capability: 'failed',
        reason: 'timeout'
      },
      fallbackEvents: [missingEvent]
    });

    await expect(
      repairEventsFromRelay(fixture.runtime, {
        filters: [{ authors: ['pubkey-a'], kinds: [1] }],
        relayUrl: 'wss://relay.contract.test',
        timeoutMs: 250
      })
    ).resolves.toEqual({
      strategy: 'fallback',
      capability: 'failed',
      repairedIds: [missingEvent.id],
      materializationEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'accepted-new',
          state: 'confirmed'
        }
      ],
      repairEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'repaired-replay',
          state: 'repairing'
        }
      ]
    });

    expect(fixture.getNegentropyCallCount()).toBe(1);
    expect(fixture.createdRequests).toHaveLength(1);
    expect(fixture.materialized).toEqual([missingEvent]);
  });

  it('caches unsupported relay capability and skips renegotiation on repeated repairs', async () => {
    const missingEvent = makeEvent(hexId('e'), { created_at: 500 });
    const fixture = await createRuntimeFixture({
      initialEvents: [makeEvent(hexId('a'))],
      negentropyResult: {
        capability: 'unsupported',
        reason: 'unsupported: relay disabled negentropy'
      },
      fallbackEvents: [missingEvent]
    });

    await repairEventsFromRelay(fixture.runtime, {
      filters: [{ authors: ['pubkey-a'], kinds: [1] }],
      relayUrl: 'wss://relay.contract.test'
    });

    await repairEventsFromRelay(fixture.runtime, {
      filters: [{ authors: ['pubkey-a'], kinds: [1] }],
      relayUrl: 'wss://relay.contract.test'
    });

    expect(fixture.getNegentropyCallCount()).toBe(1);
    expect(fixture.createdRequests).toHaveLength(2);
    expect(fixture.createdRequests[1]?.emitted).toEqual([
      expect.objectContaining({ since: missingEvent.created_at })
    ]);
    expect(fixture.materialized).toEqual([missingEvent]);
  });

  it('materializes negentropy-discovered events through reconcile and emits repaired-negentropy', async () => {
    const localEvent = makeEvent(hexId('a'), { created_at: 100 });
    const missingEvent = makeEvent(hexId('b'), { created_at: 200 });
    const fixture = await createRuntimeFixture({
      initialEvents: [localEvent],
      negentropyResult: {
        capability: 'supported',
        messageHex: encodeNegentropyIdList([localEvent.id, missingEvent.id])
      },
      relayEventsById: {
        [missingEvent.id]: missingEvent
      }
    });

    await expect(
      repairEventsFromRelay(fixture.runtime, {
        filters: [{ authors: ['pubkey-a'], kinds: [1] }],
        relayUrl: 'wss://relay.contract.test'
      })
    ).resolves.toEqual({
      strategy: 'negentropy',
      capability: 'supported',
      repairedIds: [missingEvent.id],
      materializationEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'accepted-new',
          state: 'confirmed'
        }
      ],
      repairEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'repaired-negentropy',
          state: 'repairing'
        }
      ]
    });

    const appRequestKey = createRuntimeRequestKey({
      mode: 'backward',
      filters: [{ ids: [missingEvent.id] }],
      overlay: {
        relays: ['wss://relay.contract.test'],
        includeDefaultReadRelays: false
      }
    });

    expect(fixture.createdRequests).toHaveLength(1);
    expect(fixture.createdRequests[0]?.requestKey).not.toBe(appRequestKey);
    expect(fixture.materialized).toEqual([missingEvent]);
  });

  it('suppresses late original-event resurrection through fallback repair materialization', async () => {
    const resurrectedEvent = makeEvent(hexId('f'), { created_at: 600, kind: 1111, tags: [] });
    const tombstone = makeEvent(hexId('9'), {
      kind: 5,
      created_at: 610,
      tags: [['e', resurrectedEvent.id]]
    });
    const fixture = await createRuntimeFixture({
      initialEvents: [tombstone],
      negentropyResult: {
        capability: 'unsupported',
        reason: 'unsupported: relay disabled negentropy'
      },
      fallbackEvents: [resurrectedEvent]
    });

    await expect(
      repairEventsFromRelay(fixture.runtime, {
        filters: [{ authors: ['pubkey-a'], kinds: [1111] }],
        relayUrl: 'wss://relay.contract.test'
      })
    ).resolves.toEqual({
      strategy: 'fallback',
      capability: 'unsupported',
      repairedIds: [],
      materializationEmissions: [
        {
          subjectId: resurrectedEvent.id,
          reason: 'tombstoned',
          state: 'deleted'
        }
      ],
      repairEmissions: []
    });

    expect(fixture.materialized).toEqual([resurrectedEvent]);
    await expect(fixture.eventsDB.getById(resurrectedEvent.id)).resolves.toBeNull();
    await expect(fixture.eventsDB.getById(tombstone.id)).resolves.toMatchObject({
      id: tombstone.id
    });
  });

  it('applies late kind:5 repair events through reconcile materialization', async () => {
    const targetEvent = makeEvent(hexId('1'), { created_at: 100, kind: 1111, tags: [] });
    const deletionEvent = makeEvent(hexId('2'), {
      created_at: 200,
      kind: 5,
      tags: [['e', targetEvent.id]]
    });
    const fixture = await createRuntimeFixture({
      initialEvents: [targetEvent],
      negentropyResult: {
        capability: 'supported',
        messageHex: encodeNegentropyIdList([targetEvent.id, deletionEvent.id])
      },
      relayEventsById: {
        [deletionEvent.id]: deletionEvent
      }
    });

    await expect(
      repairEventsFromRelay(fixture.runtime, {
        filters: [{ authors: ['pubkey-a'], kinds: [1111, 5] }],
        relayUrl: 'wss://relay.contract.test'
      })
    ).resolves.toEqual({
      strategy: 'negentropy',
      capability: 'supported',
      repairedIds: [deletionEvent.id],
      materializationEmissions: [
        {
          subjectId: deletionEvent.id,
          reason: 'accepted-new',
          state: 'confirmed'
        },
        {
          subjectId: targetEvent.id,
          reason: 'tombstoned',
          state: 'deleted'
        }
      ],
      repairEmissions: [
        {
          subjectId: deletionEvent.id,
          reason: 'repaired-negentropy',
          state: 'repairing'
        }
      ]
    });

    expect(fixture.materialized).toEqual([deletionEvent]);
    await expect(fixture.eventsDB.getById(targetEvent.id)).resolves.toBeNull();
    await expect(fixture.eventsDB.getById(deletionEvent.id)).resolves.toMatchObject({
      id: deletionEvent.id,
      kind: 5
    });
  });

  it('chunks multi-id negentropy repair fetches at the canonical 50-id boundary', async () => {
    const missingEvents = Array.from({ length: 101 }, (_, index) =>
      makeEvent(index.toString(16).padStart(64, '0'), { created_at: 200 + index })
    );
    const fixture = await createRuntimeFixture({
      negentropyResult: {
        capability: 'supported',
        messageHex: encodeNegentropyIdList(missingEvents.map((event) => event.id))
      },
      relayEventsById: Object.fromEntries(missingEvents.map((event) => [event.id, event]))
    });

    const result = await repairEventsFromRelay(fixture.runtime, {
      filters: [{ authors: ['pubkey-a'], kinds: [1] }],
      relayUrl: 'wss://relay.contract.test'
    });

    expect(result.strategy).toBe('negentropy');
    expect(result.capability).toBe('supported');
    expect(result.repairedIds).toHaveLength(101);
    expect(fixture.createdRequests).toHaveLength(1);
    expect(
      fixture.createdRequests[0]?.emitted.map((filter) =>
        Array.isArray(filter.ids) ? filter.ids.length : 0
      )
    ).toEqual([50, 50, 1]);
    expect(fixture.materialized).toHaveLength(101);
  });

  it('resumes fallback repair from a persisted cursor after runtime recreation', async () => {
    const filter = { authors: ['pubkey-a'], kinds: [1] };
    const firstEvent = makeEvent(hexId('3'), { created_at: 300 });
    const secondEvent = makeEvent(hexId('4'), { created_at: 400 });
    const dbName = `relay-repair-cursor-restart-${Date.now()}-${Math.random()}`;
    const initial = await createRuntimeFixture({
      dbName,
      negentropyResult: {
        capability: 'unsupported',
        reason: 'unsupported: relay disabled negentropy'
      },
      fallbackEvents: [firstEvent]
    });

    await repairEventsFromRelay(initial.runtime, {
      filters: [filter],
      relayUrl: repairRelayUrl,
      timeoutMs: 10
    });
    initial.eventsDB.db.close();

    const restarted = await createRuntimeFixture({
      dbName,
      negentropyResult: {
        capability: 'unsupported',
        reason: 'unsupported: relay disabled negentropy'
      },
      fallbackEvents: [firstEvent, secondEvent]
    });

    const result = await repairEventsFromRelay(restarted.runtime, {
      filters: [filter],
      relayUrl: repairRelayUrl,
      timeoutMs: 10
    });

    expect(restarted.createdRequests[0]?.emitted).toEqual([
      expect.objectContaining({
        authors: ['pubkey-a'],
        kinds: [1],
        since: firstEvent.created_at
      })
    ]);
    expect(result.repairedIds).toEqual([secondEvent.id]);
    expect(restarted.materialized).toEqual([secondEvent]);
  });

  it('does not advance fallback repair cursor for malformed candidates', async () => {
    const fixture = await createRuntimeFixture({
      negentropyResult: {
        capability: 'unsupported',
        reason: 'unsupported: relay disabled negentropy'
      },
      rawFallbackEvents: [{ malformed: true }]
    });
    const putSyncCursor = vi.spyOn(fixture.eventsDB, 'putSyncCursor');

    const result = await repairEventsFromRelay(fixture.runtime, {
      filters: [{ authors: ['pubkey-a'], kinds: [1] }],
      relayUrl: repairRelayUrl,
      timeoutMs: 10
    });

    expect(result.repairedIds).toEqual([]);
    expect(putSyncCursor).not.toHaveBeenCalled();
    await expect(fixture.eventsDB.db.sync_cursors.toArray()).resolves.toEqual([]);
  });

  it('repairs late kind:5 after cursor restart and tombstones the target', async () => {
    const targetEvent = makeEvent(hexId('5'), { created_at: 500, kind: 1111, tags: [] });
    const deletionEvent = makeEvent(hexId('6'), {
      created_at: 510,
      kind: 5,
      tags: [['e', targetEvent.id]]
    });
    const filter = { authors: ['pubkey-a'], kinds: [1111, 5] };
    const dbName = `relay-repair-kind5-cursor-${Date.now()}-${Math.random()}`;
    const setup = await createRuntimeFixture({
      dbName,
      initialEvents: [targetEvent]
    });
    const requestKey = createNegentropyRepairRequestKey({
      filters: [filter],
      relayUrl: repairRelayUrl,
      scope: 'timeline:repair:fallback'
    });

    await setup.eventsDB.putSyncCursor({
      key: repairCursorKey(repairRelayUrl, requestKey),
      relay: repairRelayUrl,
      requestKey,
      cursor: {
        created_at: targetEvent.created_at,
        id: targetEvent.id
      },
      updatedAt: 1
    });
    setup.eventsDB.db.close();

    const restarted = await createRuntimeFixture({
      dbName,
      negentropyResult: {
        capability: 'unsupported',
        reason: 'unsupported: relay disabled negentropy'
      },
      fallbackEvents: [targetEvent, deletionEvent]
    });

    const result = await repairEventsFromRelay(restarted.runtime, {
      filters: [filter],
      relayUrl: repairRelayUrl,
      timeoutMs: 10
    });

    expect(restarted.createdRequests[0]?.emitted).toEqual([
      expect.objectContaining({
        kinds: [1111, 5],
        since: targetEvent.created_at
      })
    ]);
    expect(result.repairedIds).toEqual([deletionEvent.id]);
    await expect(restarted.eventsDB.getById(targetEvent.id)).resolves.toBeNull();
    await expect(restarted.eventsDB.getById(deletionEvent.id)).resolves.toMatchObject({
      id: deletionEvent.id,
      kind: 5
    });
  });

  it('uses the saved cursor as the negentropy lower bound after runtime recreation', async () => {
    const filter = { authors: ['pubkey-a'], kinds: [1] };
    const cursorEvent = makeEvent(hexId('7'), { created_at: 700 });
    const missingEvent = makeEvent(hexId('8'), { created_at: 800 });
    const dbName = `relay-repair-negentropy-cursor-${Date.now()}-${Math.random()}`;
    const setup = await createRuntimeFixture({
      dbName,
      initialEvents: [cursorEvent]
    });
    const requestKey = createNegentropyRepairRequestKey({
      filters: [filter],
      relayUrl: repairRelayUrl,
      scope: 'timeline:repair:negentropy'
    });

    await setup.eventsDB.putSyncCursor({
      key: repairCursorKey(repairRelayUrl, requestKey),
      relay: repairRelayUrl,
      requestKey,
      cursor: {
        created_at: cursorEvent.created_at,
        id: cursorEvent.id
      },
      updatedAt: 1
    });
    setup.eventsDB.db.close();

    const restarted = await createRuntimeFixture({
      dbName,
      negentropyResult: {
        capability: 'supported',
        messageHex: encodeNegentropyIdList([cursorEvent.id, missingEvent.id])
      },
      relayEventsById: {
        [missingEvent.id]: missingEvent
      }
    });

    const result = await repairEventsFromRelay(restarted.runtime, {
      filters: [filter],
      relayUrl: repairRelayUrl,
      timeoutMs: 10
    });

    expect(restarted.negentropyRequests).toHaveLength(1);
    expect(restarted.negentropyRequests[0]?.filter).toMatchObject({
      authors: ['pubkey-a'],
      kinds: [1],
      since: cursorEvent.created_at
    });
    expect(result.repairedIds).toEqual([missingEvent.id]);
    expect(restarted.materialized).toEqual([missingEvent]);
  });
});
