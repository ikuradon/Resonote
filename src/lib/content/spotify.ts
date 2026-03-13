import type { ContentId, ContentProvider } from './types.js';

const SPOTIFY_URL_RE = /^https?:\/\/open\.spotify\.com\/(track|album|episode|show)\/([a-zA-Z0-9]+)/;
const SPOTIFY_URI_RE = /^spotify:(track|album|episode|show):([a-zA-Z0-9]+)$/;

export class SpotifyProvider implements ContentProvider {
  readonly platform = 'spotify';

  parseUrl(url: string): ContentId | null {
    const urlMatch = url.match(SPOTIFY_URL_RE);
    if (urlMatch) {
      return { platform: this.platform, type: urlMatch[1], id: urlMatch[2] };
    }

    const uriMatch = url.match(SPOTIFY_URI_RE);
    if (uriMatch) {
      return { platform: this.platform, type: uriMatch[1], id: uriMatch[2] };
    }

    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `spotify:${contentId.type}:${contentId.id}`,
      `https://open.spotify.com/${contentId.type}/${contentId.id}`
    ];
  }

  contentKind(contentId: ContentId): string {
    return `spotify:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string {
    return `https://open.spotify.com/embed/${contentId.type}/${contentId.id}`;
  }

  openUrl(contentId: ContentId): string {
    return `https://open.spotify.com/${contentId.type}/${contentId.id}`;
  }
}

export const spotify = new SpotifyProvider();
