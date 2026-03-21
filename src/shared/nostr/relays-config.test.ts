import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetDefaultRelays = vi.fn();
let subscribeFn: (observer: {
  next?: (packet: unknown) => void;
  complete?: () => void;
  error?: (err: unknown) => void;
}) => { unsubscribe: () => void };

vi.mock('rx-nostr', () => ({
  createRxBackwardReq: () => ({
    emit: vi.fn(),
    over: vi.fn()
  })
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getRxNostr: vi.fn().mockResolvedValue({
    use: () => ({
      subscribe: (observer: {
        next?: (p: unknown) => void;
        complete?: () => void;
        error?: (e: unknown) => void;
      }) => subscribeFn(observer)
    }),
    setDefaultRelays: mockSetDefaultRelays
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
  });

  it('applies user relays when kind:10002 event found', async () => {
    subscribeFn = (observer) => {
      observer.next?.({
        event: {
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

  it('falls back to defaults on subscription error', async () => {
    subscribeFn = (observer) => {
      queueMicrotask(() => observer.error?.(new Error('network')));
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
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
