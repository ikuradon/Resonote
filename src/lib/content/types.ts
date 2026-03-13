export interface ContentId {
  platform: string;
  type: string;
  id: string;
}

export interface ContentProvider {
  readonly platform: string;
  parseUrl(url: string): ContentId | null;
  toNostrTag(contentId: ContentId): [value: string, hint: string];
  contentKind(contentId: ContentId): string;
  embedUrl(contentId: ContentId): string;
  openUrl(contentId: ContentId): string;
}
