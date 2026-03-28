import type { Handle } from '@sveltejs/kit';

import { app } from '$server/api/app.js';

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.spotify.com https://*.spotifycdn.com https://*.youtube.com https://*.soundcloud.com https://*.vimeo.com https://*.spreaker.com https://*.mixcloud.com https://*.podbean.com",
    "style-src 'self' 'unsafe-inline' https://*.googleapis.com",
    "font-src 'self' https://*.gstatic.com",
    "img-src 'self' https: data:",
    "media-src 'self' https:",
    "connect-src 'self' https: wss:",
    "frame-src https://*.spotify.com https://*.youtube.com https://*.vimeo.com https://*.soundcloud.com https://*.mixcloud.com https://*.spreaker.com https://*.nicovideo.jp https://*.podbean.com https://*.apple.com",
    "frame-ancestors 'none'"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    return app.fetch(event.request, event.platform?.env, event.platform?.context);
  }

  const response = await resolve(event);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
};
