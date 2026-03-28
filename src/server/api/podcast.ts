import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { finalizeEvent } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';
import { z } from 'zod';

import { fetchAudioMetadata } from '$server/lib/audio-metadata.js';
import { assertSafeUrl, safeFetch, safeReadText } from '$server/lib/safe-fetch.js';
import { htmlToMarkdown } from '$shared/utils/html.js';

import type { Bindings } from './bindings.js';
import { cacheMiddleware } from './middleware/cache.js';

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
  description: string;
  episodes: ParsedEpisode[];
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

  const feedDescriptionRaw =
    extractTagContent(channelXml, 'description') ||
    extractTagContent(channelXml, 'itunes:summary') ||
    '';
  const feedDescription = htmlToMarkdown(feedDescriptionRaw);

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
    const description = htmlToMarkdown(descriptionRaw);

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
    description: feedDescription,
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
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await safeFetch(feedUrl, { allowPrivateIPs });
  if (!res.ok) {
    return { status: 502, body: { error: 'fetch_failed', status: res.status } };
  }
  const xml = await safeReadText(res);
  const feed = await parseRss(xml, feedUrl);
  if (!feed) {
    return { status: 422, body: { error: 'parse_failed' } };
  }

  const feedDTag = normalizeForDTag(feedUrl);
  const feedRoot = domainRoot(feedUrl);
  const feedEvent = signBookmarkEvent(privkey, {
    dTag: feedDTag,
    iTags: [[`podcast:guid:${feed.podcastGuid}`, feedUrl]],
    kTag: 'podcast:guid',
    rTags: [feedUrl, feedRoot],
    title: feed.title,
    content: feed.description
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

  return {
    status: 200,
    body: {
      type: 'feed',
      feed: {
        title: feed.title,
        feedUrl: feed.feedUrl,
        podcastGuid: feed.podcastGuid,
        imageUrl: feed.imageUrl,
        description: feed.description
      },
      episodes: feed.episodes,
      signedEvents
    }
  };
}

async function handleAudioUrl(
  audioUrl: string,
  privkey: Uint8Array,
  allowPrivateIPs = false
): Promise<{ status: number; body: Record<string, unknown> }> {
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

      return {
        status: 200,
        body: {
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
        }
      };
    }
  }

  // No RSS match — try extracting metadata from audio file headers
  const audioMeta = await fetchAudioMetadata(audioUrl, allowPrivateIPs);

  return {
    status: 200,
    body: {
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
    }
  };
}

async function handleSiteUrl(
  siteUrl: string,
  allowPrivateIPs = false
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await safeFetch(siteUrl, { allowPrivateIPs });
  if (!res.ok) {
    return { status: 502, body: { error: 'fetch_failed', status: res.status } };
  }
  const html = await safeReadText(res);
  const rssUrl = findRssLink(html, siteUrl);

  if (rssUrl) {
    return { status: 200, body: { type: 'redirect', feedUrl: rssUrl } };
  }

  const rootUrl = domainRoot(siteUrl);
  if (rootUrl !== siteUrl.replace(/\/$/, '')) {
    try {
      const rootRes = await safeFetch(rootUrl, { allowPrivateIPs });
      if (rootRes.ok) {
        const rootHtml = await safeReadText(rootRes);
        const rootRssUrl = findRssLink(rootHtml, rootUrl);
        if (rootRssUrl) {
          return { status: 200, body: { type: 'redirect', feedUrl: rootRssUrl } };
        }
      }
    } catch {
      // ignore
    }
  }

  return { status: 404, body: { error: 'rss_not_found' } };
}

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.ogg', '.wav', '.opus', '.flac', '.aac'];
const FEED_EXTENSIONS = ['.rss', '.xml', '.atom', '.json'];
const FEED_PATH_SEGMENTS = ['/feed', '/rss', '/atom'];

const APPLE_PODCASTS_RE =
  /^https?:\/\/podcasts\.apple\.com\/(?:[a-z]{2}\/)?podcast\/(?:[^/]+\/)?id(\d+)/i;

export function detectInputType(url: URL): 'audio' | 'feed' | 'site' | 'apple-podcasts' {
  if (APPLE_PODCASTS_RE.test(`${url.origin}${url.pathname}`)) {
    return 'apple-podcasts';
  }
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

async function handleApplePodcasts(
  url: string,
  privkey: Uint8Array,
  allowPrivateIPs: boolean
): Promise<{ status: number; body: Record<string, unknown> }> {
  const match = url.match(APPLE_PODCASTS_RE);
  if (!match) return { status: 400, body: { error: 'invalid_url' } };

  const appleId = match[1];
  const lookupUrl = `https://itunes.apple.com/lookup?id=${appleId}&entity=podcast`;

  try {
    const res = await safeFetch(lookupUrl, { allowPrivateIPs });
    if (!res.ok) return { status: 502, body: { error: 'apple_lookup_failed' } };

    const data = (await res.json()) as {
      resultCount: number;
      results?: { feedUrl?: string }[];
    };
    const feedUrl = data.results?.[0]?.feedUrl;
    if (!feedUrl) return { status: 404, body: { error: 'feed_not_found' } };

    // Redirect to existing feed handler
    return await handleFeedUrl(feedUrl, privkey, allowPrivateIPs);
  } catch {
    return { status: 502, body: { error: 'apple_lookup_failed' } };
  }
}

const querySchema = z.object({
  url: z.url()
});

export const podcastRoute = new Hono<{ Bindings: Bindings }>().get(
  '/resolve',
  cacheMiddleware({ ttl: 3600 }),
  zValidator('query', querySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'missing_url' }, 400);
    }
  }),
  async (c) => {
    const { url: urlParam } = c.req.valid('query');
    const allowPrivateIPs = !!c.env.UNSAFE_ALLOW_PRIVATE_IPS;

    let parsed: URL;
    try {
      parsed = new URL(urlParam);
    } catch {
      return c.json({ error: 'invalid_url' }, 400);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return c.json({ error: 'invalid_url' }, 400);
    }

    try {
      assertSafeUrl(urlParam, allowPrivateIPs);
    } catch {
      return c.json({ error: 'url_blocked' }, 400);
    }

    const privkeyHex = c.env.SYSTEM_NOSTR_PRIVKEY;
    if (!privkeyHex) {
      return c.json({ error: 'server_misconfigured' }, 500);
    }

    let privkey: Uint8Array;
    try {
      privkey = hexToBytes(privkeyHex);
    } catch {
      return c.json({ error: 'server_misconfigured' }, 500);
    }

    const inputType = detectInputType(parsed);

    try {
      let result: { status: number; body: Record<string, unknown> };

      if (inputType === 'apple-podcasts') {
        result = await handleApplePodcasts(urlParam, privkey, allowPrivateIPs);
      } else if (inputType === 'audio') {
        result = await handleAudioUrl(urlParam, privkey, allowPrivateIPs);
      } else if (inputType === 'feed') {
        result = await handleFeedUrl(urlParam, privkey, allowPrivateIPs);
      } else {
        result = await handleSiteUrl(urlParam, allowPrivateIPs);
      }

      return c.json(result.body, result.status as 200);
    } catch {
      return c.json({ error: 'internal_error' }, 500);
    }
  }
);
