// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { toBase64url, fromBase64url } from '$shared/content/url-utils.js';

const AUDIO_EXTENSIONS = /\.(mp3|m4a|ogg|wav|opus|flac|aac)$/i;

export class AudioProvider implements ContentProvider {
  readonly platform = 'audio';
  readonly displayName = 'Audio';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    if (!url) return null;

    const withoutQuery = url.split('?')[0].split('#')[0];
    if (!AUDIO_EXTENSIONS.test(withoutQuery)) {
      return null;
    }

    return {
      platform: this.platform,
      type: 'track',
      id: toBase64url(url)
    };
  }

  toNostrTag(contentId: ContentId): [string, string] {
    const decodedUrl = fromBase64url(contentId.id) ?? '';
    return [`audio:${decodedUrl}`, decodedUrl];
  }

  contentKind(): string {
    return 'audio:track';
  }

  embedUrl(contentId: ContentId): string {
    return fromBase64url(contentId.id) ?? '';
  }

  openUrl(contentId: ContentId): string {
    return fromBase64url(contentId.id) ?? '';
  }
}

export const audio = new AudioProvider();
