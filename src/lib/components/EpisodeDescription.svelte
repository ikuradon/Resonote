<script lang="ts">
  import { t } from '$lib/i18n/t.js';

  interface Props {
    description: string;
  }

  let { description }: Props = $props();

  let expanded = $state(false);

  let plainText = $derived(
    (new DOMParser().parseFromString(description, 'text/html').body.textContent ?? '').trim()
  );

  let isLong = $derived(plainText.length > 200);
</script>

{#if plainText}
  <div
    class="rounded-xl border border-border-subtle bg-surface-1 px-4 py-3"
    data-testid="episode-description"
  >
    <button
      type="button"
      onclick={() => (expanded = !expanded)}
      class="flex w-full items-center justify-between text-left"
    >
      <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {t('episode.description')}
      </span>
      {#if isLong}
        <svg
          class="h-4 w-4 text-text-muted transition-transform {expanded ? 'rotate-180' : ''}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      {/if}
    </button>
    <div
      class="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary {!expanded &&
      isLong
        ? 'line-clamp-3'
        : ''}"
    >
      {plainText}
    </div>
    {#if isLong && !expanded}
      <button
        type="button"
        onclick={() => (expanded = true)}
        class="mt-1 text-xs text-accent hover:text-accent-hover"
      >
        {t('episode.show_more')}
      </button>
    {/if}
  </div>
{/if}
