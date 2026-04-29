import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';
import { describe, expect, it, vi } from 'vitest';

import { createResonoteCoordinator } from './runtime.js';

function createRuntime() {
  return {
    async fetchLatestEvent() {
      return null;
    },
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        getByPubkeyAndKind: async (pubkey: string, kind: number) => {
          if (kind !== 10002) return null;
          if (pubkey === 'alice') {
            return {
              id: 'alice-relay-list',
              pubkey,
              created_at: 1,
              kind,
              tags: [['r', 'wss://alice-write.example', 'write']],
              content: ''
            };
          }
          if (pubkey === 'bob') {
            return {
              id: 'bob-relay-list',
              pubkey,
              created_at: 1,
              kind,
              tags: [['r', 'wss://bob-read.example', 'read']],
              content: ''
            };
          }
          return null;
        },
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async (pubkey: string, kind: number, dTag: string) =>
          pubkey === 'bob' && kind === 30023 && dTag === 'article'
            ? {
                id: 'addressable-target',
                pubkey,
                created_at: 2,
                kind,
                tags: [['d', dTag]],
                content: 'article'
              }
            : null,
        getByTagValue: async () => [],
        getById: async () => null,
        getAllByKind: async () => [],
        listNegentropyEventRefs: async () => [],
        getRelayHints: async (eventId: string) => {
          if (eventId === 'target') {
            return [
              {
                eventId,
                relayUrl: 'wss://target-seen.example',
                source: 'seen' as const,
                lastSeenAt: 1
              }
            ];
          }
          if (eventId === 'addressable-target') {
            return [
              {
                eventId,
                relayUrl: 'wss://addressable-seen.example',
                source: 'seen' as const,
                lastSeenAt: 2
              }
            ];
          }
          return [];
        },
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async () => ({ stored: true, emissions: [] })
      };
    },
    async getRelaySession() {
      return { use: () => ({ subscribe: () => ({ unsubscribe() {} }) }) };
    },
    createBackwardReq: () => ({ emit() {}, over() {} }),
    createForwardReq: () => ({ emit() {}, over() {} }),
    uniq: () => ({}) as unknown,
    merge: () => ({}) as unknown,
    getRelayConnectionState: async () => null,
    observeRelayConnectionStates: async () => ({ unsubscribe() {} })
  };
}

describe('coordinator publish relay routing', () => {
  it('passes selected author and audience relays to publish transport', async () => {
    const castSigned = vi.fn(async () => {});
    const event = {
      id: 'reply',
      pubkey: 'alice',
      created_at: 10,
      kind: 1111,
      tags: [['e', 'target', 'wss://explicit-target.example']],
      content: 'reply',
      sig: 'sig'
    } satisfies NostrEvent;

    const coordinator = createResonoteCoordinator({
      runtime: createRuntime(),
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.publishSignedEvent(event as EventParameters);

    expect(castSigned).toHaveBeenCalledWith(event, {
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://target-seen.example/',
          'wss://explicit-target.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('passes selected relays to reaction publish transport', async () => {
    const castSigned = vi.fn(async () => {});
    const event = {
      id: 'reaction',
      pubkey: 'alice',
      created_at: 10,
      kind: 7,
      tags: [['e', 'target', 'wss://explicit-target.example']],
      content: '+',
      sig: 'sig'
    } satisfies NostrEvent;

    const coordinator = createResonoteCoordinator({
      runtime: createRuntime(),
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.publishSignedEvent(event as EventParameters);

    expect(castSigned).toHaveBeenCalledWith(event, {
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://target-seen.example/',
          'wss://explicit-target.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('passes selected audience relays to mention publish transport', async () => {
    const castSigned = vi.fn(async () => {});
    const event = {
      id: 'mention',
      pubkey: 'alice',
      created_at: 10,
      kind: 1,
      tags: [['p', 'bob', 'wss://bob-explicit.example']],
      content: 'mention',
      sig: 'sig'
    } satisfies NostrEvent;

    const coordinator = createResonoteCoordinator({
      runtime: createRuntime(),
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.publishSignedEvent(event as EventParameters);

    expect(castSigned).toHaveBeenCalledWith(event, {
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://bob-explicit.example/',
          'wss://bob-read.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('passes addressable explicit relay hints to publish transport', async () => {
    const castSigned = vi.fn(async () => {});
    const event = {
      id: 'addressable-explicit',
      pubkey: 'alice',
      created_at: 10,
      kind: 1111,
      tags: [['a', '30023:bob:remote', 'wss://addressable-explicit.example']],
      content: 'reply to addressable',
      sig: 'sig'
    } satisfies NostrEvent;

    const coordinator = createResonoteCoordinator({
      runtime: createRuntime(),
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.publishSignedEvent(event as EventParameters);

    expect(castSigned).toHaveBeenCalledWith(event, {
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

  it('passes durable addressable target hints to publish transport', async () => {
    const castSigned = vi.fn(async () => {});
    const event = {
      id: 'addressable-durable',
      pubkey: 'alice',
      created_at: 10,
      kind: 1111,
      tags: [['a', '30023:bob:article']],
      content: 'reply to local addressable',
      sig: 'sig'
    } satisfies NostrEvent;

    const coordinator = createResonoteCoordinator({
      runtime: createRuntime(),
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.publishSignedEvent(event as EventParameters);

    expect(castSigned).toHaveBeenCalledWith(event, {
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://addressable-seen.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('applies coordinator relay selection policy overrides to publish routing', async () => {
    const castSigned = vi.fn(async () => {});
    const event = {
      id: 'reply',
      pubkey: 'alice',
      created_at: 10,
      kind: 1111,
      tags: [['e', 'target', 'wss://explicit-target.example']],
      content: 'reply',
      sig: 'sig'
    } satisfies NostrEvent;

    const coordinator = createResonoteCoordinator({
      runtime: createRuntime(),
      relaySelectionPolicy: { strategy: 'default-only' },
      cachedFetchByIdRuntime: {
        cachedFetchById: async () => ({ event: null, settlement: null }),
        invalidateFetchByIdCache: () => {}
      },
      cachedLatestRuntime: { useCachedLatest: () => null },
      publishTransportRuntime: { castSigned },
      pendingPublishQueueRuntime: {
        addPendingPublish: async () => {},
        drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
      },
      relayStatusRuntime: {
        fetchLatestEvent: async () => null,
        setDefaultRelays: async () => {}
      }
    });

    await coordinator.publishSignedEvent(event as EventParameters);

    expect(castSigned).toHaveBeenCalledWith(event, {
      on: {
        relays: ['wss://default.example/'],
        defaultWriteRelays: false
      }
    });
  });
});
