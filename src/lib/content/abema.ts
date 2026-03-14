import type { ContentId, ContentProvider } from './types.js';

const ABEMA_RE = /^https?:\/\/abema\.tv\/video\/(episode|title)\/([a-zA-Z0-9_-]+)/;

export class AbemaProvider implements ContentProvider {
  readonly platform = 'abema';
  readonly requiresExtension = true;

  parseUrl(url: string): ContentId | null {
    const match = url.match(ABEMA_RE);
    if (match) {
      return { platform: this.platform, type: match[1], id: match[2] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `abema:${contentId.type}:${contentId.id}`,
      `https://abema.tv/video/${contentId.type}/${contentId.id}`
    ];
  }

  contentKind(contentId: ContentId): string {
    return `abema:${contentId.type}`;
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://abema.tv/video/${contentId.type}/${contentId.id}`;
  }
}

export const abema = new AbemaProvider();
