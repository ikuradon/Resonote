import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- hoisted mocks ----
const {
  createRxBackwardReqMock,
  getRxNostrMock,
  getEventsDBMock,
  extractFollowsMock,
  logInfoMock
} = vi.hoisted(() => {
  const makeReq = () => ({ emit: vi.fn(), over: vi.fn() });
  const makeSub = () => ({ unsubscribe: vi.fn() });

  // rxNostr.use(...).subscribe returns sub; we capture the observer so tests can drive it
  const capturedObservers: Array<{
    next?: (p: unknown) => void;
    complete?: () => void;
    error?: () => void;
  }> = [];

  const rxNostrInstance = {
    use: vi.fn().mockImplementation(() => ({
      subscribe: vi.fn().mockImplementation((obs) => {
        capturedObservers.push(obs);
        return makeSub();
      })
    }))
  };

  const createRxBackwardReqMock = vi.fn(() => makeReq());
  const getRxNostrMock = vi.fn(async () => rxNostrInstance);
  const eventsDB = { put: vi.fn() };
  const getEventsDBMock = vi.fn(async () => eventsDB);
  const extractFollowsMock = vi.fn((event: { tags: string[][] }) => {
    const follows = new Set<string>();
    for (const tag of event.tags) {
      if (tag[0] === 'p' && tag[1]) follows.add(tag[1]);
    }
    return follows;
  });
  const logInfoMock = vi.fn();

  return {
    createRxBackwardReqMock,
    getRxNostrMock,
    getEventsDBMock,
    extractFollowsMock,
    logInfoMock,
    _capturedObservers: capturedObservers,
    _rxNostrInstance: rxNostrInstance
  };
});

vi.mock('rx-nostr', () => ({
  createRxBackwardReq: createRxBackwardReqMock
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getRxNostr: getRxNostrMock,
  getEventsDB: getEventsDBMock
}));

vi.mock('../domain/follow-model.js', () => ({
  extractFollows: extractFollowsMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

import { fetchWot } from './wot-fetcher.js';

// ---- helpers ----

function makeCallbacks(
  overrides: Partial<{
    onDirectFollows: (f: Set<string>) => void;
    onWotProgress: (c: number) => void;
    isCancelled: () => boolean;
  }> = {}
) {
  return {
    onDirectFollows: vi.fn(),
    onWotProgress: vi.fn(),
    isCancelled: vi.fn(() => false),
    ...overrides
  };
}

// ---- tests ----

describe('fetchWot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves with directFollows and wot sets', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'my-pubkey';
    const FOLLOW1 = 'follow-pk-1';
    const FOLLOW2 = 'follow-pk-2';

    const directFollowEvent = {
      tags: [
        ['p', FOLLOW1],
        ['p', FOLLOW2]
      ],
      created_at: 100
    };
    const wotEvent = {
      tags: [['p', 'wot-pk-1']],
      created_at: 200
    };

    // We need to orchestrate the two sequential backward reqs.
    // Use a custom sequence driven by resolving promises manually.
    const observerSeq: Array<{
      next?: (p: unknown) => void;
      complete?: () => void;
    }> = [];

    const rxNostrInstance = await getRxNostrMock();
    (rxNostrInstance as { use: ReturnType<typeof vi.fn> }).use.mockImplementation(() => ({
      subscribe: vi
        .fn()
        .mockImplementation((obs: { next?: (p: unknown) => void; complete?: () => void }) => {
          observerSeq.push(obs);
          return { unsubscribe: vi.fn() };
        })
    }));

    const promise = fetchWot(MY_PUBKEY, callbacks);

    // Tick to let the first async chain run until the first subscribe
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // Drive step 1: direct follows
    expect(observerSeq.length).toBeGreaterThanOrEqual(1);
    observerSeq[0].next?.({ event: directFollowEvent });
    await new Promise<void>((r) => setImmediate(r));
    observerSeq[0].complete?.();
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // Drive step 2: wot follow events
    expect(observerSeq.length).toBeGreaterThanOrEqual(2);
    observerSeq[1].next?.({ event: wotEvent });
    await new Promise<void>((r) => setImmediate(r));
    observerSeq[1].complete?.();
    await new Promise<void>((r) => setImmediate(r));

    const result = await promise;

    expect(result.directFollows).toEqual(new Set([FOLLOW1, FOLLOW2]));
    expect(result.wot.has(FOLLOW1)).toBe(true);
    expect(result.wot.has(FOLLOW2)).toBe(true);
    expect(result.wot.has('wot-pk-1')).toBe(true);
    // own pubkey is always in wot
    expect(result.wot.has(MY_PUBKEY)).toBe(true);
  });

  it('calls onDirectFollows callback after step 1 completes', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'my-pubkey-2';
    const FOLLOW1 = 'f1';

    const observerSeq: Array<{
      next?: (p: unknown) => void;
      complete?: () => void;
    }> = [];

    const rxNostrInstance = await getRxNostrMock();
    (rxNostrInstance as { use: ReturnType<typeof vi.fn> }).use.mockImplementation(() => ({
      subscribe: vi
        .fn()
        .mockImplementation((obs: { next?: (p: unknown) => void; complete?: () => void }) => {
          observerSeq.push(obs);
          return { unsubscribe: vi.fn() };
        })
    }));

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // Step 1
    observerSeq[0].next?.({ event: { tags: [['p', FOLLOW1]], created_at: 1 } });
    observerSeq[0].complete?.();
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect(callbacks.onDirectFollows).toHaveBeenCalledWith(new Set([FOLLOW1]));

    // Complete step 2 so the promise resolves
    expect(observerSeq.length).toBeGreaterThanOrEqual(2);
    observerSeq[1].complete?.();
    await promise;
  });

  it('calls onWotProgress when 2nd-hop events arrive', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'my-pubkey-3';
    const FOLLOW1 = 'f-prog-1';

    const observerSeq: Array<{
      next?: (p: unknown) => void;
      complete?: () => void;
    }> = [];

    const rxNostrInstance = await getRxNostrMock();
    (rxNostrInstance as { use: ReturnType<typeof vi.fn> }).use.mockImplementation(() => ({
      subscribe: vi
        .fn()
        .mockImplementation((obs: { next?: (p: unknown) => void; complete?: () => void }) => {
          observerSeq.push(obs);
          return { unsubscribe: vi.fn() };
        })
    }));

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    observerSeq[0].next?.({ event: { tags: [['p', FOLLOW1]], created_at: 1 } });
    observerSeq[0].complete?.();
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // 2nd hop: emit wot event
    observerSeq[1].next?.({ event: { tags: [['p', 'wot-x']], created_at: 2 } });
    await new Promise<void>((r) => setImmediate(r));

    expect(callbacks.onWotProgress).toHaveBeenCalled();

    observerSeq[1].complete?.();
    await promise;
  });

  it('returns early when isCancelled returns true after step 1', async () => {
    // isCancelled becomes true after direct follows loaded
    let cancelOnNext = false;
    const callbacks = makeCallbacks({
      isCancelled: vi.fn(() => cancelOnNext)
    });
    const MY_PUBKEY = 'my-pubkey-4';
    const FOLLOW1 = 'f-cancel';

    const observerSeq: Array<{
      next?: (p: unknown) => void;
      complete?: () => void;
    }> = [];

    const rxNostrInstance = await getRxNostrMock();
    (rxNostrInstance as { use: ReturnType<typeof vi.fn> }).use.mockImplementation(() => ({
      subscribe: vi
        .fn()
        .mockImplementation((obs: { next?: (p: unknown) => void; complete?: () => void }) => {
          observerSeq.push(obs);
          return { unsubscribe: vi.fn() };
        })
    }));

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // Set cancel flag before completing step 1
    cancelOnNext = true;
    observerSeq[0].next?.({ event: { tags: [['p', FOLLOW1]], created_at: 1 } });
    observerSeq[0].complete?.();
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    const result = await promise;

    // Should return early: wot equals directFollows (no 2nd hop)
    expect(result.directFollows).toEqual(new Set([FOLLOW1]));
    expect(result.wot).toEqual(result.directFollows);
    // Step 2 subscription should NOT have been started
    expect(observerSeq.length).toBe(1);
  });

  it('returns directFollows as empty Set and wot as {pubkey} when no follows found', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'lonely-pubkey';

    const observerSeq: Array<{
      next?: (p: unknown) => void;
      complete?: () => void;
    }> = [];

    const rxNostrInstance = await getRxNostrMock();
    (rxNostrInstance as { use: ReturnType<typeof vi.fn> }).use.mockImplementation(() => ({
      subscribe: vi
        .fn()
        .mockImplementation((obs: { next?: (p: unknown) => void; complete?: () => void }) => {
          observerSeq.push(obs);
          return { unsubscribe: vi.fn() };
        })
    }));

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // No events — just complete
    observerSeq[0].complete?.();
    await new Promise<void>((r) => setImmediate(r));

    const result = await promise;

    expect(result.directFollows.size).toBe(0);
    expect(result.wot).toEqual(new Set([MY_PUBKEY]));
    // No 2nd-hop subscription when directFollows is empty
    expect(observerSeq.length).toBe(1);
  });

  it('resolves directFollows even when step 1 errors', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'err-pubkey';
    const FOLLOW1 = 'f-err';

    const observerSeq: Array<{
      next?: (p: unknown) => void;
      complete?: () => void;
      error?: () => void;
    }> = [];

    const rxNostrInstance = await getRxNostrMock();
    (rxNostrInstance as { use: ReturnType<typeof vi.fn> }).use.mockImplementation(() => ({
      subscribe: vi
        .fn()
        .mockImplementation(
          (obs: { next?: (p: unknown) => void; complete?: () => void; error?: () => void }) => {
            observerSeq.push(obs);
            return { unsubscribe: vi.fn() };
          }
        )
    }));

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    observerSeq[0].next?.({ event: { tags: [['p', FOLLOW1]], created_at: 1 } });
    observerSeq[0].error?.();
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect(observerSeq.length).toBeGreaterThanOrEqual(2);
    observerSeq[1].complete?.();
    await new Promise<void>((r) => setImmediate(r));

    const result = await promise;
    expect(result.directFollows).toEqual(new Set([FOLLOW1]));
  });

  it('stores events in eventsDB during step 1', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'db-pubkey';
    const eventsDB = await getEventsDBMock();
    const event = { tags: [['p', 'f1']], created_at: 1 };

    const observerSeq: Array<{
      next?: (p: unknown) => void;
      complete?: () => void;
    }> = [];

    const rxNostrInstance = await getRxNostrMock();
    (rxNostrInstance as { use: ReturnType<typeof vi.fn> }).use.mockImplementation(() => ({
      subscribe: vi
        .fn()
        .mockImplementation((obs: { next?: (p: unknown) => void; complete?: () => void }) => {
          observerSeq.push(obs);
          return { unsubscribe: vi.fn() };
        })
    }));

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    observerSeq[0].next?.({ event });
    observerSeq[0].complete?.();
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect(eventsDB.put).toHaveBeenCalledWith(event);

    observerSeq[1]?.complete?.();
    await promise;
  });

  it('picks the latest event by created_at as directFollows source', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'latest-pubkey';
    const olderEvent = { tags: [['p', 'old-follow']], created_at: 50 };
    const newerEvent = { tags: [['p', 'new-follow']], created_at: 200 };

    const observerSeq: Array<{
      next?: (p: unknown) => void;
      complete?: () => void;
    }> = [];

    const rxNostrInstance = await getRxNostrMock();
    (rxNostrInstance as { use: ReturnType<typeof vi.fn> }).use.mockImplementation(() => ({
      subscribe: vi
        .fn()
        .mockImplementation((obs: { next?: (p: unknown) => void; complete?: () => void }) => {
          observerSeq.push(obs);
          return { unsubscribe: vi.fn() };
        })
    }));

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // Deliver older first, then newer
    observerSeq[0].next?.({ event: olderEvent });
    observerSeq[0].next?.({ event: newerEvent });
    observerSeq[0].complete?.();
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect(observerSeq.length).toBeGreaterThanOrEqual(2);
    observerSeq[1].complete?.();
    const result = await promise;

    expect(result.directFollows).toEqual(new Set(['new-follow']));
  });
});
