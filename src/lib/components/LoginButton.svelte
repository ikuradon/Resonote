<script lang="ts">
  import { createLoginButtonViewModel } from '$features/auth/ui/login-button-view-model.svelte.js';
  import { t } from '$shared/i18n/t.js';
  import UserAvatar from './UserAvatar.svelte';

  const vm = createLoginButtonViewModel();
</script>

{#if vm.auth.loggedIn && vm.auth.pubkey}
  <div class="flex items-center gap-3">
    <a href={vm.profileHref} class="flex items-center gap-2 transition-opacity hover:opacity-80">
      <UserAvatar pubkey={vm.auth.pubkey} picture={vm.profileDisplay?.picture} size="md" />
      <span class="max-w-[120px] truncate text-sm text-text-secondary">{vm.displayText}</span>
    </a>
    <button
      onclick={vm.logout}
      class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
    >
      <svg
        aria-hidden="true"
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {t('logout.button')}
    </button>
  </div>
{:else}
  <button
    onclick={vm.login}
    data-testid="login-button"
    class="rounded-lg bg-nostr px-4 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:bg-nostr-hover hover:shadow-[0_0_16px_rgba(155,125,219,0.25)]"
  >
    {t('login.button')}
  </button>
{/if}
