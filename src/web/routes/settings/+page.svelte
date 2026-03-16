<script lang="ts">
  import { t, type TranslationKey } from '$lib/i18n/t.js';
  import { getAuth } from '$lib/stores/auth.svelte.js';
  import {
    publishRelayList,
    getRelays,
    shortUrl,
    stateColor,
    parseRelayTags,
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
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { useCachedLatest, type UseCachedLatestResult } from '$lib/nostr/cached-nostr.svelte.js';
  import { RELAY_LIST_KIND } from '$lib/nostr/events.js';

  const auth = getAuth();
  const muteList = getMuteList();

  let confirmAction = $state<{
    title: string;
    message: string;
    variant: 'danger' | 'default';
    action: () => Promise<void>;
  } | null>(null);

  // Relay entries being edited
  let entries = $state<RelayEntry[]>([]);
  let dirty = $state(false);
  let saving = $state(false);
  let savedOk = $state(false);
  let addUrl = $state('');
  let addError = $state('');

  // SWR query for relay list
  let relayQuery: UseCachedLatestResult | undefined;

  // SWR query — starts when auth.pubkey is available
  $effect(() => {
    if (!auth.pubkey) return;
    relayQuery?.destroy();
    relayQuery = useCachedLatest(auth.pubkey, RELAY_LIST_KIND);
    return () => relayQuery?.destroy();
  });

  // Derive server entries from SWR event
  let serverEntries = $derived.by(() => {
    if (!relayQuery?.event) return [];
    return parseRelayTags(relayQuery.event.tags);
  });

  // Sync server → local only when not dirty
  $effect(() => {
    if (!dirty && serverEntries.length > 0) {
      entries = [...serverEntries];
    }
  });

  let relayLoading = $derived(!relayQuery || !relayQuery.settled);
  let noRelayList = $derived(
    relayQuery?.settled === true && !relayQuery.event && entries.length === 0
  );

  // Live connection states from the running rx-nostr instance
  let liveRelays = $derived(getRelays());

  function connectionStateFor(url: string): ConnectionState | null {
    const found = liveRelays.find((r) => r.url === url);
    return found?.state ?? null;
  }

  async function setupDefaults() {
    const { DEFAULT_RELAYS } = await import('$lib/nostr/relays.js');
    entries = DEFAULT_RELAYS.map((url) => ({ url, read: true, write: true }));
    dirty = true;
  }

  function toggleRead(index: number) {
    entries[index] = { ...entries[index], read: !entries[index].read };
    dirty = true;
  }

  function toggleWrite(index: number) {
    entries[index] = { ...entries[index], write: !entries[index].write };
    dirty = true;
  }

  function removeRelay(index: number) {
    entries = entries.filter((_, i) => i !== index);
    dirty = true;
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
      dirty = true;
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
    dirty = true;
  }

  // --- Mute word form ---
  let newMuteWord = $state('');

  function handleAddMuteWord() {
    const word = newMuteWord.trim();
    if (!word) return;
    const before = muteList.mutedWords.length;
    confirmAction = {
      title: t('confirm.mute_word_add'),
      message: t('confirm.mute_word_add.detail', { before, after: before + 1 }),
      variant: 'default',
      action: async () => {
        await muteWord(word);
        newMuteWord = '';
      }
    };
  }

  function confirmUnmuteUser(pk: string) {
    const before = muteList.mutedPubkeys.size;
    confirmAction = {
      title: t('confirm.unmute'),
      message: t('confirm.unmute.detail', { before, after: before - 1 }),
      variant: 'default',
      action: async () => {
        await unmuteUser(pk);
      }
    };
  }

  function confirmUnmuteWord(word: string) {
    const before = muteList.mutedWords.length;
    confirmAction = {
      title: t('confirm.mute_word_remove'),
      message: t('confirm.mute_word_remove.detail', { before, after: before - 1 }),
      variant: 'default',
      action: async () => {
        await unmuteWord(word);
      }
    };
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
      dirty = false;
      savedOk = true;
      setTimeout(() => {
        savedOk = false;
      }, 3000);
    } finally {
      saving = false;
    }
  }

  // --- Developer Tools ---
  interface DbStats {
    total: number;
    byKind: { kind: number; count: number }[];
  }

  let dbStats = $state<DbStats | null>(null);
  let clearFeedback = $state<string | null>(null);
  let swStatus = $state<'active' | 'none'>('none');
  let swUpdated = $state(false);
  let debugCopied = $state(false);

  $effect(() => {
    void auth.pubkey;
    loadDbStats();
    checkSwStatus();
  });

  async function loadDbStats() {
    try {
      const { getEventsDB } = await import('$lib/nostr/event-db.js');
      const db = await getEventsDB();
      const kinds = [0, 3, 5, 7, 1111, 10000, 10002, 10003, 10030, 30030];
      const byKind: { kind: number; count: number }[] = [];
      let total = 0;
      for (const kind of kinds) {
        const events = await db.getAllByKind(kind);
        if (events.length > 0) {
          byKind.push({ kind, count: events.length });
          total += events.length;
        }
      }
      dbStats = { total, byKind };
    } catch {
      dbStats = { total: 0, byKind: [] };
    }
  }

  function checkSwStatus() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      swStatus = 'active';
    } else {
      swStatus = 'none';
    }
  }

  async function checkSwUpdate() {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.update();
      swUpdated = true;
      setTimeout(() => {
        swUpdated = false;
      }, 3000);
    }
  }

  function clearStorage(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    clearFeedback = key;
    setTimeout(() => {
      clearFeedback = null;
    }, 2000);
  }

  async function clearIndexedDB() {
    try {
      const { getEventsDB } = await import('$lib/nostr/event-db.js');
      const db = await getEventsDB();
      await db.clearAll();
    } catch {
      // ignore
    }
    clearFeedback = 'indexeddb';
    setTimeout(() => {
      clearFeedback = null;
    }, 2000);
    await loadDbStats();
  }

  function clearAllData() {
    if (!confirm(t('dev.clear_all_confirm'))) return;
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    indexedDB.deleteDatabase('resonote-events');
    window.location.reload();
  }

  async function copyDebugInfo() {
    const relayStates = getRelays();
    const info = {
      app: 'Resonote',
      url: window.location.href,
      userAgent: navigator.userAgent,
      locale: document.documentElement.lang,
      auth: {
        loggedIn: auth.loggedIn,
        pubkey: auth.pubkey ? auth.pubkey.slice(0, 8) + '...' : null
      },
      relays: relayStates.map((r) => ({ url: r.url, state: r.state })),
      cache: dbStats,
      sw: swStatus,
      timestamp: new Date().toISOString()
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
      debugCopied = true;
      setTimeout(() => {
        debugCopied = false;
      }, 2000);
    } catch {
      // ignore
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
              onclick={() => confirmUnmuteUser(pk)}
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
              onclick={() => confirmUnmuteWord(word)}
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

  <!-- Developer Tools section -->
  <section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
    <h2 class="font-display text-lg font-semibold text-text-primary">
      {t('dev.title')}
    </h2>

    <!-- Cache Stats -->
    <div class="space-y-2">
      <h3 class="text-sm font-medium text-text-secondary">{t('dev.stats')}</h3>
      {#if dbStats}
        <div class="grid grid-cols-2 gap-2 text-xs text-text-muted">
          <span>{t('dev.events_total')}</span>
          <span class="font-mono text-text-primary">{dbStats.total}</span>
          {#each dbStats.byKind as { kind, count } (kind)}
            <span>kind:{kind}</span>
            <span class="font-mono text-text-primary">{count}</span>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-text-muted">{t('dev.stats_loading')}</p>
      {/if}
    </div>

    <!-- Service Worker -->
    <div class="space-y-2">
      <h3 class="text-sm font-medium text-text-secondary">{t('dev.sw')}</h3>
      <div class="flex items-center gap-3">
        <span class="text-xs text-text-muted">
          {swStatus === 'active' ? t('dev.sw_active') : t('dev.sw_none')}
        </span>
        {#if swStatus === 'active'}
          <button
            type="button"
            onclick={checkSwUpdate}
            class="rounded-lg bg-surface-2 px-3 py-1 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
          >
            {swUpdated ? t('dev.sw_updated') : t('dev.sw_update')}
          </button>
        {/if}
      </div>
    </div>

    <!-- Storage Management -->
    <div class="space-y-2">
      <h3 class="text-sm font-medium text-text-secondary">{t('dev.storage')}</h3>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          onclick={() => clearStorage('resonote-locale')}
          class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
        >
          {clearFeedback === 'resonote-locale' ? t('dev.cleared') : t('dev.clear_locale')}
        </button>
        <button
          type="button"
          onclick={() => clearStorage('resonote-notif-filter')}
          class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
        >
          {clearFeedback === 'resonote-notif-filter'
            ? t('dev.cleared')
            : t('dev.clear_notif_filter')}
        </button>
        <button
          type="button"
          onclick={() => clearStorage('resonote-notif-last-read')}
          class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
        >
          {clearFeedback === 'resonote-notif-last-read'
            ? t('dev.cleared')
            : t('dev.clear_notif_lastread')}
        </button>
        <button
          type="button"
          onclick={clearIndexedDB}
          class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
        >
          {clearFeedback === 'indexeddb' ? t('dev.cleared') : t('dev.clear_indexeddb')}
        </button>
      </div>
      <div class="flex gap-2 border-t border-border-subtle pt-3">
        <button
          type="button"
          onclick={clearAllData}
          class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
        >
          {t('dev.clear_all')}
        </button>
        <button
          type="button"
          onclick={copyDebugInfo}
          class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
        >
          {debugCopied ? t('dev.debug_copied') : t('dev.debug_copy')}
        </button>
      </div>
    </div>
  </section>
</div>

<ConfirmDialog
  open={confirmAction !== null}
  title={confirmAction?.title ?? ''}
  message={confirmAction?.message ?? ''}
  variant={confirmAction?.variant ?? 'default'}
  confirmLabel={t('confirm.ok')}
  cancelLabel={t('confirm.cancel')}
  onConfirm={async () => {
    const action = confirmAction?.action;
    confirmAction = null;
    if (action) await action();
  }}
  onCancel={() => (confirmAction = null)}
/>
