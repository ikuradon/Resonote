<script lang="ts">
  import { createQuoteViewModel } from '$features/comments/ui/quote-view-model.svelte.js';
  import { t } from '$shared/i18n/t.js';
  import { formatTimestamp } from '$shared/utils/format.js';

  interface Props {
    eventId: string;
    href: string;
  }

  let { eventId, href }: Props = $props();

  const vm = createQuoteViewModel(eventId);

  const MAX_PREVIEW_LENGTH = 120;
  let preview = $derived.by(() => {
    if (!vm.data) return '';
    const chars = [...vm.data.content];
    if (chars.length <= MAX_PREVIEW_LENGTH) return vm.data.content;
    return `${chars.slice(0, MAX_PREVIEW_LENGTH).join('')}…`;
  });
</script>

<a
  {href}
  class="my-1 block whitespace-normal rounded-lg border border-border bg-surface-1 p-3 text-left transition-colors hover:bg-surface-2"
>
  {#if vm.status === 'loading'}
    <div class="flex items-center gap-2 text-xs text-text-muted">
      <svg
        aria-hidden="true"
        class="h-3 w-3 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="10" stroke-dasharray="56" stroke-dashoffset="14" />
      </svg>
      {t('quote.loading')}
    </div>
  {:else if vm.status === 'not-found'}
    <div class="text-xs italic text-text-muted">{t('quote.not_found')}</div>
  {:else if vm.data}
    <div class="flex items-center gap-1.5 text-xs text-text-muted">
      <span class="font-medium text-text-secondary">{vm.authorName}</span>
      <span>·</span>
      <span>{formatTimestamp(vm.data.createdAt)}</span>
    </div>
    {#if vm.data.contentWarning !== null}
      <div class="mt-1 text-xs italic text-yellow-600 dark:text-yellow-400">
        {vm.data.contentWarning
          ? t('cw.warning_with_reason', { reason: vm.data.contentWarning })
          : t('cw.warning')}
      </div>
    {:else}
      <div class="mt-1 text-sm leading-relaxed text-text-primary">{preview}</div>
    {/if}
  {/if}
</a>
