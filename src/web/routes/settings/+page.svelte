<script lang="ts">
  import type { FollowFilter } from '$shared/browser/follows.js';
  import { getNotifFilter, setNotifFilter } from '$shared/browser/notifications.js';
  import { t, type TranslationKey } from '$shared/i18n/t.js';

  import CustomEmojiSettings from './CustomEmojiSettings.svelte';
  import DeveloperTools from './DeveloperTools.svelte';
  import MuteSettings from './MuteSettings.svelte';
  import RelaySettings from './RelaySettings.svelte';

  // --- Notification filter ---
  let currentNotifFilter = $state<FollowFilter>(getNotifFilter());

  function handleNotifFilterChange(filter: FollowFilter) {
    currentNotifFilter = filter;
    setNotifFilter(filter);
  }

  const notifFilterOptions: {
    value: FollowFilter;
    labelKey: TranslationKey;
  }[] = [
    { value: 'all', labelKey: 'filter.all' },
    { value: 'follows', labelKey: 'filter.follows' },
    { value: 'wot', labelKey: 'filter.wot' }
  ];
</script>

<svelte:head>
  <title>{t('settings.title')} - Resonote</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-8 py-4">
  <div>
    <h1 class="font-display text-3xl font-bold tracking-wide text-text-primary">
      {t('settings.title')}
    </h1>
    <div class="mt-3 h-px w-16 bg-gradient-to-r from-transparent via-accent to-transparent"></div>
  </div>

  <RelaySettings />

  <MuteSettings />

  <CustomEmojiSettings />

  <!-- Notification Filter section -->
  <section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
    <h2 class="font-display text-lg font-semibold text-text-primary">
      {t('notification.filter.title')}
    </h2>
    <p class="text-sm text-text-muted">
      {t('notification.filter.description')}
    </p>
    <div class="flex items-center rounded-lg bg-surface-2 p-0.5 w-fit">
      {#each notifFilterOptions as opt (opt.value)}
        <button
          type="button"
          onclick={() => handleNotifFilterChange(opt.value)}
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-all
            {currentNotifFilter === opt.value
            ? 'bg-surface-0 text-text-primary shadow-sm'
            : 'text-text-muted hover:text-text-secondary'}"
        >
          {t(opt.labelKey)}
        </button>
      {/each}
    </div>
  </section>

  <DeveloperTools />
</div>
