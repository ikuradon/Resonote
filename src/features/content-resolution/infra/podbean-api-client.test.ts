import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolvePodbeanEmbed } from './podbean-api-client.js';

describe('resolvePodbeanEmbed', () => {
  const SOURCE_URL = 'https://www.podbean.com/media/share/pb-abc123';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns embedSrc when API responds with embedSrc', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedSrc: 'https://www.podbean.com/player-v2/?i=xyz', embedId: undefined })
    } as Response);

    const result = await resolvePodbeanEmbed(SOURCE_URL);

    expect(result).toBe('https://www.podbean.com/player-v2/?i=xyz');
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/podbean/resolve?url=${encodeURIComponent(SOURCE_URL)}`
    );
  });

  it('builds embed URL from embedId when embedSrc is absent', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedId: 'ep-abc-def' })
    } as Response);

    const result = await resolvePodbeanEmbed(SOURCE_URL);

    expect(result).toBe('https://www.podbean.com/player-v2/?i=ep-abc-def');
  });

  it('throws when response is not ok', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({})
    } as Response);

    await expect(resolvePodbeanEmbed(SOURCE_URL)).rejects.toThrow('resolve 500');
  });

  it('throws when neither embedSrc nor embedId is present', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    } as Response);

    await expect(resolvePodbeanEmbed(SOURCE_URL)).rejects.toThrow('No embed URL resolved');
  });

  it('encodes special characters in the source URL', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedSrc: 'https://example.com/embed' })
    } as Response);

    const urlWithSpecialChars = 'https://podbean.com/share?q=hello world&x=1';
    await resolvePodbeanEmbed(urlWithSpecialChars);

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/podbean/resolve?url=${encodeURIComponent(urlWithSpecialChars)}`
    );
  });
});
