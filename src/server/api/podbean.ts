import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { assertSafeUrl, safeFetch, safeReadText } from '$server/lib/safe-fetch.js';
import { createLogger } from '$shared/utils/logger.js';

import type { Bindings } from './bindings.js';
import { cacheMiddleware } from './middleware/cache.js';

const log = createLogger('podbean');

const querySchema = z.object({
  url: z.url()
});

export const podbeanRoute = new Hono<{ Bindings: Bindings }>().get(
  '/resolve',
  cacheMiddleware({ ttl: 86400 }),
  zValidator('query', querySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'missing_url' }, 400);
    }
  }),
  async (c) => {
    const { url: targetUrl } = c.req.valid('query');
    const allowPrivateIPs = !!c.env.UNSAFE_ALLOW_PRIVATE_IPS;

    try {
      assertSafeUrl(targetUrl, allowPrivateIPs);
    } catch {
      return c.json({ error: 'url_blocked' }, 400);
    }

    // Use Podbean oEmbed API to get the embed iframe URL
    const oembedUrl = `https://api.podbean.com/v1/oembed?format=json&url=${encodeURIComponent(targetUrl)}`;
    try {
      const res = await safeFetch(oembedUrl, { allowPrivateIPs });
      if (!res.ok) {
        return c.json({ error: 'oembed_failed', status: res.status }, 502);
      }
      const data = (await res.json()) as { html?: string };
      const srcMatch = data.html?.match(/src="([^"]+)"/);
      if (srcMatch?.[1]) {
        try {
          assertSafeUrl(srcMatch[1], allowPrivateIPs);
          const embedHost = new URL(srcMatch[1]).hostname;
          if (embedHost === 'podbean.com' || embedHost.endsWith('.podbean.com')) {
            return c.json({ embedSrc: srcMatch[1] });
          }
        } catch (err) {
          log.warn('oEmbed returned unsafe or invalid src URL', err);
        }
      }

      // Fallback: fetch page HTML and extract embed ID
      const pageRes = await safeFetch(targetUrl, { allowPrivateIPs });
      if (pageRes.ok) {
        const html = await safeReadText(pageRes);
        const idMatch = html.match(/pb-[a-z0-9]+-[a-z0-9]+/);
        if (idMatch) {
          return c.json({ embedId: idMatch[0] });
        }
      }

      return c.json({ error: 'embed_not_found' }, 404);
    } catch {
      return c.json({ error: 'fetch_failed' }, 502);
    }
  }
);
