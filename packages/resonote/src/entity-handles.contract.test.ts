import { type ReadSettlement, reduceReadSettlement, type StoredEvent } from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import { deriveEntityHandleState } from './entity-handles.js';
import { createResonoteCoordinator, type EntityHandleState } from './runtime.js';

const LOCAL_SETTLEMENT = reduceReadSettlement({
  localSettled: true,
  relaySettled: true,
  relayRequired: false,
  localHitProvenance: 'store'
});

function makeEvent(id: string, overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id,
    pubkey: 'pubkey'.padEnd(64, '0'),
    created_at: 1,
    kind: 1,
    tags: [],
    content: '',
    ...overrides
  };
}

function createCoordinatorFixture(
  options: {
    readonly read?: (
      filters: readonly Record<string, unknown>[],
      options: { readonly cacheOnly?: boolean; readonly timeoutMs?: number },
      temporaryRelays: readonly string[]
    ) => Promise<{
      readonly events: readonly StoredEvent[];
      readonly settlement: ReadSettlement;
    }>;
    readonly relayHints?: Array<{
      readonly eventId: string;
      readonly relayUrl: string;
      readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
      readonly lastSeenAt: number;
    }>;
  } = {}
) {
  const getEventsDB = vi.fn(async () => ({
    getByPubkeyAndKind: vi.fn(async () => null),
    getManyByPubkeysAndKind: vi.fn(async () => []),
    getByReplaceKey: vi.fn(async () => null),
    getByTagValue: vi.fn(async () => []),
    getById: vi.fn(async () => null),
    getAllByKind: vi.fn(async () => []),
    listNegentropyEventRefs: vi.fn(async () => []),
    deleteByIds: vi.fn(async () => {}),
    clearAll: vi.fn(async () => {}),
    put: vi.fn(async () => true),
    putWithReconcile: vi.fn(async () => ({ stored: true, emissions: [] })),
    getRelayHints: vi.fn(async () => options.relayHints ?? [])
  }));
  const read =
    options.read ??
    vi.fn(async () => ({
      events: [],
      settlement: reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: true
      })
    }));

  const coordinator = createResonoteCoordinator({
    runtime: {
      fetchLatestEvent: async () => null,
      getEventsDB,
      getRxNostr: async () => ({
        use: () => ({ subscribe: () => ({ unsubscribe() {} }) })
      }),
      getDefaultRelays: () => ['wss://default.example/'],
      createRxBackwardReq: () => ({ emit() {}, over() {} }),
      createRxForwardReq: () => ({ emit() {}, over() {} }),
      uniq: () => ({}),
      merge: () => ({}),
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
      drainPendingPublishes: async () => ({
        emissions: [],
        settledCount: 0,
        retryingCount: 0
      })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    },
    entityHandleRuntime: {
      read,
      snapshotRelaySet: async () => ({
        subject: { type: 'event', id: 'event'.padEnd(64, '0') },
        readRelays: ['wss://default.example/'],
        writeRelays: [],
        temporaryRelays: [],
        diagnostics: []
      })
    }
  });

  return { coordinator, read, getEventsDB };
}

describe('@auftakt/resonote entity handles', () => {
  it('creates NDK-like coordinator handles without executing reads during construction', async () => {
    const { coordinator, read } = createCoordinatorFixture();

    const event = coordinator.getEvent({ id: 'a'.repeat(64) });
    const user = coordinator.getUser({ pubkey: 'b'.repeat(64) });
    const addressable = coordinator.getAddressable({
      kind: 30023,
      pubkey: 'c'.repeat(64),
      d: 'note'
    });
    const relaySet = coordinator.getRelaySet({
      type: 'event',
      id: 'd'.repeat(64)
    });
    const relayHints = coordinator.getRelayHints('e'.repeat(64));

    expect(event.id).toBe('a'.repeat(64));
    expect(user.pubkey).toBe('b'.repeat(64));
    expect(addressable.d).toBe('note');
    expect(relaySet.subject).toEqual({ type: 'event', id: 'd'.repeat(64) });
    expect(relayHints.eventId).toBe('e'.repeat(64));
    expect(read).not.toHaveBeenCalled();
  });

  it('exports the handle state type through runtime type exports', () => {
    const state: EntityHandleState = 'relay-confirmed';
    expect(state).toBe('relay-confirmed');
  });
});

describe('entity handle settlement state derivation', () => {
  it.each([
    [
      'missing',
      null,
      reduceReadSettlement({ localSettled: true, relaySettled: true, relayRequired: true }),
      false
    ],
    ['local', makeEvent('1'.repeat(64)), LOCAL_SETTLEMENT, false],
    [
      'partial',
      makeEvent('2'.repeat(64)),
      reduceReadSettlement({
        localSettled: true,
        relaySettled: false,
        relayRequired: true,
        localHitProvenance: 'store'
      }),
      false
    ],
    [
      'relay-confirmed',
      makeEvent('3'.repeat(64)),
      reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: true,
        relayHit: true
      }),
      false
    ],
    [
      'repaired',
      makeEvent('4'.repeat(64)),
      { phase: 'settled', provenance: 'relay', reason: 'negentropy-repair' },
      false
    ],
    ['deleted', makeEvent('5'.repeat(64)), LOCAL_SETTLEMENT, true]
  ] satisfies Array<[EntityHandleState, StoredEvent | null, ReadSettlement, boolean]>)(
    'maps %s state',
    (expected, value, settlement, deleted) => {
      expect(deriveEntityHandleState({ value, settlement, deleted })).toBe(expected);
    }
  );
});
