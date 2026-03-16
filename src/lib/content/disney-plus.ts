import type { ContentId, ContentProvider } from './types.js';

const DISNEY_PLUS_RE = /^https?:\/\/(?:www\.)?disneyplus\.com\/(?:video|play)\/([a-zA-Z0-9-]+)/;

export class DisneyPlusProvider implements ContentProvider {
  readonly platform = 'disneyplus';
  readonly displayName = 'Disney+';
  readonly requiresExtension = true;

  parseUrl(url: string): ContentId | null {
    const match = url.match(DISNEY_PLUS_RE);
    if (match) {
      return { platform: this.platform, type: 'video', id: match[1] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `disneyplus:${contentId.type}:${contentId.id}`,
      `https://www.disneyplus.com/video/${contentId.id}`
    ];
  }

  contentKind(): string {
    return 'disneyplus:video';
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.disneyplus.com/video/${contentId.id}`;
  }
}

export const disneyPlus = new DisneyPlusProvider();
