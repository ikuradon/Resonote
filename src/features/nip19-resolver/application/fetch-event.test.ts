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

    expect(fetchByIdMock).toHaveBeenCalledWith('event-id-4', {
      relayHint: 'wss://relay.example.com',
      timeout: 10_000
    });
  });

  it('passes no relayHint when relayHints is empty', async () => {
    fetchByIdMock.mockResolvedValue(null);

    await fetchNostrEvent('event-id-5', []);

    expect(fetchByIdMock).toHaveBeenCalledWith('event-id-5', {
      relayHint: undefined,
      timeout: 10_000
    });
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
