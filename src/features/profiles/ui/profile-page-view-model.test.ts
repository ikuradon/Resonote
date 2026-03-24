import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  followsState,
  muteListState,
  decodeNip19Mock,
  fetchProfileMock,
  getProfileDisplayMock,
  getFollowsMock,
  getMuteListMock,
  fetchFollowsCountMock,
  fetchProfileCommentsMock,
  followUserMock,
  unfollowUserMock,
  muteUserMock,
  logErrorMock,
  tMock
} = vi.hoisted(() => {
  const followsState = { follows: new Set<string>(['existing-follow']) };
  const muteListState = { mutedPubkeys: new Set<string>(['muted-user']) };
  return {
    followsState,
    muteListState,
    decodeNip19Mock: vi.fn(),
    fetchProfileMock: vi.fn(),
    getProfileDisplayMock: vi.fn((pk: string) => ({
      displayName: `Display:${pk}`,
      profileHref: `/p/${pk}`
    })),
    getFollowsMock: vi.fn(() => followsState),
    getMuteListMock: vi.fn(() => muteListState),
    fetchFollowsCountMock: vi.fn(async () => ({ count: 5, pubkeys: ['pk1', 'pk2'] })),
    fetchProfileCommentsMock: vi.fn(async () => ({
      comments: [{ id: 'c1', content: 'hello', createdAt: 100, iTag: null }],
      hasMore: false,
      oldestTimestamp: 100
    })),
    followUserMock: vi.fn(async () => {}),
    unfollowUserMock: vi.fn(async () => {}),
    muteUserMock: vi.fn(async () => {}),
    logErrorMock: vi.fn(),
    tMock: vi.fn((key: string) => key)
  };
});

vi.mock('$shared/nostr/nip19-decode.js', () => ({
  decodeNip19: decodeNip19Mock
}));

vi.mock('$shared/browser/profile.js', () => ({
  fetchProfile: fetchProfileMock,
  getProfileDisplay: getProfileDisplayMock
}));

vi.mock('$shared/browser/follows.js', () => ({
  getFollows: getFollowsMock,
  followUser: followUserMock,
  unfollowUser: unfollowUserMock
}));

vi.mock('$shared/browser/mute.js', () => ({
  getMuteList: getMuteListMock,
  muteUser: muteUserMock
}));

vi.mock('$shared/i18n/t.js', () => ({
  t: tMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ error: logErrorMock })
}));

vi.mock('../application/profile-actions.js', () => ({
  fetchFollowsCount: fetchFollowsCountMock
}));

vi.mock('../application/profile-queries.js', () => ({
  fetchProfileComments: fetchProfileCommentsMock
}));

import { createProfilePageViewModel } from './profile-page-view-model.svelte.js';

describe('createProfilePageViewModel', () => {
  const VALID_PUBKEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  beforeEach(() => {
    followsState.follows = new Set(['existing-follow']);
    muteListState.mutedPubkeys = new Set(['muted-user']);
    decodeNip19Mock.mockReset();
    fetchProfileMock.mockReset();
    fetchFollowsCountMock.mockResolvedValue({ count: 5, pubkeys: ['pk1', 'pk2'] });
    fetchProfileCommentsMock.mockResolvedValue({
      comments: [{ id: 'c1', content: 'hello', createdAt: 100, iTag: null }],
      hasMore: false,
      oldestTimestamp: 100
    });
    followUserMock.mockReset();
    unfollowUserMock.mockReset();
    muteUserMock.mockReset();
    logErrorMock.mockReset();
    tMock.mockClear();
  });

  describe('initial state', () => {
    it('exposes null pubkey and false error before any decode', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'invalid-id');

      expect(vm.pubkey).toBeNull();
      expect(vm.error).toBe(false);
      expect(vm.followsCount).toBeNull();
      expect(vm.followsPubkeys).toEqual([]);
      expect(vm.comments).toEqual([]);
      expect(vm.commentsLoading).toBe(false);
      expect(vm.hasMore).toBe(false);
      expect(vm.followActing).toBe(false);
    });

    it('exposes all required public API methods', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      expect(typeof vm.loadMore).toBe('function');
      expect(typeof vm.requestFollow).toBe('function');
      expect(typeof vm.requestUnfollow).toBe('function');
      expect(typeof vm.requestMuteUser).toBe('function');
      expect(typeof vm.confirmCurrentAction).toBe('function');
      expect(typeof vm.cancelConfirmAction).toBe('function');
    });

    it('exposes confirmDialog with default closed state', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      expect(vm.confirmDialog.open).toBe(false);
      expect(vm.confirmDialog.title).toBe('');
      expect(vm.confirmDialog.message).toBe('');
      expect(vm.confirmDialog.variant).toBe('default');
      expect(vm.confirmDialog.confirmLabel).toBe('confirm.ok');
      expect(vm.confirmDialog.cancelLabel).toBe('confirm.cancel');
    });
  });

  describe('requestFollow', () => {
    it('does nothing when pubkey is null (no $effect in test environment)', () => {
      decodeNip19Mock.mockReturnValue({ type: 'npub', pubkey: VALID_PUBKEY });
      const vm = createProfilePageViewModel(() => 'npub1...');

      vm.requestFollow();

      expect(vm.confirmDialog.open).toBe(false);
    });
  });

  describe('requestUnfollow', () => {
    it('does nothing when pubkey is null (no $effect in test environment)', () => {
      decodeNip19Mock.mockReturnValue({ type: 'npub', pubkey: VALID_PUBKEY });
      const vm = createProfilePageViewModel(() => 'npub1...');

      vm.requestUnfollow();

      expect(vm.confirmDialog.open).toBe(false);
    });
  });

  describe('requestMuteUser', () => {
    it('sets confirmDialog open with mute danger action', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('target-pubkey');

      expect(vm.confirmDialog.open).toBe(true);
      expect(vm.confirmDialog.title).toBe('confirm.mute');
      expect(vm.confirmDialog.variant).toBe('danger');
    });

    it('passes mute count parameters to confirm message', () => {
      muteListState.mutedPubkeys = new Set(['a', 'b', 'c']);
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('new-target');

      expect(vm.confirmDialog.open).toBe(true);
      expect(tMock).toHaveBeenCalledWith('confirm.mute.detail', { before: 3, after: 4 });
    });
  });

  describe('cancelConfirmAction', () => {
    it('closes the confirm dialog', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('some-pubkey');
      expect(vm.confirmDialog.open).toBe(true);

      vm.cancelConfirmAction();
      expect(vm.confirmDialog.open).toBe(false);
    });

    it('resets confirm dialog fields to defaults after cancel', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('some-pubkey');
      vm.cancelConfirmAction();

      expect(vm.confirmDialog.title).toBe('');
      expect(vm.confirmDialog.message).toBe('');
      expect(vm.confirmDialog.variant).toBe('default');
    });

    it('can cancel followed by a new request', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('first-pubkey');
      vm.cancelConfirmAction();
      expect(vm.confirmDialog.open).toBe(false);

      vm.requestMuteUser('second-pubkey');
      expect(vm.confirmDialog.open).toBe(true);
    });
  });

  describe('confirmCurrentAction', () => {
    it('executes mute action and closes dialog', async () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('target-pubkey');
      await vm.confirmCurrentAction();

      expect(muteUserMock).toHaveBeenCalledWith('target-pubkey');
      expect(vm.confirmDialog.open).toBe(false);
    });

    it('does nothing for follow when pubkey is null (no $effect in test env)', async () => {
      decodeNip19Mock.mockReturnValue({ type: 'npub', pubkey: VALID_PUBKEY });
      const vm = createProfilePageViewModel(() => 'npub1...');

      vm.requestFollow();
      await vm.confirmCurrentAction();

      expect(followUserMock).not.toHaveBeenCalled();
    });

    it('does nothing for unfollow when pubkey is null (no $effect in test env)', async () => {
      decodeNip19Mock.mockReturnValue({ type: 'npub', pubkey: VALID_PUBKEY });
      const vm = createProfilePageViewModel(() => 'npub1...');

      vm.requestUnfollow();
      await vm.confirmCurrentAction();

      expect(unfollowUserMock).not.toHaveBeenCalled();
    });

    it('does nothing when no action is pending', async () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      await vm.confirmCurrentAction();

      expect(muteUserMock).not.toHaveBeenCalled();
      expect(followUserMock).not.toHaveBeenCalled();
    });

    it('logs error when mute action fails but does not crash', async () => {
      const testError = new Error('mute failed');
      muteUserMock.mockRejectedValueOnce(testError);
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('target-pubkey');
      await vm.confirmCurrentAction();

      expect(logErrorMock).toHaveBeenCalledWith('Failed to mute', testError);
      expect(vm.confirmDialog.open).toBe(false);
    });

    it('clears confirmAction before executing the action', async () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      let dialogOpenDuringAction: boolean | undefined;
      muteUserMock.mockImplementationOnce(async () => {
        dialogOpenDuringAction = vm.confirmDialog.open;
      });

      vm.requestMuteUser('target');
      await vm.confirmCurrentAction();

      expect(dialogOpenDuringAction).toBe(false);
    });

    it('can execute mute for different pubkeys sequentially', async () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('pubkey-1');
      await vm.confirmCurrentAction();
      expect(muteUserMock).toHaveBeenCalledWith('pubkey-1');

      vm.requestMuteUser('pubkey-2');
      await vm.confirmCurrentAction();
      expect(muteUserMock).toHaveBeenCalledWith('pubkey-2');
      expect(muteUserMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('loadMore', () => {
    it('does nothing when pubkey is null', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.loadMore();

      expect(fetchProfileCommentsMock).not.toHaveBeenCalled();
    });
  });

  describe('displayName', () => {
    it('returns empty string when pubkey is null', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      expect(vm.displayName).toBe('');
    });
  });

  describe('nip19 decode types', () => {
    it('accepts npub type without error (before $effect)', () => {
      decodeNip19Mock.mockReturnValue({ type: 'npub', pubkey: VALID_PUBKEY });
      const vm = createProfilePageViewModel(() => 'npub1...');

      expect(vm.error).toBe(false);
    });

    it('accepts nprofile type', () => {
      decodeNip19Mock.mockReturnValue({ type: 'nprofile', pubkey: VALID_PUBKEY });
      const vm = createProfilePageViewModel(() => 'nprofile1...');

      expect(vm.error).toBe(false);
    });

    it('nevent type is not accepted (before $effect)', () => {
      decodeNip19Mock.mockReturnValue({ type: 'nevent', eventId: 'abc', relays: [] });
      const vm = createProfilePageViewModel(() => 'nevent1...');

      expect(vm.pubkey).toBeNull();
    });

    it('note type is not accepted (before $effect)', () => {
      decodeNip19Mock.mockReturnValue({ type: 'note', eventId: 'abc' });
      const vm = createProfilePageViewModel(() => 'note1...');

      expect(vm.pubkey).toBeNull();
    });
  });

  describe('confirm dialog onConfirm/onCancel callbacks', () => {
    it('onConfirm is a callable function that executes action', async () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('target');
      const { onConfirm } = vm.confirmDialog;
      await onConfirm();

      expect(muteUserMock).toHaveBeenCalledWith('target');
    });

    it('onCancel is a callable function that closes dialog', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('target');
      const { onCancel } = vm.confirmDialog;
      onCancel();

      expect(vm.confirmDialog.open).toBe(false);
    });
  });

  describe('multiple VM instances', () => {
    it('each instance has independent state', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm1 = createProfilePageViewModel(() => 'x');
      const vm2 = createProfilePageViewModel(() => 'y');

      vm1.requestMuteUser('target-1');

      expect(vm1.confirmDialog.open).toBe(true);
      expect(vm2.confirmDialog.open).toBe(false);
    });
  });

  describe('getFollows and getMuteList calls', () => {
    it('calls getFollows during construction', () => {
      decodeNip19Mock.mockReturnValue(null);
      createProfilePageViewModel(() => 'x');

      expect(getFollowsMock).toHaveBeenCalled();
    });

    it('calls getMuteList during construction', () => {
      decodeNip19Mock.mockReturnValue(null);
      createProfilePageViewModel(() => 'x');

      expect(getMuteListMock).toHaveBeenCalled();
    });
  });

  describe('requestMuteUser confirm then cancel pattern', () => {
    it('cancel after request prevents action execution on confirm', async () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('target');
      vm.cancelConfirmAction();
      await vm.confirmCurrentAction();

      expect(muteUserMock).not.toHaveBeenCalled();
    });
  });

  describe('confirm dialog label keys', () => {
    it('always provides confirm.ok and confirm.cancel labels', () => {
      decodeNip19Mock.mockReturnValue(null);
      const vm = createProfilePageViewModel(() => 'x');

      vm.requestMuteUser('target');

      expect(vm.confirmDialog.confirmLabel).toBe('confirm.ok');
      expect(vm.confirmDialog.cancelLabel).toBe('confirm.cancel');
    });
  });
});
