import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadLatestEvent = vi.fn();
const mockSetPreferredRelays = vi.fn();

vi.mock('$shared/auftakt/resonote.js', () => ({
  readLatestEvent: mockReadLatestEvent,
  setPreferredRelays: mockSetPreferredRelays
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
    mockReadLatestEvent.mockResolvedValueOnce(null);

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
    expect(mockSetPreferredRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });

  it('applies user relays when kind:10002 event found', async () => {
    mockReadLatestEvent.mockResolvedValueOnce({
      created_at: 1000,
      content: '',
      tags: [
        ['r', 'wss://user-relay1.example.com'],
        ['r', 'wss://user-relay2.example.com']
      ]
    });

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://user-relay1.example.com', 'wss://user-relay2.example.com']);
    expect(mockSetPreferredRelays).toHaveBeenCalledWith([
      'wss://user-relay1.example.com',
      'wss://user-relay2.example.com'
    ]);
  });

  it('waits for default relay update before resolving', async () => {
    let resolveSetDefaultRelays!: () => void;
    mockSetPreferredRelays.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSetDefaultRelays = resolve;
      })
    );
    mockReadLatestEvent.mockResolvedValueOnce({
      created_at: 1000,
      content: '',
      tags: [['r', 'wss://user-relay.example.com']]
    });

    const { applyUserRelays } = await import('./relays-config.js');
    let resolved = false;
    const pending = applyUserRelays('deadbeef'.repeat(8)).then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSetPreferredRelays).toHaveBeenCalledWith(['wss://user-relay.example.com']);
    expect(resolved).toBe(false);

    resolveSetDefaultRelays();
    await pending;
    expect(resolved).toBe(true);
  });

  it('falls back to defaults on subscription error', async () => {
    mockReadLatestEvent.mockRejectedValueOnce(new Error('network'));

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
    expect(mockSetPreferredRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });
  it('uses the materialized latest relay list event', async () => {
    mockReadLatestEvent.mockResolvedValueOnce({
      created_at: 2000,
      content: '',
      tags: [['r', 'wss://new-relay.example.com']]
    });

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://new-relay.example.com']);
    expect(mockSetPreferredRelays).toHaveBeenCalledWith(['wss://new-relay.example.com']);
  });

  it('passes the relay list kind to the materialized latest helper', async () => {
    mockReadLatestEvent.mockResolvedValueOnce({
      created_at: 1000,
      content: '',
      tags: [['r', 'wss://relay.example.com']]
    });

    const { applyUserRelays } = await import('./relays-config.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay.example.com']);
    expect(mockReadLatestEvent).toHaveBeenCalledWith('deadbeef'.repeat(8), 10002);
  });
});

describe('relays-config: resetToDefaultRelays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls setPreferredRelays with default relay list', async () => {
    const { resetToDefaultRelays } = await import('./relays-config.js');
    await resetToDefaultRelays();
    expect(mockSetPreferredRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });
});
