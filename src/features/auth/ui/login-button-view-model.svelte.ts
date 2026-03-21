import { getAuth, loginNostr, logoutNostr } from '$shared/browser/auth.js';
import { fetchProfile, getProfileDisplay } from '$shared/browser/profile.js';

export function createLoginButtonViewModel() {
  const auth = getAuth();

  let profileDisplay = $derived(auth.pubkey ? getProfileDisplay(auth.pubkey) : null);
  let displayText = $derived(profileDisplay?.displayName ?? '');
  let profileHref = $derived(profileDisplay?.profileHref ?? '/');

  $effect(() => {
    if (!auth.pubkey) return;
    fetchProfile(auth.pubkey);
  });

  return {
    auth,
    get profileDisplay() {
      return profileDisplay;
    },
    get displayText() {
      return displayText;
    },
    get profileHref() {
      return profileHref;
    },
    login: loginNostr,
    logout: logoutNostr
  };
}
