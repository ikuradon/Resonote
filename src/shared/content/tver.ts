// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';

const TVER_RE = /^https?:\/\/(?:www\.)?tver\.jp\/(?:lp\/)?episodes\/([a-zA-Z0-9]+)/;

export class TVerProvider implements ContentProvider {
  readonly platform = 'tver';
  readonly displayName = 'TVer';
  readonly requiresExtension = true;

  parseUrl(url: string): ContentId | null {
    const match = url.match(TVER_RE);
    if (match) {
      return { platform: this.platform, type: 'episode', id: match[1] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`tver:${contentId.type}:${contentId.id}`, `https://tver.jp/episodes/${contentId.id}`];
  }

  contentKind(): string {
    return 'tver:episode';
  }

  embedUrl(): null {
    return null;
  }

  openUrl(contentId: ContentId): string {
    return `https://tver.jp/episodes/${contentId.id}`;
  }
}

export const tver = new TVerProvider();
