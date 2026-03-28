import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { safeFetch } from '$server/lib/safe-fetch.js';

import { cacheMiddleware } from './middleware/cache.js';

interface Bindings {
  UNSAFE_ALLOW_PRIVATE_IPS?: string;
  YOUTUBE_API_KEY?: string;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  provider_name?: string;
  description?: string;
}

interface PlatformConfig {
  oembedBase: string;
  validTypes: Set<string>;
  idPattern: RegExp;
  buildUrl: (type: string, id: string) => string;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  spotify: {
    oembedBase: 'https://open.spotify.com/oembed',
    validTypes: new Set(['track', 'album', 'artist', 'playlist', 'episode', 'show']),
    idPattern: /^[a-zA-Z0-9]+$/,
    buildUrl: (type, id) => `https://open.spotify.com/${type}/${id}`
  },
  youtube: {
    oembedBase: 'https://www.youtube.com/oembed',
    validTypes: new Set(['video']),
    idPattern: /^[a-zA-Z0-9_-]+$/,
    buildUrl: (_type, id) => `https://www.youtube.com/watch?v=${id}`
  },
  soundcloud: {
    oembedBase: 'https://soundcloud.com/oembed',
    validTypes: new Set(['track', 'set']),
    idPattern: /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+){1,2}$/,
    buildUrl: (_type, id) => `https://soundcloud.com/${id}`
  },
  vimeo: {
    oembedBase: 'https://vimeo.com/api/oembed.json',
    validTypes: new Set(['video']),
    idPattern: /^[0-9]+$/,
    buildUrl: (_type, id) => `https://vimeo.com/${id}`
  },
  mixcloud: {
    oembedBase: 'https://www.mixcloud.com/oembed/',
    validTypes: new Set(['show']),
    idPattern: /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+$/,
    buildUrl: (_type, id) => `https://www.mixcloud.com/${id}/`
  },
  spreaker: {
    oembedBase: 'https://api.spreaker.com/oembed',
    validTypes: new Set(['episode', 'show']),
    idPattern: /^[0-9]+$/,
    buildUrl: (type, id) => `https://www.spreaker.com/${type}/${id}`
  },
  podbean: {
    oembedBase: 'https://api.podbean.com/v1/oembed',
    validTypes: new Set(['episode']),
    idPattern: /^[a-zA-Z0-9_-]+$/,
    buildUrl: (_type, id) => `https://www.podbean.com/e/${id}`
  }
};

/** Convert plain-text URLs to Markdown links. */
function autoLinkUrls(text: string): string {
  return text.replace(/(?<!\[)(?<!\()(https?:\/\/[^\s)>\]]+)/g, '[$1]($1)');
}

const NICONICO_VALID_TYPES = new Set(['video']);
const NICONICO_ID_PATTERN = /^(sm|nm|so)\d+$/;

async function handleYouTube(
  type: string,
  id: string,
  env: Bindings,
  allowPrivateIPs: boolean
): Promise<{
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}> {
  const config = PLATFORMS.youtube;
  if (!config.validTypes.has(type)) {
    return { status: 400, body: { error: 'unsupported_type' } };
  }
  if (!config.idPattern.test(id)) {
    return { status: 400, body: { error: 'invalid_id' } };
  }

  // Fetch oEmbed for title/author/thumbnail
  const contentUrl = config.buildUrl(type, id);
  const oembedUrl = `${config.oembedBase}?format=json&url=${encodeURIComponent(contentUrl)}`;

  let oembedData: OEmbedResponse = {};
  try {
    const res = await safeFetch(oembedUrl, { allowPrivateIPs });
    if (res.ok) {
      oembedData = (await res.json()) as OEmbedResponse;
    }
  } catch {
    // oEmbed failure is non-fatal if we can get data from Data API
  }

  // Fetch description from YouTube Data API v3 (if API key available)
  let description: string | null = null;
  const apiKey = env.YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${apiKey}`;
      const res = await safeFetch(apiUrl, { allowPrivateIPs });
      if (res.ok) {
        const data = (await res.json()) as {
          items?: { snippet?: { description?: string } }[];
        };
        const rawDesc = data.items?.[0]?.snippet?.description;
        if (rawDesc) {
          description = autoLinkUrls(rawDesc);
        }
      }
    } catch {
      // Data API failure is non-fatal
    }
  }

  if (!oembedData.title && !description) {
    return { status: 502, body: { error: 'oembed_failed' } };
  }

  return {
    status: 200,
    body: {
      title: oembedData.title ?? null,
      subtitle: oembedData.author_name ?? null,
      thumbnailUrl: oembedData.thumbnail_url ?? null,
      description,
      provider: oembedData.provider_name ?? 'youtube'
    },
    headers: { 'Cache-Control': 'public, max-age=86400' }
  };
}

async function handleNiconico(
  type: string,
  id: string,
  allowPrivateIPs: boolean
): Promise<{
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}> {
  if (!NICONICO_VALID_TYPES.has(type)) {
    return { status: 400, body: { error: 'unsupported_type' } };
  }
  if (!NICONICO_ID_PATTERN.test(id)) {
    return { status: 400, body: { error: 'invalid_id' } };
  }

  const apiUrl = `https://ext.nicovideo.jp/api/getthumbinfo/${id}`;
  try {
    const res = await safeFetch(apiUrl, { allowPrivateIPs });
    if (!res.ok) {
      return { status: 502, body: { error: 'oembed_failed' } };
    }
    const xml = await res.text();

    const statusMatch = xml.match(/status="(\w+)"/);
    if (statusMatch?.[1] !== 'ok') {
      return { status: 502, body: { error: 'oembed_failed' } };
    }

    const title = xml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? null;
    const subtitle =
      xml.match(/<user_nickname>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/user_nickname>/)?.[1] ??
      null;
    const thumbnailUrl =
      xml.match(/<thumbnail_url>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/thumbnail_url>/)?.[1] ??
      null;
    const rawDescription =
      xml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? null;
    const description = rawDescription ? autoLinkUrls(rawDescription) : null;

    return {
      status: 200,
      body: { title, subtitle, thumbnailUrl, description, provider: 'niconico' },
      headers: { 'Cache-Control': 'public, max-age=86400' }
    };
  } catch {
    return { status: 502, body: { error: 'fetch_failed' } };
  }
}

const querySchema = z.object({
  platform: z.string(),
  type: z.string(),
  id: z.string()
});

export const oembedRoute = new Hono<{ Bindings: Bindings }>();

oembedRoute.get(
  '/resolve',
  cacheMiddleware({ ttl: 86400 }),
  zValidator('query', querySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'missing_params' }, 400);
    }
  }),
  async (c) => {
    const { platform, type, id } = c.req.valid('query');
    const allowPrivateIPs = !!c.env.UNSAFE_ALLOW_PRIVATE_IPS;

    // Niconico uses getthumbinfo XML API instead of oEmbed
    if (platform === 'niconico') {
      const result = await handleNiconico(type, id, allowPrivateIPs);
      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
          c.header(k, v);
        }
      }
      return c.json(result.body, result.status as 200);
    }

    // YouTube: fetch description from Data API v3 if API key available
    if (platform === 'youtube') {
      const result = await handleYouTube(type, id, c.env, allowPrivateIPs);
      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
          c.header(k, v);
        }
      }
      return c.json(result.body, result.status as 200);
    }

    if (!Object.prototype.hasOwnProperty.call(PLATFORMS, platform)) {
      return c.json({ error: 'unsupported_platform' }, 400);
    }
    const config = PLATFORMS[platform];

    if (!config.validTypes.has(type)) {
      return c.json({ error: 'unsupported_type' }, 400);
    }

    if (!config.idPattern.test(id)) {
      return c.json({ error: 'invalid_id' }, 400);
    }

    const contentUrl = config.buildUrl(type, id);
    const oembedUrl = `${config.oembedBase}?format=json&url=${encodeURIComponent(contentUrl)}`;

    try {
      const res = await safeFetch(oembedUrl, { allowPrivateIPs });
      if (!res.ok) {
        return c.json({ error: 'oembed_failed' }, 502);
      }

      const data = (await res.json()) as OEmbedResponse;

      c.header('Cache-Control', 'public, max-age=86400');
      return c.json({
        title: data.title ?? null,
        subtitle: data.author_name ?? null,
        thumbnailUrl: data.thumbnail_url ?? null,
        description: data.description ?? null,
        provider: data.provider_name ?? platform
      });
    } catch {
      return c.json({ error: 'fetch_failed' }, 502);
    }
  }
);
