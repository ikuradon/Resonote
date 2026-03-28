<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolveContentNavigation } from '$features/content-resolution/application/content-navigation.js';
  import TrackInput from '$lib/components/TrackInput.svelte';
  import { t } from '$shared/i18n/t.js';

  const examples = [
    {
      icon: '🎵',
      platform: 'Spotify',
      label: '#1 はじめました',
      url: 'https://open.spotify.com/episode/7mwLSxdUKHgYxxgdI3ooZw'
    },
    {
      icon: '▶️',
      platform: 'YouTube',
      label: 'Rick Astley',
      url: 'https://youtu.be/dQw4w9WgXcQ'
    },
    {
      icon: '☁️',
      platform: 'SoundCloud',
      label: 'Flume - Say It',
      url: 'https://soundcloud.com/flume/say-it-feat-tove-lo'
    },
    { icon: '🎬', platform: 'Vimeo', label: 'Audi RS 5', url: 'https://vimeo.com/231857608' },
    {
      icon: '🎧',
      platform: 'Mixcloud',
      label: 'DJ陸',
      url: 'https://www.mixcloud.com/DJ%E9%99%B8/153-amber-logic-mellow-hiphop-rb/'
    },
    {
      icon: '📻',
      platform: 'Spreaker',
      label: 'Episode',
      url: 'https://www.spreaker.com/episode/59652612'
    },
    {
      icon: '🎥',
      platform: 'ニコニコ',
      label: 'レッツゴー！陰陽師',
      url: 'https://www.nicovideo.jp/watch/sm9'
    },
    {
      icon: '🎙️',
      platform: 'Podbean',
      label: 'Magdo Mix',
      url: 'https://www.podbean.com/media/share/pb-ar8ve-1920b14'
    },
    {
      icon: '📡',
      platform: 'RSS Feed',
      label: 'uncrop.jp',
      url: 'https://uncrop.jp/rss'
    },
    {
      icon: '🎧',
      platform: 'Podcast EP',
      label: '当たり前かのように配信を始めたふたり',
      url: 'https://op3.dev/e/dts.podtrac.com/redirect.mp3/media-cdn.uncrop.jp/uncrop-jp/production/media/audio-348cbbc4e1841a4cbc517dd4dace84ba.mp3'
    },
    {
      icon: '🍎',
      platform: 'Apple Podcasts',
      label: 'NHKラジオニュース',
      url: 'https://podcasts.apple.com/jp/podcast/nhk%E3%83%A9%E3%82%B8%E3%82%AA%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9/id400203229'
    }
  ].sort(() => Math.random() - 0.5);

  function handleExample(url: string) {
    const result = resolveContentNavigation(url);
    if (result && 'path' in result) {
      goto(result.path);
    }
  }
</script>

<div class="mx-auto flex max-w-3xl flex-col items-center gap-12 pt-20 pb-16">
  <div class="animate-fade-in text-center">
    <h1 class="font-display text-5xl font-bold tracking-wide text-text-primary">
      Reso<span class="text-accent">note</span>
    </h1>
    <p class="mt-4 text-base text-text-secondary">
      {t('app.tagline')}
    </p>
    <div
      class="mx-auto mt-6 h-px w-16 bg-gradient-to-r from-transparent via-accent to-transparent"
    ></div>
  </div>

  <div class="animate-slide-up stagger-2 w-full max-w-lg">
    <TrackInput />
  </div>

  <div class="animate-slide-up stagger-3 w-full max-w-lg space-y-4">
    <p class="text-center text-xs font-medium tracking-wide text-text-muted uppercase">
      {t('app.examples')}
    </p>
    <div class="flex flex-wrap justify-center gap-2">
      {#each examples as item (item.url)}
        <button
          type="button"
          onclick={() => handleExample(item.url)}
          class="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-1 px-3.5 py-1.5 text-sm text-text-secondary transition-all duration-200 hover:border-accent/30 hover:bg-surface-2 hover:text-text-primary"
        >
          <span>{item.icon}</span>
          <span class="font-medium">{item.platform}</span>
          <span class="text-text-muted">·</span>
          <span>{item.label}</span>
        </button>
      {/each}
    </div>
  </div>
</div>
