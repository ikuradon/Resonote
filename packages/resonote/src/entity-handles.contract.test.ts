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
    readonly isDeleted?: (id: string, pubkey: string) => Promise<boolean>;
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
      isDeleted: options.isDeleted,
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

describe('EventHandle.fetch', () => {
  it('delegates by-id reads with temporary relay hints and returns settlement state', async () => {
    const event = makeEvent('6'.repeat(64), { content: 'from relay' });
    const read = vi.fn(async () => ({
      events: [event],
      settlement: reduceReadSettlement({
        localSettled: true,
        relaySettled: true,
        relayRequired: true,
        relayHit: true
      })
    }));
    const { coordinator } = createCoordinatorFixture({ read });

    const result = await coordinator
      .getEvent({ id: '6'.repeat(64), relayHints: ['wss://temporary.example/', 'not a relay'] })
      .fetch({ timeoutMs: 1234 });

    expect(read).toHaveBeenCalledWith([{ ids: ['6'.repeat(64)] }], { timeoutMs: 1234 }, [
      'wss://temporary.example/'
    ]);
    expect(result).toMatchObject({
      value: event,
      sourceEvent: event,
      state: 'relay-confirmed',
      settlement: { phase: 'settled', provenance: 'relay', reason: 'relay-repair' }
    });
  });

  it('returns missing state for settled misses', async () => {
    const { coordinator } = createCoordinatorFixture({
      read: vi.fn(async () => ({
        events: [],
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: true,
          relayRequired: true
        })
      }))
    });

    const result = await coordinator.getEvent({ id: '7'.repeat(64) }).fetch();

    expect(result.value).toBeNull();
    expect(result.sourceEvent).toBeNull();
    expect(result.state).toBe('missing');
  });
});

describe('UserHandle.fetchProfile', () => {
  it('fetches kind 0 profile events and returns parsed profile plus settlement', async () => {
    const profileEvent = makeEvent('8'.repeat(64), {
      pubkey: '9'.repeat(64),
      kind: 0,
      content: JSON.stringify({ name: 'Alice', picture: 'https://example.com/a.png' })
    });
    const read = vi.fn(async () => ({
      events: [profileEvent],
      settlement: LOCAL_SETTLEMENT
    }));
    const { coordinator } = createCoordinatorFixture({ read });

    const result = await coordinator.getUser({ pubkey: '9'.repeat(64) }).fetchProfile();

    expect(read).toHaveBeenCalledWith(
      [{ kinds: [0], authors: ['9'.repeat(64)], limit: 1 }],
      {},
      []
    );
    expect(result.profile).toEqual({ name: 'Alice', picture: 'https://example.com/a.png' });
    expect(result.sourceEvent).toBe(profileEvent);
    expect(result.state).toBe('local');
  });

  it('keeps source event and settlement when profile JSON is malformed', async () => {
    const profileEvent = makeEvent('a'.repeat(64), {
      pubkey: 'b'.repeat(64),
      kind: 0,
      content: '{not-json'
    });
    const { coordinator } = createCoordinatorFixture({
      read: vi.fn(async () => ({ events: [profileEvent], settlement: LOCAL_SETTLEMENT }))
    });

    const result = await coordinator.getUser({ pubkey: 'b'.repeat(64) }).fetchProfile();

    expect(result.profile).toBeNull();
    expect(result.sourceEvent).toBe(profileEvent);
    expect(result.settlement).toBe(LOCAL_SETTLEMENT);
    expect(result.state).toBe('local');
  });
});

describe('AddressableHandle.fetch', () => {
  it('fetches parameterized replaceable events by kind author and d tag', async () => {
    const event = makeEvent('c'.repeat(64), {
      pubkey: 'd'.repeat(64),
      kind: 30023,
      tags: [['d', 'article']]
    });
    const read = vi.fn(async () => ({ events: [event], settlement: LOCAL_SETTLEMENT }));
    const { coordinator } = createCoordinatorFixture({ read });

    const result = await coordinator
      .getAddressable({ kind: 30023, pubkey: 'd'.repeat(64), d: 'article' })
      .fetch();

    expect(read).toHaveBeenCalledWith(
      [{ kinds: [30023], authors: ['d'.repeat(64)], '#d': ['article'], limit: 1 }],
      {},
      []
    );
    expect(result.value).toBe(event);
    expect(result.state).toBe('local');
  });

  it('maps proven deletion visibility to deleted state without returning the event value', async () => {
    const event = makeEvent('e'.repeat(64), {
      pubkey: 'f'.repeat(64),
      kind: 30023,
      tags: [['d', 'deleted']]
    });
    const isDeleted = vi.fn(async () => true);
    const { coordinator } = createCoordinatorFixture({
      read: vi.fn(async () => ({ events: [event], settlement: LOCAL_SETTLEMENT })),
      isDeleted
    });

    const result = await coordinator
      .getAddressable({ kind: 30023, pubkey: 'f'.repeat(64), d: 'deleted' })
      .fetch({ cacheOnly: true });

    expect(isDeleted).toHaveBeenCalledWith('e'.repeat(64), 'f'.repeat(64));
    expect(result.value).toBeNull();
    expect(result.sourceEvent).toBeNull();
    expect(result.state).toBe('deleted');
  });
});

describe('RelayHintsHandle.fetch', () => {
  it('returns normalized read-only durable relay hints sorted by recency', async () => {
    const eventId = '1'.repeat(64);
    const { coordinator } = createCoordinatorFixture({
      relayHints: [
        {
          eventId,
          relayUrl: 'wss://older.example',
          source: 'seen',
          lastSeenAt: 1
        },
        {
          eventId,
          relayUrl: 'not a relay',
          source: 'hinted',
          lastSeenAt: 3
        },
        {
          eventId,
          relayUrl: 'wss://newer.example/',
          source: 'published',
          lastSeenAt: 5
        }
      ]
    });

    const result = await coordinator.getRelayHints(eventId).fetch();

    expect(result).toEqual({
      eventId,
      hints: [
        { eventId, relayUrl: 'wss://newer.example/', source: 'published', lastSeenAt: 5 },
        { eventId, relayUrl: 'wss://older.example/', source: 'seen', lastSeenAt: 1 }
      ]
    });
    expect('recordRelayHint' in result).toBe(false);
  });
});
