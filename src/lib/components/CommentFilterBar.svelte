<script lang="ts">
  import { getAuth } from '$shared/browser/auth.js';
  import type { FollowFilter } from '$shared/browser/follows.js';
  import { t, type TranslationKey } from '$shared/i18n/t.js';

  interface Props {
    followFilter: FollowFilter;
    onFilterChange: (filter: FollowFilter) => void;
  }

  let { followFilter, onFilterChange }: Props = $props();

  const auth = getAuth();

  const filterOptions: { value: FollowFilter; labelKey: TranslationKey }[] = [
    { value: 'all', labelKey: 'filter.all' },
    { value: 'follows', labelKey: 'filter.follows' },
    { value: 'wot', labelKey: 'filter.wot' }
  ];
</script>

{#if auth.loggedIn}
  <select
    value={followFilter}
    onchange={(e) => onFilterChange(e.currentTarget.value as FollowFilter)}
    class="rounded-md border border-border-subtle bg-surface-1 px-2 py-1 text-xs text-text-muted focus:border-accent focus:outline-none"
  >
    {#each filterOptions as opt (opt.value)}
      <option value={opt.value}>{t(opt.labelKey)}</option>
    {/each}
  </select>
{/if}
