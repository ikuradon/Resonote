import { beforeEach, describe, expect, it, vi } from 'vitest';

const { initMock, launchMock, logoutMock } = vi.hoisted(() => ({
  initMock: vi.fn().mockResolvedValue(undefined),
  launchMock: vi.fn().mockResolvedValue(undefined),
  logoutMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@konemono/nostr-login', () => ({
  init: initMock,
  launch: launchMock,
  logout: logoutMock
}));

import {
  initNostrLogin,
  launchLogin,
  performLogout
} from './nostr-login-gateway.js';

describe('initNostrLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls init with noBanner:true and darkMode:true', async () => {
    await initNostrLogin();
    expect(initMock).toHaveBeenCalledWith({ noBanner: true, darkMode: true });
  });

  it('resolves without error on success', async () => {
    await expect(initNostrLogin()).resolves.toBeUndefined();
  });

  it('propagates rejection if init throws', async () => {
    initMock.mockRejectedValueOnce(new Error('init failed'));
    await expect(initNostrLogin()).rejects.toThrow('init failed');
  });
});

describe('launchLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls launch from nostr-login', async () => {
    await launchLogin();
    expect(launchMock).toHaveBeenCalledOnce();
  });

  it('resolves without error on success', async () => {
    await expect(launchLogin()).resolves.toBeUndefined();
  });

  it('propagates rejection if launch throws', async () => {
    launchMock.mockRejectedValueOnce(new Error('launch failed'));
    await expect(launchLogin()).rejects.toThrow('launch failed');
  });
});

describe('performLogout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls logout from nostr-login', async () => {
    await performLogout();
    expect(logoutMock).toHaveBeenCalledOnce();
  });

  it('resolves without error on success', async () => {
    await expect(performLogout()).resolves.toBeUndefined();
  });

  it('propagates rejection if logout throws', async () => {
    logoutMock.mockRejectedValueOnce(new Error('logout failed'));
    await expect(performLogout()).rejects.toThrow('logout failed');
  });
});
