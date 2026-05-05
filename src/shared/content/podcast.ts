// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { fromBase64url, toBase64url } from '$shared/content/url-utils.js';

const FEED_EXTENSIONS = /\.(rss|xml|atom|json)$/i;
const FEED_PATH_SEGMENTS = /\/(feed|rss|atom)(\/|$)/i;
const APPLE_PODCASTS_RE =
  /^https?:\/\/podcasts\.apple\.com\/(?:[a-z]{2}\/)?podcast\/(?:[^/]+\/)?id(\d+)/i;
const LISTEN_TIME_PARAM_RE = /^(?:\d+|\d+\.\d+)$/;
const INVALID_LISTEN_SLUG_RE = /[/?#]/;

export interface ParsedListenUrl {
  feedUrl: string;
  /** RSS item.link matching に使う正規化済みの canonical LISTEN episode URL。 */
  episodeUrl?: string;
  initialTimeSec?: number;
  initialTimeParam?: string;
}

export function buildListenFeedUrl(podcastSlug: string): string {
  return `https://rss.listen.style/p/${encodeURIComponent(podcastSlug)}/rss`;
}

export function normalizeListenEpisodeUrl(url: string): string | null {
  return parseListenUrl(url)?.episodeUrl ?? null;
}

export function parseListenUrl(url: string): ParsedListenUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  if (parsed.hostname === 'listen.style') {
    const segments = parseListenPathSegments(parsed.pathname);
    if (segments?.[0] !== 'p' || (segments.length !== 2 && segments.length !== 3)) {
      return null;
    }

    const podcastSlug = decodeListenSlug(segments[1]);
    if (podcastSlug === null) {
      return null;
    }

    const feedUrl = buildListenFeedUrl(podcastSlug);
    if (segments.length === 2) {
      return { feedUrl };
    }

    const episodeSlug = decodeListenSlug(segments[2]);
    if (episodeSlug === null) {
      return null;
    }

    const result: ParsedListenUrl = {
      feedUrl,
      episodeUrl: `https://listen.style/p/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(
        episodeSlug
      )}`
    };
    const initialTimeParam = parseListenInitialTimeParam(parsed);
    if (initialTimeParam !== null) {
      result.initialTimeParam = initialTimeParam;
      result.initialTimeSec = Number(initialTimeParam);
    }
    return result;
  }

  if (parsed.hostname === 'rss.listen.style') {
    const segments = parseListenPathSegments(parsed.pathname);
    if (segments?.[0] !== 'p' || segments.length !== 3 || segments[2] !== 'rss') {
      return null;
    }

    const podcastSlug = decodeListenSlug(segments[1]);
    if (podcastSlug === null) {
      return null;
    }

    return { feedUrl: buildListenFeedUrl(podcastSlug) };
  }

  return null;
}

export function isListenEpisodeUrl(url: string): boolean {
  return parseListenUrl(url)?.episodeUrl != null;
}

function parseListenPathSegments(pathname: string): string[] | null {
  if (pathname.endsWith('//')) {
    return null;
  }

  const path = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (!path.startsWith('/')) {
    return null;
  }

  const segments = path.slice(1).split('/');
  if (segments.some((segment) => segment.length === 0)) {
    return null;
  }
  return segments;
}

function decodeListenSlug(segment: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }

  if (!decoded || INVALID_LISTEN_SLUG_RE.test(decoded) || hasControlCharacter(decoded)) {
    return null;
  }
  return decoded;
}

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function parseListenInitialTimeParam(parsed: URL): string | null {
  const timeParam = parsed.searchParams.get('t');
  if (timeParam === null || !LISTEN_TIME_PARAM_RE.test(timeParam) || Number(timeParam) <= 0) {
    return null;
  }
  return timeParam;
}

export class PodcastProvider implements ContentProvider {
  readonly platform = 'podcast';
  readonly displayName = 'Podcast';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    if (!url) return null;

    // Apple Podcasts URL → treat as feed (server resolves to RSS via iTunes API)
    if (APPLE_PODCASTS_RE.test(url)) {
      return {
        platform: this.platform,
        type: 'feed',
        id: toBase64url(url)
      };
    }

    const listen = parseListenUrl(url);
    if (listen) {
      return { platform: this.platform, type: 'feed', id: toBase64url(listen.feedUrl) };
    }

    const withoutQuery = url.split('?')[0].split('#')[0];
    const isFeedExtension = FEED_EXTENSIONS.test(withoutQuery);
    const isFeedSegment = FEED_PATH_SEGMENTS.test(withoutQuery);

    if (!isFeedExtension && !isFeedSegment) {
      return null;
    }

    return {
      platform: this.platform,
      type: 'feed',
      id: toBase64url(url)
    };
  }

  toNostrTag(contentId: ContentId): [value: string, hint: string] {
    if (contentId.type === 'episode') {
      const colonIndex = contentId.id.indexOf(':');
      const encodedFeed = contentId.id.slice(0, colonIndex);
      const encodedGuid = contentId.id.slice(colonIndex + 1);
      const feedUrl = fromBase64url(encodedFeed);
      if (feedUrl === null)
        throw new Error(`Failed to decode podcast feed URL from id: ${contentId.id}`);
      const guid = fromBase64url(encodedGuid);
      if (guid === null) throw new Error(`Failed to decode podcast guid from id: ${contentId.id}`);
      return [`podcast:item:guid:${guid}`, feedUrl];
    }

    const feedUrl = fromBase64url(contentId.id);
    if (feedUrl === null)
      throw new Error(`Failed to decode podcast feed URL from id: ${contentId.id}`);
    return [`podcast:feed:${feedUrl}`, feedUrl];
  }

  contentKind(contentId: ContentId): string {
    if (contentId.type === 'episode') {
      return 'podcast:item:guid';
    }
    return 'podcast:feed';
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    if (contentId.type === 'episode') {
      const colonIndex = contentId.id.indexOf(':');
      const encodedFeed = contentId.id.slice(0, colonIndex);
      return fromBase64url(encodedFeed) ?? '';
    }
    return fromBase64url(contentId.id) ?? '';
  }
}

export const podcast = new PodcastProvider();

export function buildEpisodeContentId(feedUrl: string, guid: string): ContentId {
  return {
    platform: 'podcast',
    type: 'episode',
    id: `${toBase64url(feedUrl)}:${toBase64url(guid)}`
  };
}
