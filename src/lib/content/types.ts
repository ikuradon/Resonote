export interface ContentId {
  platform: string;
  type: string;
  id: string;
}

export interface ContentProvider {
  readonly platform: string;
  readonly requiresExtension: boolean;
  parseUrl(url: string): ContentId | null;
  toNostrTag(contentId: ContentId): [tag: string, value: string, hint: string];
  embedUrl(contentId: ContentId): string | null;
  openUrl(contentId: ContentId): string;
}
