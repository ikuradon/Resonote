import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchRelayListEventsMock, snapshotRelayStatusesMock, publishRelayListMock } = vi.hoisted(
  () => ({
    fetchRelayListEventsMock: vi.fn(),
    snapshotRelayStatusesMock: vi.fn(),
    publishRelayListMock: vi.fn(async () => ['wss://relay.example.com'])
  })
);

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchRelayListEvents: fetchRelayListEventsMock,
  observeRelayStatuses: vi.fn(),
  snapshotRelayStatuses: snapshotRelayStatusesMock
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
    snapshotRelayStatusesMock.mockImplementation(async (urls: string[]) =>
      urls.map((url) => ({
        url,
        relay: { url, connection: 'idle', replaying: false, degraded: false, reason: 'opened' },
        aggregate: { state: 'booting', reason: 'relay-opened', relays: [] }
      }))
    );
  });

  it('returns kind10002 entries when relay list events contain relay tags', async () => {
    fetchRelayListEventsMock.mockResolvedValueOnce({
      relayListEvents: [{ created_at: 1000, tags: [['r', 'wss://relay.example.com']] }],
      followListEvents: []
    });

    const result = await fetchRelayList(PUBKEY);

    expect(result).toEqual({
      source: 'kind10002',
      entries: [{ url: 'wss://relay.example.com', read: true, write: true }]
    });
  });

  it('falls back to kind3 entries when kind10002 is empty', async () => {
    fetchRelayListEventsMock.mockResolvedValueOnce({
      relayListEvents: [{ created_at: 1000, tags: [] }],
      followListEvents: [
        {
          created_at: 1000,
          content: JSON.stringify({ 'wss://fallback.relay.com': { read: true, write: true } })
        }
      ]
    });

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('kind3');
    expect(result.entries).toEqual([{ url: 'wss://fallback.relay.com', read: true, write: true }]);
  });

  it('returns none when both event groups are empty', async () => {
    fetchRelayListEventsMock.mockResolvedValueOnce({ relayListEvents: [], followListEvents: [] });

    await expect(fetchRelayList(PUBKEY)).resolves.toEqual({ entries: [], source: 'none' });
  });
});

describe('publishRelayList', () => {
  beforeEach(() => {
    destroyRelayStatus();
    vi.clearAllMocks();
  });

  it('publishes via action and refreshes relay state from snapshot', async () => {
    publishRelayListMock.mockResolvedValue(['wss://published.relay.com']);
    snapshotRelayStatusesMock.mockResolvedValue([
      {
        url: 'wss://published.relay.com',
        relay: {
          url: 'wss://published.relay.com',
          connection: 'open',
          replaying: false,
          degraded: false,
          reason: 'opened'
        },
        aggregate: { state: 'live', reason: 'relay-opened', relays: [] }
      }
    ]);

    const entries = [{ url: 'wss://published.relay.com', read: true, write: true }];
    await publishRelayList(entries);

    expect(publishRelayListMock).toHaveBeenCalledWith(entries);
    expect(getRelays()).toEqual([{ url: 'wss://published.relay.com', state: 'connected' }]);
  });
});
