import { defineProjection } from '@auftakt/core';
import {
  createResonoteCoordinator,
  registerPlugin,
  RESONOTE_COORDINATOR_PLUGIN_API_VERSION
} from '@auftakt/resonote';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageIndexPath = resolve(currentDir, 'index.ts');

function createTestCoordinator() {
  return createResonoteCoordinator({
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

describe('@auftakt/resonote plugin api contract', () => {
  it('exports typed plugin contracts and versioned registration helper from package root', async () => {
    const mod = await import('@auftakt/resonote');
    const source = readFileSync(packageIndexPath, 'utf8');

    expect(mod.registerPlugin).toBeTypeOf('function');
    expect(mod.RESONOTE_COORDINATOR_PLUGIN_API_VERSION).toBe('v1');
    expect(source).toMatch(/\bResonoteCoordinatorPlugin\b/);
    expect(source).toMatch(/\bResonoteCoordinatorPluginApi\b/);
    expect(source).toMatch(/\bregisterPlugin\b/);
  });

  it('limits plugin api capabilities to versioned registration methods', async () => {
    const coordinator = createTestCoordinator();
    let apiKeys: string[] = [];
    let observedVersion: string | null = null;

    const registration = await registerPlugin(coordinator, {
      name: 'contract-plugin',
      apiVersion: 'v1',
      setup(api) {
        apiKeys = Object.keys(api).sort();
        observedVersion = api.apiVersion;
        api.registerProjection(
          defineProjection({
            name: 'contract.timeline',
            sourceKinds: [1],
            sorts: [{ key: 'created_at', pushdownSupported: true }]
          })
        );
        api.registerReadModel('contract.read-model', { ready: true });
        api.registerFlow('contract.flow', { run: () => 'ok' });
      }
    });

    expect(registration).toEqual({
      pluginName: 'contract-plugin',
      apiVersion: RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
      enabled: true
    });
    expect(observedVersion).toBe('v1');
    expect(apiKeys).toEqual([
      'apiVersion',
      'registerFlow',
      'registerProjection',
      'registerReadModel'
    ]);
  });

  it('keeps plugin registration versioned and coordinator-owned', async () => {
    const coordinator = createTestCoordinator();

    const first = await registerPlugin(coordinator, {
      name: 'first-plugin',
      apiVersion: 'v1',
      setup(api) {
        api.registerProjection(
          defineProjection({
            name: 'shared.timeline',
            sourceKinds: [1111],
            sorts: [{ key: 'created_at', pushdownSupported: true }]
          })
        );
        api.registerReadModel('shared.read-model', { id: 1 });
        api.registerFlow('shared.flow', { id: 1 });
      }
    });

    const duplicate = await registerPlugin(coordinator, {
      name: 'duplicate-plugin',
      apiVersion: 'v1',
      setup(api) {
        api.registerProjection(
          defineProjection({
            name: 'shared.timeline',
            sourceKinds: [1111],
            sorts: [{ key: 'created_at', pushdownSupported: true }]
          })
        );
      }
    });

    expect(first.enabled).toBe(true);
    expect(duplicate.enabled).toBe(false);
    expect(duplicate.error?.message).toContain('Projection already registered: shared.timeline');
  });
});
