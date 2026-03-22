import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentId, ContentProvider } from '$shared/content/types.js';

const { buildShareMock, castSignedMock, fetchLatestEventMock } = vi.hoisted(() => ({
  buildShareMock: vi.fn(() => ({ kind: 1, content: '', tags: [] })),
  castSignedMock: vi.fn(async () => {}),
  fetchLatestEventMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null)
}));

vi.mock('$shared/nostr/events.js', () => ({
  buildShare: buildShareMock
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  castSigned: castSignedMock,
  fetchLatestEvent: fetchLatestEventMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  shortHex: (s: string) => s.slice(0, 8)
}));

import { sendShare } from './share-actions.js';

const contentId: ContentId = { platform: 'spotify', type: 'track', id: 'track-1' };
const provider: ContentProvider = {
  platform: 'spotify',
  displayName: 'Spotify',
  requiresExtension: false,
  parseUrl: () => null,
  toNostrTag: (): [string, string] => ['spotify:track:track-1', ''],
  contentKind: () => 'spotify:track',
  embedUrl: () => null,
  openUrl: () => 'https://open.spotify.com/track/track-1'
};

const builtEvent = { kind: 1, content: 'hello', tags: [] };

describe('sendShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildShareMock.mockReturnValue(builtEvent);
  });

  it('calls buildShare with content, contentId, provider', async () => {
    await sendShare({ content: 'hello', contentId, provider });
    expect(buildShareMock).toHaveBeenCalledWith('hello', contentId, provider, undefined);
  });

  it('passes emojiTags to buildShare', async () => {
    const emojiTags = [['emoji', 'wave', 'https://example.com/wave.png']];
    await sendShare({ content: 'hi', contentId, provider, emojiTags });
    expect(buildShareMock).toHaveBeenCalledWith('hi', contentId, provider, emojiTags);
  });

  it('calls castSigned with the event returned by buildShare', async () => {
    await sendShare({ content: 'hello', contentId, provider });
    expect(castSignedMock).toHaveBeenCalledWith(builtEvent);
  });

  it('propagates errors from castSigned', async () => {
    castSignedMock.mockRejectedValueOnce(new Error('network error'));
    await expect(sendShare({ content: 'hello', contentId, provider })).rejects.toThrow(
      'network error'
    );
  });

  it('propagates errors from buildShare', async () => {
    buildShareMock.mockImplementationOnce(() => {
      throw new Error('build error');
    });
    await expect(sendShare({ content: 'hello', contentId, provider })).rejects.toThrow(
      'build error'
    );
  });
});
