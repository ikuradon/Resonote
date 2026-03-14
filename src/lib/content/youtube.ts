import type { ContentId, ContentProvider } from './types.js';

// https://www.youtube.com/watch?v=VIDEO_ID
// https://m.youtube.com/watch?v=VIDEO_ID
// https://music.youtube.com/watch?v=VIDEO_ID
const YOUTUBE_WATCH_RE =
  /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^&]*&)*v=([a-zA-Z0-9_-]+)/;

// https://youtu.be/VIDEO_ID
const YOUTUBE_SHORT_RE = /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/;

// https://www.youtube.com/embed/VIDEO_ID
const YOUTUBE_EMBED_RE = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/;

// https://www.youtube.com/shorts/VIDEO_ID
const YOUTUBE_SHORTS_RE = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/;

export class YouTubeProvider implements ContentProvider {
  readonly platform = 'youtube';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    for (const re of [YOUTUBE_WATCH_RE, YOUTUBE_SHORT_RE, YOUTUBE_EMBED_RE, YOUTUBE_SHORTS_RE]) {
      const match = url.match(re);
      if (match && match[1]) {
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
