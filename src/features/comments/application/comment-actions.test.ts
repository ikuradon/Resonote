import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentId, ContentProvider } from '$shared/content/types.js';

import type { Comment } from '../domain/comment-model.js';

const { buildCommentMock, buildReactionMock, buildDeletionMock, castSignedMock, logInfoMock } =
  vi.hoisted(() => ({
    buildCommentMock: vi.fn(() => ({ kind: 1111, content: '', tags: [] })),
    buildReactionMock: vi.fn(() => ({ kind: 7, content: '+', tags: [] })),
    buildDeletionMock: vi.fn(() => ({ kind: 5, content: '', tags: [] })),
    castSignedMock: vi.fn(async () => {}),
    logInfoMock: vi.fn()
  }));

vi.mock('$shared/nostr/events.js', () => ({
  COMMENT_KIND: 1111,
  buildComment: buildCommentMock,
  buildReaction: buildReactionMock,
  buildDeletion: buildDeletionMock
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  castSigned: castSignedMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: logInfoMock, debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  shortHex: (hex: string) => hex.slice(0, 8)
}));

import { deleteComment, sendComment, sendReaction, sendReply } from './comment-actions.js';

const contentId: ContentId = { platform: 'spotify', type: 'track', id: 'track-1' };
const provider: ContentProvider = {
  platform: 'spotify',
  displayName: 'Spotify',
  requiresExtension: false,
  parseUrl: () => null,
  toNostrTag: (): [string, string] => ['spotify:track:track-1', ''],
  contentKind: () => 'spotify:track',
  embedUrl: () => null,
  openUrl: () => 'https://open.spotify.com/track/track-1'
};

const builtEvent = { kind: 1111, content: '', tags: [] };

describe('sendComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildCommentMock.mockReturnValue(builtEvent);
  });

  it('passes content, contentId, provider to buildComment', async () => {
    await sendComment({ content: 'hello', contentId, provider });
    expect(buildCommentMock).toHaveBeenCalledWith('hello', contentId, provider, {
      positionMs: undefined,
      emojiTags: undefined,
      contentWarning: undefined
    });
  });

  it('passes optional positionMs, emojiTags, contentWarning to buildComment', async () => {
    const emojiTags = [['emoji', 'wave', 'https://example.com/wave.png']];
    await sendComment({
      content: 'hi',
      contentId,
      provider,
      positionMs: 3000,
      emojiTags,
      contentWarning: 'spoiler'
    });
    expect(buildCommentMock).toHaveBeenCalledWith('hi', contentId, provider, {
      positionMs: 3000,
      emojiTags,
      contentWarning: 'spoiler'
    });
  });

  it('calls castSigned with the built event', async () => {
    await sendComment({ content: 'hello', contentId, provider });
    expect(castSignedMock).toHaveBeenCalledWith(builtEvent);
  });

  it('propagates errors from castSigned', async () => {
    castSignedMock.mockRejectedValueOnce(new Error('network error'));
    await expect(sendComment({ content: 'hello', contentId, provider })).rejects.toThrow(
      'network error'
    );
  });

  it('propagates errors from buildComment', async () => {
    buildCommentMock.mockImplementationOnce(() => {
      throw new Error('build error');
    });
    await expect(sendComment({ content: 'hello', contentId, provider })).rejects.toThrow(
      'build error'
    );
  });
});

describe('sendReply', () => {
  const parentEvent = { id: 'parent-event-id', pubkey: 'parent-pubkey' };

  beforeEach(() => {
    vi.clearAllMocks();
    buildCommentMock.mockReturnValue(builtEvent);
  });

  it('passes content, contentId, provider, parentEvent to buildComment', async () => {
    await sendReply({ content: 'reply', contentId, provider, parentEvent });
    expect(buildCommentMock).toHaveBeenCalledWith('reply', contentId, provider, {
      positionMs: undefined,
      emojiTags: undefined,
      parentEvent
    });
  });

  it('passes optional positionMs and emojiTags to buildComment', async () => {
    const emojiTags = [['emoji', 'heart', 'https://example.com/heart.png']];
    await sendReply({
      content: 'reply',
      contentId,
      provider,
      parentEvent,
      positionMs: 5000,
      emojiTags
    });
    expect(buildCommentMock).toHaveBeenCalledWith('reply', contentId, provider, {
      positionMs: 5000,
      emojiTags,
      parentEvent
    });
  });

  it('calls castSigned with the built event', async () => {
    await sendReply({ content: 'reply', contentId, provider, parentEvent });
    expect(castSignedMock).toHaveBeenCalledWith(builtEvent);
  });

  it('propagates errors from castSigned', async () => {
    castSignedMock.mockRejectedValueOnce(new Error('send failed'));
    await expect(sendReply({ content: 'reply', contentId, provider, parentEvent })).rejects.toThrow(
      'send failed'
    );
  });
});

describe('sendReaction', () => {
  const comment: Comment = {
    id: 'comment-id',
    pubkey: 'comment-pubkey',
    content: 'original comment',
    createdAt: 1000,
    positionMs: null,
    emojiTags: [],
    replyTo: null,
    contentWarning: null
  };
  const reactionEvent = { kind: 7, content: '+', tags: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    buildReactionMock.mockReturnValue(reactionEvent);
  });

  it('passes comment id, pubkey, contentId, provider and default reaction to buildReaction', async () => {
    await sendReaction({ comment, contentId, provider });
    expect(buildReactionMock).toHaveBeenCalledWith(
      'comment-id',
      'comment-pubkey',
      contentId,
      provider,
      '+',
      undefined
    );
  });

  it('passes custom reaction string to buildReaction', async () => {
    await sendReaction({ comment, contentId, provider, reaction: ':wave:' });
    expect(buildReactionMock).toHaveBeenCalledWith(
      'comment-id',
      'comment-pubkey',
      contentId,
      provider,
      ':wave:',
      undefined
    );
  });

  it('passes emojiUrl to buildReaction', async () => {
    await sendReaction({
      comment,
      contentId,
      provider,
      reaction: ':heart:',
      emojiUrl: 'https://example.com/heart.png'
    });
    expect(buildReactionMock).toHaveBeenCalledWith(
      'comment-id',
      'comment-pubkey',
      contentId,
      provider,
      ':heart:',
      'https://example.com/heart.png'
    );
  });

  it('calls castSigned with the built event', async () => {
    await sendReaction({ comment, contentId, provider });
    expect(castSignedMock).toHaveBeenCalledWith(reactionEvent);
  });

  it('propagates errors from castSigned', async () => {
    castSignedMock.mockRejectedValueOnce(new Error('reaction failed'));
    await expect(sendReaction({ comment, contentId, provider })).rejects.toThrow('reaction failed');
  });
});

describe('deleteComment', () => {
  const deletionEvent = { kind: 5, content: '', tags: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    buildDeletionMock.mockReturnValue(deletionEvent);
  });

  it('passes commentIds, contentId, provider, COMMENT_KIND to buildDeletion', async () => {
    await deleteComment({ commentIds: ['id-1', 'id-2'], contentId, provider });
    expect(buildDeletionMock).toHaveBeenCalledWith(['id-1', 'id-2'], contentId, provider, 1111);
  });

  it('passes single commentId to buildDeletion', async () => {
    await deleteComment({ commentIds: ['only-id'], contentId, provider });
    expect(buildDeletionMock).toHaveBeenCalledWith(['only-id'], contentId, provider, 1111);
  });

  it('calls castSigned with the built event', async () => {
    await deleteComment({ commentIds: ['id-1'], contentId, provider });
    expect(castSignedMock).toHaveBeenCalledWith(deletionEvent);
  });

  it('propagates errors from castSigned', async () => {
    castSignedMock.mockRejectedValueOnce(new Error('delete failed'));
    await expect(deleteComment({ commentIds: ['id-1'], contentId, provider })).rejects.toThrow(
      'delete failed'
    );
  });

  it('propagates errors from buildDeletion', async () => {
    buildDeletionMock.mockImplementationOnce(() => {
      throw new Error('build deletion error');
    });
    await expect(deleteComment({ commentIds: ['id-1'], contentId, provider })).rejects.toThrow(
      'build deletion error'
    );
  });
});
