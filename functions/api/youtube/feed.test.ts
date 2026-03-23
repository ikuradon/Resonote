import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet } from './feed.js';

function makeContext(params: Record<string, string>) {
  const url = new URL('https://example.com/api/youtube/feed');
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

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Test Playlist</title>
  <entry>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <title>Never Gonna Give You Up</title>
    <published>2009-10-25T06:57:33+00:00</published>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" />
    </media:group>
  </entry>
  <entry>
    <yt:videoId>9bZkp7q19f0</yt:videoId>
    <title>PSY - GANGNAM STYLE</title>
    <published>2012-07-15T07:46:32+00:00</published>
    <media:group>
      <media:thumbnail url="https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg" />
    </media:group>
  </entry>
</feed>`;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('YouTube feed API', () => {
  it('returns 400 when type is missing', async () => {
    const ctx = makeContext({ id: 'PLxxxx' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('missing_params');
  });

  it('returns 400 when id is missing', async () => {
    const ctx = makeContext({ type: 'playlist' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('missing_params');
  });

  it('returns 400 for unsupported type', async () => {
    const ctx = makeContext({ type: 'video', id: 'xxx' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('unsupported_type');
  });

  it('returns 400 for invalid playlist id (no PL prefix)', async () => {
    const ctx = makeContext({ type: 'playlist', id: 'notaplaylist' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('invalid_id');
  });

  it('returns 400 for invalid channel id (no UC prefix)', async () => {
    const ctx = makeContext({ type: 'channel', id: 'notachannel' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toBe('invalid_id');
  });

  it('parses playlist Atom feed and returns videos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(SAMPLE_ATOM, { status: 200 })));

    const ctx = makeContext({ type: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);

    const body = await parseJson(res);
    expect(body.title).toBe('Test Playlist');
    expect(body.videos).toHaveLength(2);
    expect(body.videos[0]).toEqual({
      videoId: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      published: expect.any(Number),
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    });
    expect(body.videos[1].videoId).toBe('9bZkp7q19f0');
  });

  it('parses channel feed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(SAMPLE_ATOM, { status: 200 })));

    const ctx = makeContext({ type: 'channel', id: 'UCddiUEpeqJcYeBxX1IVBKvQ' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);

    const body = await parseJson(res);
    expect(body.title).toBe('Test Playlist');
    expect(body.videos).toHaveLength(2);
  });

  it('uses correct RSS URL for playlist', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(SAMPLE_ATOM, { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const ctx = makeContext({ type: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    await onRequestGet(ctx);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('playlist_id=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf');
  });

  it('uses correct RSS URL for channel', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(SAMPLE_ATOM, { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const ctx = makeContext({ type: 'channel', id: 'UCddiUEpeqJcYeBxX1IVBKvQ' });
    await onRequestGet(ctx);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('channel_id=UCddiUEpeqJcYeBxX1IVBKvQ');
  });

  it('returns 502 when RSS fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));

    const ctx = makeContext({ type: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(502);
  });

  it('returns 502 when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const ctx = makeContext({ type: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(502);
  });

  it('includes Cache-Control header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(SAMPLE_ATOM, { status: 200 })));

    const ctx = makeContext({ type: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    const res = await onRequestGet(ctx);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=900');
  });

  it('handles empty feed', async () => {
    const emptyFeed = `<?xml version="1.0"?><feed><title>Empty</title></feed>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(emptyFeed, { status: 200 })));

    const ctx = makeContext({ type: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.title).toBe('Empty');
    expect(body.videos).toHaveLength(0);
  });

  it('decodes XML entities in titles', async () => {
    const entityFeed = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Rock &amp; Roll</title>
  <entry>
    <yt:videoId>abc123</yt:videoId>
    <title>Tom &amp; Jerry &lt;3&gt;</title>
    <published>2024-01-01T00:00:00+00:00</published>
    <media:group><media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg" /></media:group>
  </entry>
</feed>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(entityFeed, { status: 200 })));

    const ctx = makeContext({ type: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    const res = await onRequestGet(ctx);
    const body = await parseJson(res);
    expect(body.title).toBe('Rock & Roll');
    expect(body.videos[0].title).toBe('Tom & Jerry <3>');
  });

  it('decodes numeric character references', async () => {
    const numRefFeed = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>It&#39;s a test</title>
  <entry>
    <yt:videoId>xyz789</yt:videoId>
    <title>Don&#x27;t Stop &#8212; Believin&#39;</title>
    <published>2024-01-01T00:00:00+00:00</published>
    <media:group><media:thumbnail url="https://i.ytimg.com/vi/xyz789/hqdefault.jpg" /></media:group>
  </entry>
</feed>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(numRefFeed, { status: 200 })));

    const ctx = makeContext({ type: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    const res = await onRequestGet(ctx);
    const body = await parseJson(res);
    expect(body.title).toBe("It's a test");
    expect(body.videos[0].title).toBe("Don't Stop — Believin'");
  });
});
