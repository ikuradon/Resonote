<script lang="ts">
  import { getAuth } from '$shared/browser/auth.js';
  import { type FollowFilter, getFollows, refreshFollows } from '$shared/browser/follows.js';
  import { t, type TranslationKey } from '$shared/i18n/t.js';
  import { formatDateOnly } from '$shared/utils/format.js';

  interface Props {
    followFilter: FollowFilter;
    onFilterChange: (filter: FollowFilter) => void;
  }

  let { followFilter, onFilterChange }: Props = $props();

  const auth = getAuth();
  const follows = getFollows();

  const filterOptions: {
    value: FollowFilter;
    labelKey: TranslationKey;
    titleKey?: TranslationKey;
  }[] = [
    { value: 'all', labelKey: 'filter.all' },
    { value: 'follows', labelKey: 'filter.follows' },
    { value: 'wot', labelKey: 'filter.wot', titleKey: 'filter.wot.description' }
  ];
</script>

<div class="flex flex-wrap items-center gap-2 text-xs">
  {#if auth.loggedIn}
    <div class="flex items-center rounded-lg bg-surface-2 p-0.5">
      {#each filterOptions as opt (opt.value)}
        <button
          type="button"
          onclick={() => onFilterChange(opt.value)}
          title={opt.titleKey ? t(opt.titleKey) : undefined}
          class="rounded-md px-2.5 py-1 font-medium transition-all
            {followFilter === opt.value
            ? 'bg-surface-0 text-text-primary shadow-sm'
            : 'text-text-muted hover:text-text-secondary'}"
        >
          {t(opt.labelKey)}
        </button>
      {/each}
    </div>
    {#if follows.loading}
      <span class="text-text-muted"
        >{t('wot.building')}
        <span class="font-mono">{t('wot.users', { count: follows.discoveredCount })}</span></span
      >
    {:else if follows.cachedAt}
      <span class="text-text-muted">
        {t('wot.users', { count: follows.wot.size })}
        <span class="mx-1">|</span>
        {formatDateOnly(follows.cachedAt, { unit: 'milliseconds' })}
      </span>
      <button
        type="button"
        onclick={() => auth.pubkey && refreshFollows(auth.pubkey)}
        class="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
      >
        {t('wot.update')}
      </button>
    {/if}
  {/if}
</div>
