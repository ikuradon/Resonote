import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SubscribeCallbacks {
  next?: (packet: { event: unknown }) => void;
  complete?: () => void;
  error?: () => void;
}

const { dbGetByIdMock, dbGetByPubkeyAndKindMock, subscribeMock } = vi.hoisted(() => ({
  dbGetByIdMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  dbGetByPubkeyAndKindMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  subscribeMock: vi.fn((callbacks: SubscribeCallbacks) => {
    // Default: synchronous EOSE (no setTimeout to avoid fake timer issues)
    void Promise.resolve().then(() => callbacks.complete?.());
    return { unsubscribe: vi.fn() };
  })
}));

vi.mock('@auftakt/core', async (importOriginal) => {
  const actual = await importOriginal();
  return Object.assign({}, actual, {
    createRxBackwardReq: () => ({
      emit: vi.fn(),
      over: vi.fn()
    })
  });
});

vi.mock('$shared/nostr/event-db.js', () => ({
  getEventsDB: async () => ({
    getById: dbGetByIdMock,
    getByPubkeyAndKind: dbGetByPubkeyAndKindMock,
    put: vi.fn()
  })
}));

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: async () => ({
    use: () => ({
      subscribe: subscribeMock
    })
  })
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
  shortHex: (s: string) => s.slice(0, 8)
}));

import { finalizeEvent } from '@auftakt/core';

import {
  cachedFetchById,
  invalidateFetchByIdCache,
  resetFetchByIdCache,
  useCachedLatest
} from './cached-query.svelte.js';

const RELAY_SECRET_KEY = new Uint8Array(32).fill(1);

function signedRelayEvent(overrides: {
  content: string;
  kind: number;
  created_at?: number;
  tags?: string[][];
}) {
  return finalizeEvent(
    {
      content: overrides.content,
      kind: overrides.kind,
      created_at: overrides.created_at ?? 100,
      tags: overrides.tags ?? []
    },
    RELAY_SECRET_KEY
  );
}

describe('cachedFetchById', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetFetchByIdCache();
    dbGetByIdMock.mockClear();
    dbGetByIdMock.mockResolvedValue(null);
    subscribeMock.mockClear();
    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      void Promise.resolve().then(() => callbacks.complete?.());
      return { unsubscribe: vi.fn() };
    });
  });

  it('returns null when event not found', async () => {
    const result = await cachedFetchById('event-1');
    expect(result.event).toBeNull();
    expect(result.settlement).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'settled-miss'
    });
  });

  it('caches non-null results permanently', async () => {
    const dbEvent = { id: 'e2', content: 'hello', kind: 1 };
    dbGetByIdMock.mockResolvedValueOnce(dbEvent);

    const result1 = await cachedFetchById('event-2');
    expect(result1.event).toEqual(expect.objectContaining({ content: 'hello', kind: 1 }));
    expect(result1.settlement).toEqual({
      phase: 'settled',
      provenance: 'store',
      reason: 'cache-hit'
    });

    // Second call returns cached without hitting DB
    dbGetByIdMock.mockResolvedValue(null);
    const result2 = await cachedFetchById('event-2');
    expect(result2.event).toEqual(expect.objectContaining({ content: 'hello', kind: 1 }));
    expect(result2.settlement).toEqual({
      phase: 'settled',
      provenance: 'memory',
      reason: 'cache-hit'
    });
    // DB should have been called only once (first call)
    expect(dbGetByIdMock).toHaveBeenCalledTimes(1);
  });

  it('retries null result after TTL expires', async () => {
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    // First call: returns null
    const result1 = await cachedFetchById('event-3');
    expect(result1.event).toBeNull();
    const callsAfterFirst = dbGetByIdMock.mock.calls.length;

    // Within TTL: returns cached null
    dateSpy.mockReturnValue(now + 10_000);
    const result2 = await cachedFetchById('event-3');
    expect(result2.event).toBeNull();
    expect(result2.settlement).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'null-ttl-hit'
    });
    expect(dbGetByIdMock).toHaveBeenCalledTimes(callsAfterFirst);

    // After TTL (30s): retries
    dateSpy.mockReturnValue(now + 31_000);
    dbGetByIdMock.mockResolvedValueOnce({
      id: 'e3',
      content: 'found',
      kind: 1
    });
    const result3 = await cachedFetchById('event-3');
    expect(result3.event).toEqual(expect.objectContaining({ content: 'found', kind: 1 }));
  });

  it('returns event from relay when DB misses', async () => {
    const relayEvent = signedRelayEvent({
      content: 'from relay',
      kind: 1
    });

    // DB returns null (default), but relay fires next before complete
    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ event: relayEvent });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    const result = await cachedFetchById('event-relay');
    expect(result.event).toEqual(expect.objectContaining({ content: 'from relay', kind: 1 }));
    expect(result.settlement).toEqual({
      phase: 'settled',
      provenance: 'relay',
      reason: 'relay-repair'
    });
    // DB was queried (miss), then relay provided the event
    expect(dbGetByIdMock).toHaveBeenCalledTimes(1);
    await expect(dbGetByIdMock.mock.results[0].value).resolves.toBeNull();
  });

  it('re-caches null after TTL expires and retry still returns null', async () => {
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    // First call: returns null, populates nullCacheTimestamps
    const result1 = await cachedFetchById('event-4');
    expect(result1.event).toBeNull();

    // After TTL: retries but still null
    dateSpy.mockReturnValue(now + 31_000);
    const callsBeforeRetry = dbGetByIdMock.mock.calls.length;
    const result2 = await cachedFetchById('event-4');
    expect(result2.event).toBeNull();
    expect(dbGetByIdMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);

    // Within new TTL window: should be cached again (no extra DB call)
    dateSpy.mockReturnValue(now + 40_000);
    const callsAfterRetry = dbGetByIdMock.mock.calls.length;
    const result3 = await cachedFetchById('event-4');
    expect(result3.event).toBeNull();
    expect(result3.settlement.reason).toBe('null-ttl-hit');
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
      void Promise.resolve().then(() => callbacks.complete?.());
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
    expect(result.event).toEqual(expect.objectContaining({ content: 'db-result' }));
    expect(result.settlement.reason).toBe('invalidated-during-fetch');

    // But result must NOT be cached: next call should hit DB again
    dbGetByIdMock.mockResolvedValueOnce({
      id: 'race-db',
      content: 'fresh',
      kind: 1111
    });
    const result2 = await cachedFetchById('race-db');
    expect(result2.event).toEqual(expect.objectContaining({ content: 'fresh' }));
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
    const relayEvent = signedRelayEvent({
      content: 'relay-result',
      kind: 1111
    });

    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ event: relayEvent });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    // First fetch: DB miss -> relay returns event -> result is cached
    const result1 = await cachedFetchById('race-relay2');
    expect(result1.event).toEqual(expect.objectContaining({ content: 'relay-result' }));

    // Flush any pending microtasks (e.g. async next callback's DB write)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Invalidate the cached relay result
    invalidateFetchByIdCache('race-relay2');

    // Next fetch must NOT serve the stale cached relay result
    const callsBefore = dbGetByIdMock.mock.calls.length;
    dbGetByIdMock.mockResolvedValueOnce({
      id: 'race-relay2',
      content: 'updated',
      kind: 1111
    });
    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      void Promise.resolve().then(() => callbacks.complete?.());
      return { unsubscribe: vi.fn() };
    });
    const result2 = await cachedFetchById('race-relay2');
    // DB was queried (cache was cleared)
    expect(dbGetByIdMock.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(result2.event).toEqual(expect.objectContaining({ content: 'updated' }));
  });

  it('invalidate + TTL interaction: invalidated null is not re-cached within TTL', async () => {
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    // First call returns null (cached with TTL)
    const result1 = await cachedFetchById('ttl-invalidate');
    expect(result1.event).toBeNull();

    // Within TTL: normally would return cached null
    dateSpy.mockReturnValue(now + 5_000);

    // Invalidate within TTL
    invalidateFetchByIdCache('ttl-invalidate');

    // Next call should re-fetch, not use the invalidated null cache
    const callsBefore = dbGetByIdMock.mock.calls.length;
    dbGetByIdMock.mockResolvedValueOnce({
      id: 'ttl-invalidate',
      content: 'found',
      kind: 1111
    });
    const result2 = await cachedFetchById('ttl-invalidate');
    expect(result2.event).toEqual(expect.objectContaining({ content: 'found' }));
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
    dbGetByIdMock.mockResolvedValueOnce({
      id: 'e5',
      content: 'refreshed',
      kind: 1
    });
    const result = await cachedFetchById('event-5');
    expect(result.event).toEqual(expect.objectContaining({ content: 'refreshed' }));
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
    expect(beforeInvalidate.event).toBeNull();
    const callsBefore = dbGetByIdMock.mock.calls.length;

    // Invalidate forces re-fetch even within TTL
    invalidateFetchByIdCache('event-6');
    dbGetByIdMock.mockResolvedValueOnce({
      id: 'e6',
      content: 'found',
      kind: 1
    });
    const result = await cachedFetchById('event-6');
    expect(result.event).toEqual(expect.objectContaining({ content: 'found' }));
    expect(dbGetByIdMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

/**
 * Helper to flush async operations including dynamic import() resolution.
 * Uses setTimeout to yield to the macrotask queue, ensuring pending
 * microtasks (including those from mocked dynamic imports) settle.
 *
 * Note: useCachedLatest exposes canonical settlement via ReadSettlement.
 * This API keeps local-first semantics and settles once local lookup completes.
 */
async function flushAsync(): Promise<void> {
  await new Promise((r) => setTimeout(r, 500));
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
      void Promise.resolve().then(() => callbacks.complete?.());
      return { unsubscribe: vi.fn() };
    });
  });

  afterEach(async () => {
    activeResult?.destroy();
    activeResult = undefined;
    await new Promise((r) => setTimeout(r, 50));
  });

  it('returns event with cache-hit settlement on DB cache hit', async () => {
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
    expect(activeResult.settlement).toEqual({
      phase: 'settled',
      provenance: 'store',
      reason: 'cache-hit'
    });
  });

  it('eventually settles after all async paths complete', async () => {
    // Both DB miss and relay error/complete lead to settled=true
    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    expect(activeResult.settlement.phase).toBe('settled');
  });

  it('event stays null when neither DB nor relay provides data', async () => {
    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    expect(activeResult.event).toBeNull();
    expect(activeResult.settlement).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'settled-miss'
    });
  });

  it('DB cache miss keeps settlement as settled miss after relay settle', async () => {
    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    expect(activeResult.settlement).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'settled-miss'
    });
  });

  it('keeps a local cache hit partial until late EOSE settles the relay path', async () => {
    const cachedEvent = {
      id: 'late-eose',
      pubkey: 'pk1',
      content: 'cached before relay settle',
      created_at: 100,
      tags: [],
      kind: 0
    };
    let complete!: () => void;

    dbGetByPubkeyAndKindMock.mockResolvedValueOnce(cachedEvent);
    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      complete = () => callbacks.complete?.();
      return { unsubscribe: vi.fn() };
    });

    activeResult = useCachedLatest('pk1', 0);
    await new Promise((r) => setTimeout(r, 50));

    expect(activeResult.event).toEqual(
      expect.objectContaining({ content: 'cached before relay settle' })
    );
    expect(activeResult.settlement).toEqual({
      phase: 'partial',
      provenance: 'store',
      reason: 'cache-hit'
    });

    complete();
    await flushAsync();

    expect(activeResult.settlement).toEqual({
      phase: 'settled',
      provenance: 'store',
      reason: 'cache-hit'
    });
  });

  it('keeps a miss partial until all relays disconnect or complete', async () => {
    let complete!: () => void;

    subscribeMock.mockImplementation((callbacks: SubscribeCallbacks) => {
      complete = () => callbacks.complete?.();
      return { unsubscribe: vi.fn() };
    });

    activeResult = useCachedLatest('pk1', 0);
    await new Promise((r) => setTimeout(r, 50));

    expect(activeResult.event).toBeNull();
    expect(activeResult.settlement).toEqual({
      phase: 'partial',
      provenance: 'none',
      reason: 'cache-miss'
    });

    complete();
    await flushAsync();

    expect(activeResult.settlement).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'settled-miss'
    });
  });

  // Note: relay-hit settlement is covered by cachedFetchById tests and integration
  // tests; this suite focuses on local-first settling and cache behavior.

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
    expect(activeResult.settlement.reason).toBe('cache-hit');
  });

  it('handles DB error gracefully (settled miss)', async () => {
    dbGetByPubkeyAndKindMock.mockRejectedValueOnce(new Error('DB unavailable'));

    activeResult = useCachedLatest('pk1', 0);
    await flushAsync();

    expect(activeResult.event).toBeNull();
    expect(activeResult.settlement).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'settled-miss'
    });
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

  it('initial state is no-event with canonical settlement', () => {
    activeResult = useCachedLatest('pk1', 0);

    expect(activeResult.event).toBeNull();
    expect(activeResult.settlement).toEqual({
      phase: 'pending',
      provenance: 'none',
      reason: 'cache-miss'
    });
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

it('uses a Dexie-backed event db bridge', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./event-db.ts', import.meta.url), 'utf8')
  );
  const legacyAdapter = '@auftakt/' + 'adapter-' + 'indexeddb';

  expect(source).toContain('@auftakt/adapter-dexie');
  expect(source).not.toContain(legacyAdapter);
});
