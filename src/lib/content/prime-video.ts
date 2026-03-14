import type { ContentId, ContentProvider } from './types.js';

const PRIME_VIDEO_RE =
  /^https?:\/\/(?:www\.)?(?:amazon\.(?:com|co\.jp)\/(?:gp\/video\/detail|dp)|primevideo\.com\/detail)\/([A-Z0-9]+)/;

export class PrimeVideoProvider implements ContentProvider {
  readonly platform = 'prime-video';
  readonly displayName = 'Prime Video';
  readonly requiresExtension = true;

  parseUrl(url: string): ContentId | null {
    const match = url.match(PRIME_VIDEO_RE);
    if (match) {
      return { platform: this.platform, type: 'video', id: match[1] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`amazon:${contentId.id}`, `https://www.primevideo.com/detail/${contentId.id}`];
  }

  contentKind(): string {
    return 'prime-video:video';
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.primevideo.com/detail/${contentId.id}`;
  }
}

export const primeVideo = new PrimeVideoProvider();
