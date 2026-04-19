import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SendCallbacks {
  next?: (packet: { ok: boolean }) => void;
  complete?: () => void;
  error?: (err: unknown) => void;
}

interface UseCallbacks {
  next?: (packet: { event: Record<string, unknown> }) => void;
  complete?: () => void;
  error?: () => void;
}

const sendSubscribeMock = vi.fn<(callbacks: SendCallbacks) => { unsubscribe: () => void }>(() => ({
  unsubscribe: vi.fn()
}));
const useSubscribeMock = vi.fn<(callbacks: UseCallbacks) => { unsubscribe: () => void }>(() => ({
  unsubscribe: vi.fn()
}));

const mockRxNostr = {
  setDefaultRelays: vi.fn(),
  getDefaultRelays: vi.fn(() => ({
    'wss://relay1.test': { read: true, write: true },
    'wss://relay2.test': { read: true, write: true }
  })),
  send: vi.fn(() => ({ subscribe: sendSubscribeMock })),
  use: vi.fn(() => ({ subscribe: useSubscribeMock })),
  dispose: vi.fn()
};

vi.mock('@auftakt/adapter-relay', () => ({
  createRxNostrSession: vi.fn(({ defaultRelays }: { defaultRelays: string[] }) => {
    mockRxNostr.setDefaultRelays(defaultRelays);
    return mockRxNostr;
  }),
  nip07Signer: vi.fn(() => 'mock-signer'),
  createRxBackwardReq: vi.fn(() => ({
    emit: vi.fn(),
    over: vi.fn()
  }))
}));

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay1.test', 'wss://relay2.test']
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() })
}));

vi.mock('$shared/nostr/event-db.js', () => ({
  getEventsDB: async () => ({ put: vi.fn() })
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getRxNostr', () => {
  it('should return an RxNostr instance', async () => {
    const { getRxNostr } = await import('./client.js');
    const instance = await getRxNostr();
    expect(instance).toBe(mockRxNostr);
  });

  it('should return the same instance when called twice (singleton)', async () => {
    const { getRxNostr } = await import('./client.js');
    const first = await getRxNostr();
    const second = await getRxNostr();
    expect(first).toBe(second);
  });

  it('should resolve to the same instance for concurrent calls', async () => {
    const { getRxNostr } = await import('./client.js');
    const [result1, result2] = await Promise.all([getRxNostr(), getRxNostr()]);
    expect(result1).toBe(result2);
    expect(result1).toBe(mockRxNostr);
  });

  it('should call setDefaultRelays with DEFAULT_RELAYS during init', async () => {
    const { getRxNostr } = await import('./client.js');
    await getRxNostr();
    expect(mockRxNostr.setDefaultRelays).toHaveBeenCalledOnce();
    expect(mockRxNostr.setDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.test',
      'wss://relay2.test'
    ]);
  });
});

describe('disposeRxNostr', () => {
  it('should clear the instance so next getRxNostr creates a new one', async () => {
    const { getRxNostr, disposeRxNostr } = await import('./client.js');
    const first = await getRxNostr();
    expect(first).toBe(mockRxNostr);

    disposeRxNostr();
    expect(mockRxNostr.dispose).toHaveBeenCalledOnce();

    const second = await getRxNostr();
    expect(second).toBe(mockRxNostr);
    expect(mockRxNostr.setDefaultRelays).toHaveBeenCalledTimes(2);
  });

  it('is safe to call when no instance exists', async () => {
    const { disposeRxNostr } = await import('./client.js');
    expect(() => disposeRxNostr()).not.toThrow();
  });
});

describe('castSigned', () => {
  it('resolves when threshold OKs received', async () => {
    const { castSigned } = await import('./client.js');
    const { getRxNostr } = await import('./client.js');
    await getRxNostr();

    sendSubscribeMock.mockImplementation((callbacks: SendCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ ok: true });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(castSigned({ kind: 1, content: 'test', tags: [] })).resolves.toBeUndefined();
  });

  it('resolves on complete if at least one OK', async () => {
    const { castSigned, getRxNostr } = await import('./client.js');
    await getRxNostr();

    sendSubscribeMock.mockImplementation((callbacks: SendCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ ok: false });
        callbacks.next?.({ ok: true });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(castSigned({ kind: 1, content: 'test', tags: [] })).resolves.toBeUndefined();
  });

  it('rejects when all relays reject and stream completes', async () => {
    const { castSigned, getRxNostr } = await import('./client.js');
    await getRxNostr();

    sendSubscribeMock.mockImplementation((callbacks: SendCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ ok: false });
        callbacks.next?.({ ok: false });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(castSigned({ kind: 1, content: 'test', tags: [] })).rejects.toThrow(
      'All relays rejected the event'
    );
  });

  it('rejects on error', async () => {
    const { castSigned, getRxNostr } = await import('./client.js');
    await getRxNostr();

    sendSubscribeMock.mockImplementation((callbacks: SendCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.error?.(new Error('Network failure'));
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(castSigned({ kind: 1, content: 'test', tags: [] })).rejects.toThrow(
      'Network failure'
    );
  });

  it('resolves immediately once threshold reached, ignoring later packets', async () => {
    const { castSigned, getRxNostr } = await import('./client.js');
    await getRxNostr();

    sendSubscribeMock.mockImplementation((callbacks: SendCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ ok: true });
        callbacks.next?.({ ok: true });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(
      castSigned({ kind: 1, content: 'test', tags: [] }, { successThreshold: 0.5 })
    ).resolves.toBeUndefined();
  });

  it('ignores error after already resolved', async () => {
    const { castSigned, getRxNostr } = await import('./client.js');
    await getRxNostr();

    sendSubscribeMock.mockImplementation((callbacks: SendCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ ok: true });
        callbacks.error?.(new Error('late error'));
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(castSigned({ kind: 1, content: 'test', tags: [] })).resolves.toBeUndefined();
  });
});

describe('fetchLatestEvent', () => {
  it('returns the latest event by created_at', async () => {
    const { fetchLatestEvent, getRxNostr } = await import('./client.js');
    await getRxNostr();

    useSubscribeMock.mockImplementation((callbacks: UseCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ event: { created_at: 1, tags: [], content: 'old' } });
        callbacks.next?.({ event: { created_at: 2, tags: [], content: 'new' } });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(fetchLatestEvent('pubkey', 1)).resolves.toEqual({
      created_at: 2,
      tags: [],
      content: 'new'
    });
  });

  it('returns null when no events received', async () => {
    const { fetchLatestEvent, getRxNostr } = await import('./client.js');
    await getRxNostr();

    useSubscribeMock.mockImplementation((callbacks: UseCallbacks) => {
      void Promise.resolve().then(() => callbacks.complete?.());
      return { unsubscribe: vi.fn() };
    });

    await expect(fetchLatestEvent('pubkey', 1)).resolves.toBeNull();
  });

  it('returns latest event on error if available', async () => {
    const { fetchLatestEvent, getRxNostr } = await import('./client.js');
    await getRxNostr();

    useSubscribeMock.mockImplementation((callbacks: UseCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ event: { created_at: 2, tags: [], content: 'new' } });
        callbacks.error?.();
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(fetchLatestEvent('pubkey', 1)).resolves.toEqual({
      created_at: 2,
      tags: [],
      content: 'new'
    });
  });

  it('returns null on error with no events', async () => {
    const { fetchLatestEvent, getRxNostr } = await import('./client.js');
    await getRxNostr();

    useSubscribeMock.mockImplementation((callbacks: UseCallbacks) => {
      void Promise.resolve().then(() => callbacks.error?.());
      return { unsubscribe: vi.fn() };
    });

    await expect(fetchLatestEvent('pubkey', 1)).resolves.toBeNull();
  });

  it('resolves with latest event on timeout when subscription hangs', async () => {
    vi.useFakeTimers();
    const { fetchLatestEvent, getRxNostr } = await import('./client.js');
    await getRxNostr();

    useSubscribeMock.mockImplementation((callbacks: UseCallbacks) => {
      void Promise.resolve().then(() =>
        callbacks.next?.({ event: { created_at: 2, tags: [], content: 'new' } })
      );
      return { unsubscribe: vi.fn() };
    });

    const promise = fetchLatestEvent('pubkey', 1);
    await vi.advanceTimersByTimeAsync(10_001);
    await expect(promise).resolves.toEqual({ created_at: 2, tags: [], content: 'new' });
  });

  it('resolves with null on timeout when no events received', async () => {
    vi.useFakeTimers();
    const { fetchLatestEvent, getRxNostr } = await import('./client.js');
    await getRxNostr();

    useSubscribeMock.mockImplementation(() => ({ unsubscribe: vi.fn() }));

    const promise = fetchLatestEvent('pubkey', 1);
    await vi.advanceTimersByTimeAsync(10_001);
    await expect(promise).resolves.toBeNull();
  });

  it('keeps event with higher created_at when out-of-order', async () => {
    const { fetchLatestEvent, getRxNostr } = await import('./client.js');
    await getRxNostr();

    useSubscribeMock.mockImplementation((callbacks: UseCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ event: { created_at: 5, tags: [], content: 'newer' } });
        callbacks.next?.({ event: { created_at: 3, tags: [], content: 'older' } });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(fetchLatestEvent('pubkey', 1)).resolves.toEqual({
      created_at: 5,
      tags: [],
      content: 'newer'
    });
  });
});
