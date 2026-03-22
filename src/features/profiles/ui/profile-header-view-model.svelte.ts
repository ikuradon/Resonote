import { getAuth } from '$shared/browser/auth.js';
import { getFollows } from '$shared/browser/follows.js';
import { hasNip44Support, isMuted } from '$shared/browser/mute.js';
import {
  fetchProfiles,
  getProfileDisplay,
  getProfile,
  type Profile,
  type ProfileDisplay
} from '$shared/browser/profile.js';

interface ProfileHeaderViewModelOptions {
  getPubkey: () => string;
  getFollowsCount: () => number | null;
  getFollowsPubkeys: () => string[];
}

export function createProfileHeaderViewModel(options: ProfileHeaderViewModelOptions) {
  const auth = getAuth();
  const follows = getFollows();

  let showFollowsList = $state(false);
  let preloadedFollowsKey = $state('');

  let pubkey = $derived(options.getPubkey());
  let followsCount = $derived(options.getFollowsCount());
  let followsPubkeys = $derived(options.getFollowsPubkeys());
  let profile = $derived(getProfile(pubkey) as Profile | undefined);
  let profileDisplay = $derived(getProfileDisplay(pubkey));
  let isOwnProfile = $derived(auth.pubkey !== null && pubkey === auth.pubkey);
  let isFollowing = $derived(follows.follows.has(pubkey));
  let muteAvailable = $derived(hasNip44Support() && !isMuted(pubkey));

  function preloadFollowsProfiles(): void {
    const nextKey = followsPubkeys.join(',');
    if (nextKey === preloadedFollowsKey) return;
    preloadedFollowsKey = nextKey;

    for (let i = 0; i < followsPubkeys.length; i += 50) {
      fetchProfiles(followsPubkeys.slice(i, i + 50));
    }
  }

  function toggleFollowsList(): void {
    if (followsPubkeys.length === 0) return;
    showFollowsList = !showFollowsList;
    if (showFollowsList) {
      preloadFollowsProfiles();
    }
  }

  return {
    auth,
    get pubkey() {
      return pubkey;
    },
    get followsCount() {
      return followsCount;
    },
    get followsPubkeys() {
      return followsPubkeys;
    },
    get showFollowsList() {
      return showFollowsList;
    },
    get profile() {
      return profile;
    },
    get profileDisplay() {
      return profileDisplay;
    },
    get displayName() {
      return profileDisplay.displayName;
    },
    get isOwnProfile() {
      return isOwnProfile;
    },
    get isFollowing() {
      return isFollowing;
    },
    get muteAvailable() {
      return muteAvailable;
    },
    get formattedNip05() {
      return profileDisplay.formattedNip05 ?? '';
    },
    getFollowDisplay: (followPubkey: string): ProfileDisplay => getProfileDisplay(followPubkey),
    toggleFollowsList
  };
}
