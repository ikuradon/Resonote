import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authState,
  followsState,
  hasNip44SupportMock,
  isMutedMock,
  fetchProfilesMock,
  getProfileDisplayMock,
  getProfileMock
} = vi.hoisted(() => ({
  authState: { pubkey: 'me', loggedIn: true },
  followsState: { follows: new Set<string>(['followed1', 'followed2']) },
  hasNip44SupportMock: vi.fn(() => true),
  isMutedMock: vi.fn(() => false),
  fetchProfilesMock: vi.fn(),
  getProfileDisplayMock: vi.fn((pubkey: string) => ({
    displayName: `Display ${pubkey}`,
    profileHref: `/profile/${pubkey}`,
    formattedNip05: null as string | null
  })),
  getProfileMock: vi.fn(() => undefined)
}));

vi.mock('$shared/browser/auth.js', () => ({
  getAuth: () => authState
}));

vi.mock('$shared/browser/follows.js', () => ({
  getFollows: () => followsState
}));

vi.mock('$shared/browser/mute.js', () => ({
  hasNip44Support: hasNip44SupportMock,
  isMuted: isMutedMock
}));

vi.mock('$shared/browser/profile.js', () => ({
  fetchProfiles: fetchProfilesMock,
  getProfileDisplay: getProfileDisplayMock,
  getProfile: getProfileMock
}));

import { createProfileHeaderViewModel } from './profile-header-view-model.svelte.js';

function makeVm(
  pubkey = 'target-user',
  followsCount: number | null = 42,
  followsPubkeys: string[] = ['f1', 'f2', 'f3']
) {
  return createProfileHeaderViewModel({
    getPubkey: () => pubkey,
    getFollowsCount: () => followsCount,
    getFollowsPubkeys: () => followsPubkeys
  });
}

describe('createProfileHeaderViewModel', () => {
  beforeEach(() => {
    authState.pubkey = 'me';
    authState.loggedIn = true;
    followsState.follows = new Set<string>(['followed1', 'followed2']);
    hasNip44SupportMock.mockReturnValue(true);
    isMutedMock.mockReturnValue(false);
    fetchProfilesMock.mockClear();
    getProfileDisplayMock.mockReset().mockImplementation((pubkey: string) => ({
      displayName: `Display ${pubkey}`,
      profileHref: `/profile/${pubkey}`,
      formattedNip05: null
    }));
    getProfileMock.mockReturnValue(undefined);
  });

  describe('initial state', () => {
    it('showFollowsList starts false', () => {
      const vm = makeVm();
      expect(vm.showFollowsList).toBe(false);
    });

    it('followsCount reflects option', () => {
      const vm = makeVm('target', 99);
      expect(vm.followsCount).toBe(99);
    });

    it('followsPubkeys reflects option', () => {
      const vm = makeVm('target', 0, ['a', 'b']);
      expect(vm.followsPubkeys).toEqual(['a', 'b']);
    });

    it('isOwnProfile is true when pubkey matches auth.pubkey', () => {
      authState.pubkey = 'owner';
      const vm = makeVm('owner');
      expect(vm.isOwnProfile).toBe(true);
    });

    it('isOwnProfile is false when pubkey differs', () => {
      authState.pubkey = 'me';
      const vm = makeVm('other-user');
      expect(vm.isOwnProfile).toBe(false);
    });

    it('isFollowing is true when pubkey is in follows', () => {
      followsState.follows = new Set(['followed1', 'target-user']);
      const vm = makeVm('target-user');
      expect(vm.isFollowing).toBe(true);
    });

    it('isFollowing is false when pubkey not in follows', () => {
      followsState.follows = new Set(['followed1']);
      const vm = makeVm('not-followed');
      expect(vm.isFollowing).toBe(false);
    });

    it('muteAvailable is true when nip44 supported and not muted', () => {
      hasNip44SupportMock.mockReturnValue(true);
      isMutedMock.mockReturnValue(false);
      const vm = makeVm();
      expect(vm.muteAvailable).toBe(true);
    });

    it('muteAvailable is false when already muted', () => {
      isMutedMock.mockReturnValue(true);
      const vm = makeVm();
      expect(vm.muteAvailable).toBe(false);
    });

    it('muteAvailable is false when nip44 not supported', () => {
      hasNip44SupportMock.mockReturnValue(false);
      isMutedMock.mockReturnValue(false);
      const vm = makeVm();
      expect(vm.muteAvailable).toBe(false);
    });

    it('displayName comes from getProfileDisplay', () => {
      const vm = makeVm('someuser');
      expect(vm.displayName).toBe('Display someuser');
    });

    it('formattedNip05 returns empty string when null', () => {
      getProfileDisplayMock.mockReturnValue({
        displayName: 'Test',
        profileHref: '/profile/test',
        formattedNip05: null
      });
      const vm = makeVm();
      expect(vm.formattedNip05).toBe('');
    });

    it('formattedNip05 returns value when set', () => {
      getProfileDisplayMock.mockReturnValue({
        displayName: 'Test',
        profileHref: '/profile/test',
        formattedNip05: 'user@example.com'
      });
      const vm = makeVm();
      expect(vm.formattedNip05).toBe('user@example.com');
    });

    it('auth is exposed directly', () => {
      const vm = makeVm();
      expect(vm.auth).toBe(authState);
    });
  });

  describe('toggleFollowsList', () => {
    it('does nothing when followsPubkeys is empty', () => {
      const vm = makeVm('target', 0, []);
      vm.toggleFollowsList();
      expect(vm.showFollowsList).toBe(false);
    });

    it('toggles showFollowsList to true when has pubkeys', () => {
      const vm = makeVm('target', 3, ['a', 'b', 'c']);
      vm.toggleFollowsList();
      expect(vm.showFollowsList).toBe(true);
    });

    it('toggles showFollowsList back to false on second call', () => {
      const vm = makeVm('target', 3, ['a', 'b', 'c']);
      vm.toggleFollowsList();
      vm.toggleFollowsList();
      expect(vm.showFollowsList).toBe(false);
    });

    it('calls fetchProfiles when opening follows list', () => {
      const vm = makeVm('target', 3, ['a', 'b', 'c']);
      vm.toggleFollowsList();
      expect(fetchProfilesMock).toHaveBeenCalledWith(['a', 'b', 'c']);
    });

    it('does not call fetchProfiles when closing', () => {
      const vm = makeVm('target', 3, ['a', 'b', 'c']);
      vm.toggleFollowsList(); // open
      fetchProfilesMock.mockClear();
      vm.toggleFollowsList(); // close
      expect(fetchProfilesMock).not.toHaveBeenCalled();
    });
  });

  describe('getFollowDisplay', () => {
    it('returns profile display for a follow pubkey', () => {
      const vm = makeVm();
      const display = vm.getFollowDisplay('followed1');
      expect(display.displayName).toBe('Display followed1');
    });
  });
});
