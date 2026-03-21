import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dbState, openDBMock, pickerModule, rawData } = vi.hoisted(() => ({
  dbState: {
    cachedData: null as unknown | null,
    putCalls: [] as unknown[],
    clearCalls: 0
  },
  openDBMock: vi.fn(
    async (
      _name: string,
      _version: number,
      options?: { upgrade?: (db: { createObjectStore(name: string): void }) => void }
    ) => {
      options?.upgrade?.({
        createObjectStore() {
          // noop
        }
      });
      return {
        get: vi.fn(async () => dbState.cachedData),
        clear: vi.fn(async () => {
          dbState.clearCalls += 1;
          dbState.cachedData = null;
        }),
        put: vi.fn(async (_store: string, data: unknown) => {
          dbState.putCalls.push(data);
          dbState.cachedData = data;
        }),
        close: vi.fn()
      };
    }
  ),
  pickerModule: {
    Picker: class Picker {}
  },
  rawData: { categories: ['smile'] }
}));

vi.mock('idb', () => ({
  openDB: openDBMock
}));

vi.mock('@ikuradon/emoji-kitchen-mart', () => pickerModule);

vi.mock('@ikuradon/emoji-kitchen-mart-data', () => ({
  default: rawData
}));

describe('emoji mart helper', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    dbState.cachedData = null;
    dbState.putCalls = [];
    dbState.clearCalls = 0;
    openDBMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should preload only once', async () => {
    const { preloadEmojiMart, getEmojiMartModules } = await import('./emoji-mart.js');

    preloadEmojiMart();
    preloadEmojiMart();
    const result = await getEmojiMartModules();

    expect(result.Picker).toBe(pickerModule.Picker);
    expect(openDBMock).toHaveBeenCalledTimes(1);
  });

  it('should reuse cached data without scheduling a cache write', async () => {
    dbState.cachedData = { categories: ['cached'] };
    const { getEmojiMartModules } = await import('./emoji-mart.js');

    const result = await getEmojiMartModules();
    await vi.advanceTimersByTimeAsync(1000);

    expect(result.data).toEqual({ categories: ['cached'] });
    expect(dbState.putCalls).toHaveLength(0);
    expect(openDBMock).toHaveBeenCalledTimes(1);
  });

  it('should schedule a delayed cache write after a cache miss', async () => {
    const { getEmojiMartModules } = await import('./emoji-mart.js');

    const result = await getEmojiMartModules();
    expect(result.data).toBe(rawData);
    expect(dbState.putCalls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);

    expect(dbState.clearCalls).toBe(1);
    expect(dbState.putCalls).toEqual([rawData]);
    expect(openDBMock).toHaveBeenCalledTimes(2);
  });
});
