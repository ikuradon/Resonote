<script lang="ts">
  import { onMount, untrack } from 'svelte';
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
  import { initExtensionListener, isExtensionMode } from '$lib/stores/extension.svelte.js';
  import { retryPendingPublishes } from '$lib/nostr/publish-signed.js';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import { getRelays, isTransitionalState } from '$lib/stores/relays.svelte.js';
  import { t } from '$lib/i18n/t.js';
  import { getLocale } from '$lib/stores/locale.svelte.js';
  import '../app.css';

  let { children }: { children: Snippet } = $props();

  const auth = getAuth();

  let relayList = $derived(getRelays());
  let relayConnectedCount = $derived(relayList.filter((r) => r.state === 'connected').length);
  let anyRelayConnecting = $derived(relayList.some((r) => isTransitionalState(r.state)));
  let showRelayWarning = $derived(
    relayList.length > 0 && relayConnectedCount === 0 && !anyRelayConnecting
  );

  $effect(() => {
    document.documentElement.lang = getLocale();
  });

  // Subscribe/unsubscribe notifications on auth/follows changes.
  // untrack prevents $effect from tracking reactive reads inside
  // subscribeNotifications (e.g., allItems.length), which would cause
  // infinite re-subscription on every received event.
  $effect(() => {
    if (auth.loggedIn && auth.pubkey) {
      const pubkey = auth.pubkey;
      const follows = getFollows().follows;
      untrack(() => subscribeNotifications(pubkey, follows));
    } else if (auth.initialized && !auth.loggedIn) {
      untrack(() => destroyNotifications());
    }
  });

  onMount(() => {
    initAuth();
    initExtensionListener();
    retryPendingPublishes().catch(() => {});
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
          <LanguageSwitcher />
          {#if auth.loggedIn}
            <RelayStatus />
            <a
              href="/bookmarks"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
              aria-label="Bookmarks"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </a>
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

  {#if showRelayWarning}
    <div class="mx-auto flex max-w-7xl items-center gap-3 px-5 py-2">
      <div
        class="flex flex-1 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200"
      >
        <svg
          class="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div>
          <span class="font-medium">{t('relay.disconnected.title')}</span>
          <span class="ml-1 text-amber-200/70">{t('relay.disconnected.message')}</span>
        </div>
      </div>
    </div>
  {/if}

  <main class="relative mx-auto max-w-7xl px-5 py-6 lg:py-8">
    {@render children()}
  </main>
</div>
