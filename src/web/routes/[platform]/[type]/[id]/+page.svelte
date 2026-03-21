<script lang="ts">
  import { page } from '$app/state';
  import CommentList from '$lib/components/CommentList.svelte';
  import CommentForm from '$lib/components/CommentForm.svelte';
  import ShareButton from '$lib/components/ShareButton.svelte';
  import { getProvider } from '$shared/content/registry.js';
  import { getAuth } from '$shared/browser/auth.js';
  import { getPlayer, requestSeek } from '$shared/browser/player.js';
  import type { ContentId } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';
  import PlayerColumn from './PlayerColumn.svelte';
  import { createResolvedContentViewModel } from '$features/content-resolution/ui/resolved-content-view-model.svelte.js';
  import { createPlayerColumnViewModel } from '$features/content-resolution/ui/player-column-view-model.svelte.js';

  // --- Route params ---
  let platform = $derived(page.params.platform ?? '');
  let contentType = $derived(page.params.type ?? '');
  let contentIdParam = $derived(page.params.id ?? '');
  let provider = $derived(getProvider(platform));
  let contentId = $derived<ContentId>({ platform, type: contentType, id: contentIdParam });
  let isValid = $derived(provider !== undefined && contentType !== '' && contentIdParam !== '');
  let isCollection = $derived(contentType === 'show');
  let initialTimeSec = $derived(Number(page.url.searchParams.get('t')) || 0);

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

  // --- UI-only state ---
  const auth = getAuth();
  const isDev = import.meta.env.DEV;
  const player = isDev ? getPlayer() : undefined;
  let devSeekSec = $state(0);
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
          episodeDescription={vm.episodeDescription}
        />
      </div>

      <div class="mt-6 min-w-0 flex-1 md:mt-0">
        <section class="animate-slide-up stagger-2 space-y-5">
          <div class="flex items-center gap-3">
            <h2 class="font-display text-lg font-semibold text-text-primary">
              {t('comment.heading')}
            </h2>
            <div class="h-px flex-1 bg-border-subtle"></div>
            <ShareButton {contentId} {provider} />
            {#if auth.loggedIn}
              <button
                type="button"
                onclick={vm.toggleBookmark}
                disabled={vm.bookmarkBusy}
                class="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-50
                  {vm.bookmarked
                  ? 'bg-accent/10 text-accent hover:bg-accent/20'
                  : 'bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary'}"
                title={vm.bookmarked ? t('bookmark.remove') : t('bookmark.add')}
              >
                {vm.bookmarked ? '\u2605' : '\u2606'}
                {vm.bookmarked ? t('bookmark.remove') : t('bookmark.add')}
              </button>
            {/if}
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
          <CommentForm {contentId} {provider} />
          {#if vm.store}
            <CommentList
              comments={vm.store.comments}
              reactionIndex={vm.store.reactionIndex}
              loading={vm.store.loading}
              {contentId}
              {provider}
              getPlaceholders={() => vm.store!.placeholders}
              fetchOrphanParent={vm.store.fetchOrphanParent}
            />
          {/if}
        </section>
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
