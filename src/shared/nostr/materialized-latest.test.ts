import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchBackwardFirstMock = vi.fn();

vi.mock('$shared/nostr/query.js', () => ({
  fetchBackwardFirst: fetchBackwardFirstMock
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchMaterializedLatestEvent', () => {
  it('delegates to the materialized backward query helper', async () => {
    fetchBackwardFirstMock.mockResolvedValueOnce({
      created_at: 2,
      tags: [['r', 'wss://relay.example']],
      content: 'new',
      id: 'event-id'
    });
    const { fetchMaterializedLatestEvent } = await import('./materialized-latest.js');

    await expect(fetchMaterializedLatestEvent('pubkey', 1)).resolves.toEqual({
      created_at: 2,
      tags: [['r', 'wss://relay.example']],
      content: 'new'
    });
    expect(fetchBackwardFirstMock).toHaveBeenCalledWith(
      [{ kinds: [1], authors: ['pubkey'], limit: 1 }],
      { timeoutMs: 10_000 }
    );
  });

  it('returns null when the materialized query misses', async () => {
    fetchBackwardFirstMock.mockResolvedValueOnce(null);
    const { fetchMaterializedLatestEvent } = await import('./materialized-latest.js');

    await expect(fetchMaterializedLatestEvent('pubkey', 1)).resolves.toBeNull();
    expect(fetchBackwardFirstMock).toHaveBeenCalledWith(
      [{ kinds: [1], authors: ['pubkey'], limit: 1 }],
      { timeoutMs: 10_000 }
    );
  });
});
