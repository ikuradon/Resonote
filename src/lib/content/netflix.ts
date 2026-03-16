import type { ContentId, ContentProvider } from './types.js';

const NETFLIX_RE = /^https?:\/\/(?:www\.)?netflix\.com\/(?:watch|title)\/(\d+)/;

export class NetflixProvider implements ContentProvider {
  readonly platform = 'netflix';
  readonly displayName = 'Netflix';
  readonly requiresExtension = true;

  parseUrl(url: string): ContentId | null {
    const match = url.match(NETFLIX_RE);
    if (match) {
      return { platform: this.platform, type: 'title', id: match[1] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `netflix:${contentId.type}:${contentId.id}`,
      `https://www.netflix.com/title/${contentId.id}`
    ];
  }

  contentKind(): string {
    return 'netflix:title';
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.netflix.com/title/${contentId.id}`;
  }
}

export const netflix = new NetflixProvider();
