import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('auth');

interface AuthState {
  pubkey: string | null;
  initialized: boolean;
}

let state = $state<AuthState>({ pubkey: null, initialized: false });

function loadNostrLogin() {
  return import('@konemono/nostr-login');
}

async function onLogin(pubkey: string) {
  log.info('Login', { pubkey: shortHex(pubkey) });
  state.pubkey = pubkey;
  const [{ applyUserRelays }, { loadFollows }, { loadCustomEmojis }] = await Promise.all([
    import('../nostr/user-relays.js'),
    import('./follows.svelte.js'),
    import('./emoji-sets.svelte.js')
  ]);
  const relayUrls = await applyUserRelays(pubkey);
  const { refreshRelayList } = await import('./relays.svelte.js');
  refreshRelayList(relayUrls);
  loadFollows(pubkey).catch((err) => log.error('Failed to load follows', err));
  loadCustomEmojis(pubkey).catch((err) => log.error('Failed to load custom emojis', err));
}

async function onLogout() {
  log.info('Logout');
  state.pubkey = null;
  const [{ resetToDefaultRelays }, { clearFollows }, { clearCustomEmojis }, { clearProfiles }] =
    await Promise.all([
      import('../nostr/user-relays.js'),
      import('./follows.svelte.js'),
      import('./emoji-sets.svelte.js'),
      import('./profile.svelte.js')
    ]);
  await resetToDefaultRelays();
  clearFollows();
  clearCustomEmojis();
  clearProfiles();
  const { refreshRelayList } = await import('./relays.svelte.js');
  const { DEFAULT_RELAYS } = await import('../nostr/relays.js');
  refreshRelayList(DEFAULT_RELAYS);

  // Clear the events DB
  const { getEventsDB } = await import('../nostr/event-db.js');
  const db = await getEventsDB();
  await db.clearAll();
}

export function getAuth() {
  return {
    get pubkey() {
      return state.pubkey;
    },
    get initialized() {
      return state.initialized;
    },
    get loggedIn() {
      return state.pubkey !== null;
    }
  };
}

export async function initAuth(): Promise<void> {
  if (state.initialized) return;

  log.info('Initializing nostr-login...');

  document.addEventListener('nlAuth', (e: Event) => {
    const detail = (e as CustomEvent<{ type: string }>).detail;
    log.debug('nlAuth event', { type: detail.type });
    if (detail.type === 'login' || detail.type === 'signup') {
      window.nostr
        ?.getPublicKey()
        .then((pk) => onLogin(pk))
        .catch((err) => log.error('Failed to get public key', err));
    } else {
      onLogout();
    }
  });

  const { init } = await loadNostrLogin();

  await init({
    noBanner: true,
    darkMode: true
  });

  log.info('nostr-login initialized');
  state.initialized = true;
}

export async function loginNostr(): Promise<void> {
  log.debug('Launching nostr-login dialog');
  const { launch } = await loadNostrLogin();
  await launch();
}

export async function logoutNostr(): Promise<void> {
  log.debug('Logging out via nostr-login');
  const { logout } = await loadNostrLogin();
  await logout();
  await onLogout();
}
