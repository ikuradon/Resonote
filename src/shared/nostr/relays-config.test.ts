import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetDefaultRelays = vi.fn();
const fetchLatestMock = vi.fn();

vi.mock('$shared/nostr/store.js', () => ({
  fetchLatest: fetchLatestMock
}));

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: vi.fn().mockResolvedValue({
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
    fetchLatestMock.mockResolvedValue(null);

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
  });

  it('applies user relays when kind:10002 event found', async () => {
    fetchLatestMock.mockResolvedValue({
      tags: [
        ['r', 'wss://user-relay1.example.com'],
        ['r', 'wss://user-relay2.example.com']
      ]
    });

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://user-relay1.example.com', 'wss://user-relay2.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://user-relay1.example.com',
      'wss://user-relay2.example.com'
    ]);
  });

  it('falls back to defaults on fetchLatest error', async () => {
    fetchLatestMock.mockRejectedValue(new Error('network'));

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
  });

  it('auftakt handles created_at dedup for replaceable events', async () => {
    // fetchLatest already returns the latest event via auftakt store dedup
    fetchLatestMock.mockResolvedValue({
      tags: [['r', 'wss://new-relay.example.com']]
    });

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://new-relay.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith(['wss://new-relay.example.com']);
  });

  it('returns relay tags when found', async () => {
    fetchLatestMock.mockResolvedValue({
      tags: [['r', 'wss://new-relay.example.com']]
    });

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
    const { resetToDefaultRelays } = await import('./relays-config.js');
    await resetToDefaultRelays();
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });
});
