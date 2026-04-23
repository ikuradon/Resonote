import { defineProjection } from '@auftakt/core';
import { createResonoteCoordinator, registerPlugin } from '@auftakt/resonote';
import { describe, expect, it } from 'vitest';

function createTestCoordinator() {
  return createResonoteCoordinator({
    runtime: {
      fetchBackwardEvents: async () => [],
      fetchBackwardFirst: async () => null,
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
        putWithReconcile: async () => ({ stored: true, emissions: [] })
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

describe('@auftakt/resonote plugin isolation', () => {
  it('disables a throwing plugin without crashing later registrations', async () => {
    const coordinator = createTestCoordinator();

    const stable = await registerPlugin(coordinator, {
      name: 'stable-plugin',
      apiVersion: 'v1',
      setup(api) {
        api.registerProjection(
          defineProjection({
            name: 'stable.timeline',
            sourceKinds: [1],
            sorts: [{ key: 'created_at', pushdownSupported: true }]
          })
        );
      }
    });

    const failing = await registerPlugin(coordinator, {
      name: 'failing-plugin',
      apiVersion: 'v1',
      setup(api) {
        api.registerProjection(
          defineProjection({
            name: 'failed.timeline',
            sourceKinds: [1111],
            sorts: [{ key: 'created_at', pushdownSupported: true }]
          })
        );
        api.registerReadModel('failed.read-model', { id: 'failed' });
        api.registerFlow('failed.flow', { id: 'failed' });
        throw new Error('plugin exploded');
      }
    });

    const recovery = await registerPlugin(coordinator, {
      name: 'recovery-plugin',
      apiVersion: 'v1',
      setup(api) {
        api.registerProjection(
          defineProjection({
            name: 'failed.timeline',
            sourceKinds: [1111],
            sorts: [{ key: 'created_at', pushdownSupported: true }]
          })
        );
        api.registerReadModel('failed.read-model', { id: 'recovered' });
        api.registerFlow('failed.flow', { id: 'recovered' });
      }
    });

    const mismatchedVersion = await registerPlugin(coordinator, {
      name: 'wrong-version-plugin',
      apiVersion: 'v2' as never,
      setup() {}
    });

    const afterMismatch = await registerPlugin(coordinator, {
      name: 'after-mismatch-plugin',
      apiVersion: 'v1',
      setup(api) {
        api.registerProjection(
          defineProjection({
            name: 'after-mismatch.timeline',
            sourceKinds: [7],
            sorts: [{ key: 'created_at', pushdownSupported: true }]
          })
        );
      }
    });

    expect(stable.enabled).toBe(true);
    expect(failing.enabled).toBe(false);
    expect(failing.error?.message).toContain('plugin exploded');
    expect(recovery.enabled).toBe(true);
    expect(mismatchedVersion.enabled).toBe(false);
    expect(mismatchedVersion.error?.message).toContain('Unsupported plugin API version');
    expect(afterMismatch.enabled).toBe(true);
  });
});
