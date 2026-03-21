import { decodeNip19 } from '$shared/nostr/nip19-decode.js';
import { fetchProfile, getProfileDisplay } from '$shared/browser/profile.js';
import { getFollows, followUser, unfollowUser } from '$shared/browser/follows.js';
import { getMuteList, muteUser } from '$shared/browser/mute.js';
import { t } from '$shared/i18n/t.js';
import { createLogger } from '$shared/utils/logger.js';
import { fetchFollowsCount as fetchFollowsCountAction } from '../application/profile-actions.js';
import { fetchProfileComments, type ProfileComment } from '../application/profile-queries.js';

const log = createLogger('profile-page-vm');

type ConfirmVariant = 'danger' | 'default';

interface ProfileConfirmAction {
  title: string;
  message: string;
  variant: ConfirmVariant;
  action: () => Promise<void>;
}

interface ConfirmDialogBinding {
  open: boolean;
  title: string;
  message: string;
  variant: ConfirmVariant;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function createProfilePageViewModel(getProfileId: () => string) {
  const follows = getFollows();
  const muteList = getMuteList();

  let pubkey = $state<string | null>(null);
  let error = $state(false);
  let followsCount = $state<number | null>(null);
  let followsPubkeys = $state<string[]>([]);
  let comments = $state<ProfileComment[]>([]);
  let commentsLoading = $state(false);
  let commentsUntil = $state<number | null>(null);
  let hasMore = $state(false);
  let followActing = $state(false);
  let confirmAction = $state<ProfileConfirmAction | null>(null);

  let followsRequestKey = 0;
  let commentsRequestKey = 0;

  let displayName = $derived(pubkey ? getProfileDisplay(pubkey).displayName : '');
  let confirmDialog = $derived.by<ConfirmDialogBinding>(() => ({
    open: confirmAction !== null,
    title: confirmAction?.title ?? '',
    message: confirmAction?.message ?? '',
    variant: confirmAction?.variant ?? 'default',
    confirmLabel: t('confirm.ok'),
    cancelLabel: t('confirm.cancel'),
    onConfirm: confirmCurrentAction,
    onCancel: cancelConfirmAction
  }));

  function resetProfileState() {
    followsCount = null;
    followsPubkeys = [];
    comments = [];
    commentsLoading = false;
    commentsUntil = null;
    hasMore = false;
    confirmAction = null;
  }

  async function fetchFollowsCount(pubkeyToLoad: string, requestKey: number) {
    const result = await fetchFollowsCountAction(pubkeyToLoad);
    if (requestKey !== followsRequestKey || pubkeyToLoad !== pubkey) return;
    followsCount = result.count;
    followsPubkeys = result.pubkeys;
  }

  async function loadComments(pubkeyToLoad: string, until?: number, requestKey = commentsRequestKey) {
    commentsLoading = true;
    try {
      const result = await fetchProfileComments(pubkeyToLoad, until);
      if (requestKey !== commentsRequestKey || pubkeyToLoad !== pubkey) return;

      comments = until ? [...comments, ...result.comments] : result.comments;
      hasMore = result.hasMore;
      commentsUntil = result.oldestTimestamp;
    } catch (err) {
      if (requestKey === commentsRequestKey && pubkeyToLoad === pubkey) {
        log.error('Failed to load comments', err);
      }
    } finally {
      if (requestKey === commentsRequestKey && pubkeyToLoad === pubkey) {
        commentsLoading = false;
      }
    }
  }

  $effect(() => {
    const id = getProfileId();
    const decoded = decodeNip19(id);
    if (decoded && (decoded.type === 'npub' || decoded.type === 'nprofile')) {
      pubkey = decoded.pubkey;
      error = false;
      return;
    }

    pubkey = null;
    error = true;
    followsRequestKey += 1;
    commentsRequestKey += 1;
    resetProfileState();
  });

  $effect(() => {
    const currentPubkey = pubkey;
    if (!currentPubkey) return;
    fetchProfile(currentPubkey);
  });

  $effect(() => {
    const currentPubkey = pubkey;
    if (!currentPubkey) return;

    followsCount = null;
    followsPubkeys = [];
    const requestKey = ++followsRequestKey;
    void fetchFollowsCount(currentPubkey, requestKey);
  });

  $effect(() => {
    const currentPubkey = pubkey;
    if (!currentPubkey) return;

    comments = [];
    commentsUntil = null;
    hasMore = false;
    const requestKey = ++commentsRequestKey;
    void loadComments(currentPubkey, undefined, requestKey);
  });

  function loadMore() {
    if (!pubkey || !commentsUntil || commentsLoading) return;
    void loadComments(pubkey, commentsUntil, commentsRequestKey);
  }

  function requestFollow() {
    if (!pubkey || followActing) return;
    const before = follows.follows.size;
    confirmAction = {
      title: t('confirm.follow'),
      message: t('confirm.follow.detail', { before, after: before + 1 }),
      variant: 'default',
      action: async () => {
        if (!pubkey) return;
        followActing = true;
        try {
          await followUser(pubkey);
        } catch (err) {
          log.error('Failed to follow', err);
        } finally {
          followActing = false;
        }
      }
    };
  }

  function requestUnfollow() {
    if (!pubkey || followActing) return;
    const before = follows.follows.size;
    confirmAction = {
      title: t('confirm.unfollow'),
      message: t('confirm.unfollow.detail', { before, after: before - 1 }),
      variant: 'danger',
      action: async () => {
        if (!pubkey) return;
        followActing = true;
        try {
          await unfollowUser(pubkey);
        } catch (err) {
          log.error('Failed to unfollow', err);
        } finally {
          followActing = false;
        }
      }
    };
  }

  function requestMuteUser(pubkeyToMute: string) {
    const before = muteList.mutedPubkeys.size;
    confirmAction = {
      title: t('confirm.mute'),
      message: t('confirm.mute.detail', { before, after: before + 1 }),
      variant: 'danger',
      action: async () => {
        try {
          await muteUser(pubkeyToMute);
        } catch (err) {
          log.error('Failed to mute', err);
        }
      }
    };
  }

  async function confirmCurrentAction() {
    const action = confirmAction?.action;
    confirmAction = null;
    if (action) await action();
  }

  function cancelConfirmAction() {
    confirmAction = null;
  }

  return {
    get pubkey() {
      return pubkey;
    },
    get error() {
      return error;
    },
    get followsCount() {
      return followsCount;
    },
    get followsPubkeys() {
      return followsPubkeys;
    },
    get comments() {
      return comments;
    },
    get commentsLoading() {
      return commentsLoading;
    },
    get hasMore() {
      return hasMore;
    },
    get followActing() {
      return followActing;
    },
    get displayName() {
      return displayName;
    },
    get confirmDialog() {
      return confirmDialog;
    },
    loadMore,
    requestFollow,
    requestUnfollow,
    requestMuteUser,
    confirmCurrentAction,
    cancelConfirmAction
  };
}
