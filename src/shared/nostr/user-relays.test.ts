import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchLatestEvent = vi.fn();
const mockSetDefaultRelays = vi.fn();

vi.mock('$shared/nostr/client.js', () => ({
  fetchLatestEvent: mockFetchLatestEvent,
  setDefaultRelays: mockSetDefaultRelays
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
    mockFetchLatestEvent.mockResolvedValueOnce(null);

    const { applyUserRelays } = await import('./user-relays.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });

  it('should apply user relays when kind:10002 event found', async () => {
    mockFetchLatestEvent.mockResolvedValueOnce({
      created_at: 1000,
      content: '',
      tags: [
        ['r', 'wss://user-relay1.example.com'],
        ['r', 'wss://user-relay2.example.com']
      ]
    });

    const { applyUserRelays } = await import('./user-relays.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://user-relay1.example.com', 'wss://user-relay2.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://user-relay1.example.com',
      'wss://user-relay2.example.com'
    ]);
  });

  it('should fall back to defaults on error', async () => {
    mockFetchLatestEvent.mockRejectedValueOnce(new Error('network'));

    const { applyUserRelays } = await import('./user-relays.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });

  it('resetToDefaultRelays should call setDefaultRelays with defaults', async () => {
    const { resetToDefaultRelays } = await import('./user-relays.js');
    await resetToDefaultRelays();
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });
});
