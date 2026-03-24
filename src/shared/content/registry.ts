// @public — Stable API for route/component/feature consumers
import { abema } from '$shared/content/abema.js';
import { appleMusic } from '$shared/content/apple-music.js';
import { audio } from '$shared/content/audio.js';
import { disneyPlus } from '$shared/content/disney-plus.js';
import { fountainFm } from '$shared/content/fountain-fm.js';
import { mixcloud } from '$shared/content/mixcloud.js';
import { netflix } from '$shared/content/netflix.js';
import { niconico } from '$shared/content/niconico.js';
import { podbean } from '$shared/content/podbean.js';
import { podcast } from '$shared/content/podcast.js';
import { primeVideo } from '$shared/content/prime-video.js';
import { soundcloud } from '$shared/content/soundcloud.js';
import { spotify } from '$shared/content/spotify.js';
import { spreaker } from '$shared/content/spreaker.js';
import { tver } from '$shared/content/tver.js';
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { uNext } from '$shared/content/u-next.js';
import { vimeo } from '$shared/content/vimeo.js';
import { youtube } from '$shared/content/youtube.js';

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
  niconico,
  podbean,
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
