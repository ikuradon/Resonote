import { createRuntimeRequestKey, type RequestKey, type StoredEvent } from '@auftakt/core';
import {
  createRegistryBackedSessionRuntime,
  type EventSubscriptionRefs,
  loadEventSubscriptionDeps,
  REPAIR_REQUEST_COALESCING_SCOPE,
  type SessionRuntime
} from '@auftakt/runtime';
import { Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';

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

  use(req: FakeRelayRequest): Observable<{ event: StoredEvent; from?: string }> {
    this.useRequests.push(req);
    return new Observable((subscriber) => {
      this.completions.push(() => subscriber.complete());
      return () => {
        this.unsubscribeCount += 1;
      };
    });
  }

  completeAll(): void {
    for (const complete of this.completions.splice(0)) {
      complete();
    }
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
});
