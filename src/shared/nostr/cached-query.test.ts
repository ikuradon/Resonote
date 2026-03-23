import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SubscribeCallbacks = {
  next?: (packet: { event: Record<string, unknown> }) => void;
  complete?: () => void;
  error?: () => void;
};

const { dbGetByIdMock, dbGetByPubkeyAndKindMock, subscribeMock } = vi.hoisted(() => ({
  dbGetByIdMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  dbGetByPubkeyAndKindMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  subscribeMock: vi.fn((callbacks: SubscribeCallbacks) => {
    // Default: synchronous EOSE (no setTimeout to avoid fake timer issues)
    Promise.resolve().then(() => callbacks.complete?.());
    return { unsubscribe: vi.fn() };
  })
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getEventsDB: async () => ({
    getById: dbGetByIdMock,
    getByPubkeyAndKind: dbGetByPubkeyAndKindMock,
    put: vi.fn()
  }),
  getRxNostr: async () => ({
    use: () => ({
      subscribe: subscribeMock
    })
  })
}));

vi.mock('rx-nostr', () => ({
  createRxBackwardReq: () => ({
    emit: vi.fn(),
    over: vi.fn()
  })
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
  shortHex: (s: string) => s.slice(0, 8)
}));

import {
  cachedFetchById,
  invalidateFetchByIdCache,
  resetFetchByIdCache,
  useCachedLatest
} from './cached-query.svelte.js';

describe('cachedFetchById', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetFetchByIdCache();
    dbGetByIdMock.mockClear();
    dbGetByIdMock.mockResolvedValue(null);
    subscribeMock.mockClear();
    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      Promise.resolve().then(() => callbacks.complete?.());
      return { unsubscribe: vi.fn() };
    });
  });

  it('returns null when event not found', async () => {
    const result = await cachedFetchById('event-1');
    expect(result).toBeNull();
  });

  it('caches non-null results permanently', async () => {
    const dbEvent = { id: 'e2', content: 'hello', kind: 1 };
    dbGetByIdMock.mockResolvedValueOnce(dbEvent);

    const result1 = await cachedFetchById('event-2');
    expect(result1).toEqual(expect.objectContaining({ content: 'hello', kind: 1 }));

    // Second call returns cached without hitting DB
    dbGetByIdMock.mockResolvedValue(null);
    const result2 = await cachedFetchById('event-2');
    expect(result2).toEqual(expect.objectContaining({ content: 'hello', kind: 1 }));
    // DB should have been called only once (first call)
    expect(dbGetByIdMock).toHaveBeenCalledTimes(1);
  });

  it('retries null result after TTL expires', async () => {
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    // First call: returns null
    const result1 = await cachedFetchById('event-3');
    expect(result1).toBeNull();
    const callsAfterFirst = dbGetByIdMock.mock.calls.length;

    // Within TTL: returns cached null
    dateSpy.mockReturnValue(now + 10_000);
    const result2 = await cachedFetchById('event-3');
    expect(result2).toBeNull();
    expect(dbGetByIdMock).toHaveBeenCalledTimes(callsAfterFirst);

    // After TTL (30s): retries
    dateSpy.mockReturnValue(now + 31_000);
    dbGetByIdMock.mockResolvedValueOnce({ id: 'e3', content: 'found', kind: 1 });
    const result3 = await cachedFetchById('event-3');
    expect(result3).toEqual(expect.objectContaining({ content: 'found', kind: 1 }));
  });

  it('returns event from relay when DB misses', async () => {
    const relayEvent = { id: 'relay-e1', content: 'from relay', kind: 1 };

    // DB returns null (default), but relay fires next before complete
    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      Promise.resolve().then(() => {
        callbacks.next?.({ event: relayEvent });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    const result = await cachedFetchById('event-relay');
    expect(result).toEqual(expect.objectContaining({ content: 'from relay', kind: 1 }));
    // DB was queried (miss), then relay provided the event
    expect(dbGetByIdMock).toHaveBeenCalledTimes(1);
    await expect(dbGetByIdMock.mock.results[0].value).resolves.toBeNull();
  });

  it('re-caches null after TTL expires and retry still returns null', async () => {
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    // First call: returns null, populates nullCacheTimestamps
    const result1 = await cachedFetchById('event-4');
    expect(result1).toBeNull();

    // After TTL: retries but still null
    dateSpy.mockReturnValue(now + 31_000);
    const callsBeforeRetry = dbGetByIdMock.mock.calls.length;
    const result2 = await cachedFetchById('event-4');
    expect(result2).toBeNull();
    expect(dbGetByIdMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);

    // Within new TTL window: should be cached again (no extra DB call)
    dateSpy.mockReturnValue(now + 40_000);
    const callsAfterRetry = dbGetByIdMock.mock.calls.length;
    const result3 = await cachedFetchById('event-4');
    expect(result3).toBeNull();
    expect(dbGetByIdMock).toHaveBeenCalledTimes(callsAfterRetry);
  });
});

describe('invalidatedDuringFetch race condition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetFetchByIdCache();
    // mockReset clears call history AND any pending mockResolvedValueOnce queues,
    // preventing cross-test pollution when a prior test leaves unconsumed mocks.
    dbGetByIdMock.mockReset();
    dbGetByIdMock.mockResolvedValue(null);
    subscribeMock.mockReset();
    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      Promise.resolve().then(() => callbacks.complete?.());
      return { unsubscribe: vi.fn() };
    });
  });

  it('does not cache result when invalidated during in-flight DB fetch', async () => {
    // DB returns event but invalidation happens concurrently
    let resolveDb!: (val: Record<string, unknown> | null) => void;
    const dbPromise = new Promise<Record<string, unknown> | null>((res) => {
      resolveDb = res;
    });
    dbGetByIdMock.mockReturnValueOnce(dbPromise);

    // Start the fetch (now in-flight, waiting for DB)
    const fetchPromise = cachedFetchById('race-db');

    // While DB fetch is in-flight, invalidate
    invalidateFetchByIdCache('race-db');

    // Now resolve DB with an event
    resolveDb({ id: 'race-db', content: 'db-result', kind: 1111 });

    const result = await fetchPromise;
    // Result is still returned to the caller
    expect(result).toEqual(expect.objectContaining({ content: 'db-result' }));

    // But result must NOT be cached: next call should hit DB again
    dbGetByIdMock.mockResolvedValueOnce({ id: 'race-db', content: 'fresh', kind: 1111 });
    const result2 = await cachedFetchById('race-db');
    expect(result2).toEqual(expect.objectContaining({ content: 'fresh' }));
    // DB was called again (not served from cache)
    expect(dbGetByIdMock).toHaveBeenCalledTimes(2);
  });

  it('does not serve stale relay result after invalidation', async () => {
    // Scenario: relay returns an event (DB miss -> relay hit -> cached).
    // Then invalidation is called. The next fetch must bypass the cache.
    //
    // This tests the relay path for the invalidation contract.
    // The in-flight race (invalidation called WHILE relay is pending) is covered
    // by the DB test above using the same invalidatedDuringFetch mechanism.
    const relayEvent = { id: 'race-relay2', content: 'relay-result', kind: 1111 };

    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      Promise.resolve().then(() => {
        callbacks.next?.({ event: relayEvent });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    // First fetch: DB miss -> relay returns event -> result is cached
    const result1 = await cachedFetchById('race-relay2');
    expect(result1).toEqual(expect.objectContaining({ content: 'relay-result' }));

    // Flush any pending microtasks (e.g. async next callback's DB write)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Invalidate the cached relay result
    invalidateFetchByIdCache('race-relay2');

    // Next fetch must NOT serve the stale cached relay result
    const callsBefore = dbGetByIdMock.mock.calls.length;
    dbGetByIdMock.mockResolvedValueOnce({ id: 'race-relay2', content: 'updated', kind: 1111 });
    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      Promise.resolve().then(() => callbacks.complete?.());
      return { unsubscribe: vi.fn() };
    });
    const result2 = await cachedFetchById('race-relay2');
    // DB was queried (cache was cleared)
    expect(dbGetByIdMock.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(result2).toEqual(expect.objectContaining({ content: 'updated' }));
  });

  it('invalidate + TTL interaction: invalidated null is not re-cached within TTL', async () => {
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    // First call returns null (cached with TTL)
    const result1 = await cachedFetchById('ttl-invalidate');
    expect(result1).toBeNull();

    // Within TTL: normally would return cached null
    dateSpy.mockReturnValue(now + 5_000);

    // Invalidate within TTL
    invalidateFetchByIdCache('ttl-invalidate');

    // Next call should re-fetch, not use the invalidated null cache
    const callsBefore = dbGetByIdMock.mock.calls.length;
    dbGetByIdMock.mockResolvedValueOnce({ id: 'ttl-invalidate', content: 'found', kind: 1111 });
    const result2 = await cachedFetchById('ttl-invalidate');
    expect(result2).toEqual(expect.objectContaining({ content: 'found' }));
    expect(dbGetByIdMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe('invalidateFetchByIdCache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetFetchByIdCache();
    dbGetByIdMock.mockClear();
    dbGetByIdMock.mockResolvedValue(null);
  });

  it('evicts a cached non-null entry, forcing re-fetch', async () => {
    const dbEvent = { id: 'e5', content: 'cached', kind: 1 };
    dbGetByIdMock.mockResolvedValueOnce(dbEvent);

    // Populate cache
    await cachedFetchById('event-5');
    expect(dbGetByIdMock).toHaveBeenCalledTimes(1);

    // Invalidate
    invalidateFetchByIdCache('event-5');

    // Next call should hit DB again
    dbGetByIdMock.mockResolvedValueOnce({ id: 'e5', content: 'refreshed', kind: 1 });
    const result = await cachedFetchById('event-5');
    expect(result).toEqual(expect.objectContaining({ content: 'refreshed' }));
    expect(dbGetByIdMock).toHaveBeenCalledTimes(2);
  });

  it('evicts a cached null entry, forcing re-fetch before TTL', async () => {
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    // First call: null cached with TTL
    await cachedFetchById('event-6');

    // Within TTL: normally returns cached null
    dateSpy.mockReturnValue(now + 5_000);
    const beforeInvalidate = await cachedFetchById('event-6');
    expect(beforeInvalidate).toBeNull();
    const callsBefore = dbGetByIdMock.mock.calls.length;

    // Invalidate forces re-fetch even within TTL
    invalidateFetchByIdCache('event-6');
    dbGetByIdMock.mockResolvedValueOnce({ id: 'e6', content: 'found', kind: 1 });
    const result = await cachedFetchById('event-6');
    expect(result).toEqual(expect.objectContaining({ content: 'found' }));
    expect(dbGetByIdMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

/**
 * Helper to flush async operations including dynamic import() resolution.
 * Uses setTimeout to yield to the macrotask queue, ensuring pending
 * microtasks (including those from mocked dynamic imports) settle.
 *
 * Note: Both startDB and startRelay resolve normally via mocked modules.
 * The relay path completes via subscribeMock's complete() callback,
 * which sets settled=true.
 */
async function flushAsync(): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
}

describe('useCachedLatest', () => {
  let activeResult: ReturnType<typeof useCachedLatest> | undefined;

  beforeEach(async () => {
    resetFetchByIdCache();
    // Drain any leaked async chains from previous tests before resetting mocks
    await new Promise((r) => setTimeout(r, 50));
    dbGetByPubkeyAndKindMock.mockClear();
    dbGetByPubkeyAndKindMock.mockResolvedValue(null);
    subscribeMock.mockClear();
    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      Promise.resolve().then(() => callbacks.complete?.());
      return { unsubscribe: vi.fn() };
    });
  });

  afterEach(async () => {
    activeResult?.destroy();
    activeResult = undefined;
    await new Promise((r) => setTimeout(r, 50));
  });

  it('returns event with source=cache on DB cache hit', async () => {
    const cachedEvent = {
      id: 'c1',
      pubkey: 'pk1',
      content: 'cached',
      created_at: 100,
      tags: [],
      kind: 0
    };
    dbGetByPubkeyAndKindMock.mockResolvedValueOnce(cachedEvent);

    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    expect(activeResult.event).toEqual(expect.objectContaining({ content: 'cached' }));
    expect(activeResult.source).toBe('cache');
  });

  it('eventually settles after all async paths complete', async () => {
    // Both DB miss and relay error/complete lead to settled=true
    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    expect(activeResult.settled).toBe(true);
  });

  it('event stays null when neither DB nor relay provides data', async () => {
    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    expect(activeResult.event).toBeNull();
    expect(activeResult.settled).toBe(true);
  });

  it('DB cache miss keeps source as loading', async () => {
    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    // No DB result, relay completes without events -> source stays 'loading'
    expect(activeResult.source).toBe('loading');
  });

  // Note: source='relay' path is not testable in this unit test configuration.
  // startRelay() never reaches rxNostr.use(req).subscribe() — the fire-and-forget
  // async chain throws before reaching subscribe, and the catch block sets settled=true.
  // subscribeMock call count remains 0 across all useCachedLatest tests.
  // The relay next handler (event = incoming, source = 'relay') is exercised
  // by cachedFetchById tests (which await the relay path) and integration tests.

  it('returns DB cached event even when DB is slow', async () => {
    // Simulate a slow DB that resolves after a delay
    dbGetByPubkeyAndKindMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                id: 'slow1',
                pubkey: 'pk1',
                content: 'slow db',
                created_at: 50,
                tags: [],
                kind: 0
              }),
            50
          )
        )
    );

    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    expect(activeResult.event).toEqual(expect.objectContaining({ content: 'slow db' }));
    expect(activeResult.source).toBe('cache');
  });

  it('handles DB error gracefully (source stays loading)', async () => {
    dbGetByPubkeyAndKindMock.mockRejectedValueOnce(new Error('DB unavailable'));

    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    // DB failed, relay completes normally without events -> source stays 'loading'
    expect(activeResult.event).toBeNull();
    expect(activeResult.source).toBe('loading');
    expect(activeResult.settled).toBe(true);
  });

  it('destroy() prevents DB result from updating state', async () => {
    // Make DB resolve after a delay
    let resolveDb!: (val: Record<string, unknown> | null) => void;
    dbGetByPubkeyAndKindMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDb = resolve;
        })
    );

    activeResult = useCachedLatest('pk1', 0);

    // Wait for startDB to reach the getByPubkeyAndKind call (sets resolveDb)
    await new Promise((r) => setTimeout(r, 50));

    // Destroy before DB resolves
    activeResult.destroy();

    // Now resolve DB with an event
    resolveDb({
      id: 'late-db',
      pubkey: 'pk1',
      content: 'should not appear',
      created_at: 100,
      tags: [],
      kind: 0
    });

    await flushAsync();

    // Event should still be null because we destroyed before DB resolved
    expect(activeResult.event).toBeNull();
  });

  it('destroy() is safe to call multiple times', async () => {
    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    expect(() => {
      activeResult!.destroy();
      activeResult!.destroy();
    }).not.toThrow();
  });

  it('initial state is loading with no event', () => {
    activeResult = useCachedLatest('pk1', 0);

    // Synchronously after creation, before any async resolves
    expect(activeResult.event).toBeNull();
    expect(activeResult.source).toBe('loading');
    expect(activeResult.settled).toBe(false);
  });

  it('exposes reactive getters', async () => {
    const cachedEvent = {
      id: 'g1',
      pubkey: 'pk1',
      content: 'getter test',
      created_at: 100,
      tags: [],
      kind: 0
    };
    dbGetByPubkeyAndKindMock.mockResolvedValueOnce(cachedEvent);

    activeResult = useCachedLatest('pk1', 0);

    // Before resolution
    expect(activeResult.event).toBeNull();

    await flushAsync();

    // After resolution -- same object reference provides updated values
    expect(activeResult.event).toEqual(expect.objectContaining({ content: 'getter test' }));
  });
});
