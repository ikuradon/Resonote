// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';

const YOUTUBE_WATCH_RE =
  /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^&]*&)*v=([a-zA-Z0-9_-]+)/;
const YOUTUBE_SHORT_RE = /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/;
const YOUTUBE_EMBED_RE = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/;
const YOUTUBE_SHORTS_RE = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/;
const YOUTUBE_PLAYLIST_RE =
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/playlist\?(?:[^&]*&)*list=([a-zA-Z0-9_-]+)/;
const YOUTUBE_CHANNEL_RE = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/;

export class YouTubeProvider implements ContentProvider {
  readonly platform = 'youtube';
  readonly displayName = 'YouTube';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    // Video URLs (highest priority — watch?v=xxx&list=PLyyy is treated as video)
    for (const re of [YOUTUBE_WATCH_RE, YOUTUBE_SHORT_RE, YOUTUBE_EMBED_RE, YOUTUBE_SHORTS_RE]) {
      const match = url.match(re);
      if (match?.[1]) {
        return { platform: this.platform, type: 'video', id: match[1] };
      }
    }

    const playlistMatch = url.match(YOUTUBE_PLAYLIST_RE);
    if (playlistMatch?.[1]) {
      return { platform: this.platform, type: 'playlist', id: playlistMatch[1] };
    }

    const channelMatch = url.match(YOUTUBE_CHANNEL_RE);
    if (channelMatch?.[1]) {
      return { platform: this.platform, type: 'channel', id: channelMatch[1] };
    }

    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`youtube:${contentId.type}:${contentId.id}`, this.openUrl(contentId)];
  }

  contentKind(contentId: ContentId): string {
    return `youtube:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string {
    return `https://www.youtube.com/embed/${contentId.id}`;
  }

  openUrl(contentId: ContentId): string {
    switch (contentId.type) {
      case 'playlist':
        return `https://www.youtube.com/playlist?list=${contentId.id}`;
      case 'channel':
        return `https://www.youtube.com/channel/${contentId.id}`;
      default:
        return `https://www.youtube.com/watch?v=${contentId.id}`;
    }
  }
}

export const youtube = new YouTubeProvider();
