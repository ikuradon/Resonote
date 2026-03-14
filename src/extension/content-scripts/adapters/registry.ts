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

export function findAdapter(hostname: string): SiteAdapter | null {
  for (const adapter of adapters) {
    for (const pattern of adapter.matchPatterns) {
      const host = pattern.replace('*://', '').replace('/*', '').replace('*.', '');
      if (hostname === host || hostname.endsWith('.' + host)) {
        return adapter;
      }
    }
  }
  return null;
}
