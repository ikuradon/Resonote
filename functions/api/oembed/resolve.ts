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

const OEMBED_ENDPOINTS: Record<string, string> = {
  spotify: 'https://open.spotify.com/oembed',
  youtube: 'https://www.youtube.com/oembed',
  soundcloud: 'https://soundcloud.com/oembed',
  vimeo: 'https://vimeo.com/api/oembed.json'
};

function buildContentUrl(platform: string, type: string, id: string): string | null {
  switch (platform) {
    case 'spotify':
      return `https://open.spotify.com/${type}/${id}`;
    case 'youtube':
      return `https://www.youtube.com/watch?v=${id}`;
    case 'soundcloud':
      return `https://soundcloud.com/${id}`;
    case 'vimeo':
      return `https://vimeo.com/${id}`;
    default:
      return null;
  }
}

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

  const oembedBase = OEMBED_ENDPOINTS[platform];
  if (!oembedBase) {
    return json({ error: 'unsupported_platform' }, 400);
  }

  const contentUrl = buildContentUrl(platform, type, id);
  if (!contentUrl) {
    return json({ error: 'unsupported_content' }, 400);
  }

  const oembedUrl = `${oembedBase}?format=json&url=${encodeURIComponent(contentUrl)}`;

  try {
    const res = await safeFetch(oembedUrl, { allowPrivateIPs });
    if (!res.ok) {
      return json({ error: 'oembed_failed', status: res.status }, 502);
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

function json(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders
    }
  });
}
