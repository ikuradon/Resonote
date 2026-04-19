import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetDefaultRelays = vi.fn();
let subscribeFn: (observer: {
  next?: (packet: unknown) => void;
  complete?: () => void;
  error?: (err: unknown) => void;
}) => { unsubscribe: () => void };

vi.mock('$shared/nostr/gateway.js', () => ({
  createRxBackwardReq: () => ({
    emit: vi.fn(),
    over: vi.fn()
  }),
  setDefaultRelays: mockSetDefaultRelays,
  getRxNostr: vi.fn().mockResolvedValue({
    use: () => ({
      subscribe: (observer: {
        next?: (p: unknown) => void;
        complete?: () => void;
        error?: (e: unknown) => void;
      }) => subscribeFn(observer)
    })
  })
}));

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay1.example.com', 'wss://relay2.example.com']
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }),
  shortHex: (s: string) => s.slice(0, 8)
}));

describe('relays-config: DEFAULT_RELAYS re-export', () => {
  it('re-exports DEFAULT_RELAYS from relays.js', async () => {
    const { DEFAULT_RELAYS } = await import('./relays-config.js');
    expect(Array.isArray(DEFAULT_RELAYS)).toBe(true);
    expect(DEFAULT_RELAYS.length).toBeGreaterThan(0);
    for (const relay of DEFAULT_RELAYS) {
      expect(relay).toMatch(/^wss:\/\//);
    }
  });
});

describe('relays-config: applyUserRelays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to default relays when no relay list found', async () => {
    subscribeFn = (observer) => {
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });

  it('applies user relays when kind:10002 event found', async () => {
    subscribeFn = (observer) => {
      observer.next?.({
        event: {
          created_at: 1000,
          tags: [
            ['r', 'wss://user-relay1.example.com'],
            ['r', 'wss://user-relay2.example.com']
          ]
        }
      });
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://user-relay1.example.com', 'wss://user-relay2.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://user-relay1.example.com',
      'wss://user-relay2.example.com'
    ]);
  });

  it('waits for default relay update before resolving', async () => {
    let resolveSetDefaultRelays!: () => void;
    mockSetDefaultRelays.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSetDefaultRelays = resolve;
      })
    );
    subscribeFn = (observer) => {
      observer.next?.({
        event: {
          created_at: 1000,
          tags: [['r', 'wss://user-relay.example.com']]
        }
      });
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./relays-config.js');
    let resolved = false;
    const pending = applyUserRelays('deadbeef'.repeat(8)).then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSetDefaultRelays).toHaveBeenCalledWith(['wss://user-relay.example.com']);
    expect(resolved).toBe(false);

    resolveSetDefaultRelays();
    await pending;
    expect(resolved).toBe(true);
  });

  it('falls back to defaults on subscription error', async () => {
    subscribeFn = (observer) => {
      queueMicrotask(() => observer.error?.(new Error('network')));
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });
  it('uses event with highest created_at when multiple packets arrive', async () => {
    subscribeFn = (observer) => {
      observer.next?.({
        event: {
          created_at: 1000,
          tags: [['r', 'wss://old-relay.example.com']]
        }
      });
      observer.next?.({
        event: {
          created_at: 2000,
          tags: [['r', 'wss://new-relay.example.com']]
        }
      });
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://new-relay.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith(['wss://new-relay.example.com']);
  });

  it('ignores older event arriving after newer one', async () => {
    subscribeFn = (observer) => {
      observer.next?.({
        event: {
          created_at: 2000,
          tags: [['r', 'wss://new-relay.example.com']]
        }
      });
      observer.next?.({
        event: {
          created_at: 1000,
          tags: [['r', 'wss://old-relay.example.com']]
        }
      });
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://new-relay.example.com']);
  });
});

describe('relays-config: resetToDefaultRelays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls setDefaultRelays with default relay list', async () => {
    subscribeFn = (observer) => {
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { resetToDefaultRelays } = await import('./relays-config.js');
    await resetToDefaultRelays();
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });
});
