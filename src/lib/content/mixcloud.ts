import type { ContentId, ContentProvider } from './types.js';

// https://www.mixcloud.com/user/mix-name/
const MIXCLOUD_RE =
  /^https?:\/\/(?:www\.)?mixcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;

export class MixcloudProvider implements ContentProvider {
  readonly platform = 'mixcloud';
  readonly displayName = 'Mixcloud';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    const match = url.match(MIXCLOUD_RE);
    if (!match) return null;
    // Exclude reserved paths (these appear as match[1], the first segment)
    const reserved = ['upload', 'discover', 'dashboard', 'settings', 'favorites', 'categories'];
    if (reserved.includes(match[1])) return null;
    return { platform: this.platform, type: 'mix', id: `${match[1]}/${match[2]}` };
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`mixcloud:mix:${contentId.id}`, `https://www.mixcloud.com/${contentId.id}/`];
  }

  contentKind(): string {
    return 'mixcloud:mix';
  }

  embedUrl(contentId: ContentId): string {
    const feed = encodeURIComponent(`/${contentId.id}/`);
    return `https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed=${feed}`;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.mixcloud.com/${contentId.id}/`;
  }
}

export const mixcloud = new MixcloudProvider();
