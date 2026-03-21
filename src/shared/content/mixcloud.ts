// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';

const MIXCLOUD_RE = /^https?:\/\/(?:www\.)?mixcloud\.com\/([^/]+)\/([^/?#]+)\/?(?:\?.*)?$/;

export class MixcloudProvider implements ContentProvider {
  readonly platform = 'mixcloud';
  readonly displayName = 'Mixcloud';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    const match = url.match(MIXCLOUD_RE);
    if (!match) return null;
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
