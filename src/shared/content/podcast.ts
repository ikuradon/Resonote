// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { fromBase64url, toBase64url } from '$shared/content/url-utils.js';

const FEED_EXTENSIONS = /\.(rss|xml|atom|json)$/i;
const FEED_PATH_SEGMENTS = /\/(feed|rss|atom)(\/|$)/i;

export class PodcastProvider implements ContentProvider {
  readonly platform = 'podcast';
  readonly displayName = 'Podcast';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    if (!url) return null;

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
