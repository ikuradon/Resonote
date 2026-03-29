import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

const SAFE_MESSAGES: Partial<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  502: 'Bad Gateway',
  503: 'Service Unavailable'
};

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    return c.json({ error: SAFE_MESSAGES[err.status] ?? 'Internal Server Error' }, err.status);
  }
  console.error('Unhandled API error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
}
