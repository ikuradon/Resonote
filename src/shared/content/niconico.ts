// @public — Stable API for route/component/feature consumers
import type { ContentId, ContentProvider } from '$shared/content/types.js';

const NICONICO_RE = /^https?:\/\/(?:www\.|sp\.)?nicovideo\.jp\/watch\/((?:sm|so)\d+)/;
const NICOMS_RE = /^https?:\/\/nico\.ms\/((?:sm|so)\d+)/;
const NICOEMBED_RE = /^https?:\/\/embed\.nicovideo\.jp\/watch\/((?:sm|so)\d+)/;

export class NiconicoProvider implements ContentProvider {
  readonly platform = 'niconico';
  readonly displayName = 'ニコニコ動画';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    for (const re of [NICONICO_RE, NICOMS_RE, NICOEMBED_RE]) {
      const match = url.match(re);
      if (match?.[1]) {
        return { platform: this.platform, type: 'video', id: match[1] };
      }
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`niconico:video:${contentId.id}`, `https://www.nicovideo.jp/watch/${contentId.id}`];
  }

  contentKind(contentId: ContentId): string {
    return `niconico:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string {
    return `https://embed.nicovideo.jp/watch/${contentId.id}?jsapi=1&playerId=1`;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.nicovideo.jp/watch/${contentId.id}`;
  }
}

export const niconico = new NiconicoProvider();
