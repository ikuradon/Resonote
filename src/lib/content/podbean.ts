import type { ContentId, ContentProvider } from './types.js';

const PODBEAN_SHARE_RE =
  /^https?:\/\/(?:www\.)?podbean\.com\/media\/share\/(pb-[a-z0-9]+-[a-z0-9]+)/;
const PODBEAN_EW_RE = /^https?:\/\/(?:www\.)?podbean\.com\/ew\/(pb-[a-z0-9]+-[a-z0-9]+)/;
const PODBEAN_CHANNEL_RE = /^https?:\/\/([a-zA-Z0-9_-]+)\.podbean\.com\/e\/([a-zA-Z0-9_-]+)/;

class PodbeanProvider implements ContentProvider {
  readonly platform = 'podbean';
  readonly displayName = 'Podbean';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    for (const re of [PODBEAN_SHARE_RE, PODBEAN_EW_RE]) {
      const match = url.match(re);
      if (match?.[1]) {
        return { platform: this.platform, type: 'episode', id: match[1] };
      }
    }
    const channelMatch = url.match(PODBEAN_CHANNEL_RE);
    if (channelMatch?.[1] && channelMatch?.[2]) {
      return {
        platform: this.platform,
        type: 'episode',
        id: `${channelMatch[1]}/${channelMatch[2]}`
      };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `podbean:episode:${contentId.id}`,
      `https://www.podbean.com/media/share/${contentId.id}`
    ];
  }

  contentKind(contentId: ContentId): string {
    return `podbean:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string | null {
    if (contentId.id.startsWith('pb-')) {
      return `https://admin5.podbean.com/embed.html?id=${contentId.id}`;
    }
    return null;
  }

  openUrl(contentId: ContentId): string {
    if (contentId.id.startsWith('pb-')) {
      return `https://www.podbean.com/media/share/${contentId.id}`;
    }
    const parts = contentId.id.split('/');
    return `https://${parts[0]}.podbean.com/e/${parts[1]}`;
  }
}

export const podbean = new PodbeanProvider();
export { PodbeanProvider };
