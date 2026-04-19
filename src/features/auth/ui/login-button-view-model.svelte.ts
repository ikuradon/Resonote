import { getAuth, loginNostr, logoutNostr } from '$shared/browser/auth.js';
import { getProfileDisplay } from '$shared/browser/profile.js';

export function createLoginButtonViewModel() {
  const auth = getAuth();

  let profileDisplay = $derived(auth.pubkey ? getProfileDisplay(auth.pubkey) : null);
  let displayText = $derived(profileDisplay?.displayName ?? '');
  let profileHref = $derived(profileDisplay?.profileHref ?? '/');

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
