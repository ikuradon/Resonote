<script lang="ts">
  import '../app.css';

  import type { Snippet } from 'svelte';

  import { afterNavigate } from '$app/navigation';
  import { createAppShellViewModel } from '$appcore/ui/app-shell-view-model.svelte.js';
  import EnvBanner from '$lib/components/EnvBanner.svelte';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import MobileOverlay from '$lib/components/MobileOverlay.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import RelayStatus from '$lib/components/RelayStatus.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { LOCALES, t } from '$shared/i18n/t.js';

  let { children }: { children: Snippet } = $props();
  const vm = createAppShellViewModel();
  let langPickerOpen = $state(false);

  // Close mobile menu after SPA navigation completes (not on click)
  afterNavigate(() => {
    vm.closeMenu();
  });
</script>

<div class="noise min-h-screen bg-surface-0 font-body text-text-primary">
  <!-- Ambient glow -->
  <div
    class="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full opacity-[0.04] blur-[120px]"
    style="background: radial-gradient(circle, var(--color-accent) 0%, transparent 70%)"
  ></div>

  {#if vm.extensionMode}
    <header class="glass sticky top-0 z-40 border-b border-border-subtle">
      <div class="mx-auto flex max-w-3xl items-center justify-end gap-2 px-5 py-3">
        <LanguageSwitcher />
        {#if vm.auth.loggedIn}
          <button
            onclick={vm.logout}
            class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-secondary"
            aria-label={t('logout.button')}
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline
                points="16 17 21 12 16 7"
              /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        {:else}
          <button
            onclick={vm.login}
            class="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            {t('login.button')}
          </button>
        {/if}
      </div>
    </header>
  {:else}
    <header class="glass sticky top-0 z-40 border-b border-border-subtle">
      {#if vm.envBanner}
        <EnvBanner label={vm.envBanner.label} colorClass={vm.envBanner.colorClass} />
      {/if}
      <div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <a
          href="/"
          class="flex items-center gap-2 font-display text-xl font-semibold tracking-wide transition-colors hover:opacity-80"
        >
          <img src="/icon-192.png" class="h-6 w-6" alt="" aria-hidden="true" />
          <span>Reso<span class="text-accent">note</span></span>
        </a>

        <!-- Desktop nav -->
        <nav aria-label={t('nav.main')} class="hidden items-center gap-2 lg:flex">
          <LanguageSwitcher />
          {#if vm.auth.loggedIn}
            <RelayStatus />
            <a
              href="/bookmarks"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
              aria-label={t('nav.bookmarks')}
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </a>
            <a
              href="/settings"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
              aria-label={t('nav.settings')}
            >
              <svg
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
            {#if vm.auth.pubkey}
              <a
                href={vm.profileHref}
                class="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden transition-opacity hover:opacity-80"
                aria-label="Profile"
              >
                <UserAvatar
                  pubkey={vm.auth.pubkey}
                  picture={vm.profileDisplay?.picture}
                  size="sm"
                />
              </a>
            {/if}
            <button
              onclick={vm.logout}
              class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
              aria-label={t('logout.button')}
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          {:else}
            <button
              onclick={vm.login}
              data-testid="login-button"
              class="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <svg
                class="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              {t('login.button')}
            </button>
          {/if}
        </nav>

        <!-- Mobile nav -->
        <div class="flex items-center gap-1 lg:hidden">
          {#if vm.auth.loggedIn}
            <NotificationBell />
            {#if vm.auth.pubkey}
              <a
                href={vm.profileHref}
                class="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden"
                aria-label="Profile"
              >
                <UserAvatar
                  pubkey={vm.auth.pubkey}
                  picture={vm.profileDisplay?.picture}
                  size="xs"
                />
              </a>
            {/if}
            <button
              onclick={vm.logout}
              class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-secondary"
              aria-label={t('logout.button')}
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          {:else}
            <button
              onclick={vm.login}
              data-testid="login-button-mobile"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-accent transition-colors hover:bg-accent/10"
              aria-label={t('login.button')}
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </button>
          {/if}
          <button
            type="button"
            onclick={vm.openMenu}
            class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
            aria-label={t('nav.menu')}
            aria-expanded={vm.menuOpen}
            data-testid="hamburger-menu-button"
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </header>

    <MobileOverlay open={vm.menuOpen} onclose={vm.closeMenu} title={t('nav.menu')}>
      <nav class="flex flex-col gap-1">
        <!-- Language: compact button that opens picker -->
        <button
          type="button"
          onclick={() => (langPickerOpen = !langPickerOpen)}
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-text-secondary transition-colors hover:bg-surface-1"
        >
          <span class="text-lg">🌐</span>
          <span>{t('nav.language')}: {vm.localeCode.toUpperCase()}</span>
        </button>
        {#if langPickerOpen}
          <div class="ml-8 flex flex-wrap gap-2 pb-2">
            {#each LOCALES as locale (locale.code)}
              <button
                type="button"
                onclick={() => {
                  vm.selectLocale(locale.code);
                  langPickerOpen = false;
                }}
                class="rounded-lg px-3 py-1.5 text-sm transition-colors {locale.code ===
                vm.localeCode
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-surface-1'}"
              >
                <span>{locale.flag}</span>
                <span>{locale.label}</span>
              </button>
            {/each}
          </div>
        {/if}

        <hr class="border-border-subtle" />

        {#if vm.auth.loggedIn}
          <div class="flex items-center gap-3 rounded-lg px-2 py-3 text-text-secondary">
            <span class="text-lg">📡</span>
            <span>{t('nav.relays')} ({vm.relayConnectedCount}/{vm.relayList.length})</span>
          </div>

          <a
            href="/bookmarks"
            class="flex items-center gap-3 rounded-lg px-2 py-3 text-text-secondary transition-colors hover:bg-surface-1"
          >
            <span class="text-lg">🔖</span>
            <span>{t('nav.bookmarks')}</span>
          </a>

          <a
            href="/settings"
            class="flex items-center gap-3 rounded-lg px-2 py-3 text-text-secondary transition-colors hover:bg-surface-1"
          >
            <span class="text-lg">⚙️</span>
            <span>{t('nav.settings')}</span>
          </a>
        {/if}
      </nav>
    </MobileOverlay>
  {/if}

  {#if vm.showRelayWarning}
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
          aria-hidden="true"
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

  <ToastContainer />
</div>
