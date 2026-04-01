import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRxNostrMock, fetchLatestMock, publishRelayListMock } = vi.hoisted(() => ({
  getRxNostrMock: vi.fn(),
  fetchLatestMock: vi.fn(),
  publishRelayListMock: vi.fn(async () => ['wss://relay.example.com'])
}));

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: getRxNostrMock
}));

vi.mock('$shared/nostr/store.js', () => ({
  fetchLatest: fetchLatestMock,
  getStoreAsync: vi.fn().mockResolvedValue({
    getSync: vi.fn().mockResolvedValue([]),
    fetchById: vi.fn().mockResolvedValue(null),
    dispose: vi.fn()
  })
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay.damus.io']
}));

vi.mock('$shared/nostr/events.js', () => ({
  RELAY_LIST_KIND: 10002,
  FOLLOW_KIND: 3
}));

vi.mock('$features/relays/domain/relay-model.js', () => ({
  parseRelayTags: (tags: string[][]): { url: string; read: boolean; write: boolean }[] => {
    return tags
      .filter((t) => t[0] === 'r' && t[1])
      .map((t) => ({ url: t[1], read: true, write: true }));
  }
}));

vi.mock('$features/relays/application/relay-actions.js', () => ({
  publishRelayList: publishRelayListMock
}));

import {
  destroyRelayStatus,
  fetchRelayList,
  getRelays,
  publishRelayList
} from './relays.svelte.js';

const PUBKEY = 'aabbccdd'.repeat(8);

describe('fetchRelayList', () => {
  beforeEach(() => {
    destroyRelayStatus();
    vi.clearAllMocks();
  });

  it('returns kind10002 entries when kind:10002 has relay tags', async () => {
    fetchLatestMock.mockResolvedValue({
      created_at: 1000,
      tags: [['r', 'wss://relay.example.com']]
    });

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('kind10002');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toBe('wss://relay.example.com');
  });

  it('falls back to kind3 when kind:10002 returns no relay tags', async () => {
    // First call (kind:10002) — event with no relay tags
    fetchLatestMock
      .mockResolvedValueOnce({ created_at: 1000, tags: [] })
      // Second call (kind:3) — event with relay content
      .mockResolvedValueOnce({
        created_at: 1000,
        tags: [],
        content: JSON.stringify({ 'wss://fallback.relay.com': { read: true, write: true } })
      });

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('kind3');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toBe('wss://fallback.relay.com');
  });

  it('returns source=none when both kind:10002 and kind:3 have no entries', async () => {
    fetchLatestMock.mockResolvedValue(null);

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('none');
    expect(result.entries).toEqual([]);
  });

  it('falls through to kind3 when kind:10002 returns null', async () => {
    fetchLatestMock
      .mockResolvedValueOnce(null) // kind:10002 → null
      .mockResolvedValueOnce(null); // kind:3 → null

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('none');
    // Verify fetchLatest was called twice (once for kind:10002, once for kind:3)
    expect(fetchLatestMock).toHaveBeenCalledTimes(2);
  });
});

describe('publishRelayList', () => {
  beforeEach(() => {
    destroyRelayStatus();
    vi.clearAllMocks();
  });

  it('calls publishRelayList action and refreshes relay list', async () => {
    publishRelayListMock.mockResolvedValue(['wss://published.relay.com']);
    const rxNostr = {
      getRelayStatus: vi.fn(() => null),
      createConnectionStateObservable: vi.fn(() => ({
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() }))
      }))
    };
    getRxNostrMock.mockResolvedValue(rxNostr);

    const entries = [{ url: 'wss://published.relay.com', read: true, write: true }];
    await publishRelayList(entries);

    expect(publishRelayListMock).toHaveBeenCalledWith(entries);
    const relays = getRelays();
    expect(relays).toHaveLength(1);
    expect(relays[0].url).toBe('wss://published.relay.com');
  });
});
