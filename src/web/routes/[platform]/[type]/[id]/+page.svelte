<script lang="ts">
  import { page } from '$app/state';
  import SpotifyEmbed from '$lib/components/SpotifyEmbed.svelte';
  import YouTubeEmbed from '$lib/components/YouTubeEmbed.svelte';
  import SoundCloudEmbed from '$lib/components/SoundCloudEmbed.svelte';
  import VimeoEmbed from '$lib/components/VimeoEmbed.svelte';
  import MixcloudEmbed from '$lib/components/MixcloudEmbed.svelte';
  import SpreakerEmbed from '$lib/components/SpreakerEmbed.svelte';
  import AudioEmbed from '$lib/components/AudioEmbed.svelte';
  import PodcastEpisodeList from '$lib/components/PodcastEpisodeList.svelte';
  import CommentList from '$lib/components/CommentList.svelte';
  import CommentForm from '$lib/components/CommentForm.svelte';
  import ShareButton from '$lib/components/ShareButton.svelte';
  import { getProvider } from '$lib/content/registry.js';
  import { createCommentsStore } from '$lib/stores/comments.svelte.js';
  import {
    isExtensionMode,
    detectExtension,
    requestOpenContent
  } from '$lib/stores/extension.svelte.js';
  import { getAuth } from '$lib/stores/auth.svelte.js';
  import { isBookmarked, addBookmark, removeBookmark } from '$lib/stores/bookmarks.svelte.js';
  import { requestSeek } from '$lib/stores/player.svelte.js';
  import type { ContentId } from '$lib/content/types.js';
  import { t } from '$lib/i18n/t.js';
  import { resolveEpisodeEnclosure } from '$lib/content/episode-resolver.js';
  import { fromBase64url } from '$lib/content/url-utils.js';
  import { resolveByApi } from '$lib/content/podcast-resolver.js';
  import { publishSignedEvent } from '$lib/nostr/publish-signed.js';

  let platform = $derived(page.params.platform ?? '');
  let contentType = $derived(page.params.type ?? '');
  let contentIdParam = $derived(page.params.id ?? '');

  let provider = $derived(getProvider(platform));
  let contentId = $derived<ContentId>({ platform, type: contentType, id: contentIdParam });
  let isValid = $derived(provider !== undefined && contentType !== '' && contentIdParam !== '');

  let isCollection = $derived(contentType === 'show');
  let requiresExt = $derived(provider?.requiresExtension ?? false);
  let extAvailable = $derived(detectExtension());
  let showPlayer = $derived(!isExtensionMode() && !requiresExt);
  let showInstallPrompt = $derived(!isExtensionMode() && requiresExt && !extAvailable);
  let showPlayButton = $derived(!isExtensionMode() && requiresExt && extAvailable);
  const auth = getAuth();
  let bookmarked = $derived(isBookmarked(contentId));
  let bookmarkBusy = $state(false);

  async function toggleBookmark() {
    if (!provider || bookmarkBusy) return;
    bookmarkBusy = true;
    try {
      if (bookmarked) {
        await removeBookmark(contentId);
      } else {
        await addBookmark(contentId, provider);
      }
    } finally {
      bookmarkBusy = false;
    }
  }

  // Read initial time from URL ?t= parameter
  let initialTimeSec = $derived(Number(page.url.searchParams.get('t')) || 0);
  let seekDispatched = $state(false);

  $effect(() => {
    if (initialTimeSec > 0 && !seekDispatched) {
      // Delay to let embed initialize
      const timer = setTimeout(() => {
        requestSeek(initialTimeSec * 1000);
        seekDispatched = true;
      }, 1500);
      return () => clearTimeout(timer);
    }
  });

  let store: ReturnType<typeof createCommentsStore> | undefined = $state();

  $effect(() => {
    if (!isValid || !provider || isCollection || contentType === 'feed') return;

    const s = createCommentsStore(contentId, provider);
    s.subscribe();
    store = s;

    return () => {
      s.destroy();
    };
  });

  let resolvedEnclosureUrl = $state<string | undefined>();

  $effect(() => {
    resolvedEnclosureUrl = undefined;
    if (platform === 'audio') {
      resolvedEnclosureUrl = fromBase64url(contentIdParam);
    } else if (platform === 'podcast' && contentType === 'episode') {
      const parts = contentIdParam.split(':');
      if (parts.length === 2) {
        resolveEpisodeEnclosure(parts[0], parts[1]).then((url) => {
          resolvedEnclosureUrl = url ?? undefined;
        });
      }
    }
  });

  $effect(() => {
    if (platform !== 'audio' || !store) return;
    const audioUrl = fromBase64url(contentIdParam);
    let cancelled = false;

    resolveByApi(audioUrl).then((data) => {
      if (cancelled) return;
      if (data.episode?.guid) {
        store?.addSubscription(`podcast:item:guid:${data.episode.guid}`);
      }
      if (data.signedEvents) {
        for (const ev of data.signedEvents) {
          publishSignedEvent(ev).catch(() => {});
        }
      }
    });

    return () => {
      cancelled = true;
    };
  });
</script>

{#if isValid && provider}
  {#if isCollection}
    <div class="mx-auto max-w-3xl space-y-8">
      {#if showPlayer && platform === 'spotify'}
        <SpotifyEmbed {contentId} />
      {/if}

      {#if showInstallPrompt}
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

      {#if showPlayButton}
        <button
          onclick={() => {
            if (provider) {
              requestOpenContent(contentId, provider.openUrl(contentId));
            }
          }}
          class="flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-surface-1 p-8 text-center transition-colors hover:bg-surface-2"
        >
          <span class="text-2xl">&#9654;</span>
          <span class="font-display text-lg text-text-primary">{t('content.open_and_comment')}</span
          >
        </button>
      {/if}

      <div class="animate-slide-up stagger-2 space-y-3 text-center">
        <a
          href={provider.openUrl(contentId)}
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
    <!-- Two-column layout: Player left, Comments right (desktop) -->
    <div class="flex flex-col lg:flex-row lg:gap-8">
      <!-- Player column — sticky on desktop -->
      <div class="lg:w-[55%] xl:w-[58%] lg:flex-shrink-0">
        <div
          class="lg:sticky lg:top-[var(--header-height)] lg:max-h-[calc(100vh-var(--header-height)-2rem)] lg:overflow-y-auto lg:scrollbar-hide"
        >
          {#if platform === 'podcast' && contentType === 'feed'}
            <PodcastEpisodeList {contentId} />
          {:else if platform === 'audio' || (platform === 'podcast' && contentType === 'episode')}
            <AudioEmbed {contentId} enclosureUrl={resolvedEnclosureUrl} />
          {:else if showPlayer && platform === 'spotify'}
            <SpotifyEmbed {contentId} />
          {:else if showPlayer && platform === 'youtube'}
            <YouTubeEmbed {contentId} />
          {:else if showPlayer && platform === 'soundcloud'}
            <SoundCloudEmbed {contentId} />
          {:else if showPlayer && platform === 'vimeo'}
            <VimeoEmbed {contentId} />
          {:else if showPlayer && platform === 'mixcloud'}
            <MixcloudEmbed {contentId} />
          {:else if showPlayer && platform === 'spreaker'}
            <SpreakerEmbed {contentId} />
          {/if}

          {#if showInstallPrompt}
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

          {#if showPlayButton}
            <button
              onclick={() => {
                if (provider) {
                  requestOpenContent(contentId, provider.openUrl(contentId));
                }
              }}
              class="flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-surface-1 p-8 text-center transition-colors hover:bg-surface-2"
            >
              <span class="text-2xl">&#9654;</span>
              <span class="font-display text-lg text-text-primary"
                >{t('content.open_and_comment')}</span
              >
            </button>
          {/if}
        </div>
      </div>

      <!-- Comments column — scrollable -->
      <div class="mt-6 min-w-0 flex-1 lg:mt-0">
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
                onclick={toggleBookmark}
                disabled={bookmarkBusy}
                class="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-50
                  {bookmarked
                  ? 'bg-accent/10 text-accent hover:bg-accent/20'
                  : 'bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary'}"
                title={bookmarked ? t('bookmark.remove') : t('bookmark.add')}
              >
                {bookmarked ? '\u2605' : '\u2606'}
                {bookmarked ? t('bookmark.remove') : t('bookmark.add')}
              </button>
            {/if}
          </div>
          <CommentForm {contentId} {provider} />
          {#if store}
            <CommentList
              comments={store.comments}
              reactionIndex={store.reactionIndex}
              {contentId}
              {provider}
            />
          {/if}
        </section>
      </div>
    </div>
  {/if}
{:else}
  <div class="flex flex-col items-center gap-6 pt-20">
    <p class="font-display text-lg text-text-secondary">{t('content.unsupported')}</p>
    <a href="/" class="text-sm text-accent transition-colors hover:text-accent-hover">
      {t('content.back_home')}
    </a>
  </div>
{/if}
