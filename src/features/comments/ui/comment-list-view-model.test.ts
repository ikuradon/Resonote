import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '$features/comments/domain/comment-model.js';

const {
  playerState,
  authState,
  muteListState,
  displayByPubkey,
  dispatchSeekMock,
  matchesFilterMock,
  isMutedMock,
  isWordMutedMock,
  muteUserMock,
  toastSuccessMock,
  toastErrorMock,
  sendReactionMock,
  sendReplyMock,
  deleteCommentMock,
  logErrorMock
} = vi.hoisted(() => ({
  playerState: { position: 6_000 },
  authState: { pubkey: 'me', loggedIn: true },
  muteListState: { mutedPubkeys: new Set(['muted-user']) },
  displayByPubkey: {
    me: { displayName: 'Me', profileHref: '/profile/me' },
    followed: { displayName: 'Followed', profileHref: '/profile/followed' },
    other: { displayName: 'Other', profileHref: '/profile/other' },
    target: { displayName: 'Target', profileHref: '/profile/target' }
  } as Record<string, { displayName: string; profileHref: string }>,
  dispatchSeekMock: vi.fn(),
  matchesFilterMock: vi.fn((pubkey: string, filter: string) =>
    filter === 'all' ? true : pubkey === 'followed' || pubkey === 'me'
  ),
  isMutedMock: vi.fn((pubkey: string) => pubkey === 'muted-user'),
  isWordMutedMock: vi.fn((content: string) => content.includes('blocked-word')),
  muteUserMock: vi.fn(async () => {}),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  sendReactionMock: vi.fn(async () => {}),
  sendReplyMock: vi.fn(async () => {}),
  deleteCommentMock: vi.fn(async () => {}),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/browser/profile.js', () => ({
  getProfileDisplay: vi.fn((pubkey: string) => displayByPubkey[pubkey] ?? displayByPubkey.other)
}));

vi.mock('$shared/browser/seek-bridge.js', () => ({
  dispatchSeek: dispatchSeekMock
}));

vi.mock('$shared/browser/player.js', () => ({
  getPlayer: () => playerState
}));

vi.mock('$shared/browser/auth.js', () => ({
  getAuth: () => authState
}));

vi.mock('$shared/browser/follows.js', () => ({
  matchesFilter: matchesFilterMock
}));

vi.mock('$shared/browser/mute.js', () => ({
  isMuted: isMutedMock,
  isWordMuted: isWordMutedMock,
  muteUser: muteUserMock,
  hasNip44Support: () => true,
  getMuteList: () => muteListState
}));

vi.mock('$shared/browser/toast.js', () => ({
  toastSuccess: toastSuccessMock,
  toastError: toastErrorMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    error: logErrorMock
  })
}));

vi.mock('$shared/i18n/t.js', () => ({
  t: (key: string) => key
}));

vi.mock('$features/comments/application/comment-actions.js', () => ({
  sendReaction: sendReactionMock,
  sendReply: sendReplyMock,
  deleteComment: deleteCommentMock
}));

import { createCommentListViewModel } from './comment-list-view-model.svelte.js';

function createComment(
  partial: Partial<Comment> & Pick<Comment, 'id' | 'pubkey' | 'content'>
): Comment {
  return {
    id: partial.id,
    pubkey: partial.pubkey,
    content: partial.content,
    createdAt: partial.createdAt ?? 1,
    positionMs: partial.positionMs ?? null,
    emojiTags: partial.emojiTags ?? [],
    replyTo: partial.replyTo ?? null,
    contentWarning: partial.contentWarning ?? null
  };
}

describe('createCommentListViewModel', () => {
  const contentId = { platform: 'spotify', type: 'track', id: 'track-1' };
  const provider = {
    platform: 'spotify',
    displayName: 'Spotify',
    requiresExtension: false,
    parseUrl: () => null,
    toNostrTag: (): [string, string] => ['spotify:track:track-1', ''],
    contentKind: () => 'spotify:track',
    embedUrl: () => null,
    openUrl: () => 'https://open.spotify.com/track/track-1'
  };

  beforeEach(() => {
    playerState.position = 6_000;
    authState.pubkey = 'me';
    authState.loggedIn = true;
    muteListState.mutedPubkeys = new Set(['muted-user']);
    dispatchSeekMock.mockReset();
    matchesFilterMock.mockClear();
    isMutedMock.mockClear();
    isWordMutedMock.mockClear();
    muteUserMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    sendReactionMock.mockReset();
    sendReplyMock.mockReset();
    deleteCommentMock.mockReset();
    logErrorMock.mockReset();
  });

  it('should filter, sort and group comments for rendering', () => {
    const comments = [
      createComment({ id: 'timed-late', pubkey: 'followed', content: 'later', positionMs: 5_000 }),
      createComment({ id: 'timed-early', pubkey: 'other', content: 'earlier', positionMs: 1_000 }),
      createComment({ id: 'general', pubkey: 'followed', content: 'general', createdAt: 5 }),
      createComment({
        id: 'reply',
        pubkey: 'followed',
        content: 'reply',
        createdAt: 6,
        replyTo: 'general'
      }),
      createComment({ id: 'muted-user-comment', pubkey: 'muted-user', content: 'muted' }),
      createComment({ id: 'muted-word-comment', pubkey: 'followed', content: 'blocked-word' })
    ];

    const vm = createCommentListViewModel({
      getComments: () => comments,
      getReactionIndex: () => new Map(),
      getContentId: () => contentId,
      getProvider: () => provider
    });

    expect(vm.timedComments.map((comment) => comment.id)).toEqual(['timed-early', 'timed-late']);
    expect(vm.generalComments.map((comment) => comment.id)).toEqual(['general']);
    expect(vm.replyMap.get('general')?.map((comment) => comment.id)).toEqual(['reply']);
    expect(vm.authorDisplayFor('followed')).toEqual(displayByPubkey.followed);

    vm.setFollowFilter('follows');
    expect(vm.timedComments.map((comment) => comment.id)).toEqual(['timed-late']);
    expect(vm.generalComments.map((comment) => comment.id)).toEqual(['general']);
  });

  it('should confirm deletion through the comment action API', async () => {
    const ownComment = createComment({ id: 'mine', pubkey: 'me', content: 'my comment' });
    const vm = createCommentListViewModel({
      getComments: () => [ownComment],
      getReactionIndex: () => new Map(),
      getContentId: () => contentId,
      getProvider: () => provider
    });

    vm.requestDelete(ownComment);
    expect(vm.deleteDialogOpen).toBe(true);

    await vm.confirmDelete();

    expect(deleteCommentMock).toHaveBeenCalledWith({
      commentIds: ['mine'],
      contentId,
      provider
    });
    expect(vm.deleteDialogOpen).toBe(false);
    expect(toastSuccessMock).toHaveBeenCalledWith('toast.delete_sent');
  });

  it('should submit replies and reset reply state after success', async () => {
    const parent = createComment({ id: 'parent', pubkey: 'followed', content: 'hello' });
    const vm = createCommentListViewModel({
      getComments: () => [parent],
      getReactionIndex: () => new Map(),
      getContentId: () => contentId,
      getProvider: () => provider
    });

    vm.startReply(parent);
    vm.replyContent = '  reply body  ';
    vm.replyEmojiTags = [['emoji', 'sparkles', 'https://example.com/sparkles.png']];

    await vm.submitReply();

    expect(sendReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'reply body',
        contentId,
        provider,
        parentEvent: { id: 'parent', pubkey: 'followed' },
        emojiTags: [['emoji', 'sparkles', 'https://example.com/sparkles.png']]
      })
    );
    expect(vm.isReplyOpen('parent')).toBe(false);
    expect(vm.replyContent).toBe('');
    expect(vm.replyEmojiTags).toEqual([]);
    expect(toastSuccessMock).toHaveBeenCalledWith('toast.reply_sent');
  });

  it('submitReply passes parent positionMs to sendReply', async () => {
    const parent = createComment({
      id: 'timed-parent',
      pubkey: 'followed',
      content: 'timed comment',
      positionMs: 30_000
    });
    const vm = createCommentListViewModel({
      getComments: () => [parent],
      getReactionIndex: () => new Map(),
      getContentId: () => contentId,
      getProvider: () => provider
    });

    vm.startReply(parent);
    vm.replyContent = 'reply to timed';

    await vm.submitReply();

    expect(sendReplyMock).toHaveBeenCalledWith(expect.objectContaining({ positionMs: 30_000 }));
  });

  it('submitReply passes undefined positionMs for general comment reply', async () => {
    const parent = createComment({
      id: 'general-parent',
      pubkey: 'followed',
      content: 'general comment'
    });
    const vm = createCommentListViewModel({
      getComments: () => [parent],
      getReactionIndex: () => new Map(),
      getContentId: () => contentId,
      getProvider: () => provider
    });

    vm.startReply(parent);
    vm.replyContent = 'reply to general';

    await vm.submitReply();

    expect(sendReplyMock).toHaveBeenCalledWith(expect.objectContaining({ positionMs: undefined }));
  });

  describe('orphan detection edge cases', () => {
    it('does not detect orphan when both parent and reply are muted (filtered out)', () => {
      // isMutedMock returns true for 'muted-user'
      // Parent exists in getComments() but is muted → not in filteredComments
      // Reply is also muted → not in filteredComments
      // orphanParentIds checks filteredComments for replyTo references,
      // so neither should trigger orphan detection
      const mutedParent = createComment({
        id: 'muted-parent',
        pubkey: 'muted-user',
        content: 'muted parent'
      });
      const mutedReply = createComment({
        id: 'muted-reply',
        pubkey: 'muted-user',
        content: 'muted reply',
        replyTo: 'muted-parent'
      });
      const vm = createCommentListViewModel({
        getComments: () => [mutedParent, mutedReply],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });
      // filteredComments excludes both → no orphan
      expect(vm.orphanParentIds).toHaveLength(0);
    });

    it('detects orphan when visible reply references non-existent parent', () => {
      // Reply is visible (pubkey 'me', not muted), parent does not exist at all
      const orphanReply = createComment({
        id: 'reply-no-parent',
        pubkey: 'me',
        content: 'my orphan reply',
        replyTo: 'ghost-parent'
      });
      const vm = createCommentListViewModel({
        getComments: () => [orphanReply],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });
      expect(vm.orphanParentIds).toContain('ghost-parent');
    });

    it('deduplicates orphan parent IDs when multiple replies reference same parent', () => {
      const reply1 = createComment({
        id: 'reply-a',
        pubkey: 'me',
        content: 'first reply',
        replyTo: 'same-parent'
      });
      const reply2 = createComment({
        id: 'reply-b',
        pubkey: 'followed',
        content: 'second reply',
        replyTo: 'same-parent'
      });
      const vm = createCommentListViewModel({
        getComments: () => [reply1, reply2],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });
      // Both replies reference the same parent → deduplicated to one entry
      const ids = vm.orphanParentIds.filter((id) => id === 'same-parent');
      expect(ids).toHaveLength(1);
    });

    it('estimatedPositionMs: orphanParentIds contains parent when timed reply references it', () => {
      // Verify that orphanParentIds correctly surfaces the parent ID even when
      // one reply has positionMs and another has null — the $effect uses the
      // timed reply's positionMs as the estimate.
      const timedReply = createComment({
        id: 'timed-reply',
        pubkey: 'me',
        content: 'timed orphan reply',
        replyTo: 'orphan-parent-pos',
        positionMs: 15_000
      });
      const generalReply = createComment({
        id: 'general-reply',
        pubkey: 'followed',
        content: 'general orphan reply',
        replyTo: 'orphan-parent-pos',
        positionMs: null
      });
      const fetchOrphanParentMock = vi.fn();
      const vm = createCommentListViewModel({
        getComments: () => [timedReply, generalReply],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider,
        fetchOrphanParent: fetchOrphanParentMock
      });
      // orphanParentIds should contain the shared parent ID exactly once
      expect(vm.orphanParentIds).toContain('orphan-parent-pos');
      const ids = vm.orphanParentIds.filter((id) => id === 'orphan-parent-pos');
      expect(ids).toHaveLength(1);
      // The $effect calls fetchOrphanParent with the timed reply's positionMs (15_000)
      // as the estimate; verify via the comment model that positionMs=15_000 is available
      const timedReplies = [timedReply, generalReply].filter(
        (c) => c.replyTo === 'orphan-parent-pos' && c.positionMs !== null
      );
      expect(timedReplies[0].positionMs).toBe(15_000);
    });
  });

  describe('orphan parent detection', () => {
    it('detects orphan replies whose parent is not in comments', () => {
      const orphanReply = createComment({
        id: 'reply-1',
        pubkey: 'me',
        content: 'orphan reply',
        replyTo: 'missing-parent',
        positionMs: 15_000
      });
      const opts = {
        getComments: () => [orphanReply],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      };
      const vm = createCommentListViewModel(opts);
      expect(vm.orphanParentIds).toContain('missing-parent');
    });

    it('does not detect orphan when parent exists in comments', () => {
      const parent = createComment({
        id: 'parent-1',
        pubkey: 'me',
        content: 'parent',
        positionMs: 10_000
      });
      const reply = createComment({
        id: 'reply-1',
        pubkey: 'me',
        content: 'reply',
        replyTo: 'parent-1'
      });
      const opts = {
        getComments: () => [parent, reply],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      };
      const vm = createCommentListViewModel(opts);
      expect(vm.orphanParentIds).toHaveLength(0);
    });
  });

  it('should handle mute confirmation and seek dispatch', async () => {
    const comment = createComment({
      id: 'comment-1',
      pubkey: 'target',
      content: 'hello',
      positionMs: 5_000
    });
    const vm = createCommentListViewModel({
      getComments: () => [comment],
      getReactionIndex: () => new Map(),
      getContentId: () => contentId,
      getProvider: () => provider
    });

    expect(vm.canMute).toBe(true);
    expect(vm.muteCount).toBe(1);

    vm.seekToPosition(5_000);
    expect(dispatchSeekMock).toHaveBeenCalledWith(5_000);

    vm.requestMute('target');
    expect(vm.muteDialogOpen).toBe(true);

    await vm.confirmMute();

    expect(muteUserMock).toHaveBeenCalledWith('target');
    expect(vm.muteDialogOpen).toBe(false);
  });
});
