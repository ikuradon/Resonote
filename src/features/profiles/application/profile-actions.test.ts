import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchLatestMock, logErrorMock } = vi.hoisted(() => ({
  fetchLatestMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/nostr/store.js', () => ({
  fetchLatest: fetchLatestMock
}));

vi.mock('$shared/nostr/events.js', () => ({
  FOLLOW_KIND: 3
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock
  })
}));

import { fetchFollowsCount } from './profile-actions.js';

const PUBKEY = 'aabbccdd'.repeat(8);

describe('fetchFollowsCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns count and pubkeys from p tags', async () => {
    fetchLatestMock.mockResolvedValue({
      tags: [
        ['p', 'pk1'],
        ['p', 'pk2'],
        ['p', 'pk3']
      ],
      content: '',
      created_at: 1000
    });
    const result = await fetchFollowsCount(PUBKEY);
    expect(result.count).toBe(3);
    expect(result.pubkeys).toEqual(['pk1', 'pk2', 'pk3']);
  });

  it('returns zero when no latest event found', async () => {
    fetchLatestMock.mockResolvedValue(null);
    const result = await fetchFollowsCount(PUBKEY);
    expect(result.count).toBe(0);
    expect(result.pubkeys).toEqual([]);
  });

  it('filters out p tags without a second element', async () => {
    fetchLatestMock.mockResolvedValue({
      tags: [['p', 'pk1'], ['p'], ['e', 'event-id'], ['p', 'pk2']],
      content: '',
      created_at: 1000
    });
    const result = await fetchFollowsCount(PUBKEY);
    expect(result.count).toBe(2);
    expect(result.pubkeys).toEqual(['pk1', 'pk2']);
  });

  it('returns zero count on error and logs it', async () => {
    const err = new Error('relay down');
    fetchLatestMock.mockRejectedValue(err);
    const result = await fetchFollowsCount(PUBKEY);
    expect(result.count).toBe(0);
    expect(result.pubkeys).toEqual([]);
    expect(logErrorMock).toHaveBeenCalledWith('Failed to fetch follows count', err);
  });

  it('calls fetchLatest with pubkey and FOLLOW_KIND (3)', async () => {
    fetchLatestMock.mockResolvedValue(null);
    await fetchFollowsCount(PUBKEY);
    expect(fetchLatestMock).toHaveBeenCalledWith(PUBKEY, 3);
  });

  it('returns empty list when event has no tags', async () => {
    fetchLatestMock.mockResolvedValue({ tags: [], content: '', created_at: 1000 });
    const result = await fetchFollowsCount(PUBKEY);
    expect(result.count).toBe(0);
    expect(result.pubkeys).toEqual([]);
  });
});
