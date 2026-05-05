<script lang="ts">
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { getAuth } from '$shared/browser/auth.js';
  import { copyToClipboard } from '$shared/browser/clipboard.js';
  import { getCustomEmojiDiagnostics } from '$shared/browser/custom-emoji-diagnostics.js';
  import {
    buildDebugInfo,
    checkServiceWorkerStatus,
    checkServiceWorkerUpdate,
    clearAllData as clearAll,
    clearIndexedDB as clearIdb,
    clearLocalStorage,
    type DbStats,
    loadDbStats as fetchDbStats
  } from '$shared/browser/dev-tools.js';
  import { getRelays } from '$shared/browser/relays.js';
  import { t } from '$shared/i18n/t.js';

  import {
    buildEmojiDiagnosticsCopyPayload,
    cacheOnlyCaveat,
    truncateRefs
  } from './developer-emoji-diagnostics-view-model.js';

  const auth = getAuth();

  let dbStats = $state<DbStats | null>(null);
  let clearFeedback = $state<string | null>(null);
  let swStatus = $state<'active' | 'none'>('none');
  let swUpdated = $state(false);
  let debugCopied = $state(false);
  let emojiDiagnosticsCopied = $state(false);
  let clearAllConfirm = $state(false);
  let emojiDiagnostics = $derived(getCustomEmojiDiagnostics());
  let missingRefs = $derived(truncateRefs(emojiDiagnostics.missingRefs));
  let invalidRefs = $derived(truncateRefs(emojiDiagnostics.invalidRefs));
  let emojiCacheOnlyCaveat = $derived(
    cacheOnlyCaveat(emojiDiagnostics.sourceMode, emojiDiagnostics.missingRefs, t)
  );

  $effect(() => {
    void auth.pubkey;
    refreshDbStats();
    swStatus = checkServiceWorkerStatus();
  });

  async function refreshDbStats() {
    dbStats = await fetchDbStats();
  }

  async function handleSwUpdate() {
    const updated = await checkServiceWorkerUpdate();
    if (updated) {
      swUpdated = true;
      setTimeout(() => {
        swUpdated = false;
      }, 3000);
    }
  }

  function handleClearStorage(key: string) {
    clearLocalStorage(key);
    clearFeedback = key;
    setTimeout(() => {
      clearFeedback = null;
    }, 2000);
  }

  async function handleClearIndexedDB() {
    try {
      await clearIdb();
    } catch {
      // ignore
    }
    clearFeedback = 'indexeddb';
    setTimeout(() => {
      clearFeedback = null;
    }, 2000);
    await refreshDbStats();
  }

  async function copyDebugInfo() {
    const relayStates = getRelays();
    const info = buildDebugInfo(
      { loggedIn: auth.loggedIn, pubkey: auth.pubkey },
      relayStates.map((r) => ({ url: r.url, state: r.state })),
      dbStats,
      swStatus
    );
    const ok = await copyToClipboard(JSON.stringify(info, null, 2));
    if (ok) {
      debugCopied = true;
      setTimeout(() => {
        debugCopied = false;
      }, 2000);
    }
  }

  async function copyEmojiDiagnostics() {
    const ok = await copyToClipboard(buildEmojiDiagnosticsCopyPayload(emojiDiagnostics));
    if (ok) {
      emojiDiagnosticsCopied = true;
      setTimeout(() => {
        emojiDiagnosticsCopied = false;
      }, 2000);
    }
  }
</script>

<section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
  <h2 class="font-display text-lg font-semibold text-text-primary">
    {t('dev.title')}
  </h2>

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

  <div class="space-y-3 border-t border-border-subtle pt-4">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-sm font-medium text-text-secondary">{t('dev.emoji.title')}</h3>
      <button
        type="button"
        onclick={copyEmojiDiagnostics}
        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
      >
        {emojiDiagnosticsCopied ? t('dev.emoji.copied') : t('dev.emoji.copy')}
      </button>
    </div>

    <div class="grid grid-cols-2 gap-2 text-xs text-text-muted">
      <span>{t('dev.emoji.db_counts')}</span>
      <span class="font-mono text-text-primary">
        kind10030:{emojiDiagnostics.dbCounts.kind10030} kind30030:{emojiDiagnostics.dbCounts
          .kind30030}
      </span>
      <span>{t('dev.emoji.db_counts')}</span>
      <span class="font-mono text-text-primary">
        categories:{emojiDiagnostics.summary.categoryCount} emojis:{emojiDiagnostics.summary
          .emojiCount}
      </span>
    </div>

    {#if emojiDiagnostics.listEvent}
      <div class="grid grid-cols-2 gap-2 text-xs text-text-muted">
        <span>{t('dev.emoji.list_event')}</span>
        <span class="min-w-0 space-y-1 font-mono text-text-primary">
          <span class="block truncate">{emojiDiagnostics.listEvent.id}</span>
          <span class="block">
            created_at:{emojiDiagnostics.listEvent.createdAtSec} inline:{emojiDiagnostics.listEvent
              .inlineEmojiCount} sets:{emojiDiagnostics.listEvent.referencedSetRefCount}
          </span>
        </span>
      </div>
    {/if}

    {#if emojiDiagnostics.sets.length > 0}
      <details class="space-y-2 rounded-lg border border-border-subtle bg-surface-2 p-3 text-xs">
        <summary class="cursor-pointer text-text-secondary">
          {t('dev.emoji.sets')} ({emojiDiagnostics.sets.length})
        </summary>
        <div class="mt-3 space-y-2">
          {#each emojiDiagnostics.sets as set (set.ref)}
            <div class="grid grid-cols-2 gap-2 border-t border-border-subtle pt-2 text-text-muted">
              <span>{set.title}</span>
              <span class="min-w-0 space-y-1 font-mono text-text-primary">
                <span class="block truncate">{set.ref}</span>
                <span class="block">
                  created_at:{set.createdAtSec} emojis:{set.emojiCount} via:{set.resolvedVia}
                </span>
              </span>
            </div>
          {/each}
        </div>
      </details>
    {/if}

    {#if emojiCacheOnlyCaveat}
      <p
        class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
      >
        {emojiCacheOnlyCaveat}
      </p>
    {/if}

    {#if emojiDiagnostics.missingRefs.length > 0}
      <div class="space-y-1 text-xs text-text-muted">
        <p>
          {t('dev.emoji.missing_refs')} ({emojiDiagnostics.missingRefs
            .length}){#if missingRefs.hiddenCount > 0}
            +{missingRefs.hiddenCount}{/if}
        </p>
        <div class="space-y-1 font-mono text-text-primary">
          {#each missingRefs.visible as ref (ref)}
            <p class="truncate">{ref}</p>
          {/each}
        </div>
      </div>
    {/if}

    {#if emojiDiagnostics.invalidRefs.length > 0}
      <div class="space-y-1 text-xs text-text-muted">
        <p>
          {t('dev.emoji.invalid_refs')} ({emojiDiagnostics.invalidRefs
            .length}){#if invalidRefs.hiddenCount > 0}
            +{invalidRefs.hiddenCount}{/if}
        </p>
        <div class="space-y-1 font-mono text-text-primary">
          {#each invalidRefs.visible as ref (ref)}
            <p class="truncate">{ref}</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="space-y-2">
    <h3 class="text-sm font-medium text-text-secondary">{t('dev.sw')}</h3>
    <div class="flex items-center gap-3">
      <span class="text-xs text-text-muted">
        {swStatus === 'active' ? t('dev.sw_active') : t('dev.sw_none')}
      </span>
      {#if swStatus === 'active'}
        <button
          type="button"
          onclick={handleSwUpdate}
          class="rounded-lg bg-surface-2 px-3 py-1 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
        >
          {swUpdated ? t('dev.sw_updated') : t('dev.sw_update')}
        </button>
      {/if}
    </div>
  </div>

  <div class="space-y-2">
    <h3 class="text-sm font-medium text-text-secondary">{t('dev.storage')}</h3>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        onclick={() => handleClearStorage('resonote-locale')}
        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
      >
        {clearFeedback === 'resonote-locale' ? t('dev.cleared') : t('dev.clear_locale')}
      </button>
      <button
        type="button"
        onclick={() => handleClearStorage('resonote-notif-filter')}
        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
      >
        {clearFeedback === 'resonote-notif-filter' ? t('dev.cleared') : t('dev.clear_notif_filter')}
      </button>
      <button
        type="button"
        onclick={() => handleClearStorage('resonote-notif-last-read')}
        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
      >
        {clearFeedback === 'resonote-notif-last-read'
          ? t('dev.cleared')
          : t('dev.clear_notif_lastread')}
      </button>
      <button
        type="button"
        onclick={handleClearIndexedDB}
        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
      >
        {clearFeedback === 'indexeddb' ? t('dev.cleared') : t('dev.clear_indexeddb')}
      </button>
    </div>
    <div class="flex gap-2 border-t border-border-subtle pt-3">
      <button
        type="button"
        onclick={() => (clearAllConfirm = true)}
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

<ConfirmDialog
  open={clearAllConfirm}
  title={t('dev.clear_all')}
  message={t('dev.clear_all_confirm')}
  variant="danger"
  confirmLabel={t('confirm.ok')}
  cancelLabel={t('confirm.cancel')}
  onConfirm={() => {
    clearAllConfirm = false;
    clearAll();
  }}
  onCancel={() => (clearAllConfirm = false)}
/>
