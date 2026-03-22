import { beforeEach, describe, expect, it, vi } from 'vitest';

/** マイクロタスクキューを空にするヘルパー */
function flushPromises() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const { initAuthMock, initExtensionListenerMock, retryPendingPublishesMock, logInfoMock } =
  vi.hoisted(() => ({
    initAuthMock: vi.fn(),
    initExtensionListenerMock: vi.fn(),
    retryPendingPublishesMock: vi.fn().mockResolvedValue(undefined),
    logInfoMock: vi.fn()
  }));

vi.mock('$shared/browser/auth.js', () => ({
  initAuth: initAuthMock
}));

vi.mock('$shared/browser/extension.js', () => ({
  initExtensionListener: initExtensionListenerMock
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  retryPendingPublishes: retryPendingPublishesMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: logInfoMock, debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

import { initApp } from './init-app.js';

describe('initApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls initAuth', async () => {
    initApp();
    await flushPromises();
    expect(initAuthMock).toHaveBeenCalledOnce();
  });

  it('calls initExtensionListener', async () => {
    initApp();
    await flushPromises();
    expect(initExtensionListenerMock).toHaveBeenCalledOnce();
  });

  it('calls retryPendingPublishes', async () => {
    initApp();
    await flushPromises();
    expect(retryPendingPublishesMock).toHaveBeenCalledOnce();
  });

  it('logs initialization message', async () => {
    initApp();
    await flushPromises();
    expect(logInfoMock).toHaveBeenCalledWith('Initializing app');
  });

  it('does not throw if retryPendingPublishes rejects', async () => {
    retryPendingPublishesMock.mockRejectedValueOnce(new Error('network error'));
    expect(() => initApp()).not.toThrow();
    await flushPromises();
  });

  it('returns void (fire-and-forget)', () => {
    const result = initApp();
    expect(result).toBeUndefined();
  });
});
