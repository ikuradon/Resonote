import type { RelaySelectionPolicyOptions, StoredEvent } from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import {
  buildPublishRelaySendOptions,
  buildReadRelayOverlay,
  RESONOTE_DEFAULT_RELAY_SELECTION_POLICY
} from './relay-selection-runtime.js';
import { createResonoteCoordinator } from './runtime.js';

const policy: RelaySelectionPolicyOptions = {
  ...RESONOTE_DEFAULT_RELAY_SELECTION_POLICY,
  maxReadRelays: 4,
  maxWriteRelays: 4,
  maxTemporaryRelays: 2,
  maxAudienceRelays: 2
};

function event(overrides: Partial<StoredEvent>): StoredEvent {
  return {
    id: overrides.id ?? 'event-id',
    pubkey: overrides.pubkey ?? 'author',
    created_at: overrides.created_at ?? 1,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? ''
  };
}

function createRuntimeFixture() {
  const getRelayHints = vi.fn(async (eventId: string) => {
    if (eventId === 'target') {
      return [
        {
          eventId: 'target',
          relayUrl: 'wss://durable.example',
          source: 'seen' as const,
          lastSeenAt: 1
        }
      ];
    }
    if (eventId === 'addressable-target') {
      return [
        {
          eventId: 'addressable-target',
          relayUrl: 'wss://addressable-durable.example',
          source: 'seen' as const,
          lastSeenAt: 2
        }
      ];
    }
    return [];
  });
  const getByPubkeyAndKind = vi.fn(async (pubkey: string, kind: number) =>
    kind === 10002 && pubkey === 'alice'
      ? event({
          pubkey,
          kind,
          tags: [
            ['r', 'wss://alice-read.example', 'read'],
            ['r', 'wss://alice-write.example', 'write']
          ]
        })
      : null
  );
  const getByReplaceKey = vi.fn(async (pubkey: string, kind: number, dTag: string) =>
    pubkey === 'bob' && kind === 30023 && dTag === 'article'
      ? event({
          id: 'addressable-target',
          pubkey,
          kind,
          tags: [['d', dTag]],
          content: 'addressable article'
        })
      : null
  );

  return {
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        getRelayHints,
        getByPubkeyAndKind,
        getByReplaceKey
      };
    },
    getRelayHints,
    getByPubkeyAndKind,
    getByReplaceKey
  };
}

describe('resonote relay selection runtime', () => {
  it('builds read overlays from defaults, temporary hints, durable hints, and author relay lists', async () => {
    const runtime = createRuntimeFixture();

    const overlay = await buildReadRelayOverlay(runtime, {
      intent: 'read',
      filters: [{ ids: ['target'], authors: ['alice'] }],
      temporaryRelays: ['wss://temporary.example'],
      policy
    });

    expect(runtime.getRelayHints).toHaveBeenCalledWith('target');
    expect(runtime.getByPubkeyAndKind).toHaveBeenCalledWith('alice', 10002);
    expect(overlay).toEqual({
      relays: [
        'wss://temporary.example/',
        'wss://default.example/',
        'wss://durable.example/',
        'wss://alice-write.example/'
      ],
      includeDefaultReadRelays: false
    });
  });

  it('builds publish options from author write relays and audience hints', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: event({
        id: 'reply',
        pubkey: 'alice',
        kind: 1111,
        tags: [
          ['e', 'target', 'wss://explicit-target.example'],
          ['p', 'alice']
        ]
      }),
      policy
    });

    expect(options).toEqual({
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://durable.example/',
          'wss://explicit-target.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('builds publish options for unsigned event parameters without author relay lookup', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: {
        kind: 1111,
        tags: [['e', 'target', 'wss://explicit-target.example']]
      },
      policy
    });

    expect(runtime.getByPubkeyAndKind).not.toHaveBeenCalled();
    expect(options).toEqual({
      on: {
        relays: [
          'wss://default.example/',
          'wss://durable.example/',
          'wss://explicit-target.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('builds publish options when event parameters omit tags and pubkey', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: {
        kind: 1
      },
      policy
    });

    expect(runtime.getByPubkeyAndKind).not.toHaveBeenCalled();
    expect(options).toEqual({
      on: {
        relays: ['wss://default.example/'],
        defaultWriteRelays: false
      }
    });
  });

  it('builds repair overlays with the shared relay selection policy path', async () => {
    const runtime = createRuntimeFixture();

    const overlay = await buildReadRelayOverlay(runtime, {
      intent: 'repair',
      filters: [{ ids: ['target'] }],
      temporaryRelays: ['wss://repair-temporary.example'],
      policy: {
        strategy: 'conservative-outbox',
        maxReadRelays: 2,
        maxTemporaryRelays: 1
      }
    });

    expect(overlay).toEqual({
      relays: [
        'wss://repair-temporary.example/',
        'wss://default.example/',
        'wss://durable.example/'
      ],
      includeDefaultReadRelays: false
    });
  });

  it('builds addressable read overlays from author relay-list write relays', async () => {
    const runtime = createRuntimeFixture();

    const overlay = await buildReadRelayOverlay(runtime, {
      intent: 'read',
      filters: [{ kinds: [30023], authors: ['alice'], '#d': ['article'], limit: 1 }],
      policy
    });

    expect(runtime.getByPubkeyAndKind).toHaveBeenCalledWith('alice', 10002);
    expect(overlay).toEqual({
      relays: ['wss://default.example/', 'wss://alice-write.example/'],
      includeDefaultReadRelays: false
    });
  });

  it('builds publish options from addressable explicit relay hints', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: event({
        id: 'reply-to-addressable',
        pubkey: 'alice',
        kind: 1111,
        tags: [['a', '30023:bob:remote', 'wss://addressable-explicit.example']]
      }),
      policy
    });

    expect(runtime.getByReplaceKey).toHaveBeenCalledWith('bob', 30023, 'remote');
    expect(options).toEqual({
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://addressable-explicit.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('builds publish options from durable hints for local addressable targets', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: event({
        id: 'reply-to-local-addressable',
        pubkey: 'alice',
        kind: 1111,
        tags: [['a', '30023:bob:article']]
      }),
      policy
    });

    expect(runtime.getByReplaceKey).toHaveBeenCalledWith('bob', 30023, 'article');
    expect(runtime.getRelayHints).toHaveBeenCalledWith('addressable-target');
    expect(options).toEqual({
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://addressable-durable.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('default-only policy suppresses broader outbox publish candidates', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: event({
        id: 'broad-publish',
        pubkey: 'alice',
        kind: 1111,
        tags: [
          ['e', 'target', 'wss://explicit-target.example'],
          ['p', 'bob', 'wss://explicit-pubkey.example'],
          ['a', '30023:bob:article', 'wss://addressable-explicit.example']
        ]
      }),
      policy: { strategy: 'default-only' }
    });

    expect(options).toEqual({
      on: {
        relays: ['wss://default.example/'],
        defaultWriteRelays: false
      }
    });
  });

  it('ignores malformed addressable tags and invalid addressable relay hints', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: event({
        id: 'malformed-addressable',
        pubkey: 'alice',
        kind: 1111,
        tags: [
          ['a', '30023:bob', 'wss://malformed-explicit.example'],
          ['a', 'not-a-kind:bob:article', 'wss://invalid-kind.example'],
          ['a', '30023:bob:article', 'https://not-websocket.example']
        ]
      }),
      policy
    });

    expect(runtime.getByReplaceKey).toHaveBeenCalledWith('bob', 30023, 'article');
    expect(options).toEqual({
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://addressable-durable.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('uses conservative outbox as the Resonote default policy', () => {
    expect(RESONOTE_DEFAULT_RELAY_SELECTION_POLICY).toMatchObject({
      strategy: 'conservative-outbox',
      maxReadRelays: 4,
      maxWriteRelays: 4,
      maxTemporaryRelays: 2,
      maxAudienceRelays: 2
    });
  });
});

describe('coordinator read relay selection integration', () => {
  it('routes by-id reads through selected relays when no explicit overlay is supplied', async () => {
    const createdRequests: Array<{ options: unknown; emitted: unknown[] }> = [];
    const runtime = {
      async fetchLatestEvent() {
        return null;
      },
      async getDefaultRelays() {
        return ['wss://default.example'];
      },
      async getEventsDB() {
        return {
          getByPubkeyAndKind: async () => null,
          getManyByPubkeysAndKind: async () => [],
          getByReplaceKey: async () => null,
          getByTagValue: async () => [],
          getById: async () => null,
          getAllByKind: async () => [],
          listNegentropyEventRefs: async () => [],
          getRelayHints: async () => [
            {
              eventId: 'target',
              relayUrl: 'wss://durable.example',
              source: 'seen' as const,
              lastSeenAt: 1
            }
          ],
          deleteByIds: async () => {},
          clearAll: async () => {},
          put: async () => true,
          putWithReconcile: async () => ({ stored: true, emissions: [] })
        };
      },
      async getRxNostr() {
        return {
          use(_req: { emit(input: unknown): void }, options: unknown) {
            const entry = { options, emitted: [] as unknown[] };
            createdRequests.push(entry);
            return {
              subscribe(observer: { complete?: () => void }) {
                queueMicrotask(() => observer.complete?.());
                return { unsubscribe() {} };
              }
            };
          }
        };
      },
      createRxBackwardReq() {
        return {
          emit(input: unknown) {
            createdRequests.at(-1)?.emitted.push(input);
          },
          over() {}
        };
      },
      createRxForwardReq() {
        return { emit() {}, over() {} };
      },
      uniq: () => ({}) as unknown,
      merge: () => ({}) as unknown,
      getRelayConnectionState: async () => null,
      observeRelayConnectionStates: async () => ({ unsubscribe() {} })
    };

    const coordinator = createResonoteCoordinator({
      runtime,
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned: async () => {} },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.fetchNostrEventById('target', []);

    expect(createdRequests.map((request) => request.options)).toEqual([
      {
        on: {
          relays: ['wss://default.example/'],
          defaultReadRelays: false
        }
      },
      {
        on: {
          relays: ['wss://durable.example/'],
          defaultReadRelays: false
        }
      }
    ]);
  });

  it('applies coordinator relay selection policy overrides to by-id reads', async () => {
    const createdRequests: Array<{ options: unknown; emitted: unknown[] }> = [];
    const runtime = {
      async fetchLatestEvent() {
        return null;
      },
      async getDefaultRelays() {
        return ['wss://default.example'];
      },
      async getEventsDB() {
        return {
          getByPubkeyAndKind: async () => null,
          getManyByPubkeysAndKind: async () => [],
          getByReplaceKey: async () => null,
          getByTagValue: async () => [],
          getById: async () => null,
          getAllByKind: async () => [],
          listNegentropyEventRefs: async () => [],
          getRelayHints: async () => [
            {
              eventId: 'target',
              relayUrl: 'wss://durable.example',
              source: 'seen' as const,
              lastSeenAt: 1
            }
          ],
          deleteByIds: async () => {},
          clearAll: async () => {},
          put: async () => true,
          putWithReconcile: async () => ({ stored: true, emissions: [] })
        };
      },
      async getRxNostr() {
        return {
          use(_req: { emit(input: unknown): void }, options: unknown) {
            const entry = { options, emitted: [] as unknown[] };
            createdRequests.push(entry);
            return {
              subscribe(observer: { complete?: () => void }) {
                queueMicrotask(() => observer.complete?.());
                return { unsubscribe() {} };
              }
            };
          }
        };
      },
      createRxBackwardReq() {
        return {
          emit(input: unknown) {
            createdRequests.at(-1)?.emitted.push(input);
          },
          over() {}
        };
      },
      createRxForwardReq() {
        return { emit() {}, over() {} };
      },
      uniq: () => ({}) as unknown,
      merge: () => ({}) as unknown,
      getRelayConnectionState: async () => null,
      observeRelayConnectionStates: async () => ({ unsubscribe() {} })
    };

    const coordinator = createResonoteCoordinator({
      runtime,
      relaySelectionPolicy: { strategy: 'default-only' },
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned: async () => {} },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.fetchNostrEventById('target', []);

    expect(createdRequests[0]?.options).toEqual({
      on: {
        relays: ['wss://default.example/'],
        defaultReadRelays: false
      }
    });
  });

  it('routes by-id relay hints as temporary planner candidates', async () => {
    const createdRequests: Array<{ options: unknown; emitted: unknown[] }> = [];
    const runtime = {
      async fetchLatestEvent() {
        return null;
      },
      async getDefaultRelays() {
        return ['wss://default.example'];
      },
      async getEventsDB() {
        return {
          getByPubkeyAndKind: async () => null,
          getManyByPubkeysAndKind: async () => [],
          getByReplaceKey: async () => null,
          getByTagValue: async () => [],
          getById: async () => null,
          getAllByKind: async () => [],
          listNegentropyEventRefs: async () => [],
          getRelayHints: async () => [
            {
              eventId: 'target',
              relayUrl: 'wss://durable.example',
              source: 'seen' as const,
              lastSeenAt: 1
            }
          ],
          deleteByIds: async () => {},
          clearAll: async () => {},
          put: async () => true,
          putWithReconcile: async () => ({ stored: true, emissions: [] })
        };
      },
      async getRxNostr() {
        return {
          use(_req: { emit(input: unknown): void }, options: unknown) {
            const entry = { options, emitted: [] as unknown[] };
            createdRequests.push(entry);
            return {
              subscribe(observer: { complete?: () => void }) {
                queueMicrotask(() => observer.complete?.());
                return { unsubscribe() {} };
              }
            };
          }
        };
      },
      createRxBackwardReq() {
        return {
          emit(input: unknown) {
            createdRequests.at(-1)?.emitted.push(input);
          },
          over() {}
        };
      },
      createRxForwardReq() {
        return { emit() {}, over() {} };
      },
      uniq: () => ({}) as unknown,
      merge: () => ({}) as unknown,
      getRelayConnectionState: async () => null,
      observeRelayConnectionStates: async () => ({ unsubscribe() {} })
    };

    const coordinator = createResonoteCoordinator({
      runtime,
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned: async () => {} },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.fetchNostrEventById('target', ['wss://temporary.example']);

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
      },
      {
        on: {
          relays: ['wss://durable.example/'],
          defaultReadRelays: false
        }
      }
    ]);
  });
});
