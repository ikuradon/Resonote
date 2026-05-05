<script lang="ts">
  import { createPlayerColumnViewModel } from '$features/content-resolution/ui/player-column-view-model.svelte.js';
  import PodcastEpisodeList from '$features/content-resolution/ui/PodcastEpisodeList.svelte';
  import YouTubeFeedList from '$features/content-resolution/ui/YouTubeFeedList.svelte';
  import AudioEmbed from '$lib/components/AudioEmbed.svelte';
  import type { ContentId, ContentProvider } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';

  interface Props {
    contentId: ContentId;
    provider: ContentProvider;
    resolvedEnclosureUrl?: string;
    episodeTitle?: string;
    episodeFeedTitle?: string;
    episodeImage?: string;
    onFeedLoaded?: (info: { title: string; imageUrl: string; description: string }) => void;
    feedWarningText?: string | null;
  }

  let {
    contentId,
    provider,
    resolvedEnclosureUrl,
    episodeTitle,
    episodeFeedTitle,
    episodeImage,
    onFeedLoaded,
    feedWarningText
  }: Props = $props();
  const vm = createPlayerColumnViewModel({
    getContentId: () => contentId,
    getProvider: () => provider
  });
</script>

{#snippet embedLoading()}
  <div class="flex h-40 items-center justify-center rounded-2xl bg-surface-1">
    <div class="h-5 w-32 animate-pulse rounded bg-surface-2"></div>
  </div>
{/snippet}

<div
  class="md:sticky md:top-[var(--header-height)] md:max-h-[calc(100vh-var(--header-height)-2rem)] md:overflow-y-auto md:scrollbar-hide"
>
  {#if vm.surfaceKind === 'podcast-feed'}
    <PodcastEpisodeList {contentId} {onFeedLoaded} warningText={feedWarningText} />
  {:else if vm.surfaceKind === 'youtube-feed'}
    <YouTubeFeedList {contentId} />
  {:else if vm.surfaceKind === 'audio'}
    <AudioEmbed
      {contentId}
      enclosureUrl={resolvedEnclosureUrl}
      title={episodeTitle}
      feedTitle={episodeFeedTitle}
      image={episodeImage}
      openUrl={vm.openUrl}
    />
  {:else if vm.surfaceKind === 'embed' && vm.embedLoader}
    {#await vm.embedLoader()}
      {@render embedLoading()}
    {:then { default: EmbedComponent }}
      <EmbedComponent {contentId} openUrl={vm.openUrl} />
    {/await}
  {/if}

  {#if vm.surfaceKind === 'install-extension'}
    <div
      class="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface-1 p-8 text-center"
    >
      <p class="font-display text-lg text-text-primary">
        {t('content.requires_extension')}
      </p>
      <div class="flex gap-3">
        <button
          type="button"
          class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
        >
          {t('content.install_chrome')}
        </button>
        <button
          type="button"
          class="rounded-xl border border-accent px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
        >
          {t('content.install_firefox')}
        </button>
      </div>
    </div>
  {/if}

  {#if vm.surfaceKind === 'open-extension'}
    <button
      onclick={vm.requestOpen}
      class="flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-surface-1 p-8 text-center transition-colors hover:bg-surface-2"
    >
      <span class="text-2xl">&#9654;</span>
      <span class="font-display text-lg text-text-primary">{t('content.open_and_comment')}</span>
    </button>
  {/if}
</div>
