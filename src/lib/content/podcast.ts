import type { ContentId, ContentProvider } from './types.js';
import { toBase64url, fromBase64url } from './url-utils.js';

const FEED_EXTENSIONS = /\.(rss|xml|atom|json)$/i;
const FEED_PATH_SEGMENTS = /\/(feed|rss|atom)(\/|$)/i;

export class PodcastProvider implements ContentProvider {
  readonly platform = 'podcast';
  readonly displayName = 'Podcast';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    if (!url) return null;

    // Strip query and fragment to check extension/path
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

  toNostrTag(contentId: ContentId): [string, string] {
    if (contentId.type === 'episode') {
      const colonIndex = contentId.id.indexOf(':');
      const encodedFeed = contentId.id.slice(0, colonIndex);
      const encodedGuid = contentId.id.slice(colonIndex + 1);
      const feedUrl = fromBase64url(encodedFeed);
      const guid = fromBase64url(encodedGuid);
      return [`podcast:item:guid:${guid}`, feedUrl];
    }

    // feed type
    const feedUrl = fromBase64url(contentId.id);
    return [`podcast:guid:${feedUrl}`, feedUrl];
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
      return fromBase64url(encodedFeed);
    }
    return fromBase64url(contentId.id);
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
