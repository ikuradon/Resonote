import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- hoisted mocks ----
const { createRxBackwardReqMock, createRxForwardReqMock, uniqMock, getRxNostrMock, mergeMock } =
  vi.hoisted(() => {
    const makeSub = () => ({ unsubscribe: vi.fn() });
    const makePipe = () => ({ subscribe: vi.fn(() => makeSub()) });
    const makeUse = () => ({ pipe: vi.fn(() => makePipe()) });

    const createRxBackwardReqMock = vi.fn(() => ({
      emit: vi.fn(),
      over: vi.fn()
    }));
    const createRxForwardReqMock = vi.fn(() => ({
      emit: vi.fn()
    }));
    const uniqMock = vi.fn(() => 'uniq-operator');

    const rxNostrInstance = {
      use: vi.fn(() => makeUse())
    };
    const getRxNostrMock = vi.fn(async () => rxNostrInstance);

    const mergedSub = { unsubscribe: vi.fn() };
    const mergedStream = { subscribe: vi.fn(() => mergedSub) };
    const mergeMock = vi.fn(() => mergedStream);

    return {
      createRxBackwardReqMock,
      createRxForwardReqMock,
      uniqMock,
      getRxNostrMock,
      mergeMock
    };
  });

vi.mock('rx-nostr', () => ({
  createRxBackwardReq: createRxBackwardReqMock,
  createRxForwardReq: createRxForwardReqMock,
  uniq: uniqMock
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getRxNostr: getRxNostrMock
}));

vi.mock('$shared/nostr/events.js', () => ({
  COMMENT_KIND: 1111,
  REACTION_KIND: 7,
  DELETION_KIND: 5
}));

vi.mock('rxjs', () => ({
  merge: mergeMock
}));

import {
  buildContentFilters,
  loadSubscriptionDeps,
  startDeletionReconcile,
  startMergedSubscription,
  startSubscription
} from './comment-subscription.js';

// ---- helpers ----

/** Build a minimal SubscriptionRefs for synchronous tests. */
function makeRefs() {
  const makeSub = () => ({ unsubscribe: vi.fn() });
  const makePipeable = () => ({
    subscribe: vi.fn(() => makeSub())
  });
  const makeUsable = () => ({
    pipe: vi.fn(() => makePipeable())
  });

  const backward = { emit: vi.fn(), over: vi.fn() };
  const forward = { emit: vi.fn() };

  const rxNostr = { use: vi.fn(() => makeUsable()) };
  const rxNostrMod = {
    createRxBackwardReq: vi.fn(() => backward),
    createRxForwardReq: vi.fn(() => forward),
    uniq: vi.fn(() => 'uniq-op')
  };

  const mergedSub = { unsubscribe: vi.fn() };
  const mergedStream = { subscribe: vi.fn(() => mergedSub) };
  const rxjsMerge = vi.fn(() => mergedStream);

  return { rxNostr, rxNostrMod, rxjsMerge, backward, forward, mergedSub, mergedStream };
}

// ---- buildContentFilters ----

describe('buildContentFilters', () => {
  it('returns an array of 3 filters', () => {
    const filters = buildContentFilters('spotify:track:abc');
    expect(filters).toHaveLength(3);
  });

  it('first filter uses COMMENT_KIND (1111) and the given idValue', () => {
    const filters = buildContentFilters('spotify:track:abc');
    expect(filters[0]).toEqual({ kinds: [1111], '#I': ['spotify:track:abc'] });
  });

  it('second filter uses REACTION_KIND (7) and the given idValue', () => {
    const filters = buildContentFilters('spotify:track:abc');
    expect(filters[1]).toEqual({ kinds: [7], '#I': ['spotify:track:abc'] });
  });

  it('third filter uses DELETION_KIND (5) and the given idValue', () => {
    const filters = buildContentFilters('spotify:track:abc');
    expect(filters[2]).toEqual({ kinds: [5], '#I': ['spotify:track:abc'] });
  });

  it('uses the idValue provided, not a hardcoded string', () => {
    const id = 'youtube:video:xyz';
    const filters = buildContentFilters(id);
    for (const f of filters) {
      expect(f['#I']).toEqual([id]);
    }
  });
});

// ---- loadSubscriptionDeps ----

describe('loadSubscriptionDeps', () => {
  it('returns rxNostr resolved from getRxNostr', async () => {
    const rxNostrInstance = await getRxNostrMock();
    const deps = await loadSubscriptionDeps();
    expect(deps.rxNostr).toBe(rxNostrInstance);
  });

  it('returns rxNostrMod containing createRxBackwardReq', async () => {
    const deps = await loadSubscriptionDeps();
    expect(typeof deps.rxNostrMod.createRxBackwardReq).toBe('function');
  });

  it('returns rxNostrMod containing createRxForwardReq', async () => {
    const deps = await loadSubscriptionDeps();
    expect(typeof deps.rxNostrMod.createRxForwardReq).toBe('function');
  });

  it('returns rxjsMerge as a function', async () => {
    const deps = await loadSubscriptionDeps();
    expect(typeof deps.rxjsMerge).toBe('function');
  });
});

// ---- startSubscription ----

describe('startSubscription', () => {
  let refs: ReturnType<typeof makeRefs>;
  const filters = [
    { kinds: [1111], '#I': ['id-1'] },
    { kinds: [7], '#I': ['id-1'] },
    { kinds: [5], '#I': ['id-1'] }
  ];

  beforeEach(() => {
    refs = makeRefs();
    vi.clearAllMocks();
  });

  it('creates a backward req and a forward req', () => {
    startSubscription(refs, filters, null, vi.fn(), vi.fn());
    expect(refs.rxNostrMod.createRxBackwardReq).toHaveBeenCalledTimes(1);
    expect(refs.rxNostrMod.createRxForwardReq).toHaveBeenCalledTimes(1);
  });

  it('calls rxNostr.use for both backward and forward reqs', () => {
    startSubscription(refs, filters, null, vi.fn(), vi.fn());
    expect(refs.rxNostr.use).toHaveBeenCalledTimes(2);
  });

  it('returns two subscription handles', () => {
    const handles = startSubscription(refs, filters, null, vi.fn(), vi.fn());
    expect(handles).toHaveLength(2);
  });

  it('calls backward.emit and backward.over', () => {
    startSubscription(refs, filters, null, vi.fn(), vi.fn());
    expect(refs.backward.emit).toHaveBeenCalledTimes(1);
    expect(refs.backward.over).toHaveBeenCalledTimes(1);
  });

  it('calls forward.emit', () => {
    startSubscription(refs, filters, null, vi.fn(), vi.fn());
    expect(refs.forward.emit).toHaveBeenCalledTimes(1);
  });

  it('adds since to backward filters when maxCreatedAt is provided', () => {
    startSubscription(refs, filters, 1000, vi.fn(), vi.fn());
    const [emittedFilters] = refs.backward.emit.mock.calls[0] as [Array<Record<string, unknown>>];
    for (const f of emittedFilters) {
      expect(f['since']).toBe(1001);
    }
  });

  it('does not add since when maxCreatedAt is null', () => {
    startSubscription(refs, filters, null, vi.fn(), vi.fn());
    const [emittedFilters] = refs.backward.emit.mock.calls[0] as [Array<Record<string, unknown>>];
    for (const f of emittedFilters) {
      expect(f['since']).toBeUndefined();
    }
  });

  it('passes original filters (without since) to forward.emit', () => {
    startSubscription(refs, filters, 1000, vi.fn(), vi.fn());
    expect(refs.forward.emit).toHaveBeenCalledWith(filters);
  });

  it('calls onPacket with packet.event when next fires', () => {
    const onPacket = vi.fn();

    // Capture the subscribe observer from the backward subscription
    const backwardPipe = { subscribe: vi.fn() };
    const backwardUse = { pipe: vi.fn(() => backwardPipe) };
    refs.rxNostr.use = vi.fn(() => backwardUse as never);

    startSubscription(refs, filters, null, onPacket, vi.fn());

    const observer = backwardPipe.subscribe.mock.calls[0][0] as {
      next: (p: unknown) => void;
    };
    const fakeEvent = {
      id: 'e1',
      pubkey: 'pk',
      content: 'hi',
      created_at: 1,
      tags: [],
      kind: 1111
    };
    observer.next({ event: fakeEvent });
    expect(onPacket).toHaveBeenCalledWith(fakeEvent, undefined);
  });

  it('passes relay hint (packet.from) to onPacket', () => {
    const onPacket = vi.fn();

    const backwardPipe = { subscribe: vi.fn() };
    const backwardUse = { pipe: vi.fn(() => backwardPipe) };
    refs.rxNostr.use = vi.fn(() => backwardUse as never);

    startSubscription(refs, filters, null, onPacket, vi.fn());

    const observer = backwardPipe.subscribe.mock.calls[0][0] as {
      next: (p: unknown) => void;
    };
    const fakeEvent = {
      id: 'e1',
      pubkey: 'pk',
      content: 'hi',
      created_at: 1,
      tags: [],
      kind: 1111
    };
    observer.next({ event: fakeEvent, from: 'wss://relay.test' });
    expect(onPacket).toHaveBeenCalledWith(fakeEvent, 'wss://relay.test');
  });

  it('calls onBackwardComplete when backward subscription completes', () => {
    const onBackwardComplete = vi.fn();

    const backwardPipe = { subscribe: vi.fn() };
    const backwardUse = { pipe: vi.fn(() => backwardPipe) };
    refs.rxNostr.use = vi.fn(() => backwardUse as never);

    startSubscription(refs, filters, null, vi.fn(), onBackwardComplete);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const observer = (backwardPipe.subscribe.mock.calls[0] as any)[0] as {
      complete: () => void;
    };
    observer.complete();
    expect(onBackwardComplete).toHaveBeenCalledTimes(1);
  });
});

// ---- startMergedSubscription ----

describe('startMergedSubscription', () => {
  let refs: ReturnType<typeof makeRefs>;
  const filters = [
    { kinds: [1111], '#I': ['id-2'] },
    { kinds: [7], '#I': ['id-2'] },
    { kinds: [5], '#I': ['id-2'] }
  ];

  beforeEach(() => {
    refs = makeRefs();
    vi.clearAllMocks();
  });

  it('creates backward and forward reqs', () => {
    startMergedSubscription(refs, filters, vi.fn());
    expect(refs.rxNostrMod.createRxBackwardReq).toHaveBeenCalledTimes(1);
    expect(refs.rxNostrMod.createRxForwardReq).toHaveBeenCalledTimes(1);
  });

  it('calls rxjsMerge to combine streams', () => {
    startMergedSubscription(refs, filters, vi.fn());
    expect(refs.rxjsMerge).toHaveBeenCalledTimes(1);
  });

  it('returns the merged subscription handle', () => {
    const handle = startMergedSubscription(refs, filters, vi.fn());
    expect(handle).toBe(refs.mergedSub);
  });

  it('calls backward.emit and backward.over', () => {
    startMergedSubscription(refs, filters, vi.fn());
    expect(refs.backward.emit).toHaveBeenCalledWith(filters);
    expect(refs.backward.over).toHaveBeenCalledTimes(1);
  });

  it('calls forward.emit with filters', () => {
    startMergedSubscription(refs, filters, vi.fn());
    expect(refs.forward.emit).toHaveBeenCalledWith(filters);
  });

  it('calls onPacket with packet.event from merged stream', () => {
    const onPacket = vi.fn();
    startMergedSubscription(refs, filters, onPacket);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscribeFn = (refs.mergedStream.subscribe.mock.calls[0] as any)[0] as (
      p: unknown
    ) => void;
    const fakeEvent = { id: 'e2', pubkey: 'pk2', content: '', created_at: 2, tags: [], kind: 7 };
    subscribeFn({ event: fakeEvent });
    expect(onPacket).toHaveBeenCalledWith(fakeEvent, undefined);
  });

  it('passes relay hint (rawPacket.from) to onPacket', () => {
    const onPacket = vi.fn();
    startMergedSubscription(refs, filters, onPacket);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscribeFn = (refs.mergedStream.subscribe.mock.calls[0] as any)[0] as (
      p: unknown
    ) => void;
    const fakeEvent = { id: 'e3', pubkey: 'pk3', content: '', created_at: 3, tags: [], kind: 7 };
    subscribeFn({ event: fakeEvent, from: 'wss://relay2.test' });
    expect(onPacket).toHaveBeenCalledWith(fakeEvent, 'wss://relay2.test');
  });
});

// ---- startDeletionReconcile ----

describe('startDeletionReconcile', () => {
  let refs: ReturnType<typeof makeRefs>;

  beforeEach(() => {
    refs = makeRefs();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a backward req', () => {
    const ids = ['id-a', 'id-b'];
    startDeletionReconcile(refs, ids, vi.fn(), vi.fn());
    expect(refs.rxNostrMod.createRxBackwardReq).toHaveBeenCalledTimes(1);
  });

  it('emits chunks of at most 50 IDs', () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id-${i}`);
    startDeletionReconcile(refs, ids, vi.fn(), vi.fn());
    // 120 ids → 3 chunks (50, 50, 20)
    expect(refs.backward.emit).toHaveBeenCalledTimes(3);
  });

  it('includes DELETION_KIND (5) in emitted filter', () => {
    const ids = ['id-a'];
    startDeletionReconcile(refs, ids, vi.fn(), vi.fn());
    const [filter] = refs.backward.emit.mock.calls[0] as [Record<string, unknown>];
    expect(filter['kinds']).toEqual([5]);
  });

  it('includes cachedIds in #e filter field', () => {
    const ids = ['id-a', 'id-b'];
    startDeletionReconcile(refs, ids, vi.fn(), vi.fn());
    const [filter] = refs.backward.emit.mock.calls[0] as [Record<string, unknown>];
    expect(filter['#e']).toEqual(['id-a', 'id-b']);
  });

  it('calls backward.over after emitting all chunks', () => {
    startDeletionReconcile(refs, ['id-x'], vi.fn(), vi.fn());
    expect(refs.backward.over).toHaveBeenCalledTimes(1);
  });

  it('calls onDeletionEvent with packet.event from next', () => {
    const onDeletionEvent = vi.fn();

    const backwardPipe = { subscribe: vi.fn() };
    const backwardUse = { pipe: vi.fn(() => backwardPipe) };
    refs.rxNostr.use = vi.fn(() => backwardUse as never);

    startDeletionReconcile(refs, ['id-x'], onDeletionEvent, vi.fn());

    const observer = backwardPipe.subscribe.mock.calls[0][0] as {
      next: (p: unknown) => void;
    };
    const fakeEvent = { id: 'del-1', pubkey: 'pk', content: '', created_at: 5, tags: [], kind: 5 };
    observer.next({ event: fakeEvent });
    expect(onDeletionEvent).toHaveBeenCalledWith(fakeEvent);
  });

  it('calls onComplete when backward subscription completes (EOSE)', () => {
    const onComplete = vi.fn();

    const mockSub = { unsubscribe: vi.fn() };
    const backwardPipe = { subscribe: vi.fn(() => mockSub) };
    const backwardUse = { pipe: vi.fn(() => backwardPipe) };
    refs.rxNostr.use = vi.fn(() => backwardUse as never);

    startDeletionReconcile(refs, ['id-x'], vi.fn(), onComplete);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const observer = (backwardPipe.subscribe.mock.calls[0] as any)[0] as {
      complete: () => void;
    };
    observer.complete();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete only once even if complete fires multiple times', () => {
    const onComplete = vi.fn();

    const mockSub = { unsubscribe: vi.fn() };
    const backwardPipe = { subscribe: vi.fn(() => mockSub) };
    const backwardUse = { pipe: vi.fn(() => backwardPipe) };
    refs.rxNostr.use = vi.fn(() => backwardUse as never);

    startDeletionReconcile(refs, ['id-x'], vi.fn(), onComplete);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const observer = (backwardPipe.subscribe.mock.calls[0] as any)[0] as {
      complete: () => void;
    };
    observer.complete();
    observer.complete();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete after 5000ms timeout if EOSE never arrives', () => {
    const onComplete = vi.fn();
    startDeletionReconcile(refs, ['id-x'], vi.fn(), onComplete);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('returns { sub, timeout } object', () => {
    const result = startDeletionReconcile(refs, ['id-x'], vi.fn(), vi.fn());
    expect(result).toHaveProperty('sub');
    expect(result).toHaveProperty('timeout');
  });

  it('handles empty cachedIds without emitting', () => {
    startDeletionReconcile(refs, [], vi.fn(), vi.fn());
    expect(refs.backward.emit).not.toHaveBeenCalled();
    expect(refs.backward.over).toHaveBeenCalledTimes(1);
  });
});
