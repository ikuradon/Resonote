import type { StoredEvent } from '@auftakt/core';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { createResonoteCoordinator } from './runtime.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const runtimeSourcePath = resolve(currentDir, 'runtime.ts');

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

function createTestCoordinator() {
  const first = makeEvent('first', { tags: [['I', 'spotify:track:abc']] });
  const followList = makeEvent('follow-list', { kind: 3, tags: [['p', 'followed-pubkey']] });
  const store = {
    getByPubkeyAndKind: vi.fn(async () => followList),
    getManyByPubkeysAndKind: vi.fn(async () => []),
    getByReplaceKey: vi.fn(async () => null),
    getByTagValue: vi.fn(async () => [first]),
    getById: vi.fn(async () => null),
    getAllByKind: vi.fn(async (kind: number) =>
      kind === 3 ? [followList] : [makeEvent(`kind-${kind}`, { kind })]
    ),
    listNegentropyEventRefs: vi.fn(async () => []),
    deleteByIds: vi.fn(async () => {}),
    clearAll: vi.fn(async () => {}),
    put: vi.fn(async () => true),
    putWithReconcile: vi.fn(async () => ({ stored: true, emissions: [] }))
  };

  const coordinator = createResonoteCoordinator({
    runtime: {
      fetchLatestEvent: async () => null,
      getEventsDB: async () => store,
      getRelaySession: async () => ({
        use: () => ({
          subscribe: () => ({ unsubscribe() {} })
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

  return { coordinator, store, first, followList };
}

describe('@auftakt/resonote local store api contract', () => {
  it('keeps raw event database handles out of the public coordinator surface', () => {
    const source = readFileSync(runtimeSourcePath, 'utf8');
    const { coordinator } = createTestCoordinator();

    expect(source).not.toMatch(/\bopenEventsDb\b/);
    expect(coordinator).not.toHaveProperty('openEventsDb');
  });

  it('mediates local comment cache operations through coordinator methods', async () => {
    const { coordinator, store, first } = createTestCoordinator();
    const stored = makeEvent('stored-comment', { kind: 1111 });

    await expect(coordinator.readCommentEventsByTag('spotify:track:abc')).resolves.toEqual([first]);
    await expect(coordinator.storeCommentEvent(stored)).resolves.toBe(true);
    await coordinator.deleteCommentEventsByIds(['deleted-1', 'deleted-2']);

    expect(store.getByTagValue).toHaveBeenCalledWith('spotify:track:abc');
    expect(store.put).toHaveBeenCalledWith(stored);
    expect(store.deleteByIds).toHaveBeenCalledWith(['deleted-1', 'deleted-2']);
  });

  it('mediates local follow graph and maintenance operations through coordinator methods', async () => {
    const { coordinator, store, followList } = createTestCoordinator();

    await expect(coordinator.readStoredFollowGraph('pubkey-1', 3)).resolves.toEqual({
      currentUserFollowList: followList,
      allFollowLists: [followList]
    });
    await expect(coordinator.countStoredEventsByKinds([1, 3])).resolves.toEqual([
      { kind: 1, count: 1 },
      { kind: 3, count: 1 }
    ]);
    await coordinator.clearStoredEvents();

    expect(store.getByPubkeyAndKind).toHaveBeenCalledWith('pubkey-1', 3);
    expect(store.getAllByKind).toHaveBeenCalledWith(3);
    expect(store.clearAll).toHaveBeenCalledOnce();
  });
});
