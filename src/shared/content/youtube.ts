// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';

const YOUTUBE_WATCH_RE =
  /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^&]*&)*v=([a-zA-Z0-9_-]+)/;
const YOUTUBE_SHORT_RE = /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/;
const YOUTUBE_EMBED_RE = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/;
const YOUTUBE_SHORTS_RE = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/;

export class YouTubeProvider implements ContentProvider {
  readonly platform = 'youtube';
  readonly displayName = 'YouTube';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    for (const re of [YOUTUBE_WATCH_RE, YOUTUBE_SHORT_RE, YOUTUBE_EMBED_RE, YOUTUBE_SHORTS_RE]) {
      const match = url.match(re);
      if (match?.[1]) {
        return { platform: this.platform, type: 'video', id: match[1] };
      }
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `youtube:${contentId.type}:${contentId.id}`,
      `https://www.youtube.com/watch?v=${contentId.id}`
    ];
  }

  contentKind(contentId: ContentId): string {
    return `youtube:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string {
    return `https://www.youtube.com/embed/${contentId.id}`;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.youtube.com/watch?v=${contentId.id}`;
  }
}

export const youtube = new YouTubeProvider();
