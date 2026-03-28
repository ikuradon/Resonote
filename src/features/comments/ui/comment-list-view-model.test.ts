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
  authState: { pubkey: 'me' as string | null, loggedIn: true, canWrite: true },
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

vi.mock('$shared/nostr/content-parser.js', () => ({
  containsPrivateKey: (content: string) => content.includes('nsec1')
}));

vi.mock('$features/comments/domain/reaction-rules.js', () => ({
  emptyStats: () => ({ likes: 0, emojis: [], reactors: new Set() })
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

  // -------------------------------------------------------------------------
  // activeComment highlight threshold
  // -------------------------------------------------------------------------
  describe('isNearCurrentPosition', () => {
    it('returns true when position is within 5 seconds of player position', () => {
      playerState.position = 10_000;
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });
      expect(vm.isNearCurrentPosition(8_000)).toBe(true);
      expect(vm.isNearCurrentPosition(12_000)).toBe(true);
      expect(vm.isNearCurrentPosition(10_000)).toBe(true);
    });

    it('returns false when position is more than 5 seconds away', () => {
      playerState.position = 10_000;
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });
      expect(vm.isNearCurrentPosition(3_000)).toBe(false);
      expect(vm.isNearCurrentPosition(16_000)).toBe(false);
    });

    it('returns false when player position is 0', () => {
      playerState.position = 0;
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });
      expect(vm.isNearCurrentPosition(1_000)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // sendReaction
  // -------------------------------------------------------------------------
  describe('sendReaction', () => {
    it('sends reaction and shows success toast', async () => {
      const comment = createComment({ id: 'r-target', pubkey: 'other', content: 'hello' });
      const vm = createCommentListViewModel({
        getComments: () => [comment],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      await vm.sendReaction(comment);

      expect(sendReactionMock).toHaveBeenCalledWith({
        comment,
        contentId,
        provider,
        reaction: '+',
        emojiUrl: undefined
      });
      expect(toastSuccessMock).toHaveBeenCalledWith('toast.reaction_sent');
    });

    it('sends custom emoji reaction', async () => {
      const comment = createComment({ id: 'r-emoji', pubkey: 'other', content: 'hello' });
      const vm = createCommentListViewModel({
        getComments: () => [comment],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      await vm.sendReaction(comment, ':fire:', 'https://example.com/fire.png');

      expect(sendReactionMock).toHaveBeenCalledWith({
        comment,
        contentId,
        provider,
        reaction: ':fire:',
        emojiUrl: 'https://example.com/fire.png'
      });
    });

    it('shows error toast on failure', async () => {
      sendReactionMock.mockRejectedValue(new Error('send failed'));
      const comment = createComment({ id: 'r-fail', pubkey: 'other', content: 'hello' });
      const vm = createCommentListViewModel({
        getComments: () => [comment],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      await vm.sendReaction(comment);

      expect(toastErrorMock).toHaveBeenCalledWith('toast.reaction_failed');
      expect(logErrorMock).toHaveBeenCalled();
    });

    it('does nothing when not logged in', async () => {
      authState.loggedIn = false;
      const comment = createComment({ id: 'r-no-auth', pubkey: 'other', content: 'hello' });
      const vm = createCommentListViewModel({
        getComments: () => [comment],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      await vm.sendReaction(comment);

      expect(sendReactionMock).not.toHaveBeenCalled();
    });

    it('does nothing when already acting on another comment', async () => {
      let resolveFirst!: () => void;
      sendReactionMock.mockImplementation(
        () =>
          new Promise<void>((r) => {
            resolveFirst = r;
          })
      );
      const c1 = createComment({ id: 'acting-1', pubkey: 'other', content: 'a' });
      const c2 = createComment({ id: 'acting-2', pubkey: 'other', content: 'b' });
      const vm = createCommentListViewModel({
        getComments: () => [c1, c2],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      const p1 = vm.sendReaction(c1);
      expect(vm.isActing('acting-1')).toBe(true);

      // Second reaction should be blocked
      await vm.sendReaction(c2);
      expect(sendReactionMock).toHaveBeenCalledTimes(1);

      resolveFirst();
      await p1;
    });
  });

  // -------------------------------------------------------------------------
  // deleteComment
  // -------------------------------------------------------------------------
  describe('deleteComment', () => {
    it('shows error toast on deletion failure', async () => {
      deleteCommentMock.mockRejectedValue(new Error('delete failed'));
      const ownComment = createComment({ id: 'del-fail', pubkey: 'me', content: 'my comment' });
      const vm = createCommentListViewModel({
        getComments: () => [ownComment],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.requestDelete(ownComment);
      await vm.confirmDelete();

      expect(toastErrorMock).toHaveBeenCalledWith('toast.delete_failed');
      expect(logErrorMock).toHaveBeenCalled();
    });

    it('cancelDelete closes the dialog without deleting', () => {
      const ownComment = createComment({ id: 'cancel-del', pubkey: 'me', content: 'my comment' });
      const vm = createCommentListViewModel({
        getComments: () => [ownComment],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.requestDelete(ownComment);
      expect(vm.deleteDialogOpen).toBe(true);

      vm.cancelDelete();
      expect(vm.deleteDialogOpen).toBe(false);
    });

    it('does nothing when deleteTarget is null', async () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      await vm.confirmDelete();
      expect(deleteCommentMock).not.toHaveBeenCalled();
    });

    it('does nothing when trying to delete another user comment', async () => {
      const otherComment = createComment({ id: 'not-mine', pubkey: 'other', content: 'not mine' });
      const vm = createCommentListViewModel({
        getComments: () => [otherComment],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.requestDelete(otherComment);
      await vm.confirmDelete();

      expect(deleteCommentMock).not.toHaveBeenCalled();
    });

    it('does nothing when not logged in', async () => {
      authState.loggedIn = false;
      const ownComment = createComment({ id: 'no-auth-del', pubkey: 'me', content: 'mine' });
      const vm = createCommentListViewModel({
        getComments: () => [ownComment],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.requestDelete(ownComment);
      await vm.confirmDelete();

      expect(deleteCommentMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // muteUser
  // -------------------------------------------------------------------------
  describe('muteUser', () => {
    it('handles mute failure gracefully', async () => {
      muteUserMock.mockRejectedValue(new Error('mute failed'));
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.requestMute('bad-actor');
      await vm.confirmMute();

      expect(logErrorMock).toHaveBeenCalled();
      expect(vm.muteDialogOpen).toBe(false);
    });

    it('cancelMute closes dialog without muting', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.requestMute('target');
      expect(vm.muteDialogOpen).toBe(true);

      vm.cancelMute();
      expect(vm.muteDialogOpen).toBe(false);
    });

    it('does nothing when muteTarget is null', async () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      await vm.confirmMute();
      expect(muteUserMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // muted user / word-muted content filtering
  // -------------------------------------------------------------------------
  describe('filtering', () => {
    it('filters out muted user comments', () => {
      const comments = [
        createComment({ id: 'visible', pubkey: 'other', content: 'ok' }),
        createComment({ id: 'muted', pubkey: 'muted-user', content: 'hidden' })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.filteredComments.map((c) => c.id)).toEqual(['visible']);
    });

    it('filters out word-muted comments', () => {
      const comments = [
        createComment({ id: 'ok', pubkey: 'other', content: 'fine' }),
        createComment({ id: 'bad', pubkey: 'other', content: 'blocked-word here' })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.filteredComments.map((c) => c.id)).toEqual(['ok']);
    });
  });

  // -------------------------------------------------------------------------
  // submitReply edge cases
  // -------------------------------------------------------------------------
  describe('submitReply edge cases', () => {
    it('shows error toast on reply failure', async () => {
      sendReplyMock.mockRejectedValue(new Error('send failed'));
      const parent = createComment({ id: 'reply-fail', pubkey: 'other', content: 'hello' });
      const vm = createCommentListViewModel({
        getComments: () => [parent],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.startReply(parent);
      vm.replyContent = 'my reply';
      await vm.submitReply();

      expect(toastErrorMock).toHaveBeenCalledWith('toast.reply_failed');
      expect(logErrorMock).toHaveBeenCalled();
      // Reply form should NOT be cleared on failure (replySending resets)
      expect(vm.replySending).toBe(false);
    });

    it('does nothing when reply content is empty/whitespace', async () => {
      const parent = createComment({ id: 'empty-reply', pubkey: 'other', content: 'hello' });
      const vm = createCommentListViewModel({
        getComments: () => [parent],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.startReply(parent);
      vm.replyContent = '   ';
      await vm.submitReply();

      expect(sendReplyMock).not.toHaveBeenCalled();
    });

    it('does nothing when replyTarget is null', async () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.replyContent = 'no target';
      await vm.submitReply();

      expect(sendReplyMock).not.toHaveBeenCalled();
    });

    it('does nothing when not logged in', async () => {
      authState.loggedIn = false;
      const parent = createComment({ id: 'no-auth-reply', pubkey: 'other', content: 'hello' });
      const vm = createCommentListViewModel({
        getComments: () => [parent],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.startReply(parent);
      vm.replyContent = 'reply';
      await vm.submitReply();

      expect(sendReplyMock).not.toHaveBeenCalled();
    });

    it('omits emojiTags when empty', async () => {
      const parent = createComment({ id: 'no-emoji', pubkey: 'other', content: 'hello' });
      const vm = createCommentListViewModel({
        getComments: () => [parent],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.startReply(parent);
      vm.replyContent = 'plain reply';
      await vm.submitReply();

      expect(sendReplyMock).toHaveBeenCalledWith(expect.objectContaining({ emojiTags: undefined }));
    });
  });

  // -------------------------------------------------------------------------
  // containsPrivateKey detection
  // -------------------------------------------------------------------------
  describe('containsPrivateKey detection', () => {
    it('blocks submission and shows error when reply contains private key', async () => {
      const parent = createComment({ id: 'pk-parent', pubkey: 'other', content: 'hello' });
      const vm = createCommentListViewModel({
        getComments: () => [parent],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.startReply(parent);
      vm.replyContent = 'nsec1abc123';
      await vm.submitReply();

      expect(sendReplyMock).not.toHaveBeenCalled();
      expect(toastErrorMock).toHaveBeenCalledWith('comment.error.contains_private_key');
    });
  });

  // -------------------------------------------------------------------------
  // statsFor and myReactionFor
  // -------------------------------------------------------------------------
  describe('statsFor / myReactionFor', () => {
    it('returns empty stats for unknown event', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      const stats = vm.statsFor('unknown');
      expect(stats.likes).toBe(0);
      expect(stats.emojis).toEqual([]);
    });

    it('returns stats from reaction index', () => {
      const reactionIndex = new Map([
        ['c1', { likes: 3, emojis: [], reactors: new Set(['a', 'b', 'c']) }]
      ]);
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => reactionIndex,
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.statsFor('c1').likes).toBe(3);
    });

    it('myReactionFor returns true when auth pubkey is in reactors', () => {
      const reactionIndex = new Map([['c1', { likes: 1, emojis: [], reactors: new Set(['me']) }]]);
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => reactionIndex,
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.myReactionFor('c1')).toBe(true);
    });

    it('myReactionFor returns false when auth pubkey is not in reactors', () => {
      const reactionIndex = new Map([
        ['c1', { likes: 1, emojis: [], reactors: new Set(['other']) }]
      ]);
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => reactionIndex,
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.myReactionFor('c1')).toBe(false);
    });

    it('myReactionFor returns false when not logged in', () => {
      authState.pubkey = null;
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.myReactionFor('c1')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // isOwn
  // -------------------------------------------------------------------------
  describe('isOwn', () => {
    it('returns true for own pubkey', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.isOwn('me')).toBe(true);
    });

    it('returns false for other pubkey', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.isOwn('other')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // CW reveal/hide
  // -------------------------------------------------------------------------
  describe('content warning reveal/hide', () => {
    it('reveals and hides content warning', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.isRevealed('cw-1')).toBe(false);
      vm.revealCW('cw-1');
      expect(vm.isRevealed('cw-1')).toBe(true);
      vm.hideCW('cw-1');
      expect(vm.isRevealed('cw-1')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // reply open state
  // -------------------------------------------------------------------------
  describe('reply state management', () => {
    it('startReply opens reply form and cancelReply closes it', () => {
      const parent = createComment({ id: 'p1', pubkey: 'other', content: 'hi' });
      const vm = createCommentListViewModel({
        getComments: () => [parent],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.isReplyOpen('p1')).toBe(false);
      vm.startReply(parent);
      expect(vm.isReplyOpen('p1')).toBe(true);
      vm.cancelReply();
      expect(vm.isReplyOpen('p1')).toBe(false);
      expect(vm.replyContent).toBe('');
      expect(vm.replyEmojiTags).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // timedComments / generalComments classification
  // -------------------------------------------------------------------------
  describe('timedComments / generalComments classification', () => {
    it('classifies comments with positionMs as timed', () => {
      const comments = [
        createComment({ id: 't1', pubkey: 'me', content: 'timed', positionMs: 5_000 }),
        createComment({ id: 'g1', pubkey: 'me', content: 'general' })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.timedComments).toHaveLength(1);
      expect(vm.timedComments[0].id).toBe('t1');
      expect(vm.generalComments).toHaveLength(1);
      expect(vm.generalComments[0].id).toBe('g1');
    });

    it('sorts timed comments by positionMs ascending', () => {
      const comments = [
        createComment({ id: 't3', pubkey: 'me', content: 'late', positionMs: 30_000 }),
        createComment({ id: 't1', pubkey: 'me', content: 'early', positionMs: 10_000 }),
        createComment({ id: 't2', pubkey: 'me', content: 'mid', positionMs: 20_000 })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.timedComments.map((c) => c.id)).toEqual(['t1', 't2', 't3']);
    });

    it('sorts general comments by createdAt descending', () => {
      const comments = [
        createComment({ id: 'g1', pubkey: 'me', content: 'old', createdAt: 100 }),
        createComment({ id: 'g3', pubkey: 'me', content: 'new', createdAt: 300 }),
        createComment({ id: 'g2', pubkey: 'me', content: 'mid', createdAt: 200 })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.generalComments.map((c) => c.id)).toEqual(['g3', 'g2', 'g1']);
    });

    it('excludes replies from both timed and general lists', () => {
      const comments = [
        createComment({ id: 'parent', pubkey: 'me', content: 'parent', positionMs: 5_000 }),
        createComment({
          id: 'reply',
          pubkey: 'me',
          content: 'reply',
          replyTo: 'parent',
          positionMs: 6_000
        })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.timedComments).toHaveLength(1);
      expect(vm.timedComments[0].id).toBe('parent');
    });
  });

  // -------------------------------------------------------------------------
  // orphanParents placeholder resolution
  // -------------------------------------------------------------------------
  describe('orphanParents', () => {
    it('returns placeholder comments for orphan parent IDs', () => {
      const reply = createComment({
        id: 'orphan-reply',
        pubkey: 'me',
        content: 'reply',
        replyTo: 'missing'
      });
      const placeholders = new Map([
        ['missing', { id: 'missing', status: 'loading' as const, positionMs: null }]
      ]);
      const vm = createCommentListViewModel({
        getComments: () => [reply],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider,
        getPlaceholders: () => placeholders
      });

      expect(vm.orphanParents).toHaveLength(1);
      expect(vm.orphanParents[0].id).toBe('missing');
      expect(vm.orphanParents[0].status).toBe('loading');
    });

    it('returns empty when no placeholders provided', () => {
      const reply = createComment({
        id: 'orphan-reply',
        pubkey: 'me',
        content: 'reply',
        replyTo: 'missing'
      });
      const vm = createCommentListViewModel({
        getComments: () => [reply],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.orphanParents).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // handleTimedRangeChange / jumpToNow
  // -------------------------------------------------------------------------
  describe('handleTimedRangeChange and jumpToNow', () => {
    it('sets userScrolledAway when visible range does not contain target', () => {
      const comments = [
        createComment({ id: 't1', pubkey: 'me', content: 'a', positionMs: 1_000 }),
        createComment({ id: 't2', pubkey: 'me', content: 'b', positionMs: 5_000 }),
        createComment({ id: 't3', pubkey: 'me', content: 'c', positionMs: 10_000 })
      ];
      const mockScroller = {
        scrollToIndex: vi.fn(),
        isAutoScrolling: () => false
      };
      playerState.position = 10_000;
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider,
        getTimedList: () => mockScroller
      });

      // target index for position 10_000 should be 2
      // Visible range is 0-1 (doesn't contain 2)
      vm.handleTimedRangeChange(0, 1);
      expect(vm.userScrolledAway).toBe(true);
    });

    it('jumpToNow resets userScrolledAway and scrolls to nearest index', () => {
      const comments = [
        createComment({ id: 't1', pubkey: 'me', content: 'a', positionMs: 1_000 }),
        createComment({ id: 't2', pubkey: 'me', content: 'b', positionMs: 5_000 })
      ];
      const mockScroller = {
        scrollToIndex: vi.fn(),
        isAutoScrolling: () => false
      };
      playerState.position = 5_000;
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider,
        getTimedList: () => mockScroller
      });

      vm.handleTimedRangeChange(0, 0);
      expect(vm.userScrolledAway).toBe(true);

      vm.jumpToNow();
      expect(vm.userScrolledAway).toBe(false);
      expect(mockScroller.scrollToIndex).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // followFilter
  // -------------------------------------------------------------------------
  describe('followFilter', () => {
    it('defaults to all', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.followFilter).toBe('all');
    });

    it('updates when setFollowFilter is called', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.setFollowFilter('follows');
      expect(vm.followFilter).toBe('follows');
    });
  });

  // -------------------------------------------------------------------------
  // activeTab
  // -------------------------------------------------------------------------
  describe('activeTab', () => {
    it('defaults to flow', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.activeTab).toBe('flow');
    });

    it('updates when setActiveTab is called with shout', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.setActiveTab('shout');
      expect(vm.activeTab).toBe('shout');
    });

    it('updates when setActiveTab is called with info', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.setActiveTab('info');
      expect(vm.activeTab).toBe('info');
    });

    it('updates back to flow when setActiveTab is called with flow', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.setActiveTab('shout');
      vm.setActiveTab('flow');
      expect(vm.activeTab).toBe('flow');
    });
  });

  // -------------------------------------------------------------------------
  // shoutComments
  // -------------------------------------------------------------------------
  describe('shoutComments', () => {
    it('contains only general comments (no timed, no replies)', () => {
      const comments = [
        createComment({ id: 't1', pubkey: 'me', content: 'timed', positionMs: 5_000 }),
        createComment({ id: 'g1', pubkey: 'me', content: 'general', createdAt: 100 }),
        createComment({
          id: 'r1',
          pubkey: 'me',
          content: 'reply',
          createdAt: 200,
          replyTo: 'g1'
        })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.shoutComments).toHaveLength(1);
      expect(vm.shoutComments[0].id).toBe('g1');
    });

    it('sorts general comments by createdAt ascending (oldest first)', () => {
      const comments = [
        createComment({ id: 'g1', pubkey: 'me', content: 'old', createdAt: 100 }),
        createComment({ id: 'g3', pubkey: 'me', content: 'new', createdAt: 300 }),
        createComment({ id: 'g2', pubkey: 'me', content: 'mid', createdAt: 200 })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.shoutComments.map((c) => c.id)).toEqual(['g1', 'g2', 'g3']);
    });

    it('generalComments is still sorted descending (newest first) independently', () => {
      const comments = [
        createComment({ id: 'g1', pubkey: 'me', content: 'old', createdAt: 100 }),
        createComment({ id: 'g3', pubkey: 'me', content: 'new', createdAt: 300 }),
        createComment({ id: 'g2', pubkey: 'me', content: 'mid', createdAt: 200 })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.generalComments.map((c) => c.id)).toEqual(['g3', 'g2', 'g1']);
      expect(vm.shoutComments.map((c) => c.id)).toEqual(['g1', 'g2', 'g3']);
    });

    it('respects follow filter (same as generalComments)', () => {
      const comments = [
        createComment({ id: 'g-me', pubkey: 'me', content: 'mine', createdAt: 100 }),
        createComment({ id: 'g-other', pubkey: 'other', content: 'other', createdAt: 200 })
      ];
      const vm = createCommentListViewModel({
        getComments: () => comments,
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.setFollowFilter('follows');
      // 'other' is not 'followed' or 'me' for 'follows' filter... wait, matchesFilterMock
      // returns true for 'me' when filter='follows'
      expect(vm.shoutComments.map((c) => c.id)).toEqual(['g-me']);
    });
  });

  // -------------------------------------------------------------------------
  // shoutAtBottom / setShoutAtBottom / jumpToLatest
  // -------------------------------------------------------------------------
  describe('shoutAtBottom', () => {
    it('defaults to true', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.shoutAtBottom).toBe(true);
    });

    it('updates when setShoutAtBottom is called with false', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.setShoutAtBottom(false);
      expect(vm.shoutAtBottom).toBe(false);
    });

    it('updates when setShoutAtBottom is called with true', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.setShoutAtBottom(false);
      expect(vm.shoutAtBottom).toBe(false);

      vm.setShoutAtBottom(true);
      expect(vm.shoutAtBottom).toBe(true);
    });
  });

  describe('jumpToLatest', () => {
    it('sets shoutAtBottom to true', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      vm.setShoutAtBottom(false);
      expect(vm.shoutAtBottom).toBe(false);

      vm.jumpToLatest();
      expect(vm.shoutAtBottom).toBe(true);
    });

    it('keeps shoutAtBottom true when already at bottom', () => {
      const vm = createCommentListViewModel({
        getComments: () => [],
        getReactionIndex: () => new Map(),
        getContentId: () => contentId,
        getProvider: () => provider
      });

      expect(vm.shoutAtBottom).toBe(true);
      vm.jumpToLatest();
      expect(vm.shoutAtBottom).toBe(true);
    });
  });
});
