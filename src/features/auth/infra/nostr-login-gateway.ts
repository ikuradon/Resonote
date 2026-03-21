/**
 * Nostr-login gateway — encapsulates the @konemono/nostr-login library.
 */

function loadNostrLogin() {
  return import('@konemono/nostr-login');
}

export async function initNostrLogin(): Promise<void> {
  const { init } = await loadNostrLogin();
  await init({ noBanner: true, darkMode: true });
}

export async function launchLogin(): Promise<void> {
  const { launch } = await loadNostrLogin();
  await launch();
}

export async function performLogout(): Promise<void> {
  const { logout } = await loadNostrLogin();
  await logout();
}
