<script lang="ts">
  import { getAuth, loginNostr, logoutNostr } from '../stores/auth.svelte.js';
  import { getProfile, getDisplayName, fetchProfile } from '../stores/profile.svelte.js';

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
    {#if profile?.picture}
      <img
        src={profile.picture}
        alt=""
        class="h-7 w-7 rounded-full object-cover ring-1 ring-border"
      />
    {/if}
    <span class="max-w-[120px] truncate text-sm text-text-secondary">{displayText}</span>
    <button
      onclick={logoutNostr}
      class="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
    >
      Logout
    </button>
  </div>
{:else}
  <button
    onclick={loginNostr}
    class="rounded-lg bg-nostr px-4 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:bg-nostr-hover hover:shadow-[0_0_16px_rgba(155,125,219,0.25)]"
  >
    Login with Nostr
  </button>
{/if}
