import { beforeEach, describe, expect, it, vi } from 'vitest';

// nostr-login-gateway のモック (動的インポート経由で使われる)
vi.mock('$features/auth/infra/nostr-login-gateway.js', () => ({
  initNostrLogin: vi.fn().mockResolvedValue(undefined),
  launchLogin: vi.fn().mockResolvedValue(undefined),
  performLogout: vi.fn().mockResolvedValue(undefined)
}));

// init-session のモック (動的インポート経由で使われる)
vi.mock('$appcore/bootstrap/init-session.js', () => ({
  initSession: vi.fn().mockResolvedValue(undefined),
  destroySession: vi.fn().mockResolvedValue(undefined)
}));

// logger のモック
vi.mock('$shared/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })),
  shortHex: (hex: string) => hex.slice(0, 8)
}));

const TEST_PUBKEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

// document を EventTarget ベースの stub に差し替える
let fakeDocument: EventTarget;

function dispatchNlAuth(type: string, method?: string) {
  fakeDocument.dispatchEvent(new CustomEvent('nlAuth', { detail: { type, method } }));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  fakeDocument = new EventTarget();
  vi.stubGlobal('document', fakeDocument);

  // window および window.nostr をモック (auth.svelte.ts が window.nostr を参照するため)
  const fakeNostr = {
    getPublicKey: vi.fn().mockResolvedValue(TEST_PUBKEY)
  };
  vi.stubGlobal('window', { nostr: fakeNostr });
  vi.stubGlobal('nostr', fakeNostr);
});

describe('getAuth()', () => {
  it('初期状態: pubkey は null、initialized は false、loggedIn は false', async () => {
    const { getAuth } = await import('./auth.svelte.js');
    const auth = getAuth();
    expect(auth.pubkey).toBeNull();
    expect(auth.initialized).toBe(false);
    expect(auth.loggedIn).toBe(false);
  });

  it('pubkey が設定されると loggedIn が true になる', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    dispatchNlAuth('login');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    expect(getAuth().loggedIn).toBe(true);
  });
});

describe('initAuth()', () => {
  it('initialized が true になる', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();
    expect(getAuth().initialized).toBe(true);
  });

  it('initNostrLogin が呼ばれる', async () => {
    const { initAuth } = await import('./auth.svelte.js');
    const { initNostrLogin } = await import('$features/auth/infra/nostr-login-gateway.js');
    await initAuth();
    expect(initNostrLogin).toHaveBeenCalledOnce();
  });

  it('二重呼び出しでも initNostrLogin は1回だけ呼ばれる', async () => {
    const { initAuth } = await import('./auth.svelte.js');
    const { initNostrLogin } = await import('$features/auth/infra/nostr-login-gateway.js');
    await initAuth();
    await initAuth();
    expect(initNostrLogin).toHaveBeenCalledOnce();
  });
});

describe('nlAuth イベント: login', () => {
  it('login イベントで pubkey が設定される', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    dispatchNlAuth('login');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    expect(getAuth().pubkey).toBe(TEST_PUBKEY);
    expect(getAuth().loggedIn).toBe(true);
  });

  it('login イベントで initSession が pubkey 付きで呼ばれる', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    const { initSession } = await import('$appcore/bootstrap/init-session.js');
    await initAuth();

    dispatchNlAuth('login');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    expect(initSession).toHaveBeenCalledWith(TEST_PUBKEY);
  });

  it('復元済みセッション由来の login イベントも同じ initSession 経路を使う', async () => {
    let resolveInit!: () => void;
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    const { initSession } = await import('$appcore/bootstrap/init-session.js');
    const { launchLogin } = await import('$features/auth/infra/nostr-login-gateway.js');
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });
    (initSession as ReturnType<typeof vi.fn>).mockReturnValueOnce(initPromise);
    await initAuth();

    dispatchNlAuth('login');
    await vi.waitUntil(() => (initSession as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(launchLogin).not.toHaveBeenCalled();
    expect(initSession).toHaveBeenCalledOnce();
    expect(initSession).toHaveBeenCalledWith(TEST_PUBKEY);
    expect(getAuth().pubkey).toBeNull();

    resolveInit();
    await vi.waitUntil(() => getAuth().pubkey === TEST_PUBKEY);
  });

  it('signup イベントでも pubkey が設定される', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    dispatchNlAuth('signup');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    expect(getAuth().pubkey).toBe(TEST_PUBKEY);
    expect(getAuth().loggedIn).toBe(true);
  });

  it('initSession 完了前は pubkey を公開しない', async () => {
    let resolveInit!: () => void;
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    const { initSession } = await import('$appcore/bootstrap/init-session.js');
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });
    (initSession as ReturnType<typeof vi.fn>).mockReturnValueOnce(initPromise);
    await initAuth();

    dispatchNlAuth('login');
    await vi.waitUntil(() => (initSession as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(getAuth().pubkey).toBeNull();

    resolveInit();
    await vi.waitUntil(() => getAuth().pubkey !== null);
    expect(getAuth().pubkey).toBe(TEST_PUBKEY);
  });
});

describe('nlAuth イベント: logout', () => {
  it('logout イベントで pubkey が null に戻り loggedIn が false になる', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    dispatchNlAuth('login');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    dispatchNlAuth('logout');
    await vi.waitUntil(() => getAuth().pubkey === null);

    expect(getAuth().pubkey).toBeNull();
    expect(getAuth().loggedIn).toBe(false);
  });

  it('logout イベントで destroySession が呼ばれる', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    const { destroySession } = await import('$appcore/bootstrap/init-session.js');
    await initAuth();

    dispatchNlAuth('login');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    dispatchNlAuth('logout');
    // pubkey が null になった後、destroySession の呼び出しを待つ
    // (onLogout は pubkey=null → await destroySession() の順)
    await vi.waitUntil(() => (destroySession as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(destroySession).toHaveBeenCalled();
  });

  it('login → logout → login で再ログインできる', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    const { destroySession } = await import('$appcore/bootstrap/init-session.js');
    await initAuth();

    dispatchNlAuth('login');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    dispatchNlAuth('logout');
    await vi.waitUntil(() => getAuth().pubkey === null);
    await vi.waitUntil(() => (destroySession as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    dispatchNlAuth('login');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    expect(getAuth().pubkey).toBe(TEST_PUBKEY);
    expect(getAuth().loggedIn).toBe(true);
  });
});

describe('logoutNostr()', () => {
  it('performLogout が呼ばれ、state がクリアされる', async () => {
    const { getAuth, initAuth, logoutNostr } = await import('./auth.svelte.js');
    const { performLogout } = await import('$features/auth/infra/nostr-login-gateway.js');
    const { destroySession } = await import('$appcore/bootstrap/init-session.js');
    await initAuth();

    // ログイン状態にする
    dispatchNlAuth('login');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    await logoutNostr();

    expect(performLogout).toHaveBeenCalled();
    expect(destroySession).toHaveBeenCalled();
    expect(getAuth().pubkey).toBeNull();
    expect(getAuth().loggedIn).toBe(false);
  });

  it('未ログイン状態でも logoutNostr は正常終了する', async () => {
    const { getAuth, initAuth, logoutNostr } = await import('./auth.svelte.js');
    await initAuth();

    await expect(logoutNostr()).resolves.toBeUndefined();
    expect(getAuth().pubkey).toBeNull();
  });

  it('initAuth なしでも logoutNostr は実行できる', async () => {
    const { getAuth, logoutNostr } = await import('./auth.svelte.js');

    await expect(logoutNostr()).resolves.toBeUndefined();
    expect(getAuth().pubkey).toBeNull();
  });
});

describe('loginNostr()', () => {
  it('launchLogin が呼ばれる', async () => {
    const { loginNostr } = await import('./auth.svelte.js');
    const { launchLogin } = await import('$features/auth/infra/nostr-login-gateway.js');

    await loginNostr();

    expect(launchLogin).toHaveBeenCalled();
  });
});

describe('canWrite getter', () => {
  it('未ログイン時は false', async () => {
    const { getAuth } = await import('./auth.svelte.js');
    expect(getAuth().canWrite).toBe(false);
  });

  it('通常ログイン時は true', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    dispatchNlAuth('login');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    expect(getAuth().canWrite).toBe(true);
  });

  it('readOnly ログイン時は false', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    dispatchNlAuth('login', 'readOnly');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    expect(getAuth().canWrite).toBe(false);
    expect(getAuth().readOnly).toBe(true);
  });
});

describe('readOnly getter', () => {
  it('初期状態は false', async () => {
    const { getAuth } = await import('./auth.svelte.js');
    expect(getAuth().readOnly).toBe(false);
  });

  it('readOnly メソッドでログインすると true', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    dispatchNlAuth('login', 'readOnly');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    expect(getAuth().readOnly).toBe(true);
  });

  it('通常メソッドでログインすると false のまま', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    dispatchNlAuth('login', 'extension');
    await vi.waitUntil(() => getAuth().pubkey !== null);

    expect(getAuth().readOnly).toBe(false);
  });

  it('logout 後は false にリセットされる', async () => {
    const { getAuth, initAuth } = await import('./auth.svelte.js');
    const { destroySession } = await import('$appcore/bootstrap/init-session.js');
    await initAuth();

    dispatchNlAuth('login', 'readOnly');
    await vi.waitUntil(() => getAuth().pubkey !== null);
    expect(getAuth().readOnly).toBe(true);

    dispatchNlAuth('logout');
    await vi.waitUntil(() => (destroySession as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(getAuth().readOnly).toBe(false);
  });
});

describe('hasNip44 getter', () => {
  it('window.nostr.nip44 が存在すると true', async () => {
    vi.stubGlobal('window', {
      nostr: {
        getPublicKey: vi.fn().mockResolvedValue(TEST_PUBKEY),
        nip44: { encrypt: vi.fn(), decrypt: vi.fn() }
      }
    });

    const { getAuth } = await import('./auth.svelte.js');
    expect(getAuth().hasNip44).toBe(true);
  });

  it('window.nostr.nip44 が未定義だと false', async () => {
    vi.stubGlobal('window', {
      nostr: {
        getPublicKey: vi.fn().mockResolvedValue(TEST_PUBKEY)
      }
    });

    const { getAuth } = await import('./auth.svelte.js');
    expect(getAuth().hasNip44).toBe(false);
  });

  it('window.nostr が未定義だと false', async () => {
    vi.stubGlobal('window', {});

    const { getAuth } = await import('./auth.svelte.js');
    expect(getAuth().hasNip44).toBe(false);
  });
});

describe('window.nostr が未定義の場合', () => {
  it('login イベントで window.nostr がなくてもクラッシュしない', async () => {
    // window.nostr を持たない window に差し替える
    vi.stubGlobal('window', {});

    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    // クラッシュしないことを確認
    dispatchNlAuth('login');
    // マイクロタスクチェーンを確実にフラッシュ
    await new Promise((r) => setTimeout(r, 0));
    expect(getAuth().pubkey).toBeNull();
  });

  it('getPublicKey が失敗してもクラッシュしない', async () => {
    vi.stubGlobal('window', {
      nostr: {
        getPublicKey: vi.fn().mockRejectedValue(new Error('User rejected'))
      }
    });

    const { getAuth, initAuth } = await import('./auth.svelte.js');
    await initAuth();

    dispatchNlAuth('login');
    await new Promise((r) => setTimeout(r, 0));
    expect(getAuth().pubkey).toBeNull();
  });
});
