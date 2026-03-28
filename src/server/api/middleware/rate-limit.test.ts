import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rateLimitMiddleware } from './rate-limit.js';

describe('rateLimitMiddleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', rateLimitMiddleware({ windowMs: 1000, max: 3 }));
    app.get('/test', (c) => c.json({ ok: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should allow requests under the limit', async () => {
    const res = await app.request('/test', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });
    expect(res.status).toBe(200);
  });

  it('should return 429 when limit is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/test', {
        headers: { 'cf-connecting-ip': '1.2.3.4' }
      });
    }
    const res = await app.request('/test', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Too Many Requests');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('should track different IPs independently', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/test', {
        headers: { 'cf-connecting-ip': '1.2.3.4' }
      });
    }
    const res = await app.request('/test', {
      headers: { 'cf-connecting-ip': '5.6.7.8' }
    });
    expect(res.status).toBe(200);
  });

  it('should reset after window expires', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) {
      await app.request('/test', {
        headers: { 'cf-connecting-ip': '1.2.3.4' }
      });
    }
    vi.advanceTimersByTime(1100);
    const res = await app.request('/test', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });
    expect(res.status).toBe(200);
    vi.useRealTimers();
  });

  it('should fall back to x-forwarded-for when cf-connecting-ip is absent', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/test', {
        headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }
      });
    }
    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }
    });
    expect(res.status).toBe(429);
  });
});
