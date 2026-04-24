import { defineProjection } from '@auftakt/core';
import { createResonoteCoordinator, registerPlugin } from '@auftakt/resonote';
import { describe, expect, it, vi } from 'vitest';

import { createRelayMetricsPlugin } from './plugins/built-in-plugins.js';
import { COMMENTS_FLOW, CONTENT_RESOLUTION_FLOW } from './plugins/resonote-flows.js';

function createTestCoordinator({
  getById = async () => null,
  putWithReconcile = async () => ({ stored: true, emissions: [] }),
  fetchBackwardFirst = async () => null
}: {
  getById?: (id: string) => Promise<unknown>;
  putWithReconcile?: (event: unknown) => Promise<{ stored: boolean; emissions: unknown[] }>;
  fetchBackwardFirst?: () => Promise<unknown>;
} = {}) {
  return createResonoteCoordinator({
    runtime: {
      fetchBackwardEvents: async () => [],
      fetchBackwardFirst: async () => fetchBackwardFirst(),
      fetchLatestEvent: async () => null,
      getEventsDB: async () => ({
        getByPubkeyAndKind: async () => null,
        getManyByPubkeysAndKind: async () => [],
        getByReplaceKey: async () => null,
        getByTagValue: async () => [],
        getById: async (id: string) => getById(id),
        getAllByKind: async () => [],
        listNegentropyEventRefs: async () => [],
        deleteByIds: async () => {},
        clearAll: async () => {},
        put: async () => true,
        putWithReconcile: async (event: unknown) => putWithReconcile(event)
      }),
      getRxNostr: async () => ({
        use: () => ({
          subscribe: () => ({ unsubscribe() {} })
        })
      }),
      createRxBackwardReq: () => ({ emit() {}, over() {} }),
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
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    }
  });
}

describe('@auftakt/resonote built-in plugins', () => {
  it('registers timeline, emoji, comments, notifications, relay-list, and content-resolution plugins on startup', async () => {
    const coordinator = createTestCoordinator();

    const duplicateTimeline = await registerPlugin(coordinator, {
      name: 'duplicate-timeline',
      apiVersion: 'v1',
      setup(api) {
        api.registerProjection(
          defineProjection({
            name: 'resonote.timeline',
            sourceKinds: [1111],
            sorts: [{ key: 'created_at', pushdownSupported: true }]
          })
        );
      }
    });

    const duplicateEmojiCatalog = await registerPlugin(coordinator, {
      name: 'duplicate-emoji',
      apiVersion: 'v1',
      setup(api) {
        api.registerReadModel('emojiCatalog', { id: 'duplicate' });
      }
    });

    const duplicateCommentsFlow = await registerPlugin(coordinator, {
      name: 'duplicate-comments',
      apiVersion: 'v1',
      setup(api) {
        api.registerFlow(COMMENTS_FLOW, { id: 'duplicate' });
      }
    });

    const duplicateNotificationsFlow = await registerPlugin(coordinator, {
      name: 'duplicate-notifications',
      apiVersion: 'v1',
      setup(api) {
        api.registerFlow('notificationsFlow', { id: 'duplicate' });
      }
    });

    const duplicateRelayListFlow = await registerPlugin(coordinator, {
      name: 'duplicate-relay-list',
      apiVersion: 'v1',
      setup(api) {
        api.registerFlow('relayListFlow', { id: 'duplicate' });
      }
    });

    const duplicateContentResolutionFlow = await registerPlugin(coordinator, {
      name: 'duplicate-content-resolution',
      apiVersion: 'v1',
      setup(api) {
        api.registerFlow(CONTENT_RESOLUTION_FLOW, { id: 'duplicate' });
      }
    });

    expect(duplicateTimeline.enabled).toBe(false);
    expect(duplicateTimeline.error?.message).toContain(
      'Projection already registered: resonote.timeline'
    );
    expect(duplicateEmojiCatalog.enabled).toBe(false);
    expect(duplicateEmojiCatalog.error?.message).toContain(
      'Read model already registered: emojiCatalog'
    );
    expect(duplicateCommentsFlow.enabled).toBe(false);
    expect(duplicateCommentsFlow.error?.message).toContain(
      'Flow already registered: resonoteCommentsFlow'
    );
    expect(duplicateNotificationsFlow.enabled).toBe(false);
    expect(duplicateNotificationsFlow.error?.message).toContain(
      'Flow already registered: notificationsFlow'
    );
    expect(duplicateRelayListFlow.enabled).toBe(false);
    expect(duplicateRelayListFlow.error?.message).toContain(
      'Flow already registered: relayListFlow'
    );
    expect(duplicateContentResolutionFlow.enabled).toBe(false);
    expect(duplicateContentResolutionFlow.error?.message).toContain(
      'Flow already registered: resonoteContentResolution'
    );
  });

  it('keeps Resonote-only flow constants outside generic built-ins', () => {
    expect(COMMENTS_FLOW).toBe('resonoteCommentsFlow');
    expect(CONTENT_RESOLUTION_FLOW).toBe('resonoteContentResolution');
  });

  it('registers relay metrics as a read-only model', () => {
    const model = {
      snapshot: vi.fn(() => [{ relayUrl: 'wss://relay.example', score: 1 }])
    };
    const plugin = createRelayMetricsPlugin(model);
    const registered: Record<string, unknown> = {};

    plugin.setup({
      apiVersion: 'v1',
      registerProjection: vi.fn(),
      registerFlow: vi.fn(),
      registerReadModel(name, value) {
        registered[name] = value;
      }
    });

    expect(registered.relayMetrics).toBe(model);
    expect(Object.keys(model)).toEqual(['snapshot']);
  });

  it('keeps app-facing by-id reads coordinator-mediated', async () => {
    const fetchedEvent = {
      id: 'target-event',
      pubkey: 'author',
      kind: 1,
      content: 'coordinator-owned fetch',
      tags: [],
      created_at: 123
    };
    const storedEvents: unknown[] = [];
    const coordinator = createTestCoordinator({
      fetchBackwardFirst: async () => fetchedEvent,
      putWithReconcile: async (event) => {
        storedEvents.push(event);
        return { stored: true, emissions: [] };
      }
    });

    const result = await coordinator.fetchNostrEventById<typeof fetchedEvent>('target-event', []);

    expect(result).toEqual(fetchedEvent);
    expect(storedEvents).toEqual([fetchedEvent]);
  });
});
