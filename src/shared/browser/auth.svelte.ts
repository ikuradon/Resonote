import { createLogger, shortHex } from '$shared/utils/logger.js';

const log = createLogger('auth');

interface AuthState {
  pubkey: string | null;
  initialized: boolean;
  readOnly: boolean;
}

let state = $state<AuthState>({ pubkey: null, initialized: false, readOnly: false });

async function onLogin(pubkey: string) {
  log.info('Login', { pubkey: shortHex(pubkey) });
  const { initSession } = await import('$appcore/bootstrap/init-session.js');
  await initSession(pubkey);
  state.pubkey = pubkey;
}

let logoutInProgress = false;

async function onLogout() {
  if (logoutInProgress) return;
  logoutInProgress = true;
  try {
    log.info('Logout');
    state.pubkey = null;
    state.readOnly = false;
    const { destroySession } = await import('$appcore/bootstrap/init-session.js');
    await destroySession();
  } finally {
    logoutInProgress = false;
  }
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
    },
    get readOnly() {
      return state.readOnly;
    },
    /** Logged in with write capability (not readOnly) */
    get canWrite() {
      return state.pubkey !== null && !state.readOnly;
    },
    /** NIP-44 encryption available via window.nostr.nip44 */
    get hasNip44() {
      return typeof window !== 'undefined' && !!window.nostr?.nip44;
    }
  };
}

export async function initAuth(): Promise<void> {
  if (state.initialized) return;
  state.initialized = true;

  log.info('Initializing nostr-login...');

  document.addEventListener('nlAuth', (e: Event) => {
    const detail = (e as CustomEvent<{ type: string; method?: string }>).detail;
    log.debug('nlAuth event', { type: detail.type, method: detail.method });
    if (detail.type === 'login' || detail.type === 'signup') {
      state.readOnly = detail.method === 'readOnly';
      window.nostr
        ?.getPublicKey()
        .then((pk) => onLogin(pk))
        .catch((err) => log.error('Failed to get public key', err));
    } else {
      void onLogout();
    }
  });

  const { initNostrLogin } = await import('$features/auth/infra/nostr-login-gateway.js');
  await initNostrLogin();

  log.info('nostr-login initialized');
}

export async function loginNostr(): Promise<void> {
  log.debug('Launching nostr-login dialog');
  const { launchLogin } = await import('$features/auth/infra/nostr-login-gateway.js');
  await launchLogin();
}

export async function logoutNostr(): Promise<void> {
  log.debug('Logging out via nostr-login');
  const { performLogout } = await import('$features/auth/infra/nostr-login-gateway.js');
  await performLogout();
  await onLogout();
}
