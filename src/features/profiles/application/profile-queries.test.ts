import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchBackwardEventsMock, logErrorMock } = vi.hoisted(() => ({
  fetchBackwardEventsMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  fetchBackwardEvents: fetchBackwardEventsMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock
  })
}));

import { fetchProfileComments } from './profile-queries.js';

const PUBKEY = 'aabbccdd'.repeat(8);

describe('fetchProfileComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty list when no events', async () => {
    fetchBackwardEventsMock.mockResolvedValue([]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.oldestTimestamp).toBeNull();
  });

  it('returns comments sorted by createdAt descending', async () => {
    fetchBackwardEventsMock.mockResolvedValue([
      { id: 'a', content: 'first', created_at: 100, tags: [] },
      { id: 'b', content: 'second', created_at: 200, tags: [] }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].id).toBe('b');
    expect(result.comments[1].id).toBe('a');
  });

  it('extracts iTag from I tag', async () => {
    fetchBackwardEventsMock.mockResolvedValue([
      { id: 'x', content: 'hello', created_at: 1000, tags: [['I', 'spotify:track:abc']] }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].iTag).toBe('spotify:track:abc');
  });

  it('sets iTag to null when no I tag', async () => {
    fetchBackwardEventsMock.mockResolvedValue([
      { id: 'y', content: 'no tag', created_at: 500, tags: [['e', 'some-event']] }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].iTag).toBeNull();
  });

  it('sets oldestTimestamp to smallest createdAt', async () => {
    fetchBackwardEventsMock.mockResolvedValue([
      { id: 'a', content: '', created_at: 300, tags: [] },
      { id: 'b', content: '', created_at: 100, tags: [] },
      { id: 'c', content: '', created_at: 200, tags: [] }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.oldestTimestamp).toBe(100);
  });

  it('emits filter without until when not provided', async () => {
    fetchBackwardEventsMock.mockResolvedValue([]);
    await fetchProfileComments(PUBKEY);
    expect(fetchBackwardEventsMock).toHaveBeenCalledWith(
      [{ kinds: [1111], authors: [PUBKEY], limit: 20 }],
      { rejectOnError: true }
    );
  });

  it('emits filter with until when provided', async () => {
    fetchBackwardEventsMock.mockResolvedValue([]);
    await fetchProfileComments(PUBKEY, 9999);
    expect(fetchBackwardEventsMock).toHaveBeenCalledWith(
      [{ kinds: [1111], authors: [PUBKEY], limit: 20, until: 9999 }],
      { rejectOnError: true }
    );
  });

  it('sets hasMore=true when items.length >= 20', async () => {
    fetchBackwardEventsMock.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `id${i}`, content: '', created_at: i, tags: [] }))
    );
    const result = await fetchProfileComments(PUBKEY);
    expect(result.hasMore).toBe(true);
  });

  it('rejects and logs error when fetchBackwardEvents rejects', async () => {
    const testError = new Error('relay error');
    fetchBackwardEventsMock.mockRejectedValue(testError);

    await expect(fetchProfileComments(PUBKEY)).rejects.toThrow('relay error');
    expect(logErrorMock).toHaveBeenCalledWith('Failed to load profile comments', testError);
  });
});
