import { defineProjection, reduceReadSettlement } from '@auftakt/core';
import { createAuftaktRuntimeCoordinator, registerRuntimePlugin } from '@auftakt/runtime';
import { describe, expect, it } from 'vitest';

function createTestCoordinator() {
  return createAuftaktRuntimeCoordinator({
    entityHandleRuntime: {
      read: async () => ({
        events: [],
        settlement: reduceReadSettlement({
          localSettled: true,
          relaySettled: true,
          relayRequired: false
        })
      }),
      openStore: async () => ({}),
      snapshotRelaySet: async (subject) => ({
        subject,
        readRelays: [],
        writeRelays: [],
        temporaryRelays: [],
        diagnostics: []
      })
    }
  });
}

describe('@auftakt/runtime plugin isolation', () => {
  it('does not expose raw relay or raw storage handles to plugins', async () => {
    const observedKeys: string[][] = [];
    const observedModelKeys: string[][] = [];
    const coordinator = createTestCoordinator();

    await coordinator.registerPlugin({
      name: 'inspectPluginApi',
      apiVersion: 'v1',
      setup(api) {
        observedKeys.push(Object.keys(api).sort());
        observedModelKeys.push(Object.keys(api.models).sort());
      }
    });

    expect(observedKeys[0]).toEqual([
      'apiVersion',
      'models',
      'registerFlow',
      'registerProjection',
      'registerReadModel'
    ]);
    expect(observedModelKeys[0]).toEqual([
      'getAddressable',
      'getEvent',
      'getRelayHints',
      'getRelaySet',
      'getUser'
    ]);
    expect(observedKeys[0]).not.toContain('getRelaySession');
    expect(observedKeys[0]).not.toContain('getEventsDB');
    expect(observedKeys[0]).not.toContain('getEvent');
    expect(observedKeys[0]).not.toContain('getUser');
    expect(observedKeys[0]).not.toContain('getAddressable');
    expect(observedKeys[0]).not.toContain('getRelaySet');
    expect(observedKeys[0]).not.toContain('getRelayHints');
    expect(observedKeys[0]).not.toContain('openEventsDb');
    expect(observedModelKeys[0]).not.toContain('getRelaySession');
    expect(observedModelKeys[0]).not.toContain('getEventsDB');
    expect(observedModelKeys[0]).not.toContain('openEventsDb');
    expect(observedModelKeys[0]).not.toContain('materializerQueue');
    expect(observedModelKeys[0]).not.toContain('relayGateway');
  });

  it('provides plugins only registration functions and no coordinator handles', async () => {
    const coordinator = createTestCoordinator();
    const forbiddenKeys = [
      'getRelaySession',
      'createBackwardReq',
      'createForwardReq',
      'getEventsDB',
      'openEventsDb',
      'materializerQueue',
      'relayGateway',
      'getEvent',
      'getUser',
      'getAddressable',
      'getRelaySet',
      'getRelayHints'
    ];

    await coordinator.registerPlugin({
      name: 'assert-plugin-api-shape',
      apiVersion: 'v1',
      setup(api) {
        expect(Object.keys(api).sort()).toEqual([
          'apiVersion',
          'models',
          'registerFlow',
          'registerProjection',
          'registerReadModel'
        ]);
        expect(Object.keys(api.models).sort()).toEqual([
          'getAddressable',
          'getEvent',
          'getRelayHints',
          'getRelaySet',
          'getUser'
        ]);
        for (const key of forbiddenKeys) {
          expect(api).not.toHaveProperty(key);
        }
        const rawModelForbiddenKeys = [
          'getRelaySession',
          'createBackwardReq',
          'createForwardReq',
          'getEventsDB',
          'openEventsDb',
          'materializerQueue',
          'relayGateway'
        ];
        for (const key of rawModelForbiddenKeys) {
          expect(api.models).not.toHaveProperty(key);
        }
      }
    });
  });

  it('disables a throwing plugin without crashing later registrations', async () => {
    const coordinator = createTestCoordinator();

    const stable = await registerRuntimePlugin(coordinator, {
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

    const failing = await registerRuntimePlugin(coordinator, {
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

    const recovery = await registerRuntimePlugin(coordinator, {
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

    const mismatchedVersion = await registerRuntimePlugin(coordinator, {
      name: 'wrong-version-plugin',
      apiVersion: 'v2' as never,
      setup() {}
    });

    const afterMismatch = await registerRuntimePlugin(coordinator, {
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
