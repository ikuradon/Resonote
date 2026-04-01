import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentId } from '$shared/content/types.js';

const { castSignedMock, fetchLatestMock, logInfoMock } = vi.hoisted(() => ({
  castSignedMock: vi.fn(async () => {}),
  fetchLatestMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  logInfoMock: vi.fn()
}));

vi.mock('$shared/nostr/client.js', () => ({
  castSigned: castSignedMock
}));

vi.mock('$shared/nostr/store.js', () => ({
  fetchLatest: fetchLatestMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: logInfoMock, debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  shortHex: (hex: string) => hex.slice(0, 8)
}));

import { loadBookmarks, publishAddBookmark, publishRemoveBookmark } from './bookmark-actions.js';

const MY_PUBKEY = 'my-pubkey-1234';
const contentId: ContentId = { platform: 'spotify', type: 'track', id: 'track-1' };
const CONTENT_VALUE = 'spotify:track:track-1';
const OPEN_URL = 'https://open.spotify.com/track/track-1';
const BOOKMARK_KIND = 10003;

describe('loadBookmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls fetchLatest with pubkey and kind 10003', async () => {
    fetchLatestMock.mockResolvedValueOnce(null);
    await loadBookmarks(MY_PUBKEY);
    expect(fetchLatestMock).toHaveBeenCalledWith(MY_PUBKEY, BOOKMARK_KIND, {
      directFallback: true
    });
  });

  it('returns null when no event exists', async () => {
    fetchLatestMock.mockResolvedValueOnce(null);
    const result = await loadBookmarks(MY_PUBKEY);
    expect(result).toBeNull();
  });

  it('returns the latest event when it exists', async () => {
    const event = { tags: [['i', CONTENT_VALUE, OPEN_URL]] };
    fetchLatestMock.mockResolvedValueOnce(event);
    const result = await loadBookmarks(MY_PUBKEY);
    expect(result).toEqual(event);
  });

  it('propagates errors from fetchLatest', async () => {
    fetchLatestMock.mockRejectedValueOnce(new Error('fetch error'));
    await expect(loadBookmarks(MY_PUBKEY)).rejects.toThrow('fetch error');
  });
});

describe('publishAddBookmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new tag list when no existing bookmarks', async () => {
    fetchLatestMock.mockResolvedValueOnce(null);
    const tags = await publishAddBookmark(contentId, OPEN_URL, MY_PUBKEY);
    expect(tags).toEqual([['i', CONTENT_VALUE, OPEN_URL]]);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: BOOKMARK_KIND,
      tags: [['i', CONTENT_VALUE, OPEN_URL]],
      content: ''
    });
  });

  it('appends tag to existing bookmarks', async () => {
    const existing = [['i', 'youtube:video:vid-1', 'https://youtube.com/watch?v=vid-1']];
    fetchLatestMock.mockResolvedValueOnce({ tags: existing });
    const tags = await publishAddBookmark(contentId, OPEN_URL, MY_PUBKEY);
    expect(tags).toContainEqual(['i', CONTENT_VALUE, OPEN_URL]);
    expect(tags).toContainEqual(existing[0]);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: BOOKMARK_KIND,
      tags,
      content: ''
    });
  });

  it('returns existing tags without calling castSigned when already bookmarked', async () => {
    const existing = [['i', CONTENT_VALUE, OPEN_URL]];
    fetchLatestMock.mockResolvedValueOnce({ tags: existing });
    const tags = await publishAddBookmark(contentId, OPEN_URL, MY_PUBKEY);
    expect(tags).toEqual(existing);
    expect(castSignedMock).not.toHaveBeenCalled();
  });

  it('fetches latest event with pubkey and kind 10003', async () => {
    fetchLatestMock.mockResolvedValueOnce(null);
    await publishAddBookmark(contentId, OPEN_URL, MY_PUBKEY);
    expect(fetchLatestMock).toHaveBeenCalledWith(MY_PUBKEY, BOOKMARK_KIND, {
      directFallback: true
    });
  });

  it('propagates errors from castSigned', async () => {
    fetchLatestMock.mockResolvedValueOnce(null);
    castSignedMock.mockRejectedValueOnce(new Error('cast error'));
    await expect(publishAddBookmark(contentId, OPEN_URL, MY_PUBKEY)).rejects.toThrow('cast error');
  });
});

describe('publishRemoveBookmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the bookmark tag from existing tags', async () => {
    const other = ['i', 'youtube:video:vid-1', 'https://youtube.com/watch?v=vid-1'];
    const existing = [['i', CONTENT_VALUE, OPEN_URL], other];
    fetchLatestMock.mockResolvedValueOnce({ tags: existing });
    const tags = await publishRemoveBookmark(contentId, MY_PUBKEY);
    expect(tags).not.toContainEqual(['i', CONTENT_VALUE, OPEN_URL]);
    expect(tags).toContainEqual(other);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: BOOKMARK_KIND,
      tags,
      content: ''
    });
  });

  it('publishes empty tags when no existing event', async () => {
    fetchLatestMock.mockResolvedValueOnce(null);
    const tags = await publishRemoveBookmark(contentId, MY_PUBKEY);
    expect(tags).toEqual([]);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: BOOKMARK_KIND,
      tags: [],
      content: ''
    });
  });

  it('publishes empty tags when only bookmark is the one being removed', async () => {
    fetchLatestMock.mockResolvedValueOnce({
      tags: [['i', CONTENT_VALUE, OPEN_URL]]
    });
    const tags = await publishRemoveBookmark(contentId, MY_PUBKEY);
    expect(tags).toEqual([]);
  });

  it('fetches latest event with pubkey and kind 10003', async () => {
    fetchLatestMock.mockResolvedValueOnce(null);
    await publishRemoveBookmark(contentId, MY_PUBKEY);
    expect(fetchLatestMock).toHaveBeenCalledWith(MY_PUBKEY, BOOKMARK_KIND, {
      directFallback: true
    });
  });

  it('propagates errors from castSigned', async () => {
    fetchLatestMock.mockResolvedValueOnce(null);
    castSignedMock.mockRejectedValueOnce(new Error('remove error'));
    await expect(publishRemoveBookmark(contentId, MY_PUBKEY)).rejects.toThrow('remove error');
  });
});
