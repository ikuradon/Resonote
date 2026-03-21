import { beforeEach, describe, expect, it, vi } from 'vitest';

const { castSignedMock, fetchLatestEventMock } = vi.hoisted(() => ({
  castSignedMock: vi.fn(async () => {}),
  fetchLatestEventMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null)
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  castSigned: castSignedMock,
  fetchLatestEvent: fetchLatestEventMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  shortHex: (s: string) => s.slice(0, 8)
}));

import { publishMuteList } from './mute-actions.js';

describe('publishMuteList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls castSigned with kind:10000, empty tags, and provided encrypted content', async () => {
    await publishMuteList('encrypted-content-abc');
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: 10000,
      tags: [],
      content: 'encrypted-content-abc'
    });
  });

  it('passes empty string as encrypted content', async () => {
    await publishMuteList('');
    expect(castSignedMock).toHaveBeenCalledWith({
      kind: 10000,
      tags: [],
      content: ''
    });
  });

  it('calls castSigned exactly once', async () => {
    await publishMuteList('some-encrypted-data');
    expect(castSignedMock).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from castSigned', async () => {
    castSignedMock.mockRejectedValueOnce(new Error('publish failed'));
    await expect(publishMuteList('encrypted-content')).rejects.toThrow('publish failed');
  });
});
