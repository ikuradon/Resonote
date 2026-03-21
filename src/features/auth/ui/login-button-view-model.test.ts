import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, profileDisplayMap, fetchProfileMock, loginNostrMock, logoutNostrMock } =
  vi.hoisted(() => ({
    authState: { pubkey: null as string | null, initialized: true, loggedIn: false },
    profileDisplayMap: {
      'pubkey-alice': {
        displayName: 'Alice',
        profileHref: '/profile/npub1alice',
        picture: undefined
      }
    } as Record<string, { displayName: string; profileHref: string; picture?: string }>,
    fetchProfileMock: vi.fn(),
    loginNostrMock: vi.fn(async () => {}),
    logoutNostrMock: vi.fn(async () => {})
  }));

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
});
