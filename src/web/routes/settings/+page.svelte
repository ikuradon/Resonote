<script lang="ts">
  import { t, type TranslationKey } from '$lib/i18n/t.js';
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
  import {
    getMuteList,
    hasNip44Support,
    unmuteUser,
    muteWord,
    unmuteWord
  } from '$lib/stores/mute.svelte.js';
  import { getDisplayName } from '$lib/stores/profile.svelte.js';
  import { npubEncode } from 'nostr-tools/nip19';
  import { getNotifFilter, setNotifFilter } from '$lib/stores/notifications.svelte.js';
  import type { FollowFilter } from '$lib/stores/follows.svelte.js';

  const auth = getAuth();
  const muteList = getMuteList();

  // Relay entries being edited
  let entries = $state<RelayEntry[]>([]);
  let relayLoading = $state(true);
  let noRelayList = $state(false);
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
    if (!auth.pubkey) {
      relayLoading = false;
      noRelayList = true;
      return;
    }
    relayLoading = true;
    noRelayList = false;
    const result = await fetchRelayList(auth.pubkey);
    entries = result.entries;
    noRelayList = result.source === 'none';
    relayLoading = false;
  }

  async function setupDefaults() {
    const { DEFAULT_RELAYS } = await import('$lib/nostr/relays.js');
    entries = DEFAULT_RELAYS.map((url) => ({ url, read: true, write: true }));
    noRelayList = false;
  }

  // Reload relays when auth state changes (handles direct page access where
  // auth.pubkey is initially null until initAuth completes)
  $effect(() => {
    void auth.pubkey;
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

  // --- Mute word form ---
  let newMuteWord = $state('');

  function handleAddMuteWord() {
    const word = newMuteWord.trim();
    if (!word) return;
    muteWord(word);
    newMuteWord = '';
  }

  function handleMuteWordKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddMuteWord();
    }
  }

  // --- Notification filter ---
  let currentNotifFilter = $state<FollowFilter>(getNotifFilter());

  function handleNotifFilterChange(filter: FollowFilter) {
    currentNotifFilter = filter;
    setNotifFilter(filter);
  }

  const notifFilterOptions: {
    value: FollowFilter;
    labelKey: TranslationKey;
  }[] = [
    { value: 'all', labelKey: 'filter.all' },
    { value: 'follows', labelKey: 'filter.follows' },
    { value: 'wot', labelKey: 'filter.wot' }
  ];

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

    {#if relayLoading}
      <p class="py-4 text-center text-sm text-text-muted">{t('settings.relays.loading')}</p>
    {:else if noRelayList}
      <div
        class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-8 text-center"
      >
        <p class="text-sm text-text-muted">{t('settings.relays.not_found')}</p>
        <button
          type="button"
          onclick={setupDefaults}
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
        >
          {t('settings.relays.setup_defaults')}
        </button>
      </div>
    {:else}
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
    {/if}
  </section>

  <!-- Mute section -->
  <section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
    <h2 class="font-display text-lg font-semibold text-text-primary">
      {t('mute.title')}
    </h2>

    {#if !hasNip44Support()}
      <p class="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        {t('mute.nip44_required')}
      </p>
    {/if}

    <!-- Muted Users -->
    <div class="space-y-2">
      <h3 class="text-sm font-medium text-text-secondary">{t('mute.users')}</h3>
      {#if muteList.mutedPubkeys.size === 0}
        <p class="py-2 text-sm text-text-muted">{t('mute.empty_users')}</p>
      {:else}
        {#each [...muteList.mutedPubkeys] as pk (pk)}
          <div
            class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-0 px-4 py-3"
          >
            <a
              href="/profile/{npubEncode(pk)}"
              class="flex-1 truncate text-sm text-accent hover:underline"
            >
              {getDisplayName(pk)}
            </a>
            <button
              type="button"
              onclick={() => unmuteUser(pk)}
              disabled={!hasNip44Support()}
              class="rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary disabled:opacity-30"
            >
              {t('mute.unmute')}
            </button>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Muted Words -->
    <div class="space-y-2">
      <h3 class="text-sm font-medium text-text-secondary">{t('mute.words')}</h3>
      {#if muteList.mutedWords.length === 0}
        <p class="py-2 text-sm text-text-muted">{t('mute.empty_words')}</p>
      {:else}
        {#each muteList.mutedWords as word (word)}
          <div
            class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-0 px-4 py-3"
          >
            <span class="flex-1 text-sm text-text-primary">{word}</span>
            <button
              type="button"
              onclick={() => unmuteWord(word)}
              disabled={!hasNip44Support()}
              class="rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary disabled:opacity-30"
              aria-label={t('mute.unmute')}
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
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        {/each}
      {/if}

      <!-- Add word form -->
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={newMuteWord}
          onkeydown={handleMuteWordKeydown}
          placeholder={t('mute.word_placeholder')}
          disabled={!hasNip44Support()}
          class="flex-1 rounded-xl border border-border bg-surface-0 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/40 disabled:opacity-30"
        />
        <button
          type="button"
          onclick={handleAddMuteWord}
          disabled={!hasNip44Support()}
          class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover disabled:opacity-30"
        >
          {t('mute.add_word')}
        </button>
      </div>
    </div>
  </section>

  <!-- Notification Filter section -->
  <section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
    <h2 class="font-display text-lg font-semibold text-text-primary">
      {t('notification.filter.title')}
    </h2>
    <p class="text-sm text-text-muted">
      {t('notification.filter.description')}
    </p>
    <div class="flex items-center rounded-lg bg-surface-2 p-0.5 w-fit">
      {#each notifFilterOptions as opt (opt.value)}
        <button
          type="button"
          onclick={() => handleNotifFilterChange(opt.value)}
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-all
            {currentNotifFilter === opt.value
            ? 'bg-surface-0 text-text-primary shadow-sm'
            : 'text-text-muted hover:text-text-secondary'}"
        >
          {t(opt.labelKey)}
        </button>
      {/each}
    </div>
  </section>
</div>
