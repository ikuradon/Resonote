import {
  defineProjection,
  type ReadSettlement,
  reduceReadSettlement,
  type StoredEvent
} from '@auftakt/core';
import {
  AUFTAKT_RUNTIME_PLUGIN_API_VERSION,
  type AuftaktRuntimePluginModels,
  createAuftaktRuntimeCoordinator,
  registerRuntimePlugin} from '@auftakt/runtime';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageIndexPath = resolve(currentDir, 'index.ts');

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

function createTestCoordinator(
  options: {
    readonly read?: (
      filters: readonly Record<string, unknown>[],
      options: {
        readonly cacheOnly?: boolean;
        readonly timeoutMs?: number;
        readonly rejectOnError?: boolean;
      },
      temporaryRelays: readonly string[]
    ) => Promise<{
      readonly events: readonly StoredEvent[];
      readonly settlement: ReadSettlement;
    }>;
  } = {}
) {
  const read =
    options.read ??
    vi.fn(async () => ({
      events: [],
      settlement: LOCAL_SETTLEMENT
    }));

  return createAuftaktRuntimeCoordinator({
    entityHandleRuntime: {
      read,
      openStore: async () => ({
        getRelayHints: async () => []
      }),
      snapshotRelaySet: async (subject) => ({
        subject,
        readRelays: ['wss://default.example/'],
        writeRelays: [],
        temporaryRelays: [],
        diagnostics: []
      })
    }
  });
}

describe('@auftakt/runtime plugin api contract', () => {
  it('exports typed plugin contracts and versioned registration helper from package root', async () => {
    const mod = await import('@auftakt/runtime');
    const source = readFileSync(packageIndexPath, 'utf8');

    expect(mod.registerRuntimePlugin).toBeTypeOf('function');
    expect(mod.AUFTAKT_RUNTIME_PLUGIN_API_VERSION).toBe('v1');
    expect(source).toMatch(/\bAuftaktRuntimePlugin\b/);
    expect(source).toMatch(/\bAuftaktRuntimePluginApi\b/);
    expect(source).toMatch(/\bAuftaktRuntimePluginModels\b/);
    expect(source).toMatch(/\bregisterRuntimePlugin\b/);
    expect(source).not.toMatch(/ResonoteCoordinatorPlugin/);
  });

  it('limits plugin api capabilities to versioned registration methods', async () => {
    const coordinator = createTestCoordinator();
    let apiKeys: string[] = [];
    let observedVersion: string | null = null;
    let observedModels: AuftaktRuntimePluginModels | null = null;

    const registration = await registerRuntimePlugin(coordinator, {
      name: 'contract-plugin',
      apiVersion: 'v1',
      setup(api) {
        apiKeys = Object.keys(api).sort();
        observedVersion = api.apiVersion;
        observedModels = api.models;
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
      apiVersion: AUFTAKT_RUNTIME_PLUGIN_API_VERSION,
      enabled: true
    });
    expect(observedVersion).toBe('v1');
    expect(apiKeys).toEqual([
      'apiVersion',
      'models',
      'registerFlow',
      'registerProjection',
      'registerReadModel'
    ]);
    expect(Object.keys(observedModels ?? {}).sort()).toEqual([
      'getAddressable',
      'getEvent',
      'getRelayHints',
      'getRelaySet',
      'getUser'
    ]);
  });

  it('lets plugins register read models backed by runtime model handles', async () => {
    const event = makeEvent('f'.repeat(64), { content: 'from plugin model api' });
    const read = vi.fn(async () => ({
      events: [event],
      settlement: LOCAL_SETTLEMENT
    }));
    const coordinator = createTestCoordinator({ read });
    const modelHolder: { current?: { fetch(): Promise<unknown> } } = {};

    const registration = await registerRuntimePlugin(coordinator, {
      name: 'model-plugin',
      apiVersion: 'v1',
      setup(api) {
        const handle = api.models.getEvent({
          id: event.id,
          relayHints: ['wss://model.example', 'not a relay']
        });
        modelHolder.current = {
          fetch: () => handle.fetch({ timeoutMs: 250 })
        };
        api.registerReadModel('model.event', modelHolder.current);
      }
    });

    expect(registration.enabled).toBe(true);
    const registeredModel = modelHolder.current;
    if (!registeredModel) throw new Error('Plugin read model was not registered');

    const result = await registeredModel.fetch();

    expect(read).toHaveBeenCalledWith([{ ids: [event.id] }], { timeoutMs: 250 }, [
      'wss://model.example/'
    ]);
    expect(result).toMatchObject({
      value: event,
      sourceEvent: event,
      state: 'local'
    });
  });

  it('keeps plugin registration versioned and runtime-owned', async () => {
    const coordinator = createTestCoordinator();

    const first = await registerRuntimePlugin(coordinator, {
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

    const duplicate = await registerRuntimePlugin(coordinator, {
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
