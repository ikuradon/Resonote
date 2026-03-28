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

  it('should return HTTPException status and message', async () => {
    const app = createApp();
    app.get('/test', () => {
      throw new HTTPException(400, { message: 'bad request' });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: 'bad request' });
  });

  it('should return 500 for unknown errors', async () => {
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
