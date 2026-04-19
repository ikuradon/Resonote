import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProfileCommentEventsMock, logErrorMock } = vi.hoisted(() => ({
  fetchProfileCommentEventsMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchProfileCommentEvents: fetchProfileCommentEventsMock
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
    fetchProfileCommentEventsMock.mockResolvedValue([]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.oldestTimestamp).toBeNull();
  });

  it('returns comments sorted by createdAt descending', async () => {
    fetchProfileCommentEventsMock.mockResolvedValue([
      { id: 'a', content: 'first', created_at: 100, tags: [] },
      { id: 'b', content: 'second', created_at: 200, tags: [] }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].id).toBe('b');
    expect(result.comments[1].id).toBe('a');
  });

  it('extracts iTag from I tag', async () => {
    fetchProfileCommentEventsMock.mockResolvedValue([
      { id: 'x', content: 'hello', created_at: 1000, tags: [['I', 'spotify:track:abc']] }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].iTag).toBe('spotify:track:abc');
  });

  it('sets iTag to null when no I tag', async () => {
    fetchProfileCommentEventsMock.mockResolvedValue([
      { id: 'y', content: 'no tag', created_at: 500, tags: [['e', 'some-event']] }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].iTag).toBeNull();
  });

  it('sets oldestTimestamp to smallest createdAt', async () => {
    fetchProfileCommentEventsMock.mockResolvedValue([
      { id: 'a', content: '', created_at: 300, tags: [] },
      { id: 'b', content: '', created_at: 100, tags: [] },
      { id: 'c', content: '', created_at: 200, tags: [] }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.oldestTimestamp).toBe(100);
  });

  it('emits filter without until when not provided', async () => {
    fetchProfileCommentEventsMock.mockResolvedValue([]);
    await fetchProfileComments(PUBKEY);
    expect(fetchProfileCommentEventsMock).toHaveBeenCalledWith(PUBKEY, undefined, 20);
  });

  it('emits filter with until when provided', async () => {
    fetchProfileCommentEventsMock.mockResolvedValue([]);
    await fetchProfileComments(PUBKEY, 9999);
    expect(fetchProfileCommentEventsMock).toHaveBeenCalledWith(PUBKEY, 9999, 20);
  });

  it('sets hasMore=true when items.length >= 20', async () => {
    fetchProfileCommentEventsMock.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `id${i}`, content: '', created_at: i, tags: [] }))
    );
    const result = await fetchProfileComments(PUBKEY);
    expect(result.hasMore).toBe(true);
  });

  it('rejects and logs error when fetchProfileCommentEvents rejects', async () => {
    const testError = new Error('relay error');
    fetchProfileCommentEventsMock.mockRejectedValue(testError);

    await expect(fetchProfileComments(PUBKEY)).rejects.toThrow('relay error');
    expect(logErrorMock).toHaveBeenCalledWith('Failed to load profile comments', testError);
  });
});
