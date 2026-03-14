import type { SiteAdapter } from './types.js';
import { netflixAdapter } from './netflix.js';
import { youtubeAdapter } from './youtube.js';
import { primeVideoAdapter } from './prime-video.js';
import { disneyPlusAdapter } from './disney-plus.js';
import { appleMusicAdapter } from './apple-music.js';
import { soundcloudAdapter } from './soundcloud.js';
import { fountainFmAdapter } from './fountain-fm.js';
import { abemaAdapter } from './abema.js';
import { tverAdapter } from './tver.js';
import { unextAdapter } from './u-next.js';

const adapters: SiteAdapter[] = [
  netflixAdapter,
  youtubeAdapter,
  primeVideoAdapter,
  disneyPlusAdapter,
  appleMusicAdapter,
  soundcloudAdapter,
  fountainFmAdapter,
  abemaAdapter,
  tverAdapter,
  unextAdapter
];

const hostnameMap = new Map<string, SiteAdapter>();

for (const adapter of adapters) {
  for (const pattern of adapter.matchPatterns) {
    const host = pattern.replace('*://', '').replace('/*', '');
    if (host.startsWith('*.')) {
      // Wildcard subdomain — store the base domain
      hostnameMap.set(host.slice(2), adapter);
    } else {
      hostnameMap.set(host, adapter);
    }
  }
}

export function findAdapter(hostname: string): SiteAdapter | null {
  // Exact match first
  const exact = hostnameMap.get(hostname);
  if (exact) return exact;

  // Wildcard subdomain match: try stripping subdomains
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    const match = hostnameMap.get(parent);
    if (match) return match;
  }

  return null;
}
