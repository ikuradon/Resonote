export interface ContentId {
  platform: string;
  type: string;
  id: string;
}

export interface ContentProvider {
  readonly platform: string;
  readonly requiresExtension: boolean;
  parseUrl(url: string): ContentId | null;
  toNostrTag(contentId: ContentId): [value: string, hint: string];
  contentKind(contentId: ContentId): string;
  embedUrl(contentId: ContentId): string | null;
  openUrl(contentId: ContentId): string;
}
