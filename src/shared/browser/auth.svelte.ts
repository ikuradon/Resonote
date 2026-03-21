import { createLogger, shortHex } from '$shared/utils/logger.js';

const log = createLogger('auth');

interface AuthState {
  pubkey: string | null;
  initialized: boolean;
}

let state = $state<AuthState>({ pubkey: null, initialized: false });

async function onLogin(pubkey: string) {
  log.info('Login', { pubkey: shortHex(pubkey) });
  state.pubkey = pubkey;
  const { initSession } = await import('$appcore/bootstrap/init-session.js');
  await initSession(pubkey);
}

let logoutInProgress = false;

async function onLogout() {
  if (logoutInProgress) return;
  logoutInProgress = true;
  try {
    log.info('Logout');
    state.pubkey = null;
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
    }
  };
}

export async function initAuth(): Promise<void> {
  if (state.initialized) return;
  state.initialized = true;

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
