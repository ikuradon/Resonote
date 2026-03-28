import type { MiddlewareHandler } from 'hono';

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  /** Evict expired entries when store exceeds this size. Default: 1000. */
  evictThreshold?: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function rateLimitMiddleware(options?: RateLimitOptions): MiddlewareHandler {
  const windowMs = options?.windowMs ?? 60_000;
  const max = options?.max ?? 30;
  const evictThreshold = options?.evictThreshold ?? 1000;
  const store = new Map<string, RateLimitEntry>();

  return async (c, next) => {
    const ip =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
      'unknown';

    const now = Date.now();

    // Evict expired entries to prevent unbounded memory growth
    if (store.size > evictThreshold) {
      for (const [key, val] of store) {
        if (now >= val.resetAt) store.delete(key);
      }
    }

    const entry = store.get(ip);

    if (entry && now < entry.resetAt) {
      if (entry.count >= max) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        c.header('Retry-After', String(retryAfter));
        return c.json({ error: 'Too Many Requests' }, 429);
      }
      entry.count++;
    } else {
      store.set(ip, { count: 1, resetAt: now + windowMs });
    }

    await next();
  };
}
