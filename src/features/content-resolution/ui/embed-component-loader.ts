import type { Component } from 'svelte';

interface EmbedComponentModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embed components have varying props
  default: Component<any>;
}

export type EmbedComponentLoader = () => Promise<EmbedComponentModule>;

const EMBED_COMPONENT_LOADERS: Record<string, EmbedComponentLoader> = {
  spotify: () => import('$lib/components/SpotifyEmbed.svelte'),
  youtube: () => import('$lib/components/YouTubeEmbed.svelte'),
  soundcloud: () => import('./SoundCloudEmbed.svelte'),
  vimeo: () => import('$lib/components/VimeoEmbed.svelte'),
  mixcloud: () => import('$lib/components/MixcloudEmbed.svelte'),
  spreaker: () => import('$lib/components/SpreakerEmbed.svelte'),
  niconico: () => import('$lib/components/NiconicoEmbed.svelte'),
  podbean: () => import('$lib/components/PodbeanEmbed.svelte')
};

export function getEmbedComponentLoader(platform: string): EmbedComponentLoader | null {
  return EMBED_COMPONENT_LOADERS[platform] ?? null;
}
