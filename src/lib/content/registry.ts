import type { ContentId, ContentProvider } from './types.js';
import { spotify } from './spotify.js';

const providers: ContentProvider[] = [spotify];

const byPlatform = new Map<string, ContentProvider>(providers.map((p) => [p.platform, p]));

export function getProvider(platform: string): ContentProvider | undefined {
  return byPlatform.get(platform);
}

export function parseContentUrl(url: string): ContentId | null {
  for (const provider of providers) {
    const id = provider.parseUrl(url);
    if (id) return id;
  }
  return null;
}
