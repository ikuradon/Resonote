import type { ContentId, ContentProvider } from './types.js';

const UNEXT_RE = /^https?:\/\/video\.unext\.jp\/play\/([A-Z0-9]+)(?:\/([A-Z0-9]+))?/;

export class UNextProvider implements ContentProvider {
  readonly platform = 'unext';
  readonly displayName = 'U-NEXT';
  readonly requiresExtension = true;

  parseUrl(url: string): ContentId | null {
    const match = url.match(UNEXT_RE);
    if (match) {
      if (match[2]) {
        return {
          platform: this.platform,
          type: 'episode',
          id: `${match[1]}/${match[2]}`
        };
      }
      return { platform: this.platform, type: 'title', id: match[1] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`unext:${contentId.id}`, `https://video.unext.jp/play/${contentId.id}`];
  }

  contentKind(contentId: ContentId): string {
    return `unext:${contentId.type}`;
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://video.unext.jp/play/${contentId.id}`;
  }
}

export const uNext = new UNextProvider();
