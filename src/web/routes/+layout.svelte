<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import LoginButton from '$lib/components/LoginButton.svelte';
  import RelayStatus from '$lib/components/RelayStatus.svelte';
  import { initAuth } from '$lib/stores/auth.svelte.js';
  import { preloadEmojiMart } from '$lib/stores/emoji-mart-preload.svelte.js';
  import { initExtensionListener, isExtensionMode } from '$lib/stores/extension.svelte.js';
  import { getLocale, setLocale } from '$lib/stores/locale.svelte.js';
  import '../app.css';

  let { children }: { children: Snippet } = $props();

  $effect(() => {
    document.documentElement.lang = getLocale();
  });

  onMount(() => {
    initAuth();
    preloadEmojiMart();
    initExtensionListener();
  });
</script>

<div class="noise min-h-screen bg-surface-0 font-body text-text-primary">
  <!-- Ambient glow -->
  <div
    class="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full opacity-[0.04] blur-[120px]"
    style="background: radial-gradient(circle, var(--color-accent) 0%, transparent 70%)"
  ></div>

  {#if isExtensionMode()}
    <header class="glass sticky top-0 z-40 border-b border-border-subtle">
      <div class="mx-auto flex max-w-3xl items-center justify-end px-5 py-3">
        <button
          onclick={() => setLocale(getLocale() === 'en' ? 'ja' : 'en')}
          class="rounded-lg px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
        >
          {getLocale() === 'en' ? 'JA' : 'EN'}
        </button>
        <LoginButton />
      </div>
    </header>
  {:else}
    <header class="glass sticky top-0 z-40 border-b border-border-subtle">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <a
          href="/"
          class="flex items-center gap-2 font-display text-xl font-semibold tracking-wide text-accent transition-colors hover:text-accent-hover"
        >
          <svg
            class="h-6 w-6"
            viewBox="0 0 64 64"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <mask id="logo-cutout">
                <rect width="64" height="64" fill="white" />
                <ellipse
                  cx="27"
                  cy="31"
                  rx="8.5"
                  ry="6"
                  transform="rotate(-20 27 31)"
                  fill="black"
                />
                <rect x="34" y="11" width="3.5" height="21" rx="1.75" fill="black" />
                <path
                  d="M35.75 11.5C39 11 47.5 13.5 47.5 22"
                  stroke="black"
                  stroke-width="3.5"
                  fill="none"
                  stroke-linecap="round"
                />
              </mask>
            </defs>
            <path
              d="M14 4h36c5.5 0 10 4.5 10 10v20c0 5.5-4.5 10-10 10H22L8 56l6-12c-5.5 0-10-4.5-10-10V14C4 8.5 8.5 4 14 4z"
              fill="currentColor"
              mask="url(#logo-cutout)"
            />
          </svg>
          Resonote
        </a>
        <div class="flex items-center gap-3">
          <RelayStatus />
          <button
            onclick={() => setLocale(getLocale() === 'en' ? 'ja' : 'en')}
            class="rounded-lg px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
          >
            {getLocale() === 'en' ? 'JA' : 'EN'}
          </button>
          <LoginButton />
        </div>
      </div>
    </header>
  {/if}

  <main class="relative mx-auto max-w-7xl px-5 py-6 lg:py-8">
    {@render children()}
  </main>
</div>
