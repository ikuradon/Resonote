import type { ContentId, ContentProvider } from './types.js';

const FOUNTAIN_FM_RE = /^https?:\/\/(?:www\.)?fountain\.fm\/episode\/([a-zA-Z0-9]+)/;

export class FountainFmProvider implements ContentProvider {
  readonly platform = 'fountain';
  readonly requiresExtension = true;

  parseUrl(url: string): ContentId | null {
    const match = url.match(FOUNTAIN_FM_RE);
    if (match) {
      return { platform: this.platform, type: 'episode', id: match[1] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string, string] {
    return ['I', `fountain:episode:${contentId.id}`, `https://fountain.fm/episode/${contentId.id}`];
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://fountain.fm/episode/${contentId.id}`;
  }
}

export const fountainFm = new FountainFmProvider();
