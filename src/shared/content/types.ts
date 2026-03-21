// @public — Stable API for route/component/feature consumers
export interface ContentId {
  platform: string;
  type: string;
  id: string;
}

export function contentIdToString(id: ContentId): string {
  return `${id.platform}:${id.type}:${id.id}`;
}

export function parseContentId(value: string): ContentId | null {
  const i1 = value.indexOf(':');
  const i2 = value.indexOf(':', i1 + 1);
  if (i1 === -1 || i2 === -1) return null;
  return {
    platform: value.slice(0, i1),
    type: value.slice(i1 + 1, i2),
    id: value.slice(i2 + 1)
  };
}

export interface ContentProvider {
  readonly platform: string;
  readonly displayName: string;
  readonly requiresExtension: boolean;
  parseUrl(url: string): ContentId | null;
  toNostrTag(contentId: ContentId): [value: string, hint: string];
  contentKind(contentId: ContentId): string;
  embedUrl(contentId: ContentId): string | null;
  openUrl(contentId: ContentId): string;
}
