import { finalizeEvent } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';

import { fetchAudioMetadata } from '../../lib/audio-metadata.js';
import { assertSafeUrl, safeFetch, safeReadText } from '../../lib/url-validation.js';

interface Env {
  SYSTEM_NOSTR_PRIVKEY: string;
  UNSAFE_ALLOW_PRIVATE_IPS?: string;
}

export interface ParsedEpisode {
  title: string;
  guid: string;
  enclosureUrl: string;
  pubDate: string;
  duration: number;
  description: string;
}

export interface ParsedFeed {
  title: string;
  feedUrl: string;
  podcastGuid: string;
  imageUrl: string;
  episodes: ParsedEpisode[];
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function normalizeForDTag(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port ? `:${parsed.port}` : '';
  let path = parsed.pathname;
  if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
  return `${host}${port}${path}`;
}

export function domainRoot(url: string): string {
  const parsed = new URL(url);
  const port = parsed.port ? `:${parsed.port}` : '';
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port}`;
}

export async function syntheticGuid(feedUrl: string): Promise<string> {
  const data = new TextEncoder().encode(feedUrl);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function signBookmarkEvent(
  privkey: Uint8Array,
  params: {
    dTag: string;
    iTags: [string, string][];
    kTag: string;
    rTags: string[];
    title: string;
    content?: string;
  }
) {
  const tags = [
    ['d', params.dTag],
    ...params.iTags.map(([v, h]) => ['i', v, h]),
    ['k', params.kTag],
    ...params.rTags.map((url) => ['r', url]),
    ['title', params.title],
    ['t', 'podcast']
  ];
  return finalizeEvent(
    {
      kind: 39701,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: (params.content ?? '').slice(0, 1000)
    },
    privkey
  );
}

export function extractTagContent(xml: string, tag: string): string {
  const patterns = [
    new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i'),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim();
  }
  return '';
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Strip HTML tags and decode entities to produce plain text.
 * Two-pass: decode entities first (handles XML-escaped markup like &lt;p&gt;),
 * then strip tags.
 */
export function stripHtml(html: string): string {
  const decoded = decodeEntities(html);
  return decoded
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Note: functions/ cannot import from src/shared/ (different build targets).
// The same stripHtml logic is duplicated in src/shared/utils/html.ts for client use.

export function extractAttr(xml: string, tag: string, attr: string): string {
  const pattern = new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["'][^>]*>`, 'i');
  const match = xml.match(pattern);
  return match ? match[1].trim() : '';
}

export async function parseRss(xml: string, feedUrl: string): Promise<ParsedFeed | null> {
  const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
  if (!channelMatch) return null;
  const channelXml = channelMatch[1];

  const title = extractTagContent(channelXml, 'title');
  if (!title) return null;

  let podcastGuid = extractTagContent(channelXml, 'podcast:guid');
  if (!podcastGuid) {
    podcastGuid = await syntheticGuid(feedUrl);
  }

  const imageUrl =
    extractAttr(channelXml, 'itunes:image', 'href') || extractTagContent(channelXml, 'url') || '';

  const items: ParsedEpisode[] = [];
  const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemPattern.exec(xml)) !== null) {
    if (items.length >= 100) break;
    const itemXml = itemMatch[1];

    const enclosureUrl = extractAttr(itemXml, 'enclosure', 'url');
    if (!enclosureUrl) continue;

    const itemTitle = extractTagContent(itemXml, 'title');
    const guid = extractTagContent(itemXml, 'guid');
    const pubDate = extractTagContent(itemXml, 'pubDate');
    const durationRaw = extractTagContent(itemXml, 'itunes:duration');
    const duration = parseDurationToSeconds(durationRaw);
    const descriptionRaw =
      extractTagContent(itemXml, 'description') ||
      extractTagContent(itemXml, 'itunes:summary') ||
      '';
    const description = stripHtml(descriptionRaw);

    items.push({
      title: itemTitle,
      guid,
      enclosureUrl,
      pubDate,
      duration,
      description
    });
  }

  return {
    title,
    feedUrl,
    podcastGuid,
    imageUrl,
    episodes: items
  };
}

/** Parse itunes:duration value ("HH:MM:SS", "MM:SS", or raw seconds) to seconds */
export function parseDurationToSeconds(raw: string): number {
  if (!raw) return 0;
  const parts = raw.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export function findRssLink(html: string, baseUrl: string): string | null {
  const pattern = /<link[^>]+type=["']application\/rss\+xml["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const hrefMatch = match[0].match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      try {
        return new URL(hrefMatch[1], baseUrl).toString();
      } catch {
        // skip invalid URLs
      }
    }
  }
  return null;
}

async function handleFeedUrl(
  feedUrl: string,
  privkey: Uint8Array,
  allowPrivateIPs = false
): Promise<Response> {
  const res = await safeFetch(feedUrl, { allowPrivateIPs });
  if (!res.ok) {
    return jsonResponse({ error: 'fetch_failed', status: res.status }, 502);
  }
  const xml = await safeReadText(res);
  const feed = await parseRss(xml, feedUrl);
  if (!feed) {
    return jsonResponse({ error: 'parse_failed' }, 422);
  }

  const feedDTag = normalizeForDTag(feedUrl);
  const feedRoot = domainRoot(feedUrl);
  const feedEvent = signBookmarkEvent(privkey, {
    dTag: feedDTag,
    iTags: [[`podcast:guid:${feed.podcastGuid}`, feedUrl]],
    kTag: 'podcast:guid',
    rTags: [feedUrl, feedRoot],
    title: feed.title
  });

  // Sign bookmark events for all episodes
  const signedEvents = [feedEvent];
  for (const ep of feed.episodes) {
    const itemGuid = ep.guid || ep.enclosureUrl;
    signedEvents.push(
      signBookmarkEvent(privkey, {
        dTag: normalizeForDTag(ep.enclosureUrl),
        iTags: [
          [`podcast:item:guid:${itemGuid}`, ep.enclosureUrl],
          [`podcast:guid:${feed.podcastGuid}`, feedUrl]
        ],
        kTag: 'podcast:item:guid',
        rTags: [ep.enclosureUrl, feedUrl, feedRoot],
        title: ep.title,
        content: ep.description
      })
    );
  }

  return jsonResponse({
    type: 'feed',
    feed: {
      title: feed.title,
      feedUrl: feed.feedUrl,
      podcastGuid: feed.podcastGuid,
      imageUrl: feed.imageUrl
    },
    episodes: feed.episodes,
    signedEvents
  });
}

async function handleAudioUrl(
  audioUrl: string,
  privkey: Uint8Array,
  allowPrivateIPs = false
): Promise<Response> {
  const rootUrl = domainRoot(audioUrl);
  let rssUrl: string | null = null;
  let feed: ParsedFeed | null = null;

  try {
    const rootRes = await safeFetch(rootUrl, { allowPrivateIPs });
    if (rootRes.ok) {
      const html = await safeReadText(rootRes);
      rssUrl = findRssLink(html, rootUrl);
    }
  } catch {
    // ignore discovery failure
  }

  if (rssUrl) {
    try {
      const feedRes = await safeFetch(rssUrl, { allowPrivateIPs });
      if (feedRes.ok) {
        const xml = await safeReadText(feedRes);
        feed = await parseRss(xml, rssUrl);
      }
    } catch {
      // ignore feed fetch failure
    }
  }

  if (feed && rssUrl) {
    const normalizedAudioUrl = audioUrl.split('?')[0];
    const matchedEpisode = feed.episodes.find(
      (ep) => ep.enclosureUrl === audioUrl || ep.enclosureUrl.split('?')[0] === normalizedAudioUrl
    );

    if (matchedEpisode) {
      const feedDTag = normalizeForDTag(rssUrl);
      const feedEvent = signBookmarkEvent(privkey, {
        dTag: feedDTag,
        iTags: [[`podcast:guid:${feed.podcastGuid}`, rssUrl]],
        kTag: 'podcast:guid',
        rTags: [rssUrl, domainRoot(rssUrl)],
        title: feed.title
      });

      const episodeDTag = normalizeForDTag(matchedEpisode.enclosureUrl);
      const itemGuid = matchedEpisode.guid || matchedEpisode.enclosureUrl;
      const episodeEvent = signBookmarkEvent(privkey, {
        dTag: episodeDTag,
        iTags: [
          [`podcast:item:guid:${itemGuid}`, matchedEpisode.enclosureUrl],
          [`podcast:guid:${feed.podcastGuid}`, rssUrl]
        ],
        kTag: 'podcast:item:guid',
        rTags: [matchedEpisode.enclosureUrl, rssUrl, domainRoot(rssUrl)],
        title: matchedEpisode.title,
        content: matchedEpisode.description
      });

      return jsonResponse({
        type: 'episode',
        episode: matchedEpisode,
        feed: {
          title: feed.title,
          feedUrl: feed.feedUrl,
          podcastGuid: feed.podcastGuid,
          imageUrl: feed.imageUrl
        },
        signedEvents: [feedEvent, episodeEvent],
        metadata: {
          title: matchedEpisode.title,
          artist: feed.title,
          image: feed.imageUrl || undefined
        }
      });
    }
  }

  // No RSS match — try extracting metadata from audio file headers
  const audioMeta = await fetchAudioMetadata(audioUrl, allowPrivateIPs);

  return jsonResponse({
    type: 'episode',
    episode: {
      title: audioMeta.title ?? '',
      guid: '',
      enclosureUrl: audioUrl,
      pubDate: '',
      duration: 0,
      description: ''
    },
    feed: null,
    signedEvents: [],
    metadata: {
      title: audioMeta.title,
      artist: audioMeta.artist,
      album: audioMeta.album,
      image: audioMeta.image
    }
  });
}

async function handleSiteUrl(siteUrl: string, allowPrivateIPs = false): Promise<Response> {
  const res = await safeFetch(siteUrl, { allowPrivateIPs });
  if (!res.ok) {
    return jsonResponse({ error: 'fetch_failed', status: res.status }, 502);
  }
  const html = await safeReadText(res);
  const rssUrl = findRssLink(html, siteUrl);

  if (rssUrl) {
    return jsonResponse({ type: 'redirect', feedUrl: rssUrl });
  }

  const rootUrl = domainRoot(siteUrl);
  if (rootUrl !== siteUrl.replace(/\/$/, '')) {
    try {
      const rootRes = await safeFetch(rootUrl, { allowPrivateIPs });
      if (rootRes.ok) {
        const rootHtml = await safeReadText(rootRes);
        const rootRssUrl = findRssLink(rootHtml, rootUrl);
        if (rootRssUrl) {
          return jsonResponse({ type: 'redirect', feedUrl: rootRssUrl });
        }
      }
    } catch {
      // ignore
    }
  }

  return jsonResponse({ error: 'rss_not_found' }, 404);
}

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.ogg', '.wav', '.opus', '.flac', '.aac'];
const FEED_EXTENSIONS = ['.rss', '.xml', '.atom', '.json'];
const FEED_PATH_SEGMENTS = ['/feed', '/rss', '/atom'];

export function detectInputType(url: URL): 'audio' | 'feed' | 'site' {
  const pathname = url.pathname.toLowerCase();

  if (AUDIO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
    return 'audio';
  }

  if (
    FEED_EXTENSIONS.some((ext) => pathname.endsWith(ext)) ||
    FEED_PATH_SEGMENTS.some((seg) => pathname.includes(seg))
  ) {
    return 'feed';
  }

  return 'site';
}

export const onRequestGet: PagesFunction<Env> = handleRequest;

async function handleRequest(context: EventContext<Env, string, unknown>): Promise<Response> {
  const { searchParams } = new URL(context.request.url);
  const urlParam = searchParams.get('url');
  const allowPrivateIPs = !!context.env.UNSAFE_ALLOW_PRIVATE_IPS;

  if (!urlParam) {
    return jsonResponse({ error: 'missing_url' }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(urlParam);
  } catch {
    return jsonResponse({ error: 'invalid_url' }, 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonResponse({ error: 'invalid_url' }, 400);
  }

  try {
    assertSafeUrl(urlParam, allowPrivateIPs);
  } catch {
    return jsonResponse({ error: 'url_blocked' }, 400);
  }

  const privkeyHex = context.env.SYSTEM_NOSTR_PRIVKEY;
  if (!privkeyHex) {
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }

  let privkey: Uint8Array;
  try {
    privkey = hexToBytes(privkeyHex);
  } catch {
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }

  const inputType = detectInputType(parsed);

  try {
    if (inputType === 'audio') {
      return await handleAudioUrl(urlParam, privkey, allowPrivateIPs);
    } else if (inputType === 'feed') {
      return await handleFeedUrl(urlParam, privkey, allowPrivateIPs);
    } else {
      return await handleSiteUrl(urlParam, allowPrivateIPs);
    }
  } catch {
    return jsonResponse({ error: 'internal_error' }, 500);
  }
}
