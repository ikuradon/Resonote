import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cacheMiddleware } from './cache.js';

describe('cacheMiddleware', () => {
  const mockCache = {
    match: vi.fn(),
    put: vi.fn()
  };

  beforeEach(() => {
    vi.stubGlobal('caches', { default: mockCache });
    mockCache.match.mockReset();
    mockCache.put.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return cached response on hit', async () => {
    const cachedBody = JSON.stringify({ cached: true });
    mockCache.match.mockResolvedValue(
      new Response(cachedBody, {
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const app = new Hono();
    app.get('/test', cacheMiddleware({ ttl: 60 }), (c) => c.json({ cached: false }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ cached: true });
  });

  it('should call handler and set cache-control on miss', async () => {
    mockCache.match.mockResolvedValue(undefined);

    const app = new Hono();
    app.get('/test', cacheMiddleware({ ttl: 300 }), (c) => c.json({ fresh: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ fresh: true });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('should not cache error responses', async () => {
    mockCache.match.mockResolvedValue(undefined);

    const app = new Hono();
    app.get('/test', cacheMiddleware({ ttl: 60 }), (c) => c.json({ error: 'bad' }, 400));

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    expect(mockCache.put).not.toHaveBeenCalled();
  });
});
