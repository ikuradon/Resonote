import type { Handle } from '@sveltejs/kit';

import { app } from '$server/api/app.js';

/** Headers applied to ALL responses (pages + API) */
const COMMON_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff'
};

/**
 * Headers applied only to page responses (not API).
 *
 * Content-Security-Policy rationale:
 * - 'unsafe-eval' in script-src: Required by @konemono/nostr-login which uses
 *   dynamic code evaluation internally. Remove when the library eliminates this usage.
 * - 'unsafe-inline' in script-src: Required for Svelte event handlers and inline scripts.
 * - 'unsafe-inline' in style-src: Required for Svelte scoped styles and Tailwind CSS v4.
 */
const PAGE_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.spotify.com https://*.spotifycdn.com https://*.youtube.com https://*.soundcloud.com https://*.vimeo.com https://*.spreaker.com https://*.mixcloud.com https://*.podbean.com",
    "style-src 'self' 'unsafe-inline' https://*.googleapis.com",
    "font-src 'self' https://*.gstatic.com",
    "img-src 'self' https: data:",
    "media-src 'self' https:",
    "connect-src 'self' https: wss:",
    'frame-src https://*.spotify.com https://*.youtube.com https://*.vimeo.com https://*.soundcloud.com https://*.mixcloud.com https://*.spreaker.com https://*.nicovideo.jp https://*.podbean.com https://*.apple.com',
    "frame-ancestors 'none'"
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function setHeaders(response: Response, headers: Record<string, string>): void {
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    const response = await app.fetch(event.request, event.platform?.env, event.platform?.context);
    setHeaders(response, COMMON_HEADERS);
    return response;
  }

  const response = await resolve(event);
  setHeaders(response, COMMON_HEADERS);
  setHeaders(response, PAGE_HEADERS);
  return response;
};
