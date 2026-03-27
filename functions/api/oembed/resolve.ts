import { safeFetch } from '../../lib/url-validation.js';

interface Env {
  UNSAFE_ALLOW_PRIVATE_IPS?: string;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  provider_name?: string;
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

export const onRequestGet: PagesFunction<Env> = handleRequest;

async function handleRequest(context: EventContext<Env, string, unknown>): Promise<Response> {
  const url = new URL(context.request.url);
  const platform = url.searchParams.get('platform');
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');
  const allowPrivateIPs = !!context.env.UNSAFE_ALLOW_PRIVATE_IPS;

  if (!platform || !type || !id) {
    return json({ error: 'missing_params' }, 400);
  }

  // Niconico uses getthumbinfo XML API instead of oEmbed
  if (platform === 'niconico') {
    return handleNiconico(type, id, allowPrivateIPs);
  }

  if (!Object.prototype.hasOwnProperty.call(PLATFORMS, platform)) {
    return json({ error: 'unsupported_platform' }, 400);
  }
  const config = PLATFORMS[platform];

  if (!config.validTypes.has(type)) {
    return json({ error: 'unsupported_type' }, 400);
  }

  if (!config.idPattern.test(id)) {
    return json({ error: 'invalid_id' }, 400);
  }

  const contentUrl = config.buildUrl(type, id);
  const oembedUrl = `${config.oembedBase}?format=json&url=${encodeURIComponent(contentUrl)}`;

  try {
    const res = await safeFetch(oembedUrl, { allowPrivateIPs });
    if (!res.ok) {
      return json({ error: 'oembed_failed' }, 502);
    }

    const data = (await res.json()) as OEmbedResponse;

    return json(
      {
        title: data.title ?? null,
        subtitle: data.author_name ?? null,
        thumbnailUrl: data.thumbnail_url ?? null,
        provider: data.provider_name ?? platform
      },
      200,
      { 'Cache-Control': 'public, max-age=86400' }
    );
  } catch {
    return json({ error: 'fetch_failed' }, 502);
  }
}

const NICONICO_VALID_TYPES = new Set(['video']);
const NICONICO_ID_PATTERN = /^(sm|nm|so)\d+$/;

async function handleNiconico(
  type: string,
  id: string,
  allowPrivateIPs: boolean
): Promise<Response> {
  if (!NICONICO_VALID_TYPES.has(type)) {
    return json({ error: 'unsupported_type' }, 400);
  }
  if (!NICONICO_ID_PATTERN.test(id)) {
    return json({ error: 'invalid_id' }, 400);
  }

  const apiUrl = `https://ext.nicovideo.jp/api/getthumbinfo/${id}`;
  try {
    const res = await safeFetch(apiUrl, { allowPrivateIPs });
    if (!res.ok) {
      return json({ error: 'oembed_failed' }, 502);
    }
    const xml = await res.text();

    const statusMatch = xml.match(/status="(\w+)"/);
    if (statusMatch?.[1] !== 'ok') {
      return json({ error: 'oembed_failed' }, 502);
    }

    const title = xml.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
    const subtitle = xml.match(/<user_nickname>([^<]*)<\/user_nickname>/)?.[1] ?? null;
    const thumbnailUrl = xml.match(/<thumbnail_url>([^<]*)<\/thumbnail_url>/)?.[1] ?? null;

    return json({ title, subtitle, thumbnailUrl, provider: 'niconico' }, 200, {
      'Cache-Control': 'public, max-age=86400'
    });
  } catch {
    return json({ error: 'fetch_failed' }, 502);
  }
}

function json(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  });
}
