import type { ContentId, ContentProvider } from './types.js';

const SOUNDCLOUD_RE =
  /^https?:\/\/(?:www\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;

export class SoundCloudProvider implements ContentProvider {
  readonly platform = 'soundcloud';
  readonly requiresExtension = true;

  parseUrl(url: string): ContentId | null {
    const match = url.match(SOUNDCLOUD_RE);
    if (match) {
      if (match[2] === 'sets') return null;
      return { platform: this.platform, type: 'track', id: `${match[1]}/${match[2]}` };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string, string] {
    return ['I', `soundcloud:${contentId.id}`, `https://soundcloud.com/${contentId.id}`];
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://soundcloud.com/${contentId.id}`;
  }
}

export const soundcloud = new SoundCloudProvider();
