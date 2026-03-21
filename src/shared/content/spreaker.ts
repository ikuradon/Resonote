// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';

const SPREAKER_EPISODE_RE =
  /^https?:\/\/(?:www\.)?spreaker\.com\/episode\/(?:[a-zA-Z0-9_-]+--)?(\d+)/;

export class SpreakerProvider implements ContentProvider {
  readonly platform = 'spreaker';
  readonly displayName = 'Spreaker';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    const match = url.match(SPREAKER_EPISODE_RE);
    if (match?.[1]) {
      return { platform: this.platform, type: 'episode', id: match[1] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `spreaker:${contentId.type}:${contentId.id}`,
      `https://www.spreaker.com/episode/${contentId.id}`
    ];
  }

  contentKind(contentId: ContentId): string {
    return `spreaker:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string {
    return `https://widget.spreaker.com/player?episode_id=${contentId.id}&theme=dark`;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.spreaker.com/episode/${contentId.id}`;
  }
}

export const spreaker = new SpreakerProvider();
