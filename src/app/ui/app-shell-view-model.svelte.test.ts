import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authState,
  followsState,
  relaysState,
  mockAfterNavigate,
  mockGetLocale,
  mockSetLocale,
  mockIsExtensionMode,
  mockGetRelays,
  mockIsTransitionalState,
  mockInitRelayStatus,
  mockDestroyRelayStatus,
  mockInitApp,
  mockManageNotifications
} = vi.hoisted(() => {
  const authState = { pubkey: null as string | null, initialized: false, loggedIn: false };
  const followsState = { follows: new Set<string>() };
  const relaysState: { url: string; state: string }[] = [];

  return {
    authState,
    followsState,
    relaysState,
    mockAfterNavigate: vi.fn(),
    mockGetLocale: vi.fn().mockReturnValue('en'),
    mockSetLocale: vi.fn(),
    mockIsExtensionMode: vi.fn().mockReturnValue(false),
    mockGetRelays: vi.fn(() => relaysState),
    mockIsTransitionalState: vi.fn((s: string) => s === 'connecting' || s === 'reconnecting'),
    mockInitRelayStatus: vi.fn().mockResolvedValue(undefined),
    mockDestroyRelayStatus: vi.fn(),
    mockInitApp: vi.fn(),
    mockManageNotifications: vi.fn().mockReturnValue(undefined)
  };
});

vi.mock('$app/navigation', () => ({
  afterNavigate: (...args: unknown[]) => mockAfterNavigate(...(args as []))
}));

vi.mock('$shared/browser/auth.js', () => ({
  getAuth: () => authState
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
