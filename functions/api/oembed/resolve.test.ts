import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet } from './resolve.js';

function makeContext(params: Record<string, string>) {
  const url = new URL('https://example.com/api/oembed/resolve');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return {
    request: new Request(url.toString()),
    env: {},
    params: {},
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    next: vi.fn(),
    data: {},
    functionPath: ''
  } as unknown as Parameters<typeof onRequestGet>[0];
}

async function parseJson(response: Response) {
  return JSON.parse(await response.text());
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('oEmbed resolve API', () => {
  it('returns 400 when platform is missing', async () => {
    const ctx = makeContext({ type: 'track', id: '123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('missing_params');
  });

  it('returns 400 when type is missing', async () => {
    const ctx = makeContext({ platform: 'spotify', id: '123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('missing_params');
  });

  it('returns 400 when id is missing', async () => {
    const ctx = makeContext({ platform: 'spotify', type: 'track' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('missing_params');
  });

  it('returns 400 for unsupported platform', async () => {
    const ctx = makeContext({ platform: 'tiktok', type: 'video', id: '123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('unsupported_platform');
  });

  it('returns metadata for spotify track', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: 'Bohemian Rhapsody',
            author_name: 'Queen',
            thumbnail_url: 'https://i.scdn.co/image/thumb.jpg',
            provider_name: 'Spotify'
          }),
          { status: 200 }
        )
      )
    );

    const ctx = makeContext({ platform: 'spotify', type: 'track', id: '4uLU6hMCjMI75M1A2tKUQC' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('Bohemian Rhapsody');
    expect(body.subtitle).toBe('Queen');
    expect(body.thumbnailUrl).toBe('https://i.scdn.co/image/thumb.jpg');
    expect(body.provider).toBe('Spotify');
  });

  it('returns metadata for youtube video', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: 'Never Gonna Give You Up',
            author_name: 'Rick Astley',
            thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
            provider_name: 'YouTube'
          }),
          { status: 200 }
        )
      )
    );

    const ctx = makeContext({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('Never Gonna Give You Up');
    expect(body.subtitle).toBe('Rick Astley');
  });

  it('returns 502 when oembed API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));

    const ctx = makeContext({ platform: 'spotify', type: 'track', id: 'invalid' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(502);
    const body = await parseJson(res);
    expect(body.error).toBe('oembed_failed');
  });

  it('returns 502 when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const ctx = makeContext({ platform: 'spotify', type: 'track', id: '123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(502);
    const body = await parseJson(res);
    expect(body.error).toBe('fetch_failed');
  });

  it('includes Cache-Control header on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'Test' }), { status: 200 }))
    );

    const ctx = makeContext({ platform: 'spotify', type: 'track', id: '123' });
    const res = await onRequestGet(ctx);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('nullifies missing oembed fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    );

    const ctx = makeContext({ platform: 'spotify', type: 'track', id: '123' });
    const res = await onRequestGet(ctx);
    const body = await parseJson(res);
    expect(body.title).toBeNull();
    expect(body.subtitle).toBeNull();
    expect(body.thumbnailUrl).toBeNull();
    expect(body.provider).toBe('spotify');
  });
});
