import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { safeFetch, safeReadText } from '$server/lib/safe-fetch.js';

import type { Bindings } from './bindings.js';
import { cacheMiddleware } from './middleware/cache.js';

export interface FeedVideo {
  videoId: string;
  title: string;
  published: number;
  thumbnail: string;
}

const VALID_TYPES = new Set(['playlist', 'channel']);
const ID_PATTERNS: Record<string, RegExp> = {
  playlist: /^PL[a-zA-Z0-9_-]+$/,
  channel: /^UC[a-zA-Z0-9_-]+$/
};
const RSS_PARAMS: Record<string, string> = {
  playlist: 'playlist_id',
  channel: 'channel_id'
};

function decodeXmlEntities(s: string): string {
  return (
    s
      // Named entities (decode &amp; LAST to avoid double-decoding)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      // Numeric character references: &#NN; and &#xHH;
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&amp;/g, '&')
  );
}

function parseAtomFeed(xml: string): { title: string; videos: FeedVideo[] } {
  const titleMatch = xml.match(/<feed[^>]*>[\s\S]*?<title>([^<]*)<\/title>/);
  const title = decodeXmlEntities(titleMatch?.[1] ?? '');

  const videos: FeedVideo[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch: RegExpExecArray | null;

  while ((entryMatch = entryRe.exec(xml)) !== null) {
    const entry = entryMatch[1];
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const entryTitle = entry.match(/<title>([^<]*)<\/title>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    const thumbnail = entry.match(/<media:thumbnail\s+url="([^"]+)"/)?.[1];

    if (videoId && entryTitle) {
      videos.push({
        videoId,
        title: decodeXmlEntities(entryTitle),
        published: published ? Math.floor(new Date(published).getTime() / 1000) : 0,
        thumbnail: thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      });
    }
  }

  return { title, videos };
}

const querySchema = z.object({
  type: z.string(),
  id: z.string()
});

export const youtubeRoute = new Hono<{ Bindings: Bindings }>().get(
  '/feed',
  cacheMiddleware({ ttl: 900 }),
  zValidator('query', querySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'missing_params' }, 400);
    }
  }),
  async (c) => {
    const { type, id } = c.req.valid('query');
    const allowPrivateIPs = !!c.env.UNSAFE_ALLOW_PRIVATE_IPS;

    if (!VALID_TYPES.has(type)) {
      return c.json({ error: 'unsupported_type' }, 400);
    }

    if (!Object.prototype.hasOwnProperty.call(ID_PATTERNS, type) || !ID_PATTERNS[type].test(id)) {
      return c.json({ error: 'invalid_id' }, 400);
    }

    const rssParam = RSS_PARAMS[type];
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?${rssParam}=${id}`;

    try {
      const res = await safeFetch(rssUrl, { allowPrivateIPs });
      if (!res.ok) {
        return c.json({ error: 'feed_fetch_failed' }, 502);
      }

      const xml = await safeReadText(res);
      const { title, videos } = parseAtomFeed(xml);

      c.header('Cache-Control', 'public, max-age=900');
      return c.json({ title, videos });
    } catch {
      return c.json({ error: 'feed_fetch_failed' }, 502);
    }
  }
);
