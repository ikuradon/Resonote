import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('user-relays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fall back to default relays when no relay list found', async () => {
    subscribeFn = (observer) => {
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./user-relays.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
  });

  it('should apply user relays when kind:10002 event found', async () => {
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

    const { applyUserRelays } = await import('./user-relays.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://user-relay1.example.com', 'wss://user-relay2.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://user-relay1.example.com',
      'wss://user-relay2.example.com'
    ]);
  });

  it('should fall back to defaults on error', async () => {
    subscribeFn = (observer) => {
      queueMicrotask(() => observer.error?.(new Error('network')));
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./user-relays.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
  });

  it('resetToDefaultRelays should call setDefaultRelays with defaults', async () => {
    subscribeFn = (observer) => {
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { resetToDefaultRelays } = await import('./user-relays.js');
    await resetToDefaultRelays();
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });
});
