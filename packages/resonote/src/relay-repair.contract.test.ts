import 'fake-indexeddb/auto';

import { createDexieEventStore } from '@auftakt/adapter-dexie';
import type { RequestKey, StoredEvent } from '@auftakt/core';
import { createRuntimeRequestKey } from '@auftakt/core';
import { describe, expect, it } from 'vitest';

import { repairEventsFromRelay, type ResonoteRuntime } from './runtime.js';

type FixtureEvent = StoredEvent & { sig: string };

function hexId(seed: string): string {
  return seed.repeat(64);
}

function makeEvent(id: string, overrides: Partial<FixtureEvent> = {}): FixtureEvent {
  return {
    id,
    pubkey: overrides.pubkey ?? 'pubkey-a',
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [['p', 'pubkey-a']],
    content: overrides.content ?? 'hello',
    created_at: overrides.created_at ?? 100,
    sig: overrides.sig ?? 'sig-a'
  };
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
  initialEvents?: FixtureEvent[];
  negentropyResult?: {
    capability: 'supported' | 'unsupported' | 'failed';
    reason?: string;
    messageHex?: string;
  };
  fallbackEvents?: FixtureEvent[];
  relayEventsById?: Record<string, FixtureEvent>;
}) {
  const createdRequests: FakeBackwardRequest[] = [];
  const materialized: StoredEvent[] = [];
  let negentropyCallCount = 0;
  const eventsDB = await createDexieEventStore({
    dbName: `relay-repair-contract-${Date.now()}-${Math.random()}`
  });

  for (const event of options.initialEvents ?? []) {
    await eventsDB.putWithReconcile(event);
  }

  const session = {
    requestNegentropySync: options.negentropyResult
      ? async () => {
          negentropyCallCount += 1;
          return options.negentropyResult;
        }
      : undefined,
    use(req: FakeBackwardRequest) {
      return {
        subscribe(observer: {
          next?: (packet: { event: StoredEvent }) => void;
          complete?: () => void;
        }) {
          queueMicrotask(() => {
            const ids = req.emitted.flatMap((filter) =>
              Array.isArray(filter.ids)
                ? filter.ids.filter((value): value is string => typeof value === 'string')
                : []
            );

            const events: FixtureEvent[] =
              ids.length > 0
                ? ids.reduce<FixtureEvent[]>((results, id) => {
                    const event = options.relayEventsById?.[id];
                    if (event) results.push(event);
                    return results;
                  }, [])
                : [...(options.fallbackEvents ?? [])];

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
    async fetchBackwardEvents() {
      return [];
    },
    async fetchBackwardFirst() {
      return null;
    },
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
        deleteByIds: eventsDB.deleteByIds.bind(eventsDB),
        clearAll: eventsDB.clearAll.bind(eventsDB),
        async put(event: StoredEvent) {
          materialized.push(event);
          return eventsDB.put(event as FixtureEvent);
        },
        async putWithReconcile(event: StoredEvent) {
          materialized.push(event);
          return eventsDB.putWithReconcile(event as FixtureEvent);
        }
      };
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
    expect(fixture.materialized).toEqual([missingEvent, missingEvent]);
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
});
