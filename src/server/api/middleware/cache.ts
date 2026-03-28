import type { MiddlewareHandler } from 'hono';

interface CacheOptions {
  ttl: number;
}

export function cacheMiddleware(options: CacheOptions): MiddlewareHandler {
  return async (c, next) => {
    // caches.default is only available in Cloudflare Workers runtime.
    // In dev mode (Node.js/Vite), skip caching entirely.
    if (typeof caches === 'undefined') {
      await next();
      c.res.headers.set('Cache-Control', `public, max-age=${options.ttl}`);
      return;
    }

    const cache = (caches as unknown as { default: Cache }).default;
    const cacheKey = new Request(c.req.url, { method: 'GET' });

    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    await next();

    if (c.res.status >= 200 && c.res.status < 300) {
      c.res.headers.set('Cache-Control', `public, max-age=${options.ttl}`);
      const responseToCache = c.res.clone();
      try {
        c.executionCtx.waitUntil(cache.put(cacheKey, responseToCache));
      } catch {
        // executionCtx unavailable; fire-and-forget
        void cache.put(cacheKey, responseToCache);
      }
    }
  };
}
