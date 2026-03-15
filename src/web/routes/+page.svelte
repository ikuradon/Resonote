<script lang="ts">
  import { goto } from '$app/navigation';
  import TrackInput from '$lib/components/TrackInput.svelte';
  import { parseContentUrl } from '$lib/content/registry.js';
  import { t } from '$lib/i18n/t.js';

  const examples = [
    {
      icon: '🎵',
      platform: 'Spotify',
      label: 'Rebuild EP416',
      url: 'https://open.spotify.com/episode/4hMFcs08VRa7S1xyeOgFkb'
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
      url: 'https://soundcloud.com/flaboratory/say-it'
    },
    { icon: '🎬', platform: 'Vimeo', label: 'Audi RS 5', url: 'https://vimeo.com/231857608' },
    {
      icon: '🎧',
      platform: 'Mixcloud',
      label: 'NTS Radio',
      url: 'https://www.mixcloud.com/NTSRadio/do-you-w-kenny-dope-170222/'
    },
    {
      icon: '📻',
      platform: 'Spreaker',
      label: 'Episode',
      url: 'https://www.spreaker.com/episode/59652612'
    }
  ];

  function handleExample(url: string) {
    const contentId = parseContentUrl(url);
    if (contentId) {
      goto(`/${contentId.platform}/${contentId.type}/${encodeURIComponent(contentId.id)}`);
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
