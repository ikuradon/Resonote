import type { ContentId, ContentProvider } from './types.js';
import { spotify } from './spotify.js';
import { youtube } from './youtube.js';
import { vimeo } from './vimeo.js';
import { netflix } from './netflix.js';
import { primeVideo } from './prime-video.js';
import { disneyPlus } from './disney-plus.js';
import { appleMusic } from './apple-music.js';
import { soundcloud } from './soundcloud.js';
import { fountainFm } from './fountain-fm.js';
import { abema } from './abema.js';
import { tver } from './tver.js';
import { uNext } from './u-next.js';
import { mixcloud } from './mixcloud.js';
import { spreaker } from './spreaker.js';
import { podcast } from './podcast.js';
import { audio } from './audio.js';

const providers: ContentProvider[] = [
  spotify,
  youtube,
  vimeo,
  netflix,
  primeVideo,
  disneyPlus,
  appleMusic,
  soundcloud,
  fountainFm,
  abema,
  tver,
  uNext,
  mixcloud,
  spreaker,
  podcast,
  audio
];

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
