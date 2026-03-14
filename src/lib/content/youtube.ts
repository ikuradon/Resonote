import type { ContentId, ContentProvider } from './types.js';

const YOUTUBE_URL_RE =
  /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)([a-zA-Z0-9_-]+)/;
const YOUTU_BE_RE = /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/;

export class YouTubeProvider implements ContentProvider {
  readonly platform = 'youtube';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    const urlMatch = url.match(YOUTUBE_URL_RE);
    if (urlMatch) {
      return { platform: this.platform, type: 'video', id: urlMatch[1] };
    }

    const shortMatch = url.match(YOUTU_BE_RE);
    if (shortMatch) {
      return { platform: this.platform, type: 'video', id: shortMatch[1] };
    }

    return null;
  }

  toNostrTag(contentId: ContentId): [string, string, string] {
    return [
      'I',
      `youtube:video:${contentId.id}`,
      `https://www.youtube.com/watch?v=${contentId.id}`
    ];
  }

  embedUrl(contentId: ContentId): string {
    return `https://www.youtube.com/embed/${contentId.id}`;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.youtube.com/watch?v=${contentId.id}`;
  }
}

export const youtube = new YouTubeProvider();
