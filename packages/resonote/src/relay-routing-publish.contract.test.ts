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
        getByPubkeyAndKind: async (pubkey: string, kind: number) =>
          pubkey === 'alice' && kind === 10002
            ? {
                id: 'relay-list',
                pubkey,
                created_at: 1,
                kind,
                tags: [['r', 'wss://alice-write.example', 'write']],
                content: ''
              }
            : null,
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async () => null,
        getByTagValue: async () => [],
        getById: async () => null,
        getAllByKind: async () => [],
        listNegentropyEventRefs: async () => [],
        getRelayHints: async (eventId: string) =>
          eventId === 'target'
            ? [
                {
                  eventId,
                  relayUrl: 'wss://target-seen.example',
                  source: 'seen' as const,
                  lastSeenAt: 1
                }
              ]
            : [],
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async () => ({ stored: true, emissions: [] })
      };
    },
    async getRxNostr() {
      return { use: () => ({ subscribe: () => ({ unsubscribe() {} }) }) };
    },
    createRxBackwardReq: () => ({ emit() {}, over() {} }),
    createRxForwardReq: () => ({ emit() {}, over() {} }),
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
});
