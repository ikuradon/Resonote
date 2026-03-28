import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onRequestGet } from './resolve.js';

function makeContext(params: Record<string, string>, env: Record<string, string> = {}) {
  const url = new URL('https://example.com/api/oembed/resolve');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return {
    request: new Request(url.toString()),
    env,
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

  it('returns 400 for __proto__ platform (prototype pollution)', async () => {
    const ctx = makeContext({ platform: '__proto__', type: 'track', id: '123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('unsupported_platform');
  });

  it('returns 400 for unsupported type', async () => {
    const ctx = makeContext({ platform: 'youtube', type: 'playlist', id: 'PLxxxx' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('unsupported_type');
  });

  it('returns 400 for invalid id format', async () => {
    const ctx = makeContext({ platform: 'spotify', type: 'track', id: '../../../etc/passwd' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('invalid_id');
  });

  it('accepts soundcloud set id with two slashes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: 'My Playlist', author_name: 'Artist' }), {
          status: 200
        })
      )
    );

    const ctx = makeContext({
      platform: 'soundcloud',
      type: 'set',
      id: 'artist-name/sets/my-playlist'
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('My Playlist');
  });

  it('returns metadata for soundcloud track', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: 'My Track',
            author_name: 'Artist',
            provider_name: 'SoundCloud'
          }),
          { status: 200 }
        )
      )
    );

    const ctx = makeContext({
      platform: 'soundcloud',
      type: 'track',
      id: 'artist-name/my-track'
    });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('My Track');
    expect(body.subtitle).toBe('Artist');
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

  it('returns metadata for youtube video (oEmbed only, no API key)', async () => {
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
    expect(body.description).toBeNull();
  });

  it('returns youtube description from Data API when API key is set', async () => {
    const mockFetch = vi.fn();
    // First call: oEmbed
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          title: 'Test Video',
          author_name: 'Author',
          provider_name: 'YouTube'
        }),
        { status: 200 }
      )
    );
    // Second call: Data API v3
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [{ snippet: { description: 'Video description with https://example.com link' } }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', mockFetch);

    const ctx = makeContext(
      { platform: 'youtube', type: 'video', id: 'abc123' },
      { YOUTUBE_API_KEY: 'test-key' }
    );
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('Test Video');
    expect(body.description).toBe(
      'Video description with [https://example.com](https://example.com) link'
    );
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

  it('returns metadata for mixcloud show', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: 'Mix Title',
            author_name: 'DJ Name',
            thumbnail_url: 'https://thumbnailer.mixcloud.com/test.jpg',
            provider_name: 'Mixcloud'
          }),
          { status: 200 }
        )
      )
    );

    const ctx = makeContext({ platform: 'mixcloud', type: 'show', id: 'djname/mix-title' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('Mix Title');
    expect(body.subtitle).toBe('DJ Name');
    expect(body.provider).toBe('Mixcloud');
  });

  it('returns metadata for spreaker episode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: 'Episode Title',
            author_name: 'Show Name',
            thumbnail_url: 'https://d3wo5wojvuv7l.cloudfront.net/test.jpg',
            provider_name: 'Spreaker'
          }),
          { status: 200 }
        )
      )
    );

    const ctx = makeContext({ platform: 'spreaker', type: 'episode', id: '12345678' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('Episode Title');
    expect(body.provider).toBe('Spreaker');
  });

  it('returns metadata for podbean episode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: 'Podcast Episode',
            author_name: 'Podcast Host',
            thumbnail_url: 'https://pbcdn1.podbean.com/test.jpg',
            provider_name: 'Podbean'
          }),
          { status: 200 }
        )
      )
    );

    const ctx = makeContext({ platform: 'podbean', type: 'episode', id: 'abc12-def34' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('Podcast Episode');
    expect(body.provider).toBe('Podbean');
  });

  it('returns metadata for niconico video from XML API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok">
  <thumb>
    <title>Test Video Title</title>
    <thumbnail_url>https://nicovideo.cdn.nimg.jp/thumbnails/sm12345</thumbnail_url>
    <user_nickname>TestUser</user_nickname>
  </thumb>
</nicovideo_thumb_response>`,
          { status: 200 }
        )
      )
    );

    const ctx = makeContext({ platform: 'niconico', type: 'video', id: 'sm12345' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('Test Video Title');
    expect(body.subtitle).toBe('TestUser');
    expect(body.thumbnailUrl).toBe('https://nicovideo.cdn.nimg.jp/thumbnails/sm12345');
    expect(body.provider).toBe('niconico');
  });

  it('returns 502 for niconico error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="fail">
  <error><code>NOT_FOUND</code></error>
</nicovideo_thumb_response>`,
          { status: 200 }
        )
      )
    );

    const ctx = makeContext({ platform: 'niconico', type: 'video', id: 'sm99999' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(502);
  });

  it('returns 400 for invalid niconico id', async () => {
    const ctx = makeContext({ platform: 'niconico', type: 'video', id: 'invalid' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('invalid_id');
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
