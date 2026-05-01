import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWotViaAuftaktMock, extractFollowsMock, logInfoMock } = vi.hoisted(() => ({
  fetchWotViaAuftaktMock: vi.fn(),
  extractFollowsMock: vi.fn(),
  logInfoMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchWot: fetchWotViaAuftaktMock
}));

vi.mock('../domain/follow-model.js', () => ({
  extractFollows: extractFollowsMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

import { fetchWot } from './wot-fetcher.js';

describe('fetchWot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to resonote fetchWot with extractFollows and constants', async () => {
    const callbacks = {
      onDirectFollows: vi.fn(),
      onWotProgress: vi.fn(),
      isCancelled: vi.fn(() => false)
    };
    const result = {
      directFollows: new Set(['a']),
      wot: new Set(['a', 'b'])
    };
    fetchWotViaAuftaktMock.mockResolvedValue(result);

    await expect(fetchWot('pubkey-1', callbacks)).resolves.toBe(result);

    expect(fetchWotViaAuftaktMock).toHaveBeenCalledWith(
      'pubkey-1',
      callbacks,
      extractFollowsMock,
      3,
      100
    );
  });

  it('logs resulting counts after a successful fetch', async () => {
    fetchWotViaAuftaktMock.mockResolvedValue({
      directFollows: new Set(['a', 'b']),
      wot: new Set(['a', 'b', 'c'])
    });

    await fetchWot('pubkey-1', {
      onDirectFollows: vi.fn(),
      onWotProgress: vi.fn(),
      isCancelled: vi.fn(() => false)
    });

    expect(logInfoMock).toHaveBeenCalledWith('WoT loaded', {
      directCount: 2,
      totalCount: 3
    });
  });
});
