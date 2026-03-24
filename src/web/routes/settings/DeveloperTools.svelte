<script lang="ts">
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { getAuth } from '$shared/browser/auth.js';
  import { copyToClipboard } from '$shared/browser/clipboard.js';
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

  const auth = getAuth();

  let dbStats = $state<DbStats | null>(null);
  let clearFeedback = $state<string | null>(null);
  let swStatus = $state<'active' | 'none'>('none');
  let swUpdated = $state(false);
  let debugCopied = $state(false);
  let clearAllConfirm = $state(false);

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
