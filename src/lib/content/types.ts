export interface ContentId {
  platform: string;
  type: string;
  id: string;
}

export interface ContentProvider {
  readonly platform: string;
  parseUrl(url: string): ContentId | null;
  toNostrTag(contentId: ContentId): [tag: string, value: string, hint: string];
  embedUrl(contentId: ContentId): string;
  openUrl(contentId: ContentId): string;
}
