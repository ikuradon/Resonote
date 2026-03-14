<script lang="ts">
  import TrackInput from '$lib/components/TrackInput.svelte';
  import { t } from '$lib/i18n/t.js';
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
</div>
