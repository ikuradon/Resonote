import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertSafeUrl, safeFetch, safeReadText } from './safe-fetch.js';

describe('assertSafeUrl', () => {
  it('should allow valid public URLs', () => {
    expect(() => assertSafeUrl('https://example.com/feed.xml')).not.toThrow();
    expect(() => assertSafeUrl('https://feeds.megaphone.fm/podcast')).not.toThrow();
    expect(() => assertSafeUrl('http://example.com/audio.mp3')).not.toThrow();
  });

  it('should block private IPv4 addresses', () => {
    expect(() => assertSafeUrl('http://127.0.0.1/secret')).toThrow('blocked');
    expect(() => assertSafeUrl('http://10.0.0.1/internal')).toThrow('blocked');
    expect(() => assertSafeUrl('http://192.168.1.1/admin')).toThrow('blocked');
    expect(() => assertSafeUrl('http://172.16.0.1/data')).toThrow('blocked');
    expect(() => assertSafeUrl('http://172.31.255.255/data')).toThrow('blocked');
  });

  it('should allow non-private 172.x addresses', () => {
    expect(() => assertSafeUrl('http://172.32.0.1/data')).not.toThrow();
    expect(() => assertSafeUrl('http://172.15.0.1/data')).not.toThrow();
  });

  it('should block link-local addresses', () => {
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow('blocked');
    expect(() => assertSafeUrl('http://169.254.1.1/')).toThrow('blocked');
  });

  it('should block localhost variants', () => {
    expect(() => assertSafeUrl('http://localhost/admin')).toThrow('blocked');
    expect(() => assertSafeUrl('http://0.0.0.0/')).toThrow('blocked');
  });

  it('should block IPv6 loopback and private', () => {
    expect(() => assertSafeUrl('http://[::1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[fc00::1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[fd00::1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[fe80::1]/')).toThrow('blocked');
  });

  it('should block IPv6 unspecified address', () => {
    expect(() => assertSafeUrl('http://[::]/')).toThrow('blocked');
  });

  it('should block 6to4 tunnel addresses', () => {
    expect(() => assertSafeUrl('http://[2002:7f00:1::]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[2002:a00:1::]/')).toThrow('blocked');
  });

  it('should block Teredo tunnel addresses', () => {
    expect(() => assertSafeUrl('http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/')).toThrow(
      'blocked'
    );
    // :: compressed form (server_high = 0x0000)
    expect(() => assertSafeUrl('http://[2001::101:8000:63bf:3fff:fdd2]/')).toThrow('blocked');
  });

  it('should block IPv4-compatible addresses (deprecated ::/96)', () => {
    expect(() => assertSafeUrl('http://[::7f00:1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[::a00:1]/')).toThrow('blocked');
  });

  it('should block IPv4-mapped IPv6 addresses', () => {
    expect(() => assertSafeUrl('http://[::ffff:127.0.0.1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[::ffff:10.0.0.1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[::ffff:192.168.1.1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[::ffff:172.16.0.1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[::ffff:169.254.169.254]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[::ffff:0.0.0.0]/')).toThrow('blocked');
  });

  it('should allow public IPv4-mapped IPv6 addresses', () => {
    expect(() => assertSafeUrl('http://[::ffff:8.8.8.8]/')).not.toThrow();
    expect(() => assertSafeUrl('http://[::ffff:172.32.0.1]/')).not.toThrow();
  });

  it('should block non-http(s) protocols', () => {
    expect(() => assertSafeUrl('ftp://example.com/file')).toThrow('blocked');
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow('blocked');
    expect(() => assertSafeUrl('javascript:alert(1)')).toThrow('blocked');
  });

  it('should allow domain names that start with private IP octets', () => {
    expect(() => assertSafeUrl('http://10.example.com/')).not.toThrow();
    expect(() => assertSafeUrl('http://127.example.com/')).not.toThrow();
    expect(() => assertSafeUrl('http://192.168.example.com/')).not.toThrow();
    expect(() => assertSafeUrl('http://172.16.example.com/')).not.toThrow();
  });

  it('should throw on invalid URLs', () => {
    expect(() => assertSafeUrl('not-a-url')).toThrow();
  });
});

describe('safeFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should fetch a safe URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
    const res = await safeFetch('https://example.com/feed.xml');
    expect(res.status).toBe(200);
  });

  it('should follow redirect to safe URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 301,
            headers: { location: 'https://example.com/real-feed' }
          })
        )
        .mockResolvedValueOnce(new Response('feed content', { status: 200 }))
    );
    const res = await safeFetch('https://old.example.com/feed');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('feed content');
  });

  it('should block redirect to private IP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/metadata' }
        })
      )
    );
    await expect(safeFetch('https://evil.com/redirect')).rejects.toThrow('blocked');
  });

  it('should throw on too many redirects', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 301, headers: { location: 'https://example.com/loop' } })
        )
    );
    await expect(safeFetch('https://example.com/loop')).rejects.toThrow('Too many redirects');
  });

  it('should throw on redirect without Location header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 302 })));
    await expect(safeFetch('https://example.com/')).rejects.toThrow('Redirect without Location');
  });

  it('should pass options through to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', mockFetch);
    await safeFetch('https://example.com/', { headers: { Range: 'bytes=0-1024' } });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ headers: { Range: 'bytes=0-1024' }, redirect: 'manual' })
    );
  });

  it('should strip sensitive headers on cross-origin redirect', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://other.com/resource' }
        })
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await safeFetch('https://example.com/start', {
      headers: { Authorization: 'Bearer secret', Cookie: 'session=abc', Range: 'bytes=0-1024' }
    });

    // First call should have all headers including sensitive ones
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://example.com/start',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret', Cookie: 'session=abc', Range: 'bytes=0-1024' },
        redirect: 'manual'
      })
    );

    // Second call (cross-origin) should have sensitive headers stripped
    const secondCallOptions = mockFetch.mock.calls[1][1];
    const headers = new Headers(secondCallOptions.headers);
    expect(headers.has('authorization')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
    expect(headers.get('range')).toBe('bytes=0-1024');
  });

  it('should preserve sensitive headers on same-origin redirect', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: 'https://example.com/new-path' }
        })
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await safeFetch('https://example.com/old-path', {
      headers: { Authorization: 'Bearer secret', Cookie: 'session=abc' }
    });

    const secondCallOptions = mockFetch.mock.calls[1][1];
    expect(secondCallOptions.headers).toEqual({
      Authorization: 'Bearer secret',
      Cookie: 'session=abc'
    });
  });

  it('should strip Proxy-Authorization on cross-origin redirect', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.other.com/file' }
        })
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await safeFetch('https://example.com/proxy', {
      headers: { 'Proxy-Authorization': 'Basic creds' }
    });

    const secondCallOptions = mockFetch.mock.calls[1][1];
    const headers = new Headers(secondCallOptions.headers);
    expect(headers.has('proxy-authorization')).toBe(false);
  });
});

describe('safeReadText', () => {
  function makeResponse(body: string, headers?: Record<string, string>): Response {
    return new Response(body, { headers });
  }

  it('should read normal response body', async () => {
    const res = makeResponse('hello world');
    const text = await safeReadText(res);
    expect(text).toBe('hello world');
  });

  it('should reject response when Content-Length exceeds limit', async () => {
    const res = makeResponse('x', { 'content-length': '10000000' });
    await expect(safeReadText(res, 1024)).rejects.toThrow('Response too large');
  });

  it('should reject response when stream exceeds limit', async () => {
    const largeBody = 'x'.repeat(2048);
    const res = makeResponse(largeBody);
    await expect(safeReadText(res, 1024)).rejects.toThrow('exceeded');
  });

  it('should accept response within limit', async () => {
    const body = 'x'.repeat(512);
    const res = makeResponse(body);
    const text = await safeReadText(res, 1024);
    expect(text).toBe(body);
  });
});
