import { untrack } from 'svelte';

export type CommentTab = 'flow' | 'shout' | 'info';

import type {
  Comment,
  PlaceholderComment,
  ReactionStats
} from '$features/comments/domain/comment-model.js';
import { emptyStats } from '$features/comments/domain/reaction-rules.js';
import { getAuth } from '$shared/browser/auth.js';
import { type FollowFilter, matchesFilter } from '$shared/browser/follows.js';
import {
  getMuteList,
  hasNip44Support,
  isMuted,
  isWordMuted,
  muteUser
} from '$shared/browser/mute.js';
import { getPlayer } from '$shared/browser/player.js';
import { getProfileDisplay, type ProfileDisplay } from '$shared/browser/profile.js';
import { dispatchSeek } from '$shared/browser/seek-bridge.js';
import { toastError, toastSuccess } from '$shared/browser/toast.js';
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { t } from '$shared/i18n/t.js';
import { containsPrivateKey } from '$shared/nostr/content-parser.js';
import { createLogger } from '$shared/utils/logger.js';

import {
  deleteComment as deleteCommentAction,
  sendReaction as sendReactionAction,
  sendReply as sendReplyAction
} from '../application/comment-actions.js';

const log = createLogger('comment-list-vm');

const HIGHLIGHT_THRESHOLD_MS = 5_000;

interface TimedListScroller {
  scrollToIndex(index: number): void;
  isAutoScrolling(): boolean;
}

interface CommentListViewModelOptions {
  getComments: () => Comment[];
  getReactionIndex: () => Map<string, ReactionStats>;
  getContentId: () => ContentId;
  getProvider: () => ContentProvider;
  getTimedList?: () => TimedListScroller | undefined;
  getPlaceholders?: () => Map<string, PlaceholderComment>;
  fetchOrphanParent?: (parentId: string, positionMs: number | null) => void;
}

export function createCommentListViewModel(options: CommentListViewModelOptions) {
  const player = getPlayer();
  const auth = getAuth();
  const muteList = getMuteList();

  let followFilter = $state<FollowFilter>('all');
  let activeTab = $state<CommentTab>('flow');
  let shoutAtBottom = $state(true);
  let userScrolledAway = $state(false);
  let acting = $state<string | null>(null);
  let deleteTarget = $state<Comment | null>(null);
  let muteTarget = $state<{ pubkey: string } | null>(null);
  let revealedCW = $state(new Set<string>());
  let replyTarget = $state<Comment | null>(null);
  let replyContent = $state('');
  let replyEmojiTags = $state<string[][]>([]);
  let replySending = $state(false);

  let lastScrolledIndex = -1;

  let filteredComments = $derived(
    options
      .getComments()
      .filter((c) => matchesFilter(c.pubkey, followFilter, auth.pubkey))
      .filter((c) => !isMuted(c.pubkey) && !isWordMuted(c.content))
  );

  let { timedComments, generalComments } = $derived.by(() => {
    const timed: Comment[] = [];
    const general: Comment[] = [];
    for (const c of filteredComments) {
      if (c.replyTo !== null) continue;
      if (c.positionMs !== null) timed.push(c);
      else general.push(c);
    }
    timed.sort((a, b) => (a.positionMs ?? 0) - (b.positionMs ?? 0));
    general.sort((a, b) => b.createdAt - a.createdAt);
    return { timedComments: timed, generalComments: general };
  });

  let shoutComments = $derived([...generalComments].sort((a, b) => a.createdAt - b.createdAt));

  let replyMap = $derived.by(() => {
    const map = new Map<string, Comment[]>();
    for (const c of filteredComments) {
      if (c.replyTo === null) continue;
      let arr = map.get(c.replyTo);
      if (!arr) {
        arr = [];
        map.set(c.replyTo, arr);
      }
      arr.push(c);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.createdAt - b.createdAt);
    }
    return map;
  });

  let orphanParentIds = $derived.by(() => {
    const commentIdSet = new Set(options.getComments().map((c) => c.id));
    const orphanSet = new Set<string>();
    for (const c of filteredComments) {
      if (c.replyTo !== null && !commentIdSet.has(c.replyTo)) {
        orphanSet.add(c.replyTo);
      }
    }
    return [...orphanSet];
  });

  let orphanParents = $derived.by(() => {
    const pMap = options.getPlaceholders?.() ?? new Map();
    return orphanParentIds
      .map((id) => pMap.get(id))
      .filter((p): p is PlaceholderComment => p !== undefined);
  });

  $effect(() => {
    for (const parentId of orphanParentIds) {
      const estimatedPosition = untrack(
        () =>
          options.getComments().find((c) => c.replyTo === parentId && c.positionMs !== null)
            ?.positionMs ?? null
      );
      options.fetchOrphanParent?.(parentId, estimatedPosition);
    }
  });

  $effect(() => {
    const timedList = options.getTimedList?.();
    if (!userScrolledAway && timedComments.length > 0 && timedList && player.position > 0) {
      const idx = findNearestTimedIndex(player.position);
      if (idx !== lastScrolledIndex) {
        lastScrolledIndex = idx;
        timedList.scrollToIndex(idx);
      }
    }
  });

  function setFollowFilter(filter: FollowFilter): void {
    followFilter = filter;
  }

  function setActiveTab(tab: CommentTab): void {
    activeTab = tab;
  }

  function setShoutAtBottom(atBottom: boolean): void {
    shoutAtBottom = atBottom;
  }

  function jumpToLatest(): void {
    shoutAtBottom = true;
  }

  function findNearestTimedIndex(posMs: number): number {
    let lo = 0;
    let hi = timedComments.length - 1;
    let result = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((timedComments[mid].positionMs ?? 0) <= posMs) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  function handleTimedRangeChange(start: number, end: number): void {
    const timedList = options.getTimedList?.();
    if (timedList && !timedList.isAutoScrolling() && player.position > 0) {
      const target = findNearestTimedIndex(player.position);
      if (target < start || target > end) {
        userScrolledAway = true;
      }
    }
  }

  function jumpToNow(): void {
    userScrolledAway = false;
    const timedList = options.getTimedList?.();
    if (timedList && timedComments.length > 0) {
      timedList.scrollToIndex(findNearestTimedIndex(player.position));
    }
  }

  function statsFor(eventId: string): ReactionStats {
    return options.getReactionIndex().get(eventId) ?? emptyStats();
  }

  function myReactionFor(eventId: string): boolean {
    if (!auth.pubkey) return false;
    return statsFor(eventId).reactors.has(auth.pubkey);
  }

  function isNearCurrentPosition(positionMs: number): boolean {
    if (player.position <= 0) return false;
    return Math.abs(player.position - positionMs) < HIGHLIGHT_THRESHOLD_MS;
  }

  function isOwn(pubkey: string): boolean {
    return auth.pubkey === pubkey;
  }

  function authorDisplayFor(pubkey: string): ProfileDisplay {
    return getProfileDisplay(pubkey);
  }

  function isActing(eventId: string): boolean {
    return acting === eventId;
  }

  function isRevealed(commentId: string): boolean {
    return revealedCW.has(commentId);
  }

  function revealCW(id: string): void {
    revealedCW = new Set([...revealedCW, id]);
  }

  function hideCW(id: string): void {
    const next = new Set(revealedCW);
    next.delete(id);
    revealedCW = next;
  }

  function seekToPosition(positionMs: number): void {
    dispatchSeek(positionMs);
  }

  async function sendReaction(comment: Comment, reaction = '+', emojiUrl?: string) {
    if (!auth.loggedIn || acting) return;
    acting = comment.id;
    try {
      await sendReactionAction({
        comment,
        contentId: options.getContentId(),
        provider: options.getProvider(),
        reaction,
        emojiUrl
      });
      toastSuccess(t('toast.reaction_sent'));
    } catch (err) {
      log.error('Failed to send reaction', err);
      toastError(t('toast.reaction_failed'));
    } finally {
      acting = null;
    }
  }

  function requestDelete(comment: Comment): void {
    deleteTarget = comment;
  }

  function cancelDelete(): void {
    deleteTarget = null;
  }

  async function confirmDelete() {
    if (!deleteTarget || !auth.loggedIn || auth.pubkey !== deleteTarget.pubkey || acting) return;
    const comment = deleteTarget;
    acting = comment.id;
    deleteTarget = null;
    try {
      await deleteCommentAction({
        commentIds: [comment.id],
        contentId: options.getContentId(),
        provider: options.getProvider()
      });
      toastSuccess(t('toast.delete_sent'));
    } catch (err) {
      log.error('Failed to delete comment', err);
      toastError(t('toast.delete_failed'));
    } finally {
      acting = null;
    }
  }

  function requestMute(pubkey: string): void {
    muteTarget = { pubkey };
  }

  function cancelMute(): void {
    muteTarget = null;
  }

  async function confirmMute() {
    const pubkey = muteTarget?.pubkey;
    muteTarget = null;
    if (!pubkey) return;
    try {
      await muteUser(pubkey);
    } catch (err) {
      log.error('Failed to mute', err);
    }
  }

  function startReply(comment: Comment): void {
    replyTarget = comment;
    replyContent = '';
    replyEmojiTags = [];
  }

  function isReplyOpen(commentId: string): boolean {
    return replyTarget?.id === commentId;
  }

  function cancelReply(): void {
    replyTarget = null;
    replyContent = '';
    replyEmojiTags = [];
  }

  async function submitReply() {
    if (!replyTarget || !auth.loggedIn) return;
    const trimmed = replyContent.trim();
    if (!trimmed) return;

    if (containsPrivateKey(trimmed)) {
      toastError(t('comment.error.contains_private_key'));
      return;
    }

    replySending = true;
    try {
      const tags = replyEmojiTags.length > 0 ? replyEmojiTags : undefined;
      await sendReplyAction({
        content: trimmed,
        contentId: options.getContentId(),
        provider: options.getProvider(),
        parentEvent: { id: replyTarget.id, pubkey: replyTarget.pubkey },
        positionMs: replyTarget.positionMs ?? undefined,
        emojiTags: tags
      });
      toastSuccess(t('toast.reply_sent'));
      cancelReply();
    } catch (err) {
      log.error('Failed to send reply', err);
      toastError(t('toast.reply_failed'));
    } finally {
      replySending = false;
    }
  }

  return {
    get followFilter() {
      return followFilter;
    },
    get activeTab() {
      return activeTab;
    },
    get filteredComments() {
      return filteredComments;
    },
    get timedComments() {
      return timedComments;
    },
    get generalComments() {
      return generalComments;
    },
    get shoutComments() {
      return shoutComments;
    },
    get shoutAtBottom() {
      return shoutAtBottom;
    },
    get userScrolledAway() {
      return userScrolledAway;
    },
    get loggedIn() {
      return auth.loggedIn;
    },
    get canMute() {
      return hasNip44Support();
    },
    get replyMap() {
      return replyMap;
    },
    get replySending() {
      return replySending;
    },
    get replyContent() {
      return replyContent;
    },
    set replyContent(value: string) {
      replyContent = value;
    },
    get replyEmojiTags() {
      return replyEmojiTags;
    },
    set replyEmojiTags(value: string[][]) {
      replyEmojiTags = value;
    },
    get deleteDialogOpen() {
      return deleteTarget !== null;
    },
    get muteDialogOpen() {
      return muteTarget !== null;
    },
    get muteCount() {
      return muteList.mutedPubkeys.size;
    },
    get orphanParentIds() {
      return orphanParentIds;
    },
    get orphanParents() {
      return orphanParents;
    },
    setFollowFilter,
    setActiveTab,
    setShoutAtBottom,
    jumpToLatest,
    handleTimedRangeChange,
    jumpToNow,
    statsFor,
    myReactionFor,
    isNearCurrentPosition,
    isOwn,
    authorDisplayFor,
    isActing,
    isRevealed,
    revealCW,
    hideCW,
    seekToPosition,
    sendReaction,
    requestDelete,
    cancelDelete,
    confirmDelete,
    requestMute,
    cancelMute,
    confirmMute,
    startReply,
    isReplyOpen,
    cancelReply,
    submitReply
  };
}
