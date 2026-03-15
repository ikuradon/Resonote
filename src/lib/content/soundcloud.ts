import type { ContentId, ContentProvider } from './types.js';

const SOUNDCLOUD_RE =
  /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;

export class SoundCloudProvider implements ContentProvider {
  readonly platform = 'soundcloud';
  readonly displayName = 'SoundCloud';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    const match = url.match(SOUNDCLOUD_RE);
    if (match) {
      if (match[2] === 'sets') return null;
      return { platform: this.platform, type: 'track', id: `${match[1]}/${match[2]}` };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`soundcloud:track:${contentId.id}`, `https://soundcloud.com/${contentId.id}`];
  }

  contentKind(): string {
    return 'soundcloud:track';
  }

  embedUrl(contentId: ContentId): string {
    const trackUrl = `https://soundcloud.com/${contentId.id}`;
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=false&show_artwork=true&show_playcount=false&show_user=true&color=%23c9a256`;
  }

  openUrl(contentId: ContentId): string {
    return `https://soundcloud.com/${contentId.id}`;
  }
}

export const soundcloud = new SoundCloudProvider();
