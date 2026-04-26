import { finalizeEvent, type StoredEvent } from '@auftakt/core';
import { Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  createResonoteCoordinator,
  type ResonoteRuntime,
  startCommentSubscription
} from './runtime.js';

const RELAY_SECRET_KEY = new Uint8Array(32).fill(9);

interface RelayObserver {
  next?: (packet: { event: unknown; from?: string }) => void;
  complete?: () => void;
  error?: (error: unknown) => void;
}

class CapturingRelaySession {
  readonly observers: RelayObserver[] = [];
  readonly useOptions: unknown[] = [];

  use(_req?: unknown, options?: unknown): Observable<{ event: unknown; from?: string }> {
    this.useOptions.push(options);
    return new Observable((subscriber) => {
      const observer: RelayObserver = {
        next: (packet) => subscriber.next(packet),
        complete: () => subscriber.complete(),
        error: (error) => subscriber.error(error)
      };
      this.observers.push(observer);

      return () => {
        const index = this.observers.indexOf(observer);
        if (index >= 0) this.observers.splice(index, 1);
      };
    });
  }

  emit(index: number, event: unknown, from = 'wss://relay.example'): void {
    this.observers[index]?.next?.({ event, from });
  }
}

function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('waitFor timeout'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function validEvent(overrides: Partial<StoredEvent> = {}) {
  return finalizeEvent(
    {
      kind: overrides.kind ?? 1111,
      content: overrides.content ?? 'visible',
      tags: overrides.tags ?? [['I', 'spotify:track:abc']],
      created_at: overrides.created_at ?? 100
    },
    RELAY_SECRET_KEY
  );
}

function invalidRelayEvent() {
  return {
    id: 'not-a-valid-nostr-event',
    pubkey: 'alice',
    created_at: 1,
    kind: 1111,
    tags: [],
    content: 'invalid'
  };
}

function createCoordinatorFixture(
  options: {
    relaySelectionPolicy?: Parameters<typeof createResonoteCoordinator>[0]['relaySelectionPolicy'];
  } = {}
) {
  const relaySession = new CapturingRelaySession();
  const materialized: StoredEvent[] = [];
  const quarantined: unknown[] = [];
  const runtime: ResonoteRuntime = {
    async fetchLatestEvent() {
      return null;
    },
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        async getByPubkeyAndKind() {
          return null;
        },
        async getManyByPubkeysAndKind() {
          return [];
        },
        async getByReplaceKey() {
          return null;
        },
        async getByTagValue() {
          return [];
        },
        async getById() {
          return null;
        },
        async getAllByKind() {
          return [];
        },
        async listNegentropyEventRefs() {
          return [];
        },
        async recordRelayHint() {},
        async deleteByIds() {},
        async clearAll() {},
        async put(event: StoredEvent) {
          materialized.push(event);
          return true;
        },
        async putWithReconcile(event: StoredEvent) {
          materialized.push(event);
          return { stored: true, emissions: [] };
        },
        async putQuarantine(record: unknown) {
          quarantined.push(record);
        }
      };
    },
    async getRxNostr() {
      return relaySession as unknown;
    },
    createRxBackwardReq() {
      return { emit() {}, over() {} };
    },
    createRxForwardReq() {
      return { emit() {}, over() {} };
    },
    uniq() {
      return (source: Observable<unknown>) => source;
    },
    merge(...streams) {
      return new Observable((subscriber) => {
        const subscriptions = streams.map((stream) =>
          (stream as Observable<unknown>).subscribe({
            next: (value) => subscriber.next(value),
            error: (error) => subscriber.error(error),
            complete: () => {}
          })
        );
        return () => {
          for (const subscription of subscriptions) {
            subscription.unsubscribe();
          }
        };
      }) as unknown;
    },
    async getRelayConnectionState() {
      return null;
    },
    async observeRelayConnectionStates() {
      return { unsubscribe() {} };
    }
  };

  const coordinator = createResonoteCoordinator({
    runtime,
    relaySelectionPolicy: options.relaySelectionPolicy,
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

  return { coordinator, materialized, quarantined, relaySession };
}

describe('@auftakt/resonote subscription visibility', () => {
  it('materializes comment subscription relay packets before consumer callbacks', async () => {
    const { coordinator, materialized, quarantined, relaySession } = createCoordinatorFixture();
    const refs = await coordinator.loadCommentSubscriptionDeps();
    const onPacket = vi.fn();

    startCommentSubscription(
      refs,
      [{ kinds: [1111], '#I': ['spotify:track:abc'] }],
      null,
      onPacket,
      vi.fn()
    );

    await waitFor(() => relaySession.observers.length > 0);
    relaySession.emit(0, invalidRelayEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onPacket).not.toHaveBeenCalled();

    const event = validEvent();
    relaySession.emit(0, event);
    await waitFor(() => onPacket.mock.calls.length === 1);

    expect(onPacket).toHaveBeenCalledWith(event, 'wss://relay.example');
    expect(materialized).toEqual([event]);
    expect(quarantined).toHaveLength(1);
  });

  it('materializes notification subscription relay packets before handlers run', async () => {
    const { coordinator, materialized, quarantined, relaySession } = createCoordinatorFixture();
    const onMentionPacket = vi.fn();

    await coordinator.subscribeNotificationStreams(
      {
        myPubkey: 'alice',
        follows: new Set(),
        mentionKinds: [1],
        followCommentKind: 1111,
        mentionSince: 0,
        followCommentSince: 0
      },
      {
        onMentionPacket,
        onFollowCommentPacket: vi.fn(),
        onError: vi.fn()
      }
    );

    await waitFor(() => relaySession.observers.length > 0);
    relaySession.emit(0, invalidRelayEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onMentionPacket).not.toHaveBeenCalled();

    const event = validEvent({ kind: 1, tags: [['p', 'alice']] });
    relaySession.emit(0, event);
    await waitFor(() => onMentionPacket.mock.calls.length === 1);

    expect(onMentionPacket).toHaveBeenCalledWith({ event, from: 'wss://relay.example' });
    expect(materialized).toEqual([event]);
    expect(quarantined).toHaveLength(1);
  });

  it('applies coordinator relay selection policy overrides to subscription routing', async () => {
    const { coordinator, relaySession } = createCoordinatorFixture({
      relaySelectionPolicy: {
        strategy: 'default-only',
        includeDefaultFallback: false
      }
    });
    const refs = await coordinator.loadCommentSubscriptionDeps();

    startCommentSubscription(
      refs,
      [{ kinds: [1111], '#I': ['spotify:track:abc'] }],
      null,
      vi.fn(),
      vi.fn()
    );

    await waitFor(() => relaySession.useOptions.length > 0);

    expect(relaySession.useOptions[0]).toBeUndefined();
  });
});
