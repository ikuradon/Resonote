import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authState,
  followsState,
  relaysState,
  profileDisplayMap,
  mockAfterNavigate,
  mockGetLocale,
  mockSetLocale,
  mockIsExtensionMode,
  mockGetRelays,
  mockIsTransitionalState,
  mockInitRelayStatus,
  mockDestroyRelayStatus,
  mockInitApp,
  mockManageNotifications,
  mockLoginNostr,
  mockLogoutNostr,
  mockGetProfileDisplay,
  mockGetProfileHref
} = vi.hoisted(() => {
  const authState = { pubkey: null as string | null, initialized: false, loggedIn: false };
  const followsState = { follows: new Set<string>() };
  const relaysState: { url: string; state: string }[] = [];
  const profileDisplayMap: Record<string, { displayName: string; picture?: string | null }> = {
    abc123: { displayName: 'Alice', picture: 'https://example.com/alice.png' },
    def456: { displayName: 'Bob', picture: undefined },
    ghi789: { displayName: 'Carol', picture: undefined }
  };

  return {
    authState,
    followsState,
    relaysState,
    profileDisplayMap,
    mockAfterNavigate: vi.fn(),
    mockGetLocale: vi.fn().mockReturnValue('en'),
    mockSetLocale: vi.fn(),
    mockIsExtensionMode: vi.fn().mockReturnValue(false),
    mockGetRelays: vi.fn(() => relaysState),
    mockIsTransitionalState: vi.fn((s: string) => s === 'connecting' || s === 'reconnecting'),
    mockInitRelayStatus: vi.fn().mockResolvedValue(undefined),
    mockDestroyRelayStatus: vi.fn(),
    mockInitApp: vi.fn(),
    mockManageNotifications: vi.fn().mockReturnValue(undefined),
    mockLoginNostr: vi.fn().mockResolvedValue(undefined),
    mockLogoutNostr: vi.fn().mockResolvedValue(undefined),
    mockGetProfileDisplay: vi.fn((pubkey: string) => {
      return profileDisplayMap[pubkey] ?? { displayName: 'unknown', picture: undefined };
    }),
    mockGetProfileHref: vi.fn().mockReturnValue('/profile/test')
  };
});

vi.mock('$app/navigation', () => ({
  afterNavigate: (...args: unknown[]) => mockAfterNavigate(...(args as []))
}));

vi.mock('$shared/browser/auth.js', () => ({
  getAuth: () => authState,
  loginNostr: (...args: unknown[]) => mockLoginNostr(...(args as [])),
  logoutNostr: (...args: unknown[]) => mockLogoutNostr(...(args as []))
}));

vi.mock('$shared/browser/follows.js', () => ({
  getFollows: () => followsState
}));

vi.mock('$shared/browser/locale.js', () => ({
  getLocale: () => mockGetLocale(),
  setLocale: (...args: unknown[]) => mockSetLocale(...(args as []))
}));

vi.mock('$shared/browser/extension.js', () => ({
  isExtensionMode: () => mockIsExtensionMode()
}));

vi.mock('$shared/browser/relays.js', () => ({
  getRelays: () => mockGetRelays(),
  isTransitionalState: (s: string) => mockIsTransitionalState(s),
  initRelayStatus: (...args: unknown[]) => mockInitRelayStatus(...(args as [])),
  destroyRelayStatus: (...args: unknown[]) => mockDestroyRelayStatus(...(args as []))
}));

vi.mock('$shared/browser/profile.js', () => ({
  getProfileDisplay: (pubkey: string) => mockGetProfileDisplay(pubkey),
  getProfileHref: (pubkey: string) => mockGetProfileHref(pubkey)
}));

vi.mock('$shared/utils/deploy-env.js', () => ({
  getDeployEnv: () => 'development',
  getEnvBannerConfig: () => null
}));

vi.mock('$appcore/bootstrap/init-app.js', () => ({
  initApp: () => mockInitApp()
}));

vi.mock('$appcore/bootstrap/init-notifications.svelte.js', () => ({
  manageNotifications: (...args: unknown[]) => mockManageNotifications(...(args as []))
}));

import { createAppShellViewModel } from './app-shell-view-model.svelte.js';

describe('createAppShellViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.pubkey = null;
    authState.initialized = false;
    authState.loggedIn = false;
    followsState.follows = new Set();
    relaysState.length = 0;
    profileDisplayMap.abc123 = { displayName: 'Alice', picture: 'https://example.com/alice.png' };
    profileDisplayMap.def456 = { displayName: 'Bob', picture: undefined };
    profileDisplayMap.ghi789 = { displayName: 'Carol', picture: undefined };
    mockGetLocale.mockReturnValue('en');
    mockIsExtensionMode.mockReturnValue(false);
    mockGetRelays.mockReturnValue(relaysState);
    mockInitRelayStatus.mockResolvedValue(undefined);
  });

  describe('initial state', () => {
    it('menuOpen is false initially', () => {
      const vm = createAppShellViewModel();
      expect(vm.menuOpen).toBe(false);
    });

    it('exposes auth object', () => {
      const vm = createAppShellViewModel();
      expect(vm.auth).toBe(authState);
    });

    it('localeCode reflects getLocale()', () => {
      mockGetLocale.mockReturnValue('ja');
      const vm = createAppShellViewModel();
      expect(vm.localeCode).toBe('ja');
    });

    it('extensionMode reflects isExtensionMode()', () => {
      mockIsExtensionMode.mockReturnValue(true);
      const vm = createAppShellViewModel();
      expect(vm.extensionMode).toBe(true);
    });
  });

  describe('relayList and relay status derived values', () => {
    it('relayList is empty when no relays', () => {
      const vm = createAppShellViewModel();
      expect(vm.relayList).toEqual([]);
    });

    it('relayConnectedCount counts connected relays', () => {
      relaysState.push(
        { url: 'wss://a.example.com', state: 'connected' },
        { url: 'wss://b.example.com', state: 'connected' },
        { url: 'wss://c.example.com', state: 'error' }
      );
      mockGetRelays.mockReturnValue(relaysState);
      const vm = createAppShellViewModel();
      expect(vm.relayConnectedCount).toBe(2);
    });

    it('showRelayWarning is true when relays exist but none connected and none transitioning', () => {
      relaysState.push(
        { url: 'wss://a.example.com', state: 'error' },
        { url: 'wss://b.example.com', state: 'error' }
      );
      mockGetRelays.mockReturnValue(relaysState);
      mockIsTransitionalState.mockReturnValue(false);
      const vm = createAppShellViewModel();
      expect(vm.showRelayWarning).toBe(true);
    });

    it('showRelayWarning is false when some relays are connecting', () => {
      relaysState.push(
        { url: 'wss://a.example.com', state: 'connecting' },
        { url: 'wss://b.example.com', state: 'error' }
      );
      mockGetRelays.mockReturnValue(relaysState);
      mockIsTransitionalState.mockImplementation((s: string) => s === 'connecting');
      const vm = createAppShellViewModel();
      expect(vm.showRelayWarning).toBe(false);
    });

    it('showRelayWarning is false when at least one relay is connected', () => {
      relaysState.push(
        { url: 'wss://a.example.com', state: 'connected' },
        { url: 'wss://b.example.com', state: 'error' }
      );
      mockGetRelays.mockReturnValue(relaysState);
      const vm = createAppShellViewModel();
      expect(vm.showRelayWarning).toBe(false);
    });

    it('showRelayWarning is false when relay list is empty', () => {
      const vm = createAppShellViewModel();
      expect(vm.showRelayWarning).toBe(false);
    });
  });

  describe('openMenu', () => {
    it('sets menuOpen to true', () => {
      const vm = createAppShellViewModel();
      vm.openMenu();
      expect(vm.menuOpen).toBe(true);
    });
  });

  describe('closeMenu', () => {
    it('sets menuOpen to false', () => {
      const vm = createAppShellViewModel();
      vm.openMenu();
      vm.closeMenu();
      expect(vm.menuOpen).toBe(false);
    });

    it('is idempotent when menu is already closed', () => {
      const vm = createAppShellViewModel();
      vm.closeMenu();
      expect(vm.menuOpen).toBe(false);
    });
  });

  describe('selectLocale', () => {
    it('calls setLocale with the given code', () => {
      const vm = createAppShellViewModel();
      vm.selectLocale('ja');
      expect(mockSetLocale).toHaveBeenCalledWith('ja');
    });

    it('closes the menu after selecting locale', () => {
      const vm = createAppShellViewModel();
      vm.openMenu();
      vm.selectLocale('en');
      expect(vm.menuOpen).toBe(false);
    });
  });

  describe('profileHref', () => {
    it('returns profile path when pubkey is set', () => {
      authState.pubkey = 'abc123';
      const vm = createAppShellViewModel();
      expect(vm.profileHref).toBe('/profile/test');
      expect(mockGetProfileHref).toHaveBeenCalledWith('abc123');
    });

    it('returns "/" when pubkey is null', () => {
      authState.pubkey = null;
      const vm = createAppShellViewModel();
      expect(vm.profileHref).toBe('/');
    });
  });

  describe('profileDisplay', () => {
    it('returns profile display when pubkey is set', () => {
      authState.pubkey = 'abc123';
      const vm = createAppShellViewModel();
      expect(vm.profileDisplay).toEqual({
        displayName: 'Alice',
        picture: 'https://example.com/alice.png'
      });
      expect(mockGetProfileDisplay).toHaveBeenCalledWith('abc123');
    });

    it('picture が未設定な場合は navbar fallback 用に undefined を返す', () => {
      authState.pubkey = 'def456';
      const vm = createAppShellViewModel();

      expect(vm.profileDisplay).toEqual({ displayName: 'Bob', picture: undefined });
      expect(vm.profileDisplay?.picture).toBeUndefined();
    });

    it('invalid picture が sanitize 済みで落ちたケースでも undefined を維持する', () => {
      authState.pubkey = 'ghi789';
      profileDisplayMap.ghi789 = { displayName: 'Carol', picture: undefined };
      const vm = createAppShellViewModel();

      expect(vm.profileDisplay).toEqual({ displayName: 'Carol', picture: undefined });
      expect(vm.profileDisplay?.picture).toBeUndefined();
    });

    it('account-switch と logout で stale avatar を残さない', () => {
      authState.pubkey = 'abc123';
      const vm = createAppShellViewModel();
      expect(vm.profileDisplay).toEqual({
        displayName: 'Alice',
        picture: 'https://example.com/alice.png'
      });

      authState.pubkey = 'def456';
      expect(vm.profileDisplay).toEqual({ displayName: 'Bob', picture: undefined });
      expect(vm.profileDisplay?.picture).toBeUndefined();
      expect(mockGetProfileDisplay).toHaveBeenCalledWith('def456');

      authState.pubkey = null;
      expect(vm.profileDisplay).toBeNull();
    });

    it('returns null when pubkey is null', () => {
      authState.pubkey = null;
      const vm = createAppShellViewModel();
      expect(vm.profileDisplay).toBeNull();
    });
  });

  describe('login/logout', () => {
    it('exposes login as a function', () => {
      const vm = createAppShellViewModel();
      expect(typeof vm.login).toBe('function');
    });

    it('exposes logout as a function', () => {
      const vm = createAppShellViewModel();
      expect(typeof vm.logout).toBe('function');
    });
  });

  describe('afterNavigate callback registration', () => {
    it('registers an afterNavigate callback on creation', () => {
      createAppShellViewModel();
      expect(mockAfterNavigate).toHaveBeenCalledOnce();
      expect(mockAfterNavigate).toHaveBeenCalledWith(expect.any(Function));
    });

    it('afterNavigate callback closes the menu', () => {
      createAppShellViewModel();
      const vm2 = createAppShellViewModel();
      vm2.openMenu();

      // Invoke the callback registered by vm2 (second call)
      const callback2 = mockAfterNavigate.mock.calls[1][0] as () => void;
      callback2();
      expect(vm2.menuOpen).toBe(false);
    });
  });
});
