import { beforeEach, describe, expect, it, vi } from 'vitest';

const { castSignedMock, fetchLatestEventMock, logInfoMock } = vi.hoisted(() => ({
  castSignedMock: vi.fn(async () => {}),
  fetchLatestEventMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  logInfoMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  publishSignedEvent: castSignedMock,
  readLatestEvent: fetchLatestEventMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: logInfoMock, debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  shortHex: (hex: string) => hex.slice(0, 8)
}));

import { publishFollow, publishUnfollow } from './follow-actions.js';

const MY_PUBKEY = 'my-pubkey-abcdef';
const TARGET_PUBKEY = 'target-pubkey-1234';
const FOLLOW_KIND = 3;

describe('publishFollow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches latest kind:3 event for myPubkey', async () => {
    fetchLatestEventMock.mockResolvedValueOnce(null);
    await publishFollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(fetchLatestEventMock).toHaveBeenCalledWith(MY_PUBKEY, FOLLOW_KIND);
  });

  it('publishes event with p-tag added when no existing follow list', async () => {
    fetchLatestEventMock.mockResolvedValueOnce(null);
    await publishFollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: FOLLOW_KIND,
      tags: [['p', TARGET_PUBKEY]],
      content: ''
    });
  });

  it('appends p-tag to existing follow list', async () => {
    const existing = {
      tags: [['p', 'other-pubkey']],
      content: 'relay hints'
    };
    fetchLatestEventMock.mockResolvedValueOnce(existing);
    await publishFollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: FOLLOW_KIND,
      tags: [
        ['p', 'other-pubkey'],
        ['p', TARGET_PUBKEY]
      ],
      content: 'relay hints'
    });
  });

  it('does not call castSigned when already following', async () => {
    const existing = {
      tags: [['p', TARGET_PUBKEY]],
      content: ''
    };
    fetchLatestEventMock.mockResolvedValueOnce(existing);
    await publishFollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(castSignedMock).not.toHaveBeenCalled();
  });

  it('preserves existing content field', async () => {
    const existing = { tags: [], content: '{"relay":"wss://example.com"}' };
    fetchLatestEventMock.mockResolvedValueOnce(existing);
    await publishFollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(castSignedMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: '{"relay":"wss://example.com"}' })
    );
  });

  it('propagates errors from castSigned', async () => {
    fetchLatestEventMock.mockResolvedValueOnce(null);
    castSignedMock.mockRejectedValueOnce(new Error('follow failed'));
    await expect(publishFollow(TARGET_PUBKEY, MY_PUBKEY)).rejects.toThrow('follow failed');
  });

  it('propagates errors from fetchLatestEvent', async () => {
    fetchLatestEventMock.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(publishFollow(TARGET_PUBKEY, MY_PUBKEY)).rejects.toThrow('fetch failed');
  });
});

describe('publishUnfollow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches latest kind:3 event for myPubkey', async () => {
    fetchLatestEventMock.mockResolvedValueOnce(null);
    await publishUnfollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(fetchLatestEventMock).toHaveBeenCalledWith(MY_PUBKEY, FOLLOW_KIND);
  });

  it('does nothing when no existing follow list', async () => {
    fetchLatestEventMock.mockResolvedValueOnce(null);
    await publishUnfollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(castSignedMock).not.toHaveBeenCalled();
  });

  it('removes p-tag from existing follow list', async () => {
    const existing = {
      tags: [
        ['p', 'other-pubkey'],
        ['p', TARGET_PUBKEY]
      ],
      content: ''
    };
    fetchLatestEventMock.mockResolvedValueOnce(existing);
    await publishUnfollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: FOLLOW_KIND,
      tags: [['p', 'other-pubkey']],
      content: ''
    });
  });

  it('publishes empty tag list when unfollowing the only followed user', async () => {
    const existing = {
      tags: [['p', TARGET_PUBKEY]],
      content: ''
    };
    fetchLatestEventMock.mockResolvedValueOnce(existing);
    await publishUnfollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: FOLLOW_KIND,
      tags: [],
      content: ''
    });
  });

  it('preserves existing content field', async () => {
    const existing = {
      tags: [['p', TARGET_PUBKEY]],
      content: '{"relay":"wss://example.com"}'
    };
    fetchLatestEventMock.mockResolvedValueOnce(existing);
    await publishUnfollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(castSignedMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: '{"relay":"wss://example.com"}' })
    );
  });

  it('does not remove unrelated tags (non-p tags)', async () => {
    const existing = {
      tags: [
        ['p', TARGET_PUBKEY],
        ['r', 'wss://relay.example.com']
      ],
      content: ''
    };
    fetchLatestEventMock.mockResolvedValueOnce(existing);
    await publishUnfollow(TARGET_PUBKEY, MY_PUBKEY);
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: FOLLOW_KIND,
      tags: [['r', 'wss://relay.example.com']],
      content: ''
    });
  });

  it('propagates errors from castSigned', async () => {
    fetchLatestEventMock.mockResolvedValueOnce({
      tags: [['p', TARGET_PUBKEY]],
      content: ''
    });
    castSignedMock.mockRejectedValueOnce(new Error('unfollow failed'));
    await expect(publishUnfollow(TARGET_PUBKEY, MY_PUBKEY)).rejects.toThrow('unfollow failed');
  });

  it('propagates errors from fetchLatestEvent', async () => {
    fetchLatestEventMock.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(publishUnfollow(TARGET_PUBKEY, MY_PUBKEY)).rejects.toThrow('fetch failed');
  });
});
