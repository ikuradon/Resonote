<script lang="ts">
  import { getAuth, loginNostr, logoutNostr } from '../stores/auth.svelte.js';
  import { getProfile, getDisplayName, fetchProfile } from '../stores/profile.svelte.js';
  import { npubEncode } from 'nostr-tools/nip19';
  import { t } from '../i18n/t.js';

  const auth = getAuth();

  let profile = $derived(auth.pubkey ? getProfile(auth.pubkey) : undefined);
  let displayText = $derived(auth.pubkey ? getDisplayName(auth.pubkey) : '');

  $effect(() => {
    if (auth.pubkey) {
      fetchProfile(auth.pubkey);
    }
  });
</script>

{#if auth.loggedIn && auth.pubkey}
  <div class="flex items-center gap-3">
    <a
      href="/profile/{npubEncode(auth.pubkey)}"
      class="flex items-center gap-2 transition-opacity hover:opacity-80"
    >
      {#if profile?.picture}
        <img
          src={profile.picture}
          alt=""
          class="h-7 w-7 rounded-full object-cover ring-1 ring-border"
        />
      {/if}
      <span class="max-w-[120px] truncate text-sm text-text-secondary">{displayText}</span>
    </a>
    <button
      onclick={logoutNostr}
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
    onclick={loginNostr}
    data-testid="login-button"
    class="rounded-lg bg-nostr px-4 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:bg-nostr-hover hover:shadow-[0_0_16px_rgba(155,125,219,0.25)]"
  >
    {t('login.button')}
  </button>
{/if}
