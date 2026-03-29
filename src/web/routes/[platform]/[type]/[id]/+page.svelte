<script lang="ts">
  import { page } from '$app/state';
  import {
    deleteContentReaction,
    sendContentReaction
  } from '$features/comments/application/comment-actions.js';
  import { createPlayerColumnViewModel } from '$features/content-resolution/ui/player-column-view-model.svelte.js';
  import { createResolvedContentViewModel } from '$features/content-resolution/ui/resolved-content-view-model.svelte.js';
  import CommentInfoTab from '$lib/components/CommentInfoTab.svelte';
  import CommentList from '$lib/components/CommentList.svelte';
  import { getAuth } from '$shared/browser/auth.js';
  import { getPlayer, requestSeek } from '$shared/browser/player.js';
  import { getProvider } from '$shared/content/registry.js';
  import type { ContentId } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';
  import { createLogger } from '$shared/utils/logger.js';

  import PlayerColumn from './PlayerColumn.svelte';

  // --- Route params ---
  let platform = $derived(page.params.platform ?? '');
  let contentType = $derived(page.params.type ?? '');
  let contentIdParam = $derived(page.params.id ?? '');
  let provider = $derived(getProvider(platform));
  let contentId = $derived<ContentId>({ platform, type: contentType, id: contentIdParam });
  let isValid = $derived(provider !== undefined && contentType !== '' && contentIdParam !== '');
  let isCollection = $derived(contentType === 'show');
  let isFeed = $derived(platform === 'podcast' && contentType === 'feed');
  let isYouTubeFeed = $derived(
    platform === 'youtube' && (contentType === 'playlist' || contentType === 'channel')
  );
  let initialTimeSec = $derived(Number(page.url.searchParams.get('t')) || 0);
  let highlightCommentId = $derived(
    page.url.hash.startsWith('#comment-') ? page.url.hash.slice('#comment-'.length) : undefined
  );

  // --- View model (single facade for all content page logic) ---
  const vm = createResolvedContentViewModel(
    () => contentId,
    () => provider,
    () => isValid,
    () => isCollection,
    () => contentType,
    () => contentIdParam,
    () => platform,
    () => initialTimeSec
  );

  // --- Auth + logger ---
  const auth = getAuth();
  const log = createLogger('content-page');

  // --- UI-only state ---
  const isDev = import.meta.env.DEV;
  const player = isDev ? getPlayer() : undefined;
  let devSeekSec = $state(0);
  let threadPubkeys = $derived(
    vm.store ? [...new Set(vm.store.comments.map((c) => c.pubkey))] : []
  );
  // --- Feed metadata (for podcast feed info display) ---
  let feedMetadata = $state<{
    title: string;
    imageUrl: string;
    description: string;
  } | null>(null);

  function handleFeedLoaded(info: { title: string; imageUrl: string; description: string }) {
    feedMetadata = info;
  }

  // --- Content reaction state + handler ---
  let contentReactionBusy = $state(false);

  async function handleContentReactionClick() {
    if (contentReactionBusy || !auth.loggedIn || !provider) return;
    contentReactionBusy = true;
    try {
      const myReaction = vm.store?.contentReactions.find((cr) => cr.pubkey === auth.pubkey);
      if (myReaction) {
        await deleteContentReaction({
          reactionId: myReaction.id,
          contentId,
          provider
        });
      } else {
        await sendContentReaction({ contentId, provider });
      }
    } catch (err) {
      log.error('Content reaction failed', err);
    } finally {
      contentReactionBusy = false;
    }
  }

  const collectionVm = createPlayerColumnViewModel({
    getContentId: () => contentId,
    getProvider: () => provider!
  });
</script>

<svelte:head>
  {#if isValid && provider}
    <title>{provider.displayName} - Resonote</title>
  {:else}
    <title>Resonote</title>
  {/if}
</svelte:head>

{#if isValid && provider}
  {#if isCollection}
    <div class="mx-auto max-w-3xl space-y-8">
      {#if collectionVm.surfaceKind === 'embed' && collectionVm.embedLoader}
        {#await collectionVm.embedLoader()}
          <div class="flex h-40 items-center justify-center rounded-2xl bg-surface-1">
            <div class="h-5 w-32 animate-pulse rounded bg-surface-2"></div>
          </div>
        {:then { default: EmbedComponent }}
          <EmbedComponent {contentId} openUrl={collectionVm.openUrl} />
        {/await}
      {/if}

      {#if collectionVm.surfaceKind === 'install-extension'}
        <div
          class="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface-1 p-8 text-center"
        >
          <p class="font-display text-lg text-text-primary">{t('content.requires_extension')}</p>
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

      {#if collectionVm.surfaceKind === 'open-extension'}
        <button
          onclick={collectionVm.requestOpen}
          class="flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-surface-1 p-8 text-center transition-colors hover:bg-surface-2"
        >
          <span class="text-2xl">&#9654;</span>
          <span class="font-display text-lg text-text-primary">{t('content.open_and_comment')}</span
          >
        </button>
      {/if}

      <div class="animate-slide-up stagger-2 space-y-3 text-center">
        <a
          href={collectionVm.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="show-episodes-link"
          class="inline-block rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent-hover"
        >
          {t('show.episodes', { name: provider.displayName })}
        </a>
        <p data-testid="show-paste-hint" class="text-sm text-text-muted">
          {t('show.paste_episode')}
        </p>
      </div>
    </div>
  {:else}
    <div class="flex flex-col md:flex-row md:gap-6 lg:gap-8">
      <div class="md:w-1/2 lg:w-[55%] xl:w-[58%] md:flex-shrink-0">
        <PlayerColumn
          {contentId}
          {provider}
          resolvedEnclosureUrl={vm.resolvedEnclosureUrl}
          episodeTitle={vm.episodeTitle}
          episodeFeedTitle={vm.episodeFeedTitle}
          episodeImage={vm.episodeImage}
          onFeedLoaded={handleFeedLoaded}
        />
      </div>

      <div class="mt-6 min-w-0 flex-1 md:mt-0">
        {#if isFeed}
          <section class="animate-slide-up stagger-2 space-y-5">
            <CommentInfoTab
              metadata={feedMetadata
                ? {
                    title: feedMetadata.title,
                    subtitle: null,
                    thumbnailUrl: feedMetadata.imageUrl || null,
                    description: feedMetadata.description || null
                  }
                : null}
              metadataLoading={!feedMetadata}
              openUrl={provider.openUrl(contentId)}
            />
            <p data-testid="feed-comment-hint" class="py-4 text-center text-sm text-text-muted">
              {t('comment.feed.select_episode')}
            </p>
          </section>
        {:else if isYouTubeFeed}
          <section class="animate-slide-up stagger-2 space-y-5">
            <div class="flex items-center gap-3">
              <h2 class="font-display text-lg font-semibold text-text-primary">
                {t('comment.heading')}
              </h2>
              <div class="h-px flex-1 bg-border-subtle"></div>
            </div>
            <p data-testid="feed-comment-hint" class="py-8 text-center text-sm text-text-muted">
              {t('youtube.feed.select_video')}
            </p>
          </section>
        {:else}
          <section class="animate-slide-up stagger-2 space-y-5">
            <div class="flex items-center gap-3">
              <h2 class="font-display text-lg font-semibold text-text-primary">
                {t('comment.heading')}
              </h2>
              <div class="h-px flex-1 bg-border-subtle"></div>
            </div>
            {#if isDev && player}
              <div
                class="rounded-lg border border-dashed border-yellow-600/40 bg-yellow-950/20 px-3 py-2"
              >
                <div class="flex items-center gap-3">
                  <span class="text-xs font-semibold text-yellow-500">DEV</span>
                  <span class="font-mono text-xs text-text-muted">
                    {Math.floor(player.position / 60000)}:{String(
                      Math.floor((player.position / 1000) % 60)
                    ).padStart(2, '0')}
                    /
                    {Math.floor(player.duration / 60000)}:{String(
                      Math.floor((player.duration / 1000) % 60)
                    ).padStart(2, '0')}
                  </span>
                  <span
                    class="rounded px-1 py-0.5 text-xs {player.isPaused
                      ? 'bg-zinc-700 text-zinc-400'
                      : 'bg-green-900 text-green-400'}"
                  >
                    {player.isPaused ? 'PAUSED' : 'PLAYING'}
                  </span>
                  <div class="ml-auto flex items-center gap-1.5">
                    <input
                      type="number"
                      bind:value={devSeekSec}
                      min="0"
                      placeholder="sec"
                      class="w-16 rounded border border-yellow-600/30 bg-transparent px-1.5 py-0.5 text-xs text-text-primary"
                    />
                    <button
                      onclick={() => requestSeek(devSeekSec * 1000)}
                      class="rounded bg-yellow-600 px-2 py-0.5 text-xs font-semibold text-black hover:bg-yellow-500"
                    >
                      Seek
                    </button>
                  </div>
                </div>
              </div>
            {/if}
            {#if vm.store}
              <CommentList
                comments={vm.store.comments}
                reactionIndex={vm.store.reactionIndex}
                loading={vm.store.loading}
                {contentId}
                {provider}
                {threadPubkeys}
                getPlaceholders={() => vm.store!.placeholders}
                fetchOrphanParent={vm.store.fetchOrphanParent}
                bookmarked={vm.bookmarked}
                bookmarkBusy={vm.bookmarkBusy}
                onToggleBookmark={vm.toggleBookmark}
                openUrl={provider.openUrl(contentId)}
                {highlightCommentId}
                contentMetadata={vm.contentMetadata}
                contentMetadataLoading={vm.contentMetadataLoading}
                contentReactions={vm.store.contentReactions}
                onContentReactionClick={handleContentReactionClick}
                {contentReactionBusy}
              />
            {/if}
          </section>
        {/if}
      </div>
    </div>
  {/if}
{:else}
  <div class="flex flex-col items-center gap-6 pt-20">
    <p class="font-display text-lg text-text-secondary">{t('content.unsupported')}</p>
    <a href="/" class="text-sm text-accent transition-colors hover:text-accent-hover"
      >{t('content.back_home')}</a
    >
  </div>
{/if}
