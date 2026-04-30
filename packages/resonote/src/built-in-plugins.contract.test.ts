import {
  defineProjection,
  finalizeEvent,
  type ReconcileEmission,
  type StoredEvent
} from '@auftakt/core';
import { createRelayMetricsPlugin, registerRuntimePlugin } from '@auftakt/runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  createEmojiCatalogPlugin,
  createNotificationsFlowPlugin,
  EMOJI_CATALOG_READ_MODEL,
  NOTIFICATIONS_FLOW
} from './plugins/built-in-plugins.js';
import {
  COMMENTS_FLOW,
  CONTENT_RESOLUTION_FLOW,
  createResonoteCommentsFlowPlugin,
  createResonoteContentResolutionFlowPlugin
} from './plugins/resonote-flows.js';
import { createTimelinePlugin, resonoteTimelineProjection } from './plugins/timeline-plugin.js';
import { createResonoteCoordinator } from './runtime.js';

const RELAY_SECRET_KEY = new Uint8Array(32).fill(7);

function createTestCoordinator({
  getById = async () => null,
  putWithReconcile = async () => ({ stored: true, emissions: [] }),
  relayEvents = []
}: {
  getById?: (id: string) => Promise<StoredEvent | null>;
  putWithReconcile?: (event: StoredEvent) => Promise<{
    stored: boolean;
    emissions: ReconcileEmission[];
  }>;
  relayEvents?: StoredEvent[];
} = {}) {
  return createResonoteCoordinator({
    runtime: {
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
        putWithReconcile: async (event: StoredEvent) => putWithReconcile(event)
      }),
      getRelaySession: async () => ({
        use: () => ({
          subscribe: (observer: {
            next?: (packet: { event: unknown; from?: string }) => void;
            complete?: () => void;
          }) => {
            queueMicrotask(() => {
              for (const event of relayEvents) {
                observer.next?.({ event, from: 'wss://relay.example' });
              }
              observer.complete?.();
            });
            return { unsubscribe() {} };
          }
        })
      }),
      createBackwardReq: () => ({ emit() {}, over() {} }),
      createForwardReq: () => ({ emit() {}, over() {} }),
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

    const duplicateTimeline = await registerRuntimePlugin(coordinator, {
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

    const duplicateEmojiCatalog = await registerRuntimePlugin(coordinator, {
      name: 'duplicate-emoji',
      apiVersion: 'v1',
      setup(api) {
        api.registerReadModel('emojiCatalog', { id: 'duplicate' });
      }
    });

    const duplicateCommentsFlow = await registerRuntimePlugin(coordinator, {
      name: 'duplicate-comments',
      apiVersion: 'v1',
      setup(api) {
        api.registerFlow(COMMENTS_FLOW, { id: 'duplicate' });
      }
    });

    const duplicateNotificationsFlow = await registerRuntimePlugin(coordinator, {
      name: 'duplicate-notifications',
      apiVersion: 'v1',
      setup(api) {
        api.registerFlow('notificationsFlow', { id: 'duplicate' });
      }
    });

    const duplicateRelayListFlow = await registerRuntimePlugin(coordinator, {
      name: 'duplicate-relay-list',
      apiVersion: 'v1',
      setup(api) {
        api.registerFlow('relayListFlow', { id: 'duplicate' });
      }
    });

    const duplicateContentResolutionFlow = await registerRuntimePlugin(coordinator, {
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

  it('uses stable built-in plugin registration names and targets', () => {
    const timelinePlugin = createTimelinePlugin();
    const emojiPlugin = createEmojiCatalogPlugin({
      fetchCustomEmojiSources: async () => ({ listEvent: null, setEvents: [] }),
      fetchCustomEmojiCategories: async () => []
    });
    const notificationsPlugin = createNotificationsFlowPlugin({
      subscribeNotificationStreams: async () => []
    });
    const commentsPlugin = createResonoteCommentsFlowPlugin({
      loadCommentSubscriptionDeps: async () => ({ runtime: null as never, session: null as never }),
      buildCommentContentFilters: () => [],
      startCommentSubscription: () => [],
      startMergedCommentSubscription: () => ({ unsubscribe() {} }),
      startCommentDeletionReconcile: () => ({
        sub: { unsubscribe() {} },
        timeout: setTimeout(() => {}, 0)
      })
    });
    const contentPlugin = createResonoteContentResolutionFlowPlugin({
      searchBookmarkDTagEvent: async () => null,
      searchEpisodeBookmarkByGuid: async () => null
    });
    const registeredFlows: string[] = [];
    const registeredModels: string[] = [];
    const registeredProjections: string[] = [];

    timelinePlugin.setup({
      apiVersion: 'v1',
      models: {} as never,
      registerFlow: vi.fn(),
      registerReadModel: vi.fn(),
      registerProjection(projection) {
        registeredProjections.push(projection.name);
      }
    });
    emojiPlugin.setup({
      apiVersion: 'v1',
      models: {} as never,
      registerProjection: vi.fn(),
      registerFlow: vi.fn(),
      registerReadModel(name) {
        registeredModels.push(name);
      }
    });
    notificationsPlugin.setup({
      apiVersion: 'v1',
      models: {} as never,
      registerProjection: vi.fn(),
      registerReadModel: vi.fn(),
      registerFlow(name) {
        registeredFlows.push(name);
      }
    });
    commentsPlugin.setup({
      apiVersion: 'v1',
      models: {} as never,
      registerProjection: vi.fn(),
      registerReadModel: vi.fn(),
      registerFlow(name) {
        registeredFlows.push(name);
      }
    });
    contentPlugin.setup({
      apiVersion: 'v1',
      models: {} as never,
      registerProjection: vi.fn(),
      registerReadModel: vi.fn(),
      registerFlow(name) {
        registeredFlows.push(name);
      }
    });

    expect(timelinePlugin.name).toBe('timelinePlugin');
    expect(emojiPlugin.name).toBe('emojiCatalogPlugin');
    expect(notificationsPlugin.name).toBe('notificationsFlowPlugin');
    expect(commentsPlugin.name).toBe('resonoteCommentsFlowPlugin');
    expect(contentPlugin.name).toBe('resonoteContentResolutionFlowPlugin');
    expect(registeredProjections).toEqual([resonoteTimelineProjection.name]);
    expect(registeredModels).toEqual([EMOJI_CATALOG_READ_MODEL]);
    expect(registeredFlows).toEqual([NOTIFICATIONS_FLOW, COMMENTS_FLOW, CONTENT_RESOLUTION_FLOW]);
  });

  it('registers relay metrics as a read-only model', () => {
    const model = {
      snapshot: vi.fn(() => [{ relayUrl: 'wss://relay.example', score: 1 }])
    };
    const plugin = createRelayMetricsPlugin(model);
    const registered: Record<string, unknown> = {};

    plugin.setup({
      apiVersion: 'v1',
      models: {} as never,
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
    const fetchedEvent = finalizeEvent(
      {
        kind: 1,
        content: 'coordinator-owned fetch',
        tags: [],
        created_at: 123
      },
      RELAY_SECRET_KEY
    );
    const storedEvents: unknown[] = [];
    const coordinator = createTestCoordinator({
      relayEvents: [fetchedEvent],
      putWithReconcile: async (event) => {
        storedEvents.push(event);
        return { stored: true, emissions: [] };
      }
    });

    const result = await coordinator.fetchNostrEventById<typeof fetchedEvent>(fetchedEvent.id, []);

    expect(result).toEqual(fetchedEvent);
    expect(storedEvents).toEqual([fetchedEvent]);
  });

  it('exposes coordinator-owned backward reads that materialize relay events', async () => {
    const relayEvent = finalizeEvent(
      {
        kind: 1,
        content: 'materialized backward read',
        tags: [],
        created_at: 123
      },
      RELAY_SECRET_KEY
    );
    const materialized: unknown[] = [];
    const coordinator = createResonoteCoordinator({
      runtime: {
        fetchLatestEvent: async () => null,
        getEventsDB: async () => ({
          getByPubkeyAndKind: async () => null,
          getManyByPubkeysAndKind: async () => [],
          getByReplaceKey: async () => null,
          getByTagValue: async () => [],
          getById: async () => null,
          getAllByKind: async () => [],
          listNegentropyEventRefs: async () => [],
          deleteByIds: async () => {},
          clearAll: async () => {},
          put: async () => true,
          putWithReconcile: async (event) => {
            materialized.push(event);
            return { stored: true, emissions: [] };
          }
        }),
        getRelaySession: async () => ({
          use: () => ({
            subscribe: (observer: {
              next?: (packet: { event: unknown; from?: string }) => void;
              complete?: () => void;
            }) => {
              queueMicrotask(() => {
                observer.next?.({ event: relayEvent, from: 'wss://relay.example' });
                observer.complete?.();
              });
              return { unsubscribe() {} };
            }
          })
        }),
        createBackwardReq: () => ({ emit() {}, over() {} }),
        createForwardReq: () => ({ emit() {}, over() {} }),
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

    const events = await coordinator.fetchBackwardEvents<typeof relayEvent>([{ kinds: [1] }]);

    expect(events).toEqual([relayEvent]);
    expect(materialized).toEqual([relayEvent]);
  });
});
