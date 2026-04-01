import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- hoisted mocks ----
const {
  fetchLatestMock,
  getRxNostrMock,
  createSyncedQueryMock,
  extractFollowsMock,
  logInfoMock,
  getStoreAsyncMock
} = vi.hoisted(() => {
  return {
    fetchLatestMock: vi.fn(),
    getRxNostrMock: vi.fn(async () => ({})),
    createSyncedQueryMock: vi.fn(),
    getStoreAsyncMock: vi.fn().mockResolvedValue({
      getSync: vi.fn().mockResolvedValue([]),
      fetchById: vi.fn().mockResolvedValue(null),
      dispose: vi.fn()
    }),
    extractFollowsMock: vi.fn((event: { tags: string[][] }) => {
      const follows = new Set<string>();
      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1]) follows.add(tag[1]);
      }
      return follows;
    }),
    logInfoMock: vi.fn()
  };
});

vi.mock('$shared/nostr/store.js', () => ({
  fetchLatest: fetchLatestMock,
  getStoreAsync: getStoreAsyncMock
}));

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: getRxNostrMock
}));

vi.mock('@ikuradon/auftakt/sync', () => ({
  createSyncedQuery: createSyncedQueryMock
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

    // Step 1: fetchLatest returns the direct follow event
    fetchLatestMock.mockResolvedValue({
      tags: [
        ['p', FOLLOW1],
        ['p', FOLLOW2]
      ],
      created_at: 100
    });

    // Step 2: createSyncedQuery for 2nd-hop
    const wotEventsSubject = new BehaviorSubject<unknown[]>([]);
    const statusSubject = new BehaviorSubject<string>('cached');
    createSyncedQueryMock.mockReturnValue({
      events$: wotEventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: vi.fn()
    });

    const promise = fetchWot(MY_PUBKEY, callbacks);

    // Wait for async to proceed
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // Push 2nd-hop events
    wotEventsSubject.next([
      {
        event: { tags: [['p', 'wot-pk-1']], created_at: 200 },
        seenOn: ['wss://relay.test'],
        firstSeen: Date.now()
      }
    ]);
    statusSubject.next('complete');

    const result = await promise;

    expect(result.directFollows).toEqual(new Set([FOLLOW1, FOLLOW2]));
    expect(result.wot.has(FOLLOW1)).toBe(true);
    expect(result.wot.has(FOLLOW2)).toBe(true);
    expect(result.wot.has('wot-pk-1')).toBe(true);
    expect(result.wot.has(MY_PUBKEY)).toBe(true);
  });

  it('calls onDirectFollows callback after step 1 completes', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'my-pubkey-2';
    const FOLLOW1 = 'f1';

    fetchLatestMock.mockResolvedValue({
      tags: [['p', FOLLOW1]],
      created_at: 1
    });

    // 2nd-hop query: use status completion to resolve
    const wotEventsSubject = new Subject<unknown[]>();
    const statusSubject = new BehaviorSubject<string>('cached');
    createSyncedQueryMock.mockReturnValue({
      events$: wotEventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: vi.fn()
    });

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect(callbacks.onDirectFollows).toHaveBeenCalledWith(new Set([FOLLOW1]));

    statusSubject.next('complete');

    await promise;
  });

  it('calls onWotProgress when 2nd-hop events arrive', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'my-pubkey-3';
    const FOLLOW1 = 'f-prog-1';

    fetchLatestMock.mockResolvedValue({
      tags: [['p', FOLLOW1]],
      created_at: 1
    });

    const wotEventsSubject = new BehaviorSubject<unknown[]>([]);
    const statusSubject = new BehaviorSubject<string>('cached');
    createSyncedQueryMock.mockReturnValue({
      events$: wotEventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: vi.fn()
    });

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // 2nd hop: emit wot event
    wotEventsSubject.next([
      {
        event: { tags: [['p', 'wot-x']], created_at: 2 },
        seenOn: ['wss://relay.test'],
        firstSeen: Date.now()
      }
    ]);
    statusSubject.next('complete');

    await promise;
    expect(callbacks.onWotProgress).toHaveBeenCalled();
  });

  it('uses the final accumulated snapshot when backward query completes', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'my-pubkey-final';
    const FOLLOW1 = 'f-final-1';

    fetchLatestMock.mockResolvedValue({
      tags: [['p', FOLLOW1]],
      created_at: 1
    });

    const wotEventsSubject = new BehaviorSubject<unknown[]>([]);
    const statusSubject = new BehaviorSubject<string>('cached');
    createSyncedQueryMock.mockReturnValue({
      events$: wotEventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: vi.fn()
    });

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    wotEventsSubject.next([
      {
        event: { tags: [['p', 'wot-first']], created_at: 2 },
        seenOn: ['wss://relay.test'],
        firstSeen: Date.now()
      }
    ]);
    wotEventsSubject.next([
      {
        event: { tags: [['p', 'wot-first']], created_at: 2 },
        seenOn: ['wss://relay.test'],
        firstSeen: Date.now()
      },
      {
        event: { tags: [['p', 'wot-second']], created_at: 3 },
        seenOn: ['wss://relay.test'],
        firstSeen: Date.now()
      }
    ]);
    statusSubject.next('complete');

    const result = await promise;

    expect(result.wot.has('wot-first')).toBe(true);
    expect(result.wot.has('wot-second')).toBe(true);
  });

  it('treats backward completion without events emissions as an empty batch', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'my-pubkey-empty';
    const FOLLOW1 = 'f-empty-1';

    fetchLatestMock.mockResolvedValue({
      tags: [['p', FOLLOW1]],
      created_at: 1
    });

    const wotEventsSubject = new Subject<unknown[]>();
    const statusSubject = new BehaviorSubject<string>('cached');
    createSyncedQueryMock.mockReturnValue({
      events$: wotEventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: vi.fn()
    });

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    statusSubject.next('complete');

    const result = await promise;

    expect(result.directFollows).toEqual(new Set([FOLLOW1]));
    expect(result.wot).toEqual(new Set([FOLLOW1, MY_PUBKEY]));
  });

  it('returns early when isCancelled returns true after step 1', async () => {
    let cancelOnNext = false;
    const callbacks = makeCallbacks({
      isCancelled: vi.fn(() => cancelOnNext)
    });
    const MY_PUBKEY = 'my-pubkey-4';
    const FOLLOW1 = 'f-cancel';

    // Set cancel flag before fetchLatest resolves
    fetchLatestMock.mockImplementation(async () => {
      cancelOnNext = true;
      return {
        tags: [['p', FOLLOW1]],
        created_at: 1
      };
    });

    const result = await fetchWot(MY_PUBKEY, callbacks);

    // Should return early: wot equals directFollows (no 2nd hop)
    expect(result.directFollows).toEqual(new Set([FOLLOW1]));
    expect(result.wot).toEqual(result.directFollows);
    // createSyncedQuery should NOT have been called
    expect(createSyncedQueryMock).not.toHaveBeenCalled();
  });

  it('returns directFollows as empty Set and wot as {pubkey} when no follows found', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'lonely-pubkey';

    fetchLatestMock.mockResolvedValue(null);

    const result = await fetchWot(MY_PUBKEY, callbacks);

    expect(result.directFollows.size).toBe(0);
    expect(result.wot).toEqual(new Set([MY_PUBKEY]));
    // No 2nd-hop subscription when directFollows is empty
    expect(createSyncedQueryMock).not.toHaveBeenCalled();
  });

  it('picks the latest event by created_at as directFollows source', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'latest-pubkey';

    // fetchLatest returns the latest event (already handles dedup)
    fetchLatestMock.mockResolvedValue({
      tags: [['p', 'new-follow']],
      created_at: 200
    });

    // 2nd-hop query: use status completion to resolve
    const wotEventsSubject = new Subject<unknown[]>();
    const statusSubject = new BehaviorSubject<string>('cached');
    createSyncedQueryMock.mockReturnValue({
      events$: wotEventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: vi.fn()
    });

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    statusSubject.next('complete');

    const result = await promise;

    expect(result.directFollows).toEqual(new Set(['new-follow']));
  });

  it('starts 2nd-hop batches in parallel when direct follows exceed one batch', async () => {
    const callbacks = makeCallbacks();
    const MY_PUBKEY = 'parallel-pubkey';
    const follows = Array.from({ length: 101 }, (_, i) => `follow-${i}`);

    fetchLatestMock.mockResolvedValue({
      tags: follows.map((follow) => ['p', follow]),
      created_at: 1
    });

    const firstBatchEvents$ = new Subject<unknown[]>();
    const secondBatchEvents$ = new Subject<unknown[]>();
    const firstBatchStatus$ = new BehaviorSubject<string>('cached');
    const secondBatchStatus$ = new BehaviorSubject<string>('cached');
    createSyncedQueryMock
      .mockReturnValueOnce({
        events$: firstBatchEvents$.asObservable(),
        status$: firstBatchStatus$.asObservable(),
        emit: vi.fn(),
        dispose: vi.fn()
      })
      .mockReturnValueOnce({
        events$: secondBatchEvents$.asObservable(),
        status$: secondBatchStatus$.asObservable(),
        emit: vi.fn(),
        dispose: vi.fn()
      });

    const promise = fetchWot(MY_PUBKEY, callbacks);

    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect(createSyncedQueryMock).toHaveBeenCalledTimes(2);

    firstBatchStatus$.next('complete');
    secondBatchStatus$.next('complete');

    await promise;
  });
});
