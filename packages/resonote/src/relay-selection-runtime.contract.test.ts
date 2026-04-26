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
  const getRelayHints = vi.fn(async (eventId: string) =>
    eventId === 'target'
      ? [
          {
            eventId: 'target',
            relayUrl: 'wss://durable.example',
            source: 'seen' as const,
            lastSeenAt: 1
          }
        ]
      : []
  );
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

  return {
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        getRelayHints,
        getByPubkeyAndKind
      };
    },
    getRelayHints,
    getByPubkeyAndKind
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

    expect(createdRequests[0]?.options).toEqual({
      on: {
        relays: ['wss://default.example/', 'wss://durable.example/'],
        defaultReadRelays: false
      }
    });
  });
});
