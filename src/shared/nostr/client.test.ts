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
const fetchMaterializedLatestEventMock = vi.fn();

const mockRelaySession = {
  setDefaultRelays: vi.fn(),
  getDefaultRelays: vi.fn(() => ({
    'wss://relay1.test': { read: true, write: true },
    'wss://relay2.test': { read: true, write: true }
  })),
  send: vi.fn(() => ({ subscribe: sendSubscribeMock })),
  use: vi.fn(() => ({ subscribe: useSubscribeMock })),
  dispose: vi.fn()
};

vi.mock('@auftakt/core', async (importOriginal) => {
  const actual = await importOriginal();
  return Object.assign({}, actual);
});

vi.mock('@auftakt/runtime', async (importOriginal) => {
  const actual = await importOriginal();
  return Object.assign({}, actual, {
    createRelaySession: vi.fn(({ defaultRelays }: { defaultRelays: string[] }) => {
      mockRelaySession.setDefaultRelays(defaultRelays);
      return mockRelaySession;
    }),
    nip07Signer: vi.fn(() => 'mock-signer')
  });
});

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay1.test', 'wss://relay2.test']
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() })
}));

vi.mock('$shared/nostr/event-db.js', () => ({
  getEventsDB: async () => ({ put: vi.fn() })
}));

vi.mock('$shared/nostr/materialized-latest.js', () => ({
  fetchMaterializedLatestEvent: fetchMaterializedLatestEventMock
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getRelaySession', () => {
  it('should return an RelaySession instance', async () => {
    const { getRelaySession } = await import('./client.js');
    const instance = await getRelaySession();
    expect(instance).toBe(mockRelaySession);
  });

  it('should return the same instance when called twice (singleton)', async () => {
    const { getRelaySession } = await import('./client.js');
    const first = await getRelaySession();
    const second = await getRelaySession();
    expect(first).toBe(second);
  });

  it('should resolve to the same instance for concurrent calls', async () => {
    const { getRelaySession } = await import('./client.js');
    const [result1, result2] = await Promise.all([getRelaySession(), getRelaySession()]);
    expect(result1).toBe(result2);
    expect(result1).toBe(mockRelaySession);
  });

  it('should call setDefaultRelays with DEFAULT_RELAYS during init', async () => {
    const { getRelaySession } = await import('./client.js');
    await getRelaySession();
    expect(mockRelaySession.setDefaultRelays).toHaveBeenCalledOnce();
    expect(mockRelaySession.setDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.test',
      'wss://relay2.test'
    ]);
  });
});

describe('disposeRelaySession', () => {
  it('should clear the instance so next getRelaySession creates a new one', async () => {
    const { getRelaySession, disposeRelaySession } = await import('./client.js');
    const first = await getRelaySession();
    expect(first).toBe(mockRelaySession);

    disposeRelaySession();
    expect(mockRelaySession.dispose).toHaveBeenCalledOnce();

    const second = await getRelaySession();
    expect(second).toBe(mockRelaySession);
    expect(mockRelaySession.setDefaultRelays).toHaveBeenCalledTimes(2);
  });

  it('is safe to call when no instance exists', async () => {
    const { disposeRelaySession } = await import('./client.js');
    expect(() => disposeRelaySession()).not.toThrow();
  });
});

describe('castSigned', () => {
  it('resolves when threshold OKs received', async () => {
    const { castSigned } = await import('./client.js');
    const { getRelaySession } = await import('./client.js');
    await getRelaySession();

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
    const { castSigned, getRelaySession } = await import('./client.js');
    await getRelaySession();

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
    const { castSigned, getRelaySession } = await import('./client.js');
    await getRelaySession();

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
    const { castSigned, getRelaySession } = await import('./client.js');
    await getRelaySession();

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
    const { castSigned, getRelaySession } = await import('./client.js');
    await getRelaySession();

    sendSubscribeMock.mockImplementation((callbacks: SendCallbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({ ok: true });
        callbacks.next?.({ ok: true });
        callbacks.complete?.();
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(
      castSigned(
        { kind: 1, content: 'test', tags: [] },
        {
          successThreshold: 0.5
        }
      )
    ).resolves.toBeUndefined();
  });

  it('ignores error after already resolved', async () => {
    const { castSigned, getRelaySession } = await import('./client.js');
    await getRelaySession();

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
  it('delegates to the materialized latest bridge', async () => {
    fetchMaterializedLatestEventMock.mockResolvedValueOnce({
      created_at: 2,
      tags: [['r', 'wss://relay.example']],
      content: 'new'
    });
    const { fetchLatestEvent } = await import('./client.js');

    await expect(fetchLatestEvent('pubkey', 1)).resolves.toEqual({
      created_at: 2,
      tags: [['r', 'wss://relay.example']],
      content: 'new'
    });
    expect(fetchMaterializedLatestEventMock).toHaveBeenCalledWith('pubkey', 1);
  });

  it('returns null when the materialized query misses', async () => {
    fetchMaterializedLatestEventMock.mockResolvedValueOnce(null);
    const { fetchLatestEvent } = await import('./client.js');

    await expect(fetchLatestEvent('pubkey', 1)).resolves.toBeNull();
    expect(fetchMaterializedLatestEventMock).toHaveBeenCalledWith('pubkey', 1);
  });
});
