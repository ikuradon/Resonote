<script lang="ts">
  import { page } from '$app/state';
  import SpotifyEmbed from '$lib/components/SpotifyEmbed.svelte';
  import CommentList from '$lib/components/CommentList.svelte';
  import CommentForm from '$lib/components/CommentForm.svelte';
  import { getProvider } from '$lib/content/registry.js';
  import { createCommentsStore } from '$lib/stores/comments.svelte.js';
  import {
    isExtensionMode,
    detectExtension,
    requestOpenContent
  } from '$lib/stores/extension.svelte.js';
  import type { ContentId } from '$lib/content/types.js';

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
  let store: ReturnType<typeof createCommentsStore> | undefined = $state();

  $effect(() => {
    if (!isValid || !provider || isCollection) return;

    const s = createCommentsStore(contentId, provider);
    s.subscribe();
    store = s;

    return () => {
      s.destroy();
    };
  });
</script>

{#if isValid && provider}
  <div class="space-y-8">
    {#if showPlayer && platform === 'spotify'}
      <SpotifyEmbed {contentId} />
    {/if}

    {#if showInstallPrompt}
      <div
        class="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface-1 p-8 text-center"
      >
        <p class="font-display text-lg text-text-primary">
          This content requires the Resonote extension
        </p>
        <div class="flex gap-3">
          <a
            href="#"
            class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
          >
            Install for Chrome
          </a>
          <a
            href="#"
            class="rounded-xl border border-accent px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
          >
            Install for Firefox
          </a>
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
        <span class="font-display text-lg text-text-primary">Open and comment on this content</span>
      </button>
    {/if}

    {#if isCollection}
      <div class="animate-slide-up stagger-2 space-y-3 text-center">
        <a
          href={provider.openUrl(contentId)}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block rounded-xl bg-spotify px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-spotify-hover hover:shadow-[0_0_20px_rgba(29,185,84,0.2)]"
        >
          View all episodes on Spotify
        </a>
        <p class="text-sm text-text-muted">Paste an episode URL to view comments</p>
      </div>
    {:else}
      <section class="animate-slide-up stagger-2 space-y-5">
        <div class="flex items-center gap-3">
          <h2 class="font-display text-lg font-semibold text-text-primary">Comments</h2>
          <div class="h-px flex-1 bg-border-subtle"></div>
        </div>
        <CommentForm {contentId} {provider} />
        {#if store}
          <CommentList
            comments={store.comments}
            reactions={store.reactions}
            {contentId}
            {provider}
          />
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <div class="flex flex-col items-center gap-6 pt-20">
    <p class="font-display text-lg text-text-secondary">Unsupported content</p>
    <a href="/" class="text-sm text-accent transition-colors hover:text-accent-hover">
      Back to home
    </a>
  </div>
{/if}
