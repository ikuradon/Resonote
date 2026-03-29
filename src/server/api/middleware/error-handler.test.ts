import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { errorHandler } from './error-handler.js';

describe('errorHandler', () => {
  function createApp() {
    const app = new Hono();
    app.onError(errorHandler);
    return app;
  }

  it('should return safe message for 400 HTTPException', async () => {
    const app = createApp();
    app.get('/test', () => {
      throw new HTTPException(400, { message: 'internal detail leak' });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: 'Bad Request' });
  });

  it('should return safe message for 404 HTTPException', async () => {
    const app = createApp();
    app.get('/test', () => {
      throw new HTTPException(404, { message: '/secret/internal/path' });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toEqual({ error: 'Not Found' });
  });

  it('should return safe message for 429 HTTPException', async () => {
    const app = createApp();
    app.get('/test', () => {
      throw new HTTPException(429, { message: 'rate limited' });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data).toEqual({ error: 'Too Many Requests' });
  });

  it('should fallback to Internal Server Error for unknown status', async () => {
    const app = createApp();
    app.get('/test', () => {
      throw new HTTPException(418, { message: 'teapot' });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(418);
    const data = await res.json();
    expect(data).toEqual({ error: 'Internal Server Error' });
  });

  it('should return 500 for non-HTTPException errors', async () => {
    const app = createApp();
    app.get('/test', () => {
      throw new Error('unexpected');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data).toEqual({ error: 'Internal Server Error' });
  });
});
