<script lang="ts">
  import type { ContentMetadata } from '$features/content-resolution/domain/content-metadata.js';
  import { t } from '$shared/i18n/t.js';

  interface Props {
    metadata: ContentMetadata | null;
    metadataLoading: boolean;
    openUrl?: string;
  }

  const { metadata, metadataLoading, openUrl }: Props = $props();

  let expanded = $state(false);

  let isLong = $derived((metadata?.description?.length ?? 0) > 200);
</script>

<div class="space-y-4 py-6">
  {#if metadataLoading}
    <!-- Skeleton loading -->
    <div class="flex gap-3 animate-pulse">
      <div class="h-20 w-20 shrink-0 rounded-lg bg-surface-2"></div>
      <div class="flex-1 space-y-2">
        <div class="h-4 w-3/4 rounded bg-surface-2"></div>
        <div class="h-3 w-1/2 rounded bg-surface-2"></div>
        <div class="h-3 w-full rounded bg-surface-2"></div>
      </div>
    </div>
  {:else if metadata && (metadata.title || metadata.description)}
    <!-- Metadata card -->
    <div class="flex gap-3 rounded-xl border border-border-subtle bg-surface-1 p-4">
      {#if metadata.thumbnailUrl}
        <img
          src={metadata.thumbnailUrl}
          alt=""
          class="h-20 w-20 shrink-0 rounded-lg object-cover"
        />
      {/if}
      <div class="min-w-0 flex-1">
        {#if metadata.title}
          <h3 class="text-sm font-semibold text-text-primary">{metadata.title}</h3>
        {/if}
        {#if metadata.subtitle}
          <p class="mt-0.5 text-xs text-text-muted">{metadata.subtitle}</p>
        {/if}
        {#if metadata.description}
          <p
            class="mt-2 whitespace-pre-line text-xs leading-relaxed text-text-secondary
              {!expanded && isLong ? 'line-clamp-3' : ''}"
          >
            {metadata.description}
          </p>
          {#if isLong}
            <button
              type="button"
              onclick={() => (expanded = !expanded)}
              class="mt-1 text-xs text-accent hover:text-accent-hover"
            >
              {expanded ? t('info.show_less') : t('info.show_more')}
            </button>
          {/if}
        {/if}
      </div>
    </div>
  {:else}
    <p class="py-4 text-center text-sm text-text-muted">{t('info.error')}</p>
  {/if}

  {#if openUrl}
    <a
      href={openUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-sm text-accent hover:underline"
    >
      {t('content.open_and_comment')} &#8599;
    </a>
  {/if}
</div>
