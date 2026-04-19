import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchBackwardEventsMock,
  getRelayConnectionStateMock,
  observeRelayConnectionStatesMock,
  publishRelayListMock
} = vi.hoisted(() => ({
  fetchBackwardEventsMock: vi.fn(),
  getRelayConnectionStateMock: vi.fn(),
  observeRelayConnectionStatesMock: vi.fn(),
  publishRelayListMock: vi.fn(async () => ['wss://relay.example.com'])
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  fetchBackwardEvents: fetchBackwardEventsMock,
  getRelayConnectionState: getRelayConnectionStateMock,
  observeRelayConnectionStates: observeRelayConnectionStatesMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay.damus.io']
}));

vi.mock('$shared/nostr/events.js', () => ({
  RELAY_LIST_KIND: 10002,
  FOLLOW_KIND: 3
}));

vi.mock('$features/relays/domain/relay-model.js', () => ({
  parseRelayTags: (tags: string[][]): { url: string; read: boolean; write: boolean }[] =>
    tags.filter((t) => t[0] === 'r' && t[1]).map((t) => ({ url: t[1], read: true, write: true }))
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
    getRelayConnectionStateMock.mockResolvedValue(null);
    observeRelayConnectionStatesMock.mockResolvedValue({ unsubscribe: vi.fn() });
  });

  it('returns kind10002 entries when kind:10002 has relay tags', async () => {
    fetchBackwardEventsMock.mockResolvedValueOnce([
      { created_at: 1000, tags: [['r', 'wss://relay.example.com']] }
    ]);

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('kind10002');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toBe('wss://relay.example.com');
  });

  it('falls back to kind3 when kind:10002 returns no relay tags', async () => {
    fetchBackwardEventsMock
      .mockResolvedValueOnce([{ created_at: 1000, tags: [] }])
      .mockResolvedValueOnce([
        {
          created_at: 1000,
          content: JSON.stringify({ 'wss://fallback.relay.com': { read: true, write: true } })
        }
      ]);

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('kind3');
    expect(result.entries[0].url).toBe('wss://fallback.relay.com');
  });

  it('returns source=none when both kind:10002 and kind:3 have no entries', async () => {
    fetchBackwardEventsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('none');
    expect(result.entries).toEqual([]);
  });
});

describe('publishRelayList', () => {
  beforeEach(() => {
    destroyRelayStatus();
    vi.clearAllMocks();
  });

  it('calls publishRelayList action and refreshes relay list', async () => {
    publishRelayListMock.mockResolvedValue(['wss://published.relay.com']);
    getRelayConnectionStateMock.mockResolvedValue(null);

    const entries = [{ url: 'wss://published.relay.com', read: true, write: true }];
    await publishRelayList(entries);

    expect(publishRelayListMock).toHaveBeenCalledWith(entries);
    expect(getRelays()).toHaveLength(1);
    expect(getRelays()[0].url).toBe('wss://published.relay.com');
  });
});
