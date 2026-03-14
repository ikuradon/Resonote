import type { ContentId, ContentProvider } from './types.js';

const APPLE_MUSIC_RE = /^https?:\/\/music\.apple\.com\/[a-z]{2}\/album\/[^/]+\/(\d+)(?:\?i=(\d+))?/;

export class AppleMusicProvider implements ContentProvider {
  readonly platform = 'apple-music';
  readonly requiresExtension = true;

  parseUrl(url: string): ContentId | null {
    const match = url.match(APPLE_MUSIC_RE);
    if (match) {
      if (match[2]) {
        return { platform: this.platform, type: 'song', id: match[2] };
      }
      return { platform: this.platform, type: 'album', id: match[1] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `apple-music:${contentId.type}:${contentId.id}`,
      `https://music.apple.com/us/${contentId.type}/${contentId.id}`
    ];
  }

  contentKind(contentId: ContentId): string {
    return `apple-music:${contentId.type}`;
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://music.apple.com/us/${contentId.type}/${contentId.id}`;
  }
}

export const appleMusic = new AppleMusicProvider();
