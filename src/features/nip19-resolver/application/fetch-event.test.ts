import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

interface SubscriberCallbacks {
  next: (packet: unknown) => void;
  complete: () => void;
  error: (err: unknown) => void;
}

const { createRxBackwardReqMock, getRxNostrMock } = vi.hoisted(() => {
  const createRxBackwardReqMock = vi.fn();
  const getRxNostrMock = vi.fn();
  return { createRxBackwardReqMock, getRxNostrMock };
});

vi.mock('rx-nostr', () => ({
  createRxBackwardReq: createRxBackwardReqMock
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getRxNostr: getRxNostrMock
}));

import { fetchNostrEvent } from './fetch-event.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake rxNostr instance. The `resolveCallbacks` promise resolves
 * with the subscriber callbacks once rxNostr.use().subscribe() is called,
 * which happens inside fetchNostrEvent after the async getRxNostr() resolves.
 */
function makeFakeRxNostr() {
  let resolveCallbacks!: (cbs: SubscriberCallbacks) => void;
  const callbacksReady = new Promise<SubscriberCallbacks>((resolve) => {
    resolveCallbacks = resolve;
  });

  let capturedUseOptions: unknown;
  const subscription = { unsubscribe: vi.fn() };

  const use = vi.fn((_req: unknown, opts?: unknown) => {
    capturedUseOptions = opts;
    return {
      subscribe: (cbs: SubscriberCallbacks) => {
        resolveCallbacks(cbs);
        return subscription;
      }
    };
  });

  const simulate = {
    get capturedUseOptions() {
      return capturedUseOptions;
    },
    /** Wait for subscribe() to be called, then emit an event packet. */
    async emitEvent(event: unknown) {
      const cbs = await callbacksReady;
      cbs.next({ event });
    },
    /** Wait for subscribe() to be called, then complete the observable. */
    async complete() {
      const cbs = await callbacksReady;
      cbs.complete();
    },
    /** Wait for subscribe() to be called, then error the observable. */
    async error(err: unknown) {
      const cbs = await callbacksReady;
      cbs.error(err);
    }
  };

  return { rxNostr: { use }, simulate, subscription };
}

/**
 * Build a minimal fake backward-req with emit() and over().
 */
function makeFakeReq() {
  return { emit: vi.fn(), over: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchNostrEvent', () => {
  it('returns the event provided by the relay', async () => {
    const { rxNostr, simulate } = makeFakeRxNostr();
    getRxNostrMock.mockResolvedValue(rxNostr);
    createRxBackwardReqMock.mockReturnValue(makeFakeReq());

    const fetchPromise = fetchNostrEvent('event-id-1', []);

    // Simulate relay responding then completing
    await simulate.emitEvent({ kind: 1111, tags: [['I', 'spotify:track:abc']], content: 'hello' });
    await simulate.complete();

    const result = await fetchPromise;
    expect(result).toEqual({ kind: 1111, tags: [['I', 'spotify:track:abc']], content: 'hello' });
  });

  it('returns null when the relay provides no event before EOSE', async () => {
    const { rxNostr, simulate } = makeFakeRxNostr();
    getRxNostrMock.mockResolvedValue(rxNostr);
    createRxBackwardReqMock.mockReturnValue(makeFakeReq());

    const fetchPromise = fetchNostrEvent('event-id-2', []);

    // EOSE without any event
    await simulate.complete();

    const result = await fetchPromise;
    expect(result).toBeNull();
  });

  it('returns null on timeout (fake timers)', async () => {
    vi.useFakeTimers();

    const { rxNostr } = makeFakeRxNostr();
    getRxNostrMock.mockResolvedValue(rxNostr);
    createRxBackwardReqMock.mockReturnValue(makeFakeReq());

    // Do NOT call simulate.complete() — let the timeout fire
    const fetchPromise = fetchNostrEvent('event-id-3', []);

    await vi.advanceTimersByTimeAsync(10_001);

    const result = await fetchPromise;
    expect(result).toBeNull();
  });

  it('passes temporary relay options when hints are provided', async () => {
    const { rxNostr, simulate } = makeFakeRxNostr();
    getRxNostrMock.mockResolvedValue(rxNostr);
    createRxBackwardReqMock.mockReturnValue(makeFakeReq());

    const hints = ['wss://relay.example.com', 'wss://relay2.example.com'];
    const fetchPromise = fetchNostrEvent('event-id-4', hints);

    await simulate.complete();
    await fetchPromise;

    // use() must have been called with the temporary relay options
    expect(rxNostr.use).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        on: expect.objectContaining({
          relays: hints,
          defaultReadRelays: true
        })
      })
    );
  });

  it('passes no use options when relayHints is empty', async () => {
    const { rxNostr, simulate } = makeFakeRxNostr();
    getRxNostrMock.mockResolvedValue(rxNostr);
    createRxBackwardReqMock.mockReturnValue(makeFakeReq());

    const fetchPromise = fetchNostrEvent('event-id-5', []);
    await simulate.complete();
    await fetchPromise;

    // Second argument to use() should be undefined
    expect(rxNostr.use).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it('emits the correct filter via req.emit()', async () => {
    const { rxNostr, simulate } = makeFakeRxNostr();
    getRxNostrMock.mockResolvedValue(rxNostr);
    const req = makeFakeReq();
    createRxBackwardReqMock.mockReturnValue(req);

    const fetchPromise = fetchNostrEvent('my-event-id', []);
    await simulate.complete();
    await fetchPromise;

    expect(req.emit).toHaveBeenCalledWith({ ids: ['my-event-id'] });
    expect(req.over).toHaveBeenCalled();
  });

  it('resolves with found event even when observable errors', async () => {
    const { rxNostr, simulate } = makeFakeRxNostr();
    getRxNostrMock.mockResolvedValue(rxNostr);
    createRxBackwardReqMock.mockReturnValue(makeFakeReq());

    const fetchPromise = fetchNostrEvent('event-id-6', []);

    // Emit an event then trigger an error
    await simulate.emitEvent({ kind: 1111, tags: [], content: 'partial' });
    await simulate.error(new Error('relay error'));

    const result = await fetchPromise;
    expect(result).toEqual({ kind: 1111, tags: [], content: 'partial' });
  });
});
