import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveSoundCloudEmbed } from '$features/content-resolution/infra/soundcloud-api-client.js';

describe('resolveSoundCloudEmbed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the iframe src from the oEmbed response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        html: '<iframe src="https://w.soundcloud.com/player/?url=track"></iframe>'
      })
    } as Response);

    await expect(resolveSoundCloudEmbed('https://soundcloud.com/artist/track')).resolves.toBe(
      'https://w.soundcloud.com/player/?url=track'
    );
  });

  it('should throw when the oEmbed response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad', { status: 502 }));

    await expect(resolveSoundCloudEmbed('https://soundcloud.com/artist/track')).rejects.toThrow(
      'oEmbed 502'
    );
  });

  it('should throw when the response does not include an iframe src', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        html: '<div>missing iframe</div>'
      })
    } as Response);

    await expect(resolveSoundCloudEmbed('https://soundcloud.com/artist/track')).rejects.toThrow(
      'No iframe src in oEmbed response'
    );
  });
});
