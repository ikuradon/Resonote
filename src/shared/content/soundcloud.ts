// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';

const SOUNDCLOUD_SETS_RE =
  /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/sets\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;

const SOUNDCLOUD_RE =
  /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;

export class SoundCloudProvider implements ContentProvider {
  readonly platform = 'soundcloud';
  readonly displayName = 'SoundCloud';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    const setsMatch = url.match(SOUNDCLOUD_SETS_RE);
    if (setsMatch) {
      return { platform: this.platform, type: 'set', id: `${setsMatch[1]}/sets/${setsMatch[2]}` };
    }

    const match = url.match(SOUNDCLOUD_RE);
    if (match) {
      if (match[2] === 'sets') return null;
      return { platform: this.platform, type: 'track', id: `${match[1]}/${match[2]}` };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `${contentId.platform}:${contentId.type}:${contentId.id}`,
      `https://soundcloud.com/${contentId.id}`
    ];
  }

  contentKind(contentId: ContentId): string {
    return `soundcloud:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string | null {
    void contentId;
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://soundcloud.com/${contentId.id}`;
  }
}

export const soundcloud = new SoundCloudProvider();
