import { finalizeEvent, type StoredEvent } from '@auftakt/core';
import { Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  createResonoteCoordinator,
  type LatestReadDriver,
  type ResonoteRuntime,
  startCommentSubscription,
  useCachedLatest
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

  complete(index: number): void {
    this.observers[index]?.complete?.();
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
    localLatest?: StoredEvent | null;
    materializeGate?: Promise<void>;
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
          return options.localLatest ?? null;
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
          await options.materializeGate;
          materialized.push(event);
          return true;
        },
        async putWithReconcile(event: StoredEvent) {
          await options.materializeGate;
          materialized.push(event);
          return { stored: true, emissions: [] };
        },
        async putQuarantine(record: unknown) {
          quarantined.push(record);
        }
      };
    },
    async getRelaySession() {
      return relaySession as unknown;
    },
    createBackwardReq() {
      return { emit() {}, over() {} };
    },
    createForwardReq() {
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

  return { coordinator, materialized, quarantined, relaySession, runtime };
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

  it('keeps shared comment subscription alive after one consumer unsubscribes', async () => {
    const { coordinator, relaySession } = createCoordinatorFixture();
    const leftRefs = await coordinator.loadCommentSubscriptionDeps();
    const rightRefs = await coordinator.loadCommentSubscriptionDeps();
    const leftPacket = vi.fn();
    const rightPacket = vi.fn();
    const filters = [{ kinds: [1111], '#I': ['spotify:track:abc'] }];

    const left = startCommentSubscription(leftRefs, filters, null, leftPacket, vi.fn());
    startCommentSubscription(rightRefs, filters, null, rightPacket, vi.fn());

    await waitFor(() => relaySession.observers.length > 0);
    for (const handle of left) handle.unsubscribe();

    const event = validEvent({ content: 'after-left-unsubscribe' });
    for (let index = 0; index < relaySession.observers.length; index += 1) {
      relaySession.emit(index, event);
    }

    await waitFor(() => rightPacket.mock.calls.length === 1);
    expect(leftPacket).not.toHaveBeenCalled();
    expect(rightPacket).toHaveBeenCalledWith(event, 'wss://relay.example');
  });

  it('quarantines invalid relay candidates without materializing or exposing them', async () => {
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
    const invalid = invalidRelayEvent();
    relaySession.emit(0, invalid, 'wss://bad-relay.example');
    await waitFor(() => quarantined.length === 1);

    expect(onPacket).not.toHaveBeenCalled();
    expect(materialized).toEqual([]);
    expect(quarantined[0]).toEqual(
      expect.objectContaining({
        relayUrl: 'wss://bad-relay.example',
        eventId: 'not-a-valid-nostr-event',
        rawEvent: invalid
      })
    );
  });

  it('does not expose duplicate visible comment events from backfill and live streams', async () => {
    const { coordinator, relaySession } = createCoordinatorFixture();
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
    const event = validEvent({ content: 'same-event' });
    for (let index = 0; index < relaySession.observers.length; index += 1) {
      relaySession.emit(index, event, `wss://relay-${index}.example`);
    }

    await waitFor(() => onPacket.mock.calls.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onPacket).toHaveBeenCalledTimes(1);
  });

  it('keeps local latest reads partial until relay event materializes and settles', async () => {
    let releaseMaterialization: (() => void) | null = null;
    const local = validEvent({ kind: 0, content: 'local', created_at: 100 });
    const remote = validEvent({ kind: 0, content: 'remote', created_at: 200 });
    const { materialized, relaySession, runtime } = createCoordinatorFixture({
      localLatest: local,
      materializeGate: new Promise<void>((resolve) => {
        releaseMaterialization = resolve;
      })
    });
    const driver = useCachedLatest<LatestReadDriver<StoredEvent>>(runtime, local.pubkey, 0);
    const snapshots: Array<ReturnType<typeof driver.getSnapshot>> = [];
    const unsubscribe = driver.subscribe(() => snapshots.push(driver.getSnapshot()));

    await waitFor(() => snapshots.some((snapshot) => snapshot.event?.id === local.id));
    expect(driver.getSnapshot()).toMatchObject({
      event: expect.objectContaining({ id: local.id }),
      settlement: expect.objectContaining({ phase: 'partial' })
    });

    await waitFor(() => relaySession.observers.length > 0);
    relaySession.emit(0, remote);
    await waitFor(() => releaseMaterialization !== null);
    relaySession.complete(0);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(driver.getSnapshot()).toMatchObject({
      event: expect.objectContaining({ id: local.id }),
      settlement: expect.objectContaining({ phase: 'partial' })
    });

    releaseMaterialization?.();
    await waitFor(
      () => materialized.length === 1 && driver.getSnapshot().settlement.phase === 'settled'
    );

    expect(driver.getSnapshot()).toMatchObject({
      event: expect.objectContaining({ id: remote.id }),
      settlement: expect.objectContaining({ phase: 'settled', provenance: 'mixed' })
    });
    unsubscribe();
    driver.destroy();
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
