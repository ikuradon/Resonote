import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbGetByIdMock } = vi.hoisted(() => ({
  dbGetByIdMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null)
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getEventsDB: async () => ({
    getById: dbGetByIdMock,
    put: vi.fn()
  }),
  getRxNostr: async () => ({
    use: () => ({
      subscribe: ({ complete }: { complete: () => void }) => {
        // Synchronous EOSE (no setTimeout to avoid fake timer issues)
        Promise.resolve().then(() => complete());
        return { unsubscribe: vi.fn() };
      }
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

import { cachedFetchById, resetFetchByIdCache } from './cached-query.svelte.js';

describe('cachedFetchById', () => {
  beforeEach(() => {
    resetFetchByIdCache();
    dbGetByIdMock.mockClear();
    dbGetByIdMock.mockResolvedValue(null);
  });

  it('returns null when event not found', async () => {
    const result = await cachedFetchById('event-1');
    expect(result).toBeNull();
  });

  it('caches non-null results permanently', async () => {
    const dbEvent = { id: 'e2', content: 'hello', kind: 1 };
    dbGetByIdMock.mockResolvedValueOnce(dbEvent);

    const result1 = await cachedFetchById('event-2');
    expect(result1).toEqual({ content: 'hello', kind: 1 });

    // Second call returns cached without hitting DB
    dbGetByIdMock.mockResolvedValue(null);
    const result2 = await cachedFetchById('event-2');
    expect(result2).toEqual({ content: 'hello', kind: 1 });
    // DB should have been called only once (first call)
    expect(dbGetByIdMock).toHaveBeenCalledTimes(1);
  });

  it('retries null result after TTL expires', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // First call: returns null
    const result1 = await cachedFetchById('event-3');
    expect(result1).toBeNull();
    const callsAfterFirst = dbGetByIdMock.mock.calls.length;

    // Within TTL: returns cached null
    vi.spyOn(Date, 'now').mockReturnValue(now + 10_000);
    const result2 = await cachedFetchById('event-3');
    expect(result2).toBeNull();
    expect(dbGetByIdMock).toHaveBeenCalledTimes(callsAfterFirst);

    // After TTL (30s): retries
    vi.spyOn(Date, 'now').mockReturnValue(now + 31_000);
    dbGetByIdMock.mockResolvedValueOnce({ id: 'e3', content: 'found', kind: 1 });
    const result3 = await cachedFetchById('event-3');
    expect(result3).toEqual({ content: 'found', kind: 1 });

    vi.restoreAllMocks();
  });
});
