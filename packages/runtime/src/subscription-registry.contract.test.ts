import { createRuntimeRequestKey, type RequestKey, type StoredEvent } from '@auftakt/core';
import {
  createForwardReq,
  createRegistryBackedSessionRuntime,
  createRelaySession,
  type EventSubscriptionRefs,
  loadEventSubscriptionDeps,
  REPAIR_REQUEST_COALESCING_SCOPE,
  type SessionRuntime
} from '@auftakt/runtime';
import { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event?: unknown) => void;

class FakeRelayRequest {
  private readonly listeners = new Set<() => void>();
  private readonly collected: Array<Record<string, unknown>> = [];
  private completed = false;

  constructor(
    readonly mode: 'backward' | 'forward',
    readonly requestKey?: RequestKey,
    readonly coalescingScope?: string
  ) {}

  emit(input: unknown): void {
    const next = Array.isArray(input) ? input : [input];
    this.collected.push(...(next as Array<Record<string, unknown>>));
    this.notify();
  }

  over(): void {
    this.completed = true;
    this.notify();
  }

  get filters(): Array<Record<string, unknown>> {
    return [...this.collected];
  }

  get closed(): boolean {
    return this.completed;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

class FakeRawSession {
  readonly useRequests: FakeRelayRequest[] = [];
  unsubscribeCount = 0;
  private readonly completions: Array<() => void> = [];
  private readonly nexts: Array<(packet: { event: StoredEvent; from?: string }) => void> = [];

  use(req: FakeRelayRequest): Observable<{ event: StoredEvent; from?: string }> {
    this.useRequests.push(req);
    return new Observable((subscriber) => {
      const next = (packet: { event: StoredEvent; from?: string }) => subscriber.next(packet);
      this.nexts.push(next);
      this.completions.push(() => subscriber.complete());
      return () => {
        this.unsubscribeCount += 1;
        const index = this.nexts.indexOf(next);
        if (index >= 0) this.nexts.splice(index, 1);
      };
    });
  }

  emitAll(packet: { event: StoredEvent; from?: string }): void {
    for (const next of [...this.nexts]) {
      next(packet);
    }
  }

  completeAll(): void {
    for (const complete of this.completions.splice(0)) {
      complete();
    }
  }
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readonly sent: unknown[] = [];
  readonly listeners: Record<string, Listener[]> = {
    open: [],
    message: [],
    error: [],
    close: []
  };
  readyState = FakeWebSocket.CONNECTING;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: Listener): void {
    this.listeners[type].push(listener);
  }

  send(payload: string): void {
    this.sent.push(JSON.parse(payload));
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  message(packet: unknown): void {
    this.emit('message', { data: JSON.stringify(packet) });
  }

  private emit(type: 'open' | 'message' | 'error' | 'close', event?: unknown): void {
    for (const listener of this.listeners[type]) {
      listener(event);
    }
  }
}

const RELAY_URL = 'wss://registry-relay.contract.test';

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

function storedEvent(id: string): StoredEvent {
  return {
    id,
    pubkey: `pubkey-${id}`,
    kind: 1,
    created_at: 1,
    tags: [],
    content: '',
    sig: `sig-${id}`
  } as StoredEvent;
}

function createFixture() {
  const rawSession = new FakeRawSession();
  const runtime: SessionRuntime<StoredEvent> = {
    async fetchBackwardEvents() {
      return [];
    },
    async fetchBackwardFirst() {
      return null;
    },
    async fetchLatestEvent() {
      return null;
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
        async put() {
          return true;
        }
      };
    },
    async getRelaySession() {
      return rawSession as never;
    },
    createBackwardReq(options) {
      return new FakeRelayRequest(
        'backward',
        options?.requestKey,
        options?.coalescingScope
      ) as never;
    },
    createForwardReq(options) {
      return new FakeRelayRequest(
        'forward',
        options?.requestKey,
        options?.coalescingScope
      ) as never;
    },
    uniq() {
      return (source: Observable<unknown>) => source;
    },
    merge(...streams) {
      return new Observable((subscriber) => {
        const subs = streams.map((stream) =>
          (stream as Observable<unknown>).subscribe({
            next: (value) => subscriber.next(value),
            error: (error) => subscriber.error(error),
            complete: () => {}
          })
        );
        return () => {
          for (const sub of subs) {
            sub.unsubscribe();
          }
        };
      }) as never;
    },
    async getRelayConnectionState() {
      return null;
    },
    async observeRelayConnectionStates() {
      return { unsubscribe() {} };
    }
  };

  return {
    rawSession,
    runtime: createRegistryBackedSessionRuntime(runtime)
  };
}

function subscribeSharedForward(
  refs: EventSubscriptionRefs,
  filter: Record<string, unknown>,
  scope: string
) {
  const req = refs.relaySessionMod.createForwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'forward',
      scope,
      filters: [filter]
    })
  }) as FakeRelayRequest;
  const sub = refs.relaySession.use(req).pipe(refs.relaySessionMod.uniq()).subscribe({});
  req.emit(filter);
  return sub;
}

function subscribeSharedBackward(
  refs: EventSubscriptionRefs,
  filter: Record<string, unknown>,
  scope: string,
  onComplete: () => void
) {
  const req = refs.relaySessionMod.createBackwardReq({
    requestKey: createRuntimeRequestKey({
      mode: 'backward',
      scope,
      filters: [filter]
    })
  }) as FakeRelayRequest;
  const sub = refs.relaySession.use(req).pipe(refs.relaySessionMod.uniq()).subscribe({
    complete: onComplete
  });
  req.emit(filter);
  req.over();
  return sub;
}

describe('@auftakt/runtime shared subscription registry contract', () => {
  it('shares one logical forward request across multiple consumers and tears down only after the final unsubscribe', async () => {
    const { rawSession, runtime } = createFixture();
    const refs = await loadEventSubscriptionDeps(runtime);
    const leftFilter = { authors: ['pubkey-a', 'pubkey-b'], kinds: [1] };
    const rightFilter = { kinds: [1], authors: ['pubkey-b', 'pubkey-a'] };

    const leftSub = subscribeSharedForward(refs, leftFilter, 'contract:registry:left');
    const rightSub = subscribeSharedForward(refs, rightFilter, 'contract:registry:right');

    await waitFor(() => rawSession.useRequests.length === 1);
    expect(rawSession.useRequests).toHaveLength(1);

    leftSub.unsubscribe();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(rawSession.unsubscribeCount).toBe(0);

    rightSub.unsubscribe();
    await waitFor(() => rawSession.unsubscribeCount === 1);
    expect(rawSession.unsubscribeCount).toBe(1);
  });

  it('reuses one logical backward entry and completes all attached consumers from the shared registry state', async () => {
    const { rawSession, runtime } = createFixture();
    const refs = await loadEventSubscriptionDeps(runtime);
    const leftFilter = { '#I': ['spotify:track:abc'], kinds: [1111] };
    const rightFilter = { kinds: [1111], '#I': ['spotify:track:abc'] };
    let completed = 0;

    const leftSub = subscribeSharedBackward(
      refs,
      leftFilter,
      'contract:registry:backward:left',
      () => {
        completed += 1;
      }
    );
    const rightSub = subscribeSharedBackward(
      refs,
      rightFilter,
      'contract:registry:backward:right',
      () => {
        completed += 1;
      }
    );

    await waitFor(() => rawSession.useRequests.length === 1);
    rawSession.completeAll();

    await waitFor(() => completed === 2);
    expect(rawSession.useRequests).toHaveLength(1);
    expect(completed).toBe(2);

    leftSub.unsubscribe();
    rightSub.unsubscribe();
  });

  it('does not reuse a shared backward entry across app and repair coalescing domains', async () => {
    const { rawSession, runtime } = createFixture();
    const refs = await loadEventSubscriptionDeps(runtime);
    const filter = { '#I': ['spotify:track:abc'], kinds: [1111] };

    const appReq = refs.relaySessionMod.createBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'contract:registry:app',
        filters: [filter]
      })
    }) as FakeRelayRequest;
    const repairReq = refs.relaySessionMod.createBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'timeline:repair:negentropy',
        filters: [filter]
      }),
      coalescingScope: REPAIR_REQUEST_COALESCING_SCOPE
    }) as FakeRelayRequest;

    const appSub = refs.relaySession.use(appReq).pipe(refs.relaySessionMod.uniq()).subscribe({});
    const repairSub = refs.relaySession
      .use(repairReq)
      .pipe(refs.relaySessionMod.uniq())
      .subscribe({});
    appReq.emit(filter);
    repairReq.emit(filter);
    appReq.over();
    repairReq.over();

    await waitFor(() => rawSession.useRequests.length === 2);
    expect(rawSession.useRequests).toHaveLength(2);

    rawSession.completeAll();
    appSub.unsubscribe();
    repairSub.unsubscribe();
  });

  it('keeps a shared backward entry alive when one consumer unsubscribes before completion', async () => {
    const { rawSession, runtime } = createFixture();
    const refs = await loadEventSubscriptionDeps(runtime);
    const leftFilter = { '#I': ['spotify:track:abc'], kinds: [1111] };
    const rightFilter = { kinds: [1111], '#I': ['spotify:track:abc'] };
    const completed: string[] = [];

    const leftSub = subscribeSharedBackward(
      refs,
      leftFilter,
      'contract:registry:partial:left',
      () => {
        completed.push('left');
      }
    );
    const rightSub = subscribeSharedBackward(
      refs,
      rightFilter,
      'contract:registry:partial:right',
      () => {
        completed.push('right');
      }
    );

    await waitFor(() => rawSession.useRequests.length === 1);
    leftSub.unsubscribe();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(rawSession.unsubscribeCount).toBe(0);
    expect(completed).toEqual([]);

    rawSession.completeAll();

    await waitFor(() => completed.length === 1);
    await waitFor(() => rawSession.unsubscribeCount === 1);
    expect(completed).toEqual(['right']);

    rightSub.unsubscribe();
  });

  it('does not deliver late forward events to a consumer after it unsubscribes from a shared request', async () => {
    const { rawSession, runtime } = createFixture();
    const refs = await loadEventSubscriptionDeps(runtime);
    const leftFilter = { authors: ['pubkey-a', 'pubkey-b'], kinds: [1] };
    const rightFilter = { kinds: [1], authors: ['pubkey-b', 'pubkey-a'] };
    const leftEvents: string[] = [];
    const rightEvents: string[] = [];

    const leftReq = refs.relaySessionMod.createForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:registry:late-events:left',
        filters: [leftFilter]
      })
    }) as FakeRelayRequest;
    const rightReq = refs.relaySessionMod.createForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:registry:late-events:right',
        filters: [rightFilter]
      })
    }) as FakeRelayRequest;

    const leftSub = refs.relaySession
      .use(leftReq)
      .pipe(refs.relaySessionMod.uniq())
      .subscribe({
        next: (packet: unknown) => leftEvents.push((packet as { event: StoredEvent }).event.id)
      });
    const rightSub = refs.relaySession
      .use(rightReq)
      .pipe(refs.relaySessionMod.uniq())
      .subscribe({
        next: (packet: unknown) => rightEvents.push((packet as { event: StoredEvent }).event.id)
      });
    leftReq.emit(leftFilter);
    rightReq.emit(rightFilter);

    await waitFor(() => rawSession.useRequests.length === 1);
    rawSession.emitAll({ event: storedEvent('before-unsubscribe'), from: 'relay-a' });
    await waitFor(() => leftEvents.length === 1 && rightEvents.length === 1);

    leftSub.unsubscribe();
    rawSession.emitAll({ event: storedEvent('after-unsubscribe'), from: 'relay-a' });
    await waitFor(() => rightEvents.length === 2);

    expect(leftEvents).toEqual(['before-unsubscribe']);
    expect(rightEvents).toEqual(['before-unsubscribe', 'after-unsubscribe']);
    expect(rawSession.unsubscribeCount).toBe(0);

    rightSub.unsubscribe();
    await waitFor(() => rawSession.unsubscribeCount === 1);
  });

  it('keeps backward EOSE completion scoped to remaining consumers after a partial unsubscribe', async () => {
    const { rawSession, runtime } = createFixture();
    const refs = await loadEventSubscriptionDeps(runtime);
    const leftFilter = { '#I': ['spotify:track:abc'], kinds: [1111] };
    const rightFilter = { kinds: [1111], '#I': ['spotify:track:abc'] };
    const leftEvents: string[] = [];
    const rightEvents: string[] = [];
    const completed: string[] = [];

    const leftReq = refs.relaySessionMod.createBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'contract:registry:backward-eose:left',
        filters: [leftFilter]
      })
    }) as FakeRelayRequest;
    const rightReq = refs.relaySessionMod.createBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'contract:registry:backward-eose:right',
        filters: [rightFilter]
      })
    }) as FakeRelayRequest;

    const leftSub = refs.relaySession
      .use(leftReq)
      .pipe(refs.relaySessionMod.uniq())
      .subscribe({
        next: (packet: unknown) => leftEvents.push((packet as { event: StoredEvent }).event.id),
        complete: () => completed.push('left')
      });
    const rightSub = refs.relaySession
      .use(rightReq)
      .pipe(refs.relaySessionMod.uniq())
      .subscribe({
        next: (packet: unknown) => rightEvents.push((packet as { event: StoredEvent }).event.id),
        complete: () => completed.push('right')
      });
    leftReq.emit(leftFilter);
    rightReq.emit(rightFilter);
    leftReq.over();
    rightReq.over();

    await waitFor(() => rawSession.useRequests.length === 1);
    leftSub.unsubscribe();
    rawSession.emitAll({ event: storedEvent('late-backward'), from: 'relay-a' });
    rawSession.completeAll();

    await waitFor(() => completed.length === 1);
    expect(leftEvents).toEqual([]);
    expect(rightEvents).toEqual(['late-backward']);
    expect(completed).toEqual(['right']);
    expect(rawSession.unsubscribeCount).toBe(1);

    rightSub.unsubscribe();
  });
});

describe('@auftakt/runtime relay reconnect and capability queue contract', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: FakeWebSocket
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: originalWebSocket
    });
  });

  it('does not duplicate forward delivery when reconnect replay restores a capability-limited queue', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        relayCapabilities: {
          [RELAY_URL]: {
            relayUrl: RELAY_URL,
            maxFilters: 1,
            maxSubscriptions: 1,
            supportedNips: [1, 11],
            source: 'nip11',
            expiresAt: 3_600,
            stale: false
          }
        }
      },
      relayLifecycle: {
        retry: { initialDelayMs: 0, maxAttempts: 1 }
      }
    });
    const req = createForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:registry:reconnect-queue-dedup',
        filters: [{ ids: ['a'] }, { ids: ['b'] }]
      })
    });
    const delivered: string[] = [];

    const sub = session.use(req).subscribe({
      next: (packet) => delivered.push(packet.event.id)
    });
    req.emit([{ ids: ['a'] }, { ids: ['b'] }]);

    await waitFor(() => FakeWebSocket.instances.length === 1);
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.open();
    await waitFor(() => firstSocket.sent.length === 1);

    const firstSubId = (firstSocket.sent[0] as [string, string, ...unknown[]])[1];
    firstSocket.message(['EVENT', firstSubId, storedEvent('event-a')]);
    await waitFor(() => delivered.length === 1);
    expect(session.getRelayCapabilitySnapshot(RELAY_URL)).toMatchObject({
      queueDepth: 1,
      activeSubscriptions: 1
    });

    firstSocket.close();
    await waitFor(() => FakeWebSocket.instances.length === 2);
    const replaySocket = FakeWebSocket.instances[1];
    replaySocket.open();
    await waitFor(() => replaySocket.sent.length === 1);

    const replayedFirstSubId = (replaySocket.sent[0] as [string, string, ...unknown[]])[1];
    replaySocket.message(['EVENT', replayedFirstSubId, storedEvent('event-a')]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(delivered).toEqual(['event-a']);

    replaySocket.message(['CLOSED', replayedFirstSubId, 'normal completion']);
    await waitFor(() => replaySocket.sent.length === 2);

    const secondSubId = (replaySocket.sent[1] as [string, string, ...unknown[]])[1];
    replaySocket.message(['EVENT', secondSubId, storedEvent('event-b')]);
    await waitFor(() => delivered.length === 2);

    expect(delivered).toEqual(['event-a', 'event-b']);
    expect(session.getRelayCapabilitySnapshot(RELAY_URL)).toMatchObject({
      queueDepth: 0,
      activeSubscriptions: 1
    });

    sub.unsubscribe();
    session.dispose();
  });
});
