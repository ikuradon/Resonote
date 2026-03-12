import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRxNostr = {
  setDefaultRelays: vi.fn(),
  dispose: vi.fn()
};

vi.mock('rx-nostr', () => ({
  createRxNostr: vi.fn(() => mockRxNostr)
}));

vi.mock('@rx-nostr/crypto', () => ({
  verifier: 'mock-verifier'
}));

vi.mock('./relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay1.test', 'wss://relay2.test']
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
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
});
