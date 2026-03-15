<script lang="ts">
  import { goto } from '$app/navigation';
  import TrackInput from '$lib/components/TrackInput.svelte';
  import { parseContentUrl } from '$lib/content/registry.js';
  import { t } from '$lib/i18n/t.js';

  const examples = [
    {
      platform: 'Spotify',
      icon: '🎵',
      items: [
        {
          label: 'Rebuild - EP 416',
          url: 'https://open.spotify.com/episode/4hMFcs08VRa7S1xyeOgFkb'
        },
        {
          label: 'Off Topic - EP 311',
          url: 'https://open.spotify.com/episode/3X8RHJkJHiwbXdvAFHjQOp'
        }
      ]
    },
    {
      platform: 'YouTube',
      icon: '▶️',
      items: [
        {
          label: 'Lofi Girl - lofi hip hop radio',
          url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk'
        },
        { label: 'YOASOBI「アイドル」', url: 'https://www.youtube.com/watch?v=ZRtdQ81jPUQ' }
      ]
    },
    {
      platform: 'SoundCloud',
      icon: '☁️',
      items: [
        {
          label: 'Flume - Say It (feat. Tove Lo)',
          url: 'https://soundcloud.com/flaboratory/say-it'
        }
      ]
    },
    {
      platform: 'Vimeo',
      icon: '🎬',
      items: [{ label: 'Audi RS 5 - The Rally', url: 'https://vimeo.com/231857608' }]
    },
    {
      platform: 'Mixcloud',
      icon: '🎧',
      items: [
        {
          label: 'NTS Radio - Do!! You!!',
          url: 'https://www.mixcloud.com/NTSRadio/do-you-w-kenny-dope-170222/'
        }
      ]
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
    <div class="grid gap-3">
      {#each examples as group (group.platform)}
        <div class="space-y-1.5">
          <div class="flex items-center gap-1.5 text-xs text-text-muted">
            <span>{group.icon}</span>
            <span class="font-medium">{group.platform}</span>
          </div>
          {#each group.items as item (item.url)}
            <button
              type="button"
              onclick={() => handleExample(item.url)}
              class="w-full rounded-lg border border-border-subtle bg-surface-1 px-4 py-2.5 text-left text-sm text-text-secondary transition-all duration-200 hover:border-accent/30 hover:bg-surface-2 hover:text-text-primary"
            >
              {item.label}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>
