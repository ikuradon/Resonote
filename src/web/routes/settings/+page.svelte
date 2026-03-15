<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/t.js';
  import { getAuth } from '$lib/stores/auth.svelte.js';
  import {
    fetchRelayList,
    publishRelayList,
    getRelays,
    shortUrl,
    stateColor,
    type RelayEntry,
    type ConnectionState
  } from '$lib/stores/relays.svelte.js';

  const auth = getAuth();

  // Relay entries being edited
  let entries = $state<RelayEntry[]>([]);
  let saving = $state(false);
  let savedOk = $state(false);
  let addUrl = $state('');
  let addError = $state('');

  // Live connection states from the running rx-nostr instance
  let liveRelays = $derived(getRelays());

  function connectionStateFor(url: string): ConnectionState | null {
    const found = liveRelays.find((r) => r.url === url);
    return found?.state ?? null;
  }

  async function loadRelays() {
    if (auth.pubkey) {
      entries = await fetchRelayList(auth.pubkey);
    } else {
      const { DEFAULT_RELAYS } = await import('$lib/nostr/relays.js');
      entries = DEFAULT_RELAYS.map((url) => ({ url, read: true, write: true }));
    }
  }

  onMount(() => {
    loadRelays();
  });

  function toggleRead(index: number) {
    entries[index] = { ...entries[index], read: !entries[index].read };
  }

  function toggleWrite(index: number) {
    entries[index] = { ...entries[index], write: !entries[index].write };
  }

  function removeRelay(index: number) {
    entries = entries.filter((_, i) => i !== index);
  }

  function validateRelayUrl(url: string): boolean {
    return /^wss?:\/\/.+/.test(url.trim());
  }

  function addRelay() {
    const url = addUrl.trim();
    if (!validateRelayUrl(url)) {
      addError = t('settings.relays.invalid_url');
      return;
    }
    addError = '';
    if (!entries.some((e) => e.url === url)) {
      entries = [...entries, { url, read: true, write: true }];
    }
    addUrl = '';
  }

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRelay();
    }
  }

  async function resetToDefaults() {
    const { DEFAULT_RELAYS } = await import('$lib/nostr/relays.js');
    entries = DEFAULT_RELAYS.map((url) => ({ url, read: true, write: true }));
  }

  async function save() {
    if (saving || entries.length === 0) return;
    saving = true;
    savedOk = false;
    try {
      await publishRelayList(entries);
      savedOk = true;
      setTimeout(() => {
        savedOk = false;
      }, 3000);
    } finally {
      saving = false;
    }
  }
</script>

<div class="mx-auto max-w-3xl space-y-8 py-4">
  <!-- Page heading -->
  <div>
    <h1 class="font-display text-3xl font-bold tracking-wide text-text-primary">
      {t('settings.title')}
    </h1>
    <div class="mt-3 h-px w-16 bg-gradient-to-r from-transparent via-accent to-transparent"></div>
  </div>

  <!-- Relay section -->
  <section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
    <h2 class="font-display text-lg font-semibold text-text-primary">
      {t('settings.relays.title')}
    </h2>

    <!-- Relay list -->
    <div class="space-y-2">
      {#each entries as entry, i (entry.url)}
        <div
          class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-0 px-4 py-3"
        >
          <!-- Connection state dot -->
          <span
            class="h-2 w-2 flex-shrink-0 rounded-full {stateColor(connectionStateFor(entry.url))}"
          ></span>

          <!-- URL -->
          <span class="flex-1 truncate text-sm text-text-primary" title={entry.url}>
            {shortUrl(entry.url)}
          </span>

          <!-- Read toggle -->
          <button
            type="button"
            onclick={() => toggleRead(i)}
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-all
              {entry.read
              ? 'bg-surface-0 text-text-primary shadow-sm ring-1 ring-accent/40'
              : 'text-text-muted hover:text-text-secondary'}"
          >
            {t('settings.relays.read')}
          </button>

          <!-- Write toggle -->
          <button
            type="button"
            onclick={() => toggleWrite(i)}
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-all
              {entry.write
              ? 'bg-surface-0 text-text-primary shadow-sm ring-1 ring-accent/40'
              : 'text-text-muted hover:text-text-secondary'}"
          >
            {t('settings.relays.write')}
          </button>

          <!-- Delete button -->
          <button
            type="button"
            onclick={() => removeRelay(i)}
            class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-error"
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

      {#if entries.length === 0}
        <p class="py-3 text-center text-sm text-amber-400">
          {t('settings.relays.min_warning')}
        </p>
      {/if}
    </div>

    <!-- Add relay form -->
    <div class="space-y-2">
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={addUrl}
          onkeydown={handleAddKeydown}
          placeholder={t('settings.relays.placeholder')}
          class="flex-1 rounded-xl border border-border bg-surface-0 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/40"
        />
        <button
          type="button"
          onclick={addRelay}
          class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
        >
          {t('settings.relays.add')}
        </button>
      </div>
      {#if addError}
        <p class="text-xs text-error">{addError}</p>
      {/if}
    </div>

    <!-- Action buttons -->
    <div class="flex items-center justify-between border-t border-border-subtle pt-4">
      <button
        type="button"
        onclick={resetToDefaults}
        class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
      >
        {t('settings.relays.reset')}
      </button>

      <button
        type="button"
        onclick={save}
        disabled={saving || entries.length === 0}
        class="rounded-xl px-6 py-2 text-sm font-semibold transition-colors
          {savedOk
          ? 'bg-emerald-500 text-white'
          : saving || entries.length === 0
            ? 'cursor-not-allowed bg-surface-2 text-text-muted'
            : 'bg-accent text-surface-0 hover:bg-accent-hover'}"
      >
        {#if savedOk}
          {t('settings.relays.saved')}
        {:else if saving}
          {t('settings.relays.saving')}
        {:else}
          {t('settings.relays.save')}
        {/if}
      </button>
    </div>
  </section>
</div>
