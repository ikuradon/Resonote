import type { ContentId, ContentProvider } from './types.js';

// https://vimeo.com/76979871 or https://vimeo.com/76979871/abc123hash
const VIMEO_URL_RE = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/;
// https://player.vimeo.com/video/76979871
const VIMEO_EMBED_RE = /^https?:\/\/player\.vimeo\.com\/video\/(\d+)/;

export class VimeoProvider implements ContentProvider {
  readonly platform = 'vimeo';
  readonly displayName = 'Vimeo';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    for (const re of [VIMEO_URL_RE, VIMEO_EMBED_RE]) {
      const match = url.match(re);
      if (match && match[1]) {
        return { platform: this.platform, type: 'video', id: match[1] };
      }
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`vimeo:${contentId.type}:${contentId.id}`, `https://vimeo.com/${contentId.id}`];
  }

  contentKind(contentId: ContentId): string {
    return `vimeo:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string {
    return `https://player.vimeo.com/video/${contentId.id}`;
  }

  openUrl(contentId: ContentId): string {
    return `https://vimeo.com/${contentId.id}`;
  }
}

export const vimeo = new VimeoProvider();
