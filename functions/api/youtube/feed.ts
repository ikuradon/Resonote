import { safeFetch } from '../../lib/url-validation.js';

interface Env {
  UNSAFE_ALLOW_PRIVATE_IPS?: string;
}

interface FeedVideo {
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
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
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

export const onRequestGet: PagesFunction<Env> = handleRequest;

async function handleRequest(context: EventContext<Env, string, unknown>): Promise<Response> {
  const url = new URL(context.request.url);
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');
  const allowPrivateIPs = !!context.env.UNSAFE_ALLOW_PRIVATE_IPS;

  if (!type || !id) {
    return json({ error: 'missing_params' }, 400);
  }

  if (!VALID_TYPES.has(type)) {
    return json({ error: 'unsupported_type' }, 400);
  }

  if (!Object.prototype.hasOwnProperty.call(ID_PATTERNS, type) || !ID_PATTERNS[type].test(id)) {
    return json({ error: 'invalid_id' }, 400);
  }

  const rssParam = RSS_PARAMS[type];
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?${rssParam}=${id}`;

  try {
    const res = await safeFetch(rssUrl, { allowPrivateIPs });
    if (!res.ok) {
      return json({ error: 'feed_fetch_failed' }, 502);
    }

    const xml = await res.text();
    const { title, videos } = parseAtomFeed(xml);

    return json({ title, videos }, 200, { 'Cache-Control': 'public, max-age=900' });
  } catch {
    return json({ error: 'feed_fetch_failed' }, 502);
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
