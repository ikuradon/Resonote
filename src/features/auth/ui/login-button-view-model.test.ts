import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, profileDisplayMap, fetchProfileMock, loginNostrMock, logoutNostrMock } =
  vi.hoisted(() => {
    const profileDisplayMap: Record<
      string,
      { displayName: string; profileHref: string; picture?: string }
    > = {
      'pubkey-alice': {
        displayName: 'Alice',
        profileHref: '/profile/npub1alice',
        picture: 'https://example.com/alice.png'
      },
      'pubkey-bob': {
        displayName: 'Bob',
        profileHref: '/profile/npub1bob',
        picture: undefined
      }
    };

    return {
      authState: { pubkey: null as string | null, initialized: true, loggedIn: false },
      profileDisplayMap,
      fetchProfileMock: vi.fn(),
      loginNostrMock: vi.fn(async () => {}),
      logoutNostrMock: vi.fn(async () => {})
    };
  });

vi.mock('$shared/browser/auth.js', () => ({
  getAuth: () => authState,
  loginNostr: loginNostrMock,
  logoutNostr: logoutNostrMock
}));

vi.mock('$shared/browser/profile.js', () => ({
  getProfileDisplay: vi.fn(
    (pubkey: string) =>
      profileDisplayMap[pubkey] ?? { displayName: 'unknown', profileHref: '/', picture: undefined }
  ),
  fetchProfile: fetchProfileMock
}));

// svelte runes ($derived, $effect) をスタブ
vi.mock('svelte', () => ({
  untrack: (fn: () => void) => fn()
}));

import { createLoginButtonViewModel } from './login-button-view-model.svelte.js';

describe('createLoginButtonViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.pubkey = null;
    authState.loggedIn = false;
    authState.initialized = true;
    profileDisplayMap['pubkey-alice'] = {
      displayName: 'Alice',
      profileHref: '/profile/npub1alice',
      picture: 'https://example.com/alice.png'
    };
    profileDisplayMap['pubkey-bob'] = {
      displayName: 'Bob',
      profileHref: '/profile/npub1bob',
      picture: undefined
    };
  });

  it('exposes auth from getAuth()', () => {
    const vm = createLoginButtonViewModel();
    expect(vm.auth).toBe(authState);
  });

  it('exposes login as loginNostr', () => {
    const vm = createLoginButtonViewModel();
    expect(vm.login).toBe(loginNostrMock);
  });

  it('exposes logout as logoutNostr', () => {
    const vm = createLoginButtonViewModel();
    expect(vm.logout).toBe(logoutNostrMock);
  });

  it('profileHref defaults to "/" when no pubkey', () => {
    authState.pubkey = null;
    const vm = createLoginButtonViewModel();
    expect(vm.profileHref).toBe('/');
  });

  it('displayText defaults to "" when no pubkey', () => {
    authState.pubkey = null;
    const vm = createLoginButtonViewModel();
    expect(vm.displayText).toBe('');
  });

  it('profileDisplay is null when no pubkey', () => {
    authState.pubkey = null;
    const vm = createLoginButtonViewModel();
    expect(vm.profileDisplay).toBeNull();
  });

  it('中央 hydrate 済み profile の picture をそのまま参照する', () => {
    authState.pubkey = 'pubkey-alice';

    const vm = createLoginButtonViewModel();

    expect(vm.profileDisplay).toEqual({
      displayName: 'Alice',
      profileHref: '/profile/npub1alice',
      picture: 'https://example.com/alice.png'
    });
    expect(vm.displayText).toBe('Alice');
    expect(vm.profileHref).toBe('/profile/npub1alice');
  });

  it('account-switch で stale avatar を引き継がない', () => {
    authState.pubkey = 'pubkey-alice';
    const vm = createLoginButtonViewModel();
    expect(vm.profileDisplay?.picture).toBe('https://example.com/alice.png');

    authState.pubkey = 'pubkey-bob';

    expect(vm.profileDisplay).toEqual({
      displayName: 'Bob',
      profileHref: '/profile/npub1bob',
      picture: undefined
    });
    expect(vm.profileDisplay?.picture).toBeUndefined();
    expect(vm.displayText).toBe('Bob');
  });

  it('logout 後は profile 表示を null に戻し href を fallback に戻す', () => {
    authState.pubkey = 'pubkey-alice';
    const vm = createLoginButtonViewModel();
    expect(vm.profileDisplay?.picture).toBe('https://example.com/alice.png');

    authState.pubkey = null;

    expect(vm.profileDisplay).toBeNull();
    expect(vm.displayText).toBe('');
    expect(vm.profileHref).toBe('/');
  });

  it('view-model 作成時に profile fetch の副作用を起こさない', () => {
    authState.pubkey = 'pubkey-alice';

    createLoginButtonViewModel();

    expect(fetchProfileMock).not.toHaveBeenCalled();
  });
});
