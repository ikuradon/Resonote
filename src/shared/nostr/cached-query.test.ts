import { beforeEach, describe, expect, it, vi } from 'vitest';

type SubscribeCallbacks = {
  next?: (packet: { event: Record<string, unknown> }) => void;
  complete?: () => void;
  error?: () => void;
};

const { dbGetByIdMock, subscribeMock } = vi.hoisted(() => ({
  dbGetByIdMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  subscribeMock: vi.fn((callbacks: SubscribeCallbacks) => {
    // Default: synchronous EOSE (no setTimeout to avoid fake timer issues)
    Promise.resolve().then(() => callbacks.complete?.());
    return { unsubscribe: vi.fn() };
  })
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getEventsDB: async () => ({
    getById: dbGetByIdMock,
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
  resetFetchByIdCache
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
