<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import LoginButton from '$lib/components/LoginButton.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import RelayStatus from '$lib/components/RelayStatus.svelte';
  import { getAuth, initAuth } from '$lib/stores/auth.svelte.js';
  import { getFollows } from '$lib/stores/follows.svelte.js';
  import {
    subscribeNotifications,
    destroyNotifications
  } from '$lib/stores/notifications.svelte.js';
  import { preloadEmojiMart } from '$lib/stores/emoji-mart-preload.svelte.js';
  import { initExtensionListener, isExtensionMode } from '$lib/stores/extension.svelte.js';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import { getLocale } from '$lib/stores/locale.svelte.js';
  import '../app.css';

  let { children }: { children: Snippet } = $props();

  const auth = getAuth();

  $effect(() => {
    document.documentElement.lang = getLocale();
  });

  // Subscribe/unsubscribe notifications on auth changes
  $effect(() => {
    if (auth.loggedIn && auth.pubkey) {
      const pubkey = auth.pubkey;
      const follows = getFollows().follows;
      subscribeNotifications(pubkey, follows);
    } else if (auth.initialized && !auth.loggedIn) {
      destroyNotifications();
    }
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
        <LanguageSwitcher />
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
          <LanguageSwitcher />
          {#if auth.loggedIn}
            <a
              href="/settings"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
              aria-label="Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3"></circle>
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                ></path>
              </svg>
            </a>
            <NotificationBell />
          {/if}
          <LoginButton />
        </div>
      </div>
    </header>
  {/if}

  <main class="relative mx-auto max-w-7xl px-5 py-6 lg:py-8">
    {@render children()}
  </main>
</div>
