<script lang="ts">
  import {
    createRelaySettingsViewModel,
    getRelays,
    publishRelayList,
    shortUrl,
    stateColor,
    type ConnectionState
  } from '$shared/browser/relays.js';
  import { getAuth } from '$shared/browser/auth.js';
  import { t } from '$shared/i18n/t.js';

  const auth = getAuth();
  let liveRelays = $derived(getRelays());
  const vm = createRelaySettingsViewModel({
    getPubkey: () => auth.pubkey,
    getLiveRelays: () => liveRelays,
    saveRelayList: publishRelayList
  });

  function connectionStateFor(url: string): ConnectionState | null {
    return vm.connectionStateFor(url);
  }
</script>

<section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
  <h2 class="font-display text-lg font-semibold text-text-primary">
    {t('settings.relays.title')}
  </h2>

  {#if vm.relayLoading}
    <p class="py-4 text-center text-sm text-text-muted">{t('settings.relays.loading')}</p>
  {:else if vm.noRelayList}
    <div
      class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-8 text-center"
    >
      <p class="text-sm text-text-muted">{t('settings.relays.not_found')}</p>
      <button
        type="button"
        onclick={vm.setupDefaults}
        class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
      >
        {t('settings.relays.setup_defaults')}
      </button>
    </div>
  {:else}
    <div class="space-y-2">
      {#each vm.entries as entry, i (entry.url)}
        <div
          class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-0 px-4 py-3"
        >
          <span
            class="h-2 w-2 flex-shrink-0 rounded-full {stateColor(connectionStateFor(entry.url))}"
          ></span>
          <span class="flex-1 truncate text-sm text-text-primary" title={entry.url}>
            {shortUrl(entry.url)}
          </span>
          <button
            type="button"
            onclick={() => vm.toggleRead(i)}
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-all
            {entry.read
              ? 'bg-surface-0 text-text-primary shadow-sm ring-1 ring-accent/40'
              : 'text-text-muted hover:text-text-secondary'}"
          >
            {t('settings.relays.read')}
          </button>
          <button
            type="button"
            onclick={() => vm.toggleWrite(i)}
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-all
            {entry.write
              ? 'bg-surface-0 text-text-primary shadow-sm ring-1 ring-accent/40'
              : 'text-text-muted hover:text-text-secondary'}"
          >
            {t('settings.relays.write')}
          </button>
          <button
            type="button"
            onclick={() => vm.removeRelay(i)}
            class="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-error"
            aria-label="Remove relay"
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
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
            </svg>
          </button>
        </div>
      {/each}

      {#if vm.entries.length === 0}
        <p class="py-3 text-center text-sm text-amber-400">
          {t('settings.relays.min_warning')}
        </p>
      {/if}
    </div>

    <div class="space-y-2">
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={vm.addUrl}
          onkeydown={vm.handleAddKeydown}
          placeholder={t('settings.relays.placeholder')}
          aria-label="Relay URL"
          class="flex-1 rounded-xl border border-border bg-surface-0 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/40"
        />
        <button
          type="button"
          onclick={vm.addRelay}
          class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
        >
          {t('settings.relays.add')}
        </button>
      </div>
      {#if vm.addError}
        <p class="text-xs text-error" role="alert">{vm.addError}</p>
      {/if}
    </div>

    <div class="flex items-center justify-between border-t border-border-subtle pt-4">
      <button
        type="button"
        onclick={vm.resetToDefaults}
        class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
      >
        {t('settings.relays.reset')}
      </button>
      <button
        type="button"
        onclick={vm.save}
        disabled={vm.saving || vm.entries.length === 0}
        class="rounded-xl px-6 py-2 text-sm font-semibold transition-colors
        {vm.savedOk
          ? 'bg-emerald-500 text-white'
          : vm.saving || vm.entries.length === 0
            ? 'cursor-not-allowed bg-surface-2 text-text-muted'
            : 'bg-accent text-surface-0 hover:bg-accent-hover'}"
      >
        {#if vm.savedOk}
          {t('settings.relays.saved')}
        {:else if vm.saving}
          {t('settings.relays.saving')}
        {:else}
          {t('settings.relays.save')}
        {/if}
      </button>
    </div>
  {/if}
</section>
