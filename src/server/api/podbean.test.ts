import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { podbeanRoute } from './podbean.js';

interface Bindings {
  UNSAFE_ALLOW_PRIVATE_IPS?: string;
}

function createApp(): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();
  app.route('/podbean', podbeanRoute);
  return app;
}

function requestResolve(
  app: Hono<{ Bindings: Bindings }>,
  params: Record<string, string>,
  env: Partial<Bindings> = {}
): Response | Promise<Response> {
  const url = new URL('http://localhost/podbean/resolve');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return app.request(url.toString(), undefined, env);
}

async function parseJson(response: Response) {
  return JSON.parse(await response.text());
}

const mockCache = { match: vi.fn(), put: vi.fn() };

beforeEach(() => {
  vi.restoreAllMocks();
  mockCache.match.mockReset().mockResolvedValue(undefined);
  mockCache.put.mockReset();
  vi.stubGlobal('caches', { default: mockCache });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('podbean resolve', () => {
  it('should return missing_url when no url param', async () => {
    const app = createApp();
    const res = await requestResolve(app, {});
    expect(res.status).toBe(400);
    expect(await parseJson(res)).toEqual({ error: 'missing_url' });
  });

  it('should block private IP addresses', async () => {
    const app = createApp();
    const res = await requestResolve(app, { url: 'http://127.0.0.1/secret' });
    expect(res.status).toBe(400);
    expect(await parseJson(res)).toEqual({ error: 'url_blocked' });
  });

  it('should return embedSrc from oEmbed response', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          html: '<iframe src="https://www.podbean.com/player-v2/?i=abc123"></iframe>'
        })
      )
    );
    vi.stubGlobal('fetch', mockFetch);

    const app = createApp();
    const res = await requestResolve(app, { url: 'https://www.podbean.com/ew/pb-abc123' });
    expect(res.status).toBe(200);
    const data = await parseJson(res);
    expect(data.embedSrc).toBe('https://www.podbean.com/player-v2/?i=abc123');
  });

  it('should reject non-podbean embed URLs from oEmbed', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        // oEmbed returns evil URL
        new Response(JSON.stringify({ html: '<iframe src="http://evil.com/steal"></iframe>' }))
      )
      .mockResolvedValueOnce(
        // Fallback page fetch
        new Response('<html>no embed id here</html>')
      );
    vi.stubGlobal('fetch', mockFetch);

    const app = createApp();
    const res = await requestResolve(app, { url: 'https://www.podbean.com/ew/pb-abc123' });
    expect(res.status).toBe(404);
    expect(await parseJson(res)).toEqual({ error: 'embed_not_found' });
  });

  it('should fall back to HTML scraping when oEmbed has no src', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        // oEmbed with no html
        new Response(JSON.stringify({}))
      )
      .mockResolvedValueOnce(
        // Page HTML with embed ID
        new Response('<div id="pb-a1b2c3-d4e5f6">player</div>')
      );
    vi.stubGlobal('fetch', mockFetch);

    const app = createApp();
    const res = await requestResolve(app, { url: 'https://www.podbean.com/ew/pb-abc123' });
    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({ embedId: 'pb-a1b2c3-d4e5f6' });
  });

  it('should return oembed_failed on non-ok oEmbed response', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', mockFetch);

    const app = createApp();
    const res = await requestResolve(app, { url: 'https://www.podbean.com/ew/pb-abc123' });
    expect(res.status).toBe(502);
    expect(await parseJson(res)).toEqual({ error: 'oembed_failed', status: 500 });
  });

  it('should return fetch_failed on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', mockFetch);

    const app = createApp();
    const res = await requestResolve(app, { url: 'https://www.podbean.com/ew/pb-abc123' });
    expect(res.status).toBe(502);
    expect(await parseJson(res)).toEqual({ error: 'fetch_failed' });
  });

  it('should return embed_not_found when fallback has no embed ID', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({})))
      .mockResolvedValueOnce(new Response('<html>nothing useful</html>'));
    vi.stubGlobal('fetch', mockFetch);

    const app = createApp();
    const res = await requestResolve(app, { url: 'https://www.podbean.com/ew/pb-abc123' });
    expect(res.status).toBe(404);
    expect(await parseJson(res)).toEqual({ error: 'embed_not_found' });
  });

  it('should return embed_not_found when fallback page fetch returns error status', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({})))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', mockFetch);

    const app = createApp();
    const res = await requestResolve(app, { url: 'https://www.podbean.com/ew/pb-abc123' });
    expect(res.status).toBe(404);
    expect(await parseJson(res)).toEqual({ error: 'embed_not_found' });
  });

  it('should return fetch_failed when fallback page fetch throws network error', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({})))
      .mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', mockFetch);

    const app = createApp();
    const res = await requestResolve(app, { url: 'https://www.podbean.com/ew/pb-abc123' });
    expect(res.status).toBe(502);
    expect(await parseJson(res)).toEqual({ error: 'fetch_failed' });
  });
});
