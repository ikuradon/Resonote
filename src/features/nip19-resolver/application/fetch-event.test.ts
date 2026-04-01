import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { fetchByIdMock } = vi.hoisted(() => ({
  fetchByIdMock: vi.fn()
}));

vi.mock('$shared/nostr/store.js', () => ({
  getStoreAsync: vi.fn().mockResolvedValue({
    fetchById: fetchByIdMock,
    getSync: vi.fn().mockResolvedValue([]),
    dispose: vi.fn()
  })
}));

import { fetchNostrEvent } from './fetch-event.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('fetchNostrEvent', () => {
  it('returns the event provided by the store', async () => {
    fetchByIdMock.mockResolvedValue({
      event: { kind: 1111, tags: [['I', 'spotify:track:abc']], content: 'hello' },
      seenOn: ['wss://relay.test'],
      firstSeen: Date.now()
    });

    const result = await fetchNostrEvent('event-id-1', []);
    expect(result).toEqual({ kind: 1111, tags: [['I', 'spotify:track:abc']], content: 'hello' });
  });

  it('returns null when the store returns null', async () => {
    fetchByIdMock.mockResolvedValue(null);

    const result = await fetchNostrEvent('event-id-2', []);
    expect(result).toBeNull();
  });

  it('passes relayHint and timeout options to fetchById', async () => {
    fetchByIdMock.mockResolvedValue(null);

    const hints = ['wss://relay.example.com', 'wss://relay2.example.com'];
    await fetchNostrEvent('event-id-4', hints);

    expect(fetchByIdMock).toHaveBeenCalledWith(
      'event-id-4',
      expect.objectContaining({
        relayHint: 'wss://relay.example.com',
        timeout: 10_000
      })
    );
  });

  it('starts all relay hint fetches without waiting for the first hint to finish', async () => {
    let resolveFirst: ((value: null) => void) | undefined;
    fetchByIdMock.mockImplementation((_eventId: string, options?: { relayHint?: string }) => {
      if (options?.relayHint === 'wss://relay.example.com') {
        return new Promise((resolve: (value: null) => void) => {
          resolveFirst = resolve;
        });
      }

      return Promise.resolve({
        event: { kind: 1111, tags: [['I', 'spotify:track:fast']], content: 'from-second-hint' },
        seenOn: ['wss://relay2.example.com'],
        firstSeen: Date.now()
      });
    });

    const resultPromise = fetchNostrEvent('event-id-parallel', [
      'wss://relay.example.com',
      'wss://relay2.example.com'
    ]);

    await vi.waitFor(() => {
      expect(fetchByIdMock).toHaveBeenCalledWith('event-id-parallel', {
        relayHint: 'wss://relay.example.com',
        timeout: 10_000,
        signal: expect.any(AbortSignal)
      });
      expect(fetchByIdMock).toHaveBeenCalledWith('event-id-parallel', {
        relayHint: 'wss://relay2.example.com',
        timeout: 5_000,
        signal: expect.any(AbortSignal)
      });
    });
    await expect(resultPromise).resolves.toEqual({
      kind: 1111,
      tags: [['I', 'spotify:track:fast']],
      content: 'from-second-hint'
    });

    resolveFirst?.(null);
  });

  it('aborts remaining relay hint fetches after the first success', async () => {
    const abortStates: boolean[] = [];
    fetchByIdMock.mockImplementation(
      (_eventId: string, options?: { relayHint?: string; signal?: AbortSignal }) => {
        if (options?.relayHint === 'wss://relay2.example.com') {
          return Promise.resolve({
            event: { kind: 1111, tags: [['I', 'spotify:track:fast']], content: 'from-second-hint' },
            seenOn: ['wss://relay2.example.com'],
            firstSeen: Date.now()
          });
        }

        return new Promise((resolve) => {
          options?.signal?.addEventListener(
            'abort',
            () => {
              abortStates.push(true);
              resolve(null);
            },
            { once: true }
          );
        });
      }
    );

    const result = await fetchNostrEvent('event-id-abort', [
      'wss://relay.example.com',
      'wss://relay2.example.com'
    ]);

    expect(result).toEqual({
      kind: 1111,
      tags: [['I', 'spotify:track:fast']],
      content: 'from-second-hint'
    });
    expect(abortStates.length).toBeGreaterThan(0);
  });

  it('falls back to default relays after all relay hints return null', async () => {
    fetchByIdMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        event: { kind: 1111, tags: [['I', 'spotify:track:fallback']], content: 'from-default' },
        seenOn: ['wss://default-relay.example.com'],
        firstSeen: Date.now()
      });

    const result = await fetchNostrEvent('event-id-fallback', [
      'wss://relay.example.com',
      'wss://relay2.example.com'
    ]);

    expect(fetchByIdMock).toHaveBeenNthCalledWith(
      1,
      'event-id-fallback',
      expect.objectContaining({
        relayHint: 'wss://relay.example.com',
        timeout: 10_000
      })
    );
    expect(fetchByIdMock).toHaveBeenNthCalledWith(
      2,
      'event-id-fallback',
      expect.objectContaining({
        relayHint: 'wss://relay2.example.com',
        timeout: 5_000
      })
    );
    expect(fetchByIdMock).toHaveBeenNthCalledWith(
      3,
      'event-id-fallback',
      expect.objectContaining({
        relayHint: undefined,
        timeout: 10_000
      })
    );
    expect(result).toEqual({
      kind: 1111,
      tags: [['I', 'spotify:track:fallback']],
      content: 'from-default'
    });
  });

  it('passes no relayHint when relayHints is empty', async () => {
    fetchByIdMock.mockResolvedValue(null);

    await fetchNostrEvent('event-id-5', []);

    expect(fetchByIdMock).toHaveBeenCalledWith(
      'event-id-5',
      expect.objectContaining({
        relayHint: undefined,
        timeout: 10_000
      })
    );
  });

  it('calls fetchById with the correct event id', async () => {
    fetchByIdMock.mockResolvedValue(null);

    await fetchNostrEvent('my-event-id', []);

    expect(fetchByIdMock).toHaveBeenCalledWith('my-event-id', expect.any(Object));
  });

  it('returns event even when fetchById returns event with extra fields', async () => {
    fetchByIdMock.mockResolvedValue({
      event: {
        kind: 1111,
        tags: [],
        content: 'partial',
        id: 'x',
        pubkey: 'y',
        sig: 'z',
        created_at: 1
      },
      seenOn: [],
      firstSeen: 0
    });

    const result = await fetchNostrEvent('event-id-6', []);
    expect(result).toEqual({ kind: 1111, tags: [], content: 'partial' });
  });
});
